"""QA endpoints: JSON + SSE 双模式 + 会话 CRUD (backend spec §2.4)."""
from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from ..errors import sse_error
from ..schemas.qa import AskRequest, SessionDetail, SessionSummary
from ..services import agent_service, session_service

router = APIRouter(prefix="/api/v1/qa", tags=["qa"])


@router.post("/ask")
async def ask(body: AskRequest):
  """同步 JSON 模式: {answer, citations} 对齐 agentic_rag §4.1 + 服务层富化键."""
  return await agent_service.ask_json(body.question.strip(), body.session_id,
                                      body.doc_ids, body.include_evidence)


@router.post("/ask/stream")
async def ask_stream(body: AskRequest):
  """SSE 流模式 (EventSource 不支持 POST, 前端用 fetch+ReadableStream 消费)."""
  gen = await agent_service.ask_stream(body.question.strip(), body.session_id,
                                       body.doc_ids)

  async def guarded():
    try:
      async for chunk in gen:
        yield chunk
    except Exception as exc:  # noqa: BLE001 - 生成器异常 → error 事件后关流
      yield (f"event: error\ndata: {__import__('json').dumps(sse_error('E_INTERNAL', str(exc)))}\n\n")

  return StreamingResponse(guarded(), media_type="text/event-stream",
                           headers={"Cache-Control": "no-cache",
                                    "X-Accel-Buffering": "no"})


@router.get("/sessions")
async def list_sessions(page: int = 1, page_size: int = 20):
  page, page_size = max(1, page), min(100, max(1, page_size))
  rows, total = session_service.list_sessions(page, page_size)
  items = [SessionSummary(session_id=r["session_id"], title=r["title"],
                          created_at=r["created_at"],
                          last_message_at=r.get("last_message_at"),
                          message_count=r.get("message_count", 0)).model_dump()
           for r in rows]
  return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/sessions/{session_id}")
async def get_session(session_id: str):
  row = session_service.require_session(session_id)
  messages = session_service.list_messages(session_id)
  return SessionDetail(
    session_id=row["session_id"], title=row["title"], created_at=row["created_at"],
    messages=[m for m in messages]).model_dump()


@router.delete("/sessions/{session_id}", status_code=204)
async def delete_session(session_id: str):
  session_service.delete_session(session_id)
