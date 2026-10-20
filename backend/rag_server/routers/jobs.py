"""Job endpoints: 状态查询 / 取消 / 重试 / 列表 (backend spec §2.2)."""
from __future__ import annotations

import json

from fastapi import APIRouter

from .. import db
from ..errors import ApiError
from ..schemas.jobs import CancelResponse, JobOut
from ..services import job_runner

router = APIRouter(prefix="/api/v1/jobs", tags=["jobs"])

STAGE_OF_STEP = {"parse": "parsing", "chunk": "chunking", "extract": "extracting",
                 "kg": "kg_building"}


def _job_out(row: dict) -> JobOut:
  steps = json.loads(row.get("steps_json") or "[]")
  status = row["status"]
  progress = {"queued": 0, "parsing": 40, "chunking": 70, "extracting": 80,
              "kg_building": 90, "done": 100}.get(status, 0 if status == "failed" else 0)
  err = None
  if row.get("error_code"):
    err = {"code": row["error_code"], "message": row.get("error_message")}
  return JobOut(
    job_id=row["job_id"], document_id=row["document_id"], type=row["type"],
    status=status, attempt=row["attempt"], progress=progress,
    steps=[{"name": s["name"], "status": s["status"],
            "started_at": s.get("started_at"), "finished_at": s.get("finished_at"),
            "elapsed_ms": s.get("elapsed_ms"), "detail": s.get("detail", {})}
           for s in steps],
    error=err, queued_at=row.get("queued_at"), started_at=row.get("started_at"),
    finished_at=row.get("finished_at"))


def _require(job_id: str) -> dict:
  row = db.get_job(job_id)
  if not row:
    raise ApiError("E_JOB_NOT_FOUND", "任务不存在", 404)
  return row


@router.get("")
async def list_jobs(document_id: str | None = None, status: str | None = None,
                    page: int = 1, page_size: int = 20):
  page, page_size = max(1, page), min(100, max(1, page_size))
  rows, total = db.list_jobs(document_id, status, page, page_size)
  return {"items": [_job_out(r).model_dump() for r in rows],
          "total": total, "page": page, "page_size": page_size}


@router.get("/{job_id}")
async def get_job(job_id: str):
  return _job_out(_require(job_id)).model_dump()


@router.post("/{job_id}/cancel")
async def cancel(job_id: str):
  _require(job_id)
  status = await job_runner.cancel_job(job_id)
  return CancelResponse(job_id=job_id, status=status).model_dump()


@router.post("/{job_id}/retry", status_code=202)
async def retry(job_id: str):
  _require(job_id)
  row = await job_runner.retry_job(job_id)
  return _job_out(row).model_dump()
