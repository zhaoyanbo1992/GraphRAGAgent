"""Document endpoints: 上传/管理/产物 (backend spec §2.1/§2.3)."""
from __future__ import annotations

import asyncio
import json
import pathlib

from fastapi import APIRouter, File, Form, UploadFile

from .. import config, db
from ..errors import ApiError
from ..schemas.documents import (
  ArtifactInfo, DocumentDetail, DocumentListItem, ReindexRequest, UploadResponse)
from ..services import job_runner, kg_service, upload_service

router = APIRouter(prefix="/api/v1/documents", tags=["documents"])
ARTIFACT_NAMES = {"kg_triples.jsonl", "entities.jsonl", "chunks.jsonl",
                  "extraction_results.jsonl", "full.md"}


@router.post("", response_model=UploadResponse, status_code=202)
async def upload_documents(
  files: list[UploadFile] = File(...),
  is_ocr: bool | None = Form(None),
  model_version: str | None = Form(None),
  max_chunk_chars: int | None = Form(None),
  language: str | None = Form(None),   # 预留: v1.0 接收不透传 (spec §2.1)
):
  """批量上传并启动索引; 部分成功语义 (202 accepted/rejected 分列)."""
  payload = []
  for f in files:
    data = await f.read()
    payload.append((f.filename or "unnamed", data))
  result = await asyncio.to_thread(
    upload_service.handle_upload, payload, is_ocr, model_version, max_chunk_chars)
  for item in result.accepted:
    job_runner.submit(item.job_id)
  return result


def _list_item(row: dict) -> DocumentListItem:
  err = None
  if row.get("error_code"):
    err = {"code": row["error_code"], "message": row.get("error_message")}
  return DocumentListItem(
    document_id=row["document_id"], original_filename=row["original_filename"],
    format=row["format"], size_bytes=row["size_bytes"], page_count=row["page_count"],
    status=row["status"], n_chunks=row["n_chunks"], n_entities=row["n_entities"],
    n_triples=row["n_triples"], created_at=row["created_at"],
    indexed_at=row["indexed_at"], error=err)


def _require(row: dict | None) -> dict:
  if not row:
    raise ApiError("E_DOC_NOT_FOUND", "文档不存在", 404)
  return row


@router.get("")
async def list_documents(status: str | None = None, q: str | None = None,
                         page: int = 1, page_size: int = 20):
  page, page_size = max(1, page), min(100, max(1, page_size))
  rows, total = db.list_documents(status, q, page, page_size)
  return {"items": [_list_item(r).model_dump() for r in rows],
          "total": total, "page": page, "page_size": page_size}


@router.get("/{document_id}")
async def get_document(document_id: str):
  row = _require(db.get_document(document_id))
  stats = json.loads(row["stats_json"]) if row.get("stats_json") else None
  artifacts = []
  for name in sorted(ARTIFACT_NAMES):
    p = _artifact_path(row, name)
    if p and p.exists():
      artifacts.append(ArtifactInfo(name=name, size_bytes=p.stat().st_size,
                                    url=f"/api/v1/documents/{document_id}/artifacts/{name}").model_dump())
  detail = _list_item(row).model_dump()
  detail |= {"model_version": row["model_version"], "is_ocr": bool(row["is_ocr"]),
             "mineru_batch_id": row.get("mineru_batch_id"), "stats": stats,
             "artifacts": artifacts}
  return detail


def _artifact_path(row: dict, name: str) -> pathlib.Path | None:
  if name == "full.md":
    return config.MINERU_OUTPUT_DIR / row["document_id"] / "full.md"
  return config.KG_OUTPUT_DIR / row["document_id"] / name


