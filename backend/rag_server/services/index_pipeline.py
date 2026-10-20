"""Index pipeline: 四阶段编排 + 步骤进度落库 (backend spec §2.2).

阶段: parsing(MinerU) → chunking → extracting(LangExtract+DeepSeek) → kg_building.
断点续跑: 每阶段产物独立落盘, retry 从首个未完成阶段继续 (bridge 规范 §1 原则 4).
"""
from __future__ import annotations

import asyncio
import json
import pathlib
import time

from .. import config, db
from ..errors import ApiError
from ..pipeline import chunker, extraction, kg_builder
from . import job_runner
from . import mineru_client


def _steps_from_row(row: dict) -> list[dict]:
  return json.loads(row.get("steps_json") or "[]")


def _save_job(job_id: str, status: str, steps: list[dict], current_step: str | None,
              error: tuple[str, str] | None = None) -> None:
  finished = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()) if status in ("done", "failed", "canceled") else None
  db.update_job(job_id, status=status, steps_json=json.dumps(steps, ensure_ascii=False),
                current_step=current_step, finished_at=finished,
                error_code=error[0] if error else None,
                error_message=error[1] if error else None)


def _mark_step(steps: list[dict], name: str, status: str, detail: dict,
               started: float | None = None) -> None:
  for s in steps:
    if s["name"] == name:
      s["status"] = status
      if detail:
        s["detail"] = detail
      if status == "running":
        s["started_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
      elif status in ("done", "error"):
        s["finished_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        if started:
          s["elapsed_ms"] = int((time.time() - started) * 1000)


def _stage_done(steps: list[dict], name: str) -> bool:
  return any(s["name"] == name and s["status"] == "done" for s in steps)


def run_stage_parse(doc: dict, job: dict, steps: list[dict], cancel_event) -> dict:
  """MinerU 解析; 返回阶段 detail. 已有产物 (断点续跑) 则跳过云端调用."""
  doc_id = doc["document_id"]
  _mark_step(steps, "parse", "running", {})
  _save_job(job["job_id"], "parsing", steps, "parse")
  started = time.time()
  existing = sorted((config.MINERU_OUTPUT_DIR / doc_id).glob("*_content_list.json"))
  if _stage_done(steps, "parse") and existing:
    out_dir = existing[0].parent
    page_count = _page_count_of(existing[0])
    detail = {"batch_id": doc.get("mineru_batch_id") or "reused", "mineru_state": "done",
              "page_count": page_count, "reused": True}
  else:
    uploaded = pathlib.Path(doc["stored_path"])
    out_dir, page_count, batch_id = mineru_client.parse(
      uploaded, doc_id, doc["model_version"], bool(doc["is_ocr"]), cancel_event)
    detail = {"batch_id": batch_id, "mineru_state": "done", "page_count": page_count}
    db.update_document(doc_id, page_count=page_count, mineru_batch_id=batch_id,
                       status="indexing")
  if page_count > config.LIMITS["max_pages"]:
    raise ApiError("E_MINERU_PAGE_LIMIT",
                   f"页数超限: {page_count} > {config.LIMITS['max_pages']}", 422)
  _mark_step(steps, "parse", "done", detail, started)
  return {"out_dir": out_dir, "page_count": page_count}


def _page_count_of(content_list: pathlib.Path) -> int:
  blocks = json.loads(content_list.read_text(encoding="utf-8"))
  pages = [b["page_idx"] for b in blocks if b.get("page_idx") is not None]
  return (max(pages) + 1) if pages else 1


def run_stage_chunk(doc: dict, job: dict, steps: list[dict], ctx: dict,
                    max_chunk_chars: int) -> dict:
  doc_id = doc["document_id"]
  kg_dir = config.KG_OUTPUT_DIR / doc_id
  _mark_step(steps, "chunk", "running", {})
  _save_job(job["job_id"], "chunking", steps, "chunk")
  started = time.time()
  chunks_path = kg_dir / "chunks.jsonl"
  if not (_stage_done(steps, "chunk") and chunks_path.exists()):
    content_list = sorted(ctx["out_dir"].glob("*_content_list.json"))[0]
    chunks = chunker.build_chunks(content_list, ctx["out_dir"] / "full.md",
                                  doc_id, max_chunk_chars=max_chunk_chars)
    chunker.save_chunks(chunks, chunks_path)
    detail = {"n_chunks": len(chunks)}
  else:
    detail = {"n_chunks": len(chunks_path.read_text(encoding="utf-8").strip().splitlines()),
              "reused": True}
  _mark_step(steps, "chunk", "done", detail, started)
  return {"chunks_path": chunks_path}


def run_stage_extract(doc: dict, job: dict, steps: list[dict], ctx: dict) -> dict:
  kg_dir = config.KG_OUTPUT_DIR / doc["document_id"]
  _mark_step(steps, "extract", "running", {})
  _save_job(job["job_id"], "extracting", steps, "extract")
  started = time.time()
  out_file = kg_dir / "extraction_results.jsonl"
  if not (_stage_done(steps, "extract") and out_file.exists()):
    chunks = [json.loads(l) for l in (kg_dir / "chunks.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
    extraction.run_extraction(chunks, {"DEEPSEEK_MODEL": config.DEEPSEEK["model"],
                                       "OPENAI_API_KEY": config.DEEPSEEK["api_key"],
                                       "DEEPSEEK_BASE_URL": config.DEEPSEEK["base_url"]}, kg_dir)
    detail = {"n_documents": len(chunks)}
  else:
    detail = {"n_documents": len(out_file.read_text(encoding="utf-8").strip().splitlines()),
              "reused": True}
  n_ext = sum(len(json.loads(l).get("extractions", []))
              for l in out_file.read_text(encoding="utf-8").splitlines() if l.strip())
  detail["n_extractions"] = n_ext
  _mark_step(steps, "extract", "done", detail, started)
  return {}


def run_stage_kg(doc: dict, job: dict, steps: list[dict], ctx: dict) -> dict:
  doc_id = doc["document_id"]
  kg_dir = config.KG_OUTPUT_DIR / doc_id
  _mark_step(steps, "kg", "running", {})
  _save_job(job["job_id"], "kg_building", steps, "kg")
  started = time.time()
  triples, entities, stats = kg_builder.build_kg(
    kg_dir / "chunks.jsonl", kg_dir / "extraction_results.jsonl",
    next((config.MINERU_OUTPUT_DIR / doc_id).glob("*_content_list.json")),
    config.MINERU_OUTPUT_DIR / doc_id / "full.md", kg_dir)
  detail = {"n_entities": len(entities), "n_triples": len(triples), "stats": stats}
  _mark_step(steps, "kg", "done", detail, started)
  return detail


def run_job_sync(job_id: str) -> None:
  """四阶段同步执行 (在 to_thread 线程中运行); 每阶段落库可审计、可断点."""
  job = db.get_job(job_id)
  if not job:
    return
  doc = db.get_document(job["document_id"])
  if not doc:
    _save_job(job_id, "failed", _steps_from_row(job), None, ("E_DOC_NOT_FOUND", "文档不存在"))
    return
  steps = _steps_from_row(job) or [
    {"name": n, "status": "pending", "detail": {}} for n in job_runner.STEP_ORDER]
  if db.get_job(job_id)["cancel_requested"]:
    _save_job(job_id, "canceled", steps, None)
    return
  db.update_job(job_id, started_at=db.now(), status="parsing")
  cancel_event = job_runner.cancel_events.get(job_id)
  max_chunk_chars = job_runner.job_params.get(job_id, {}).get("max_chunk_chars", 900)
  try:
    ctx = run_stage_parse(doc, job, steps, cancel_event)
    if cancel_event is not None and cancel_event.is_set():
      _save_job(job_id, "canceled", steps, None)
      return
    ctx |= run_stage_chunk(doc, job, steps, ctx, max_chunk_chars)
    run_stage_extract(doc, job, steps, ctx)
    kg_detail = run_stage_kg(doc, job, steps, ctx)
    db.update_document(doc["document_id"], status="done",
                       n_chunks=_steps_val(steps, "chunk", "n_chunks"),
                       n_entities=kg_detail["n_entities"],
                       n_triples=kg_detail["n_triples"],
                       stats_json=json.dumps(kg_detail["stats"], ensure_ascii=False),
                       indexed_at=db.now())
    _save_job(job_id, "done", steps, None)
  except ApiError as exc:
    _mark_step(steps, _step_of_status(exc), "error", {})
    _save_job(job_id, "failed", steps, None, (exc.code, exc.message))
    db.update_document(doc["document_id"], status="failed",
                       error_code=exc.code, error_message=exc.message)
  except Exception as exc:  # noqa: BLE001
    _save_job(job_id, "failed", steps, None, ("E_INTERNAL", str(exc)))
    db.update_document(doc["document_id"], status="failed",
                       error_code="E_INTERNAL", error_message=str(exc))


def _step_of_status(exc: ApiError) -> str:
  return {"E_MINERU_PAGE_LIMIT": "parse"}.get(exc.code, "extract" if "LLM" in exc.code else "parse")


def _steps_val(steps: list[dict], name: str, key: str):
  for s in steps:
    if s["name"] == name:
      return s["detail"].get(key)
  return None


async def run_job_async(job_id: str) -> None:
  """JobRunner 调用入口: 阻塞执行下放线程 (backend spec §1.1 编排约束)."""
  await asyncio.to_thread(run_job_sync, job_id)
