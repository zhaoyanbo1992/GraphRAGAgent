"""Agent service: LangGraph ainvoke/astream + 引用复核富化 (backend spec §2.4).

事件循环约束 (spec §1.1): 图在 FastAPI 主 loop 上 ainvoke/astream 驱动; 工具为
kg_service 提供的原生 @tool (同步纯函数, ToolNode 线程池执行); 不使用 MCP stdio.
"""
from __future__ import annotations

import asyncio
import json
import time
import uuid

from langchain_core.messages import HumanMessage

from ..pipeline import agent_graph
from ..schemas.qa import Citation
from . import kg_service, session_service

_llm_cache = {}


def _get_llm():
  from .. import config
  key = (config.DEEPSEEK["model"], config.DEEPSEEK["base_url"])
  if key not in _llm_cache:
    _llm_cache[key] = agent_graph.build_llm(config.DEEPSEEK)
  return _llm_cache[key]


def _extract_final(messages) -> dict | None:
  """[FINAL] 交付契约 (agentic_rag spec §4.4): 自尾向前找首个 {"answer" 开头消息."""
  for m in reversed(messages):
    content = str(m.content) if m.content else ""
    if content.startswith('{"answer"'):
      return json.loads(content)
  return None


def _enrich_citations(view: kg_service.MultiDocView, raw_citations: list[dict]) -> list[dict]:
  out = []
  for c in raw_citations:
    tid = c.get("triple_id", "")
    if tid in view.triples:            # 引用复核: exists_in_kg (triples 为 property)
      out.append(view.citation_enrich(tid, c.get("text_span", "")))
    # 不在 KG 的引用静默剔除 (防幻觉引用; 与 check3 exists_in_kg 基线一致)
  return out


def _sentence_split(text: str) -> list[str]:
  """准流式切分 (spec §2.4 诚实说明: structured output 整块输出 → 按句推送)."""
  parts, buf = [], ""
  for ch in text:
    buf += ch
    if ch in "。！？!?\n" or (ch == "." and buf.strip().endswith((".", "。")) and len(buf) > 2):
      parts.append(buf)
      buf = ""
  if buf.strip():
    parts.append(buf)
  return parts or [text]


def _init_session(question: str, session_id: str | None) -> str:
  if session_id:
    if not session_service.get_session(session_id):
      from ..errors import ApiError
      raise ApiError("E_QA_SESSION_NOT_FOUND", "会话不存在", 404)
    return session_id
  return session_service.create_session(question[:30])


async def ask_json(question: str, session_id: str | None, doc_ids: list[str],
                   include_evidence: bool) -> dict:
  """同步 JSON 模式 (spec §2.4 POST /qa/ask)."""
  scope = kg_service.resolve_scope(doc_ids)
  sid = _init_session(question, session_id)
  view = kg_service.MultiDocView(scope)
  tools = agent_graph.build_tools(view)
  agent = agent_graph.build_graph(_get_llm(), tools, view)
  t0 = time.time()
  state = await agent.ainvoke(
    {"messages": [HumanMessage(content=question)], "rewrite_count": 0},
    config={"recursion_limit": 30})
  payload = _extract_final(state["messages"])
  if payload is None:
    from ..errors import ApiError
    raise ApiError("E_QA_LLM_FAILED", "问答链路未产出结构化回答", 502)
  total = int((time.time() - t0) * 1000)
  citations = _enrich_citations(view, payload.get("citations", []))
  result = {
    "message_id": f"m_{uuid.uuid4().hex[:8]}",
    "session_id": sid,
    "question": question,
    "answer": payload["answer"],
    "citations": citations if include_evidence else [
      {"triple_id": c["triple_id"], "text_span": c["text_span"]} for c in citations],
    "doc_ids": scope,
    "latency_ms": {"total": total},
    "created_at": session_service.now(),
  }
  session_service.append_message(sid, {**result, "mode": "json", "error_code": None})
  return result