@router.get("/{document_id}/result")
async def get_result(document_id: str):
  """webapp 兼容 payload (spec §2.3; chunks[].blocks 完整返回)."""
  row = _require(db.get_document(document_id))
  kg_dir = config.KG_OUTPUT_DIR / document_id
  out: dict = {"doc_id": document_id}
  fullmd = config.MINERU_OUTPUT_DIR / document_id / "full.md"
  out["full_md"] = fullmd.read_text(encoding="utf-8") if fullmd.exists() else None
  chunks = []
  cp = kg_dir / "chunks.jsonl"
  if cp.exists():
    for line in cp.read_text(encoding="utf-8").splitlines():
      if not line.strip():
        continue
      c = json.loads(line)
      chunks.append({"chunk_id": c["chunk_id"], "section_title": c.get("section_title"),
                     "n_chars": len(c.get("text", "")), "blocks": c.get("blocks", [])})
  out["chunks"] = chunks
  extractions = []
  ep = kg_dir / "extraction_results.jsonl"
  if ep.exists():
    for line in ep.read_text(encoding="utf-8").splitlines():
      if not line.strip():
        continue
      d = json.loads(line)
      for e in d.get("extractions", []):
        extractions.append({
          "chunk_id": d.get("document_id"), "extraction_class": e.get("extraction_class"),
          "extraction_text": e.get("extraction_text"), "attributes": e.get("attributes"),
          "char_interval": e.get("char_interval"),
          "alignment_status": e.get("alignment_status"),
          "grounded": e.get("char_interval") is not None})
  out["extractions"] = extractions
  for name in ("entities", "triples"):
    fname = f"{name}.jsonl" if name == "entities" else f"kg_{name}.jsonl"
    p = kg_dir / fname
    out[name] = [json.loads(l) for l in (p.read_text(encoding="utf-8").splitlines()
                                         if p.exists() else []) if l.strip()]
  return out


@router.get("/{document_id}/artifacts/{name}")
async def download_artifact(document_id: str, name: str):
  if name not in ARTIFACT_NAMES:
    raise ApiError("E_ARTIFACT_NOT_FOUND", f"未知产物: {name}", 404)
  row = _require(db.get_document(document_id))
  p = _artifact_path(row, name)
  if not p or not p.exists():
    raise ApiError("E_ARTIFACT_NOT_FOUND", f"产物缺失: {name}", 404)
  media = "text/markdown" if name == "full.md" else "application/jsonl"
  from fastapi.responses import FileResponse
  return FileResponse(p, media_type=media, filename=name)


@router.delete("/{document_id}", status_code=204)
async def delete_document(document_id: str):
  row = _require(db.get_document(document_id))
  running = [j for j in db.list_jobs(document_id=document_id, page_size=100)[0]
             if j["status"] not in ("done", "failed", "canceled")]
  if running:
    raise ApiError("E_JOB_RUNNING", "文档有任务运行中, 禁止删除", 409)
  db.delete_document(document_id)  # jobs 级联 (ON DELETE CASCADE)
  shutil_rmtree(config.KG_OUTPUT_DIR / document_id)
  shutil_rmtree(config.MINERU_OUTPUT_DIR / document_id)
  stem = pathlib.Path(row["stored_path"])
  if stem.exists():
    stem.unlink()
  kg_service.invalidate(document_id)


def shutil_rmtree(p: pathlib.Path) -> None:
  import shutil
  if p.exists():
    shutil.rmtree(p, ignore_errors=True)


@router.post("/{document_id}/reindex", status_code=202)
async def reindex(document_id: str, body: ReindexRequest):
  row = _require(db.get_document(document_id))
  running = [j for j in db.list_jobs(document_id=document_id, page_size=100)[0]
             if j["status"] not in ("done", "failed", "canceled")]
  if running:
    raise ApiError("E_JOB_RUNNING", "文档有任务运行中", 409)
  if not body.reparse and row["page_count"]:
    # 断点续跑语义: parse 产物在 → 从 chunking 起跑 (步骤表保留 parse=done)
    pass
  elif not body.reparse:
    body = ReindexRequest(reparse=True, is_ocr=body.is_ocr,
                          model_version=body.model_version)
  import uuid
  job_id = f"j_{uuid.uuid4().hex[:8]}"
  prev = db.list_jobs(document_id=document_id, page_size=1)[0]
  steps = json.loads(prev[0]["steps_json"]) if prev else \
    [{"name": n, "status": "pending", "detail": {}} for n in upload_service.STEP_ORDER]
  if not body.reparse:
    for s in steps:
      if s["name"] == "parse":
        s["status"] = "done"   # 断点: parse 产物复用, 不再调 MinerU
  db.update_document(document_id, status="queued", error_code=None, error_message=None)
  if body.is_ocr is not None:
    db.update_document(document_id, is_ocr=int(body.is_ocr))
  db.insert_job({"job_id": job_id, "document_id": document_id, "type": "index",
                 "status": "queued", "attempt": 1, "current_step": None,
                 "steps_json": json.dumps(steps, ensure_ascii=False)})
  job_runner.job_params[job_id] = {"max_chunk_chars": 900}
  job_runner.submit(job_id)
  return db.get_job(job_id)