async def ask_stream(question: str, session_id: str | None, doc_ids: list[str]):
  """SSE 流模式 (spec §2.4 POST /qa/ask/stream): 事件序列生成器."""
  scope = kg_service.resolve_scope(doc_ids)
  sid = _init_session(question, session_id)
  message_id = f"m_{uuid.uuid4().hex[:8]}"
  view = kg_service.MultiDocView(scope)
  tools = agent_graph.build_tools(view)
  agent = agent_graph.build_graph(_get_llm(), tools, view)

  def sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"

  async def gen():
    t0 = time.time()
    yield sse("session", {"session_id": sid, "message_id": message_id})
    citations: list[dict] = []
    answer_parts: list[str] = []
    error: dict | None = None
    last_node = None
    tool_open: dict[str, dict] = {}
    try:
      async for chunk in agent.astream(
          {"messages": [HumanMessage(content=question)], "rewrite_count": 0},
          config={"recursion_limit": 30}, stream_mode="updates"):
        for node, update in chunk.items():
          if node != last_node:
            stage = ("retrieval" if node in ("generate_query_or_respond", "tools",
                                             "continue_retrieval", "rewrite_question")
                     else "answering")
            yield sse("status", {"stage": stage, "node": node, "attempt": 1})
            last_node = node
          msgs = (update or {}).get("messages", [])
          for m in msgs:
            mtype = getattr(m, "type", "")
            if mtype == "ai" and getattr(m, "tool_calls", None):
              for tc in m.tool_calls:
                tool_open[tc["id"]] = {"name": tc["name"], "args": tc.get("args", {})}
                yield sse("tool_call", {"call_id": tc["id"], "name": tc["name"],
                                        "args": tc.get("args", {})})
            elif mtype == "tool":
              info = tool_open.get(m.tool_call_id, {})
              ok = '"error"' not in str(m.content)
              try:
                body = json.loads(m.content)
                summary = body.get("matched", {}).get("normalized_name") if isinstance(
                  body.get("matched"), dict) else (
                  f"{len(body.get('triples', []))} triples" if "triples" in body
                  else body.get("text_span") or (body.get("error") or "ok"))
              except Exception:  # noqa: BLE001
                summary = str(m.content)[:80]
              yield sse("tool_result", {"call_id": m.tool_call_id,
                                        "name": info.get("name", "tool"), "ok": ok,
                                        "summary": str(summary), "elapsed_ms": None})
            elif isinstance(m, HumanMessage) and str(m.content).startswith('{"answer"'):
              payload = json.loads(str(m.content))
              answer_parts.append(payload.get("answer", ""))
              citations = _enrich_citations(view, payload.get("citations", []))
      # answer_delta 准流式 (整块输出按句切分); 双重净化 + 空答案兜底
      answer = agent_graph.strip_leaked_markup("".join(answer_parts))
      if not answer:
        answer = agent_graph.EMPTY_ANSWER
        answer_parts = [answer]
      for part in _sentence_split(answer):
        yield sse("answer_delta", {"delta": part})
        await asyncio.sleep(0.08)
      if citations:
        yield sse("citations", {"citations": citations})
      total = int((time.time() - t0) * 1000)
      yield sse("done", {"message_id": message_id, "finish_reason": "stop",
                         "latency_ms": {"total": total}})
      session_service.append_message(sid, {
        "message_id": message_id, "question": question, "answer": answer,
        "citations": citations, "doc_ids": scope, "mode": "sse",
        "latency": {"total": total}, "error_code": None})
    except asyncio.CancelledError:
      session_service.append_message(sid, {
        "message_id": message_id, "question": question, "answer": "".join(answer_parts),
        "citations": citations, "doc_ids": scope, "mode": "sse",
        "latency": {}, "error_code": "E_QA_ABORTED"})
      raise
    except Exception as exc:  # noqa: BLE001
      yield sse("error", {"code": "E_QA_LLM_FAILED", "message": str(exc),
                          "retryable": True})
      session_service.append_message(sid, {
        "message_id": message_id, "question": question, "answer": None,
        "citations": [], "doc_ids": scope, "mode": "sse", "latency": {},
        "error_code": "E_QA_LLM_FAILED"})

  return gen()
