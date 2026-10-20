"""System endpoints: health / config (backend spec §2.5; config 不含密钥)."""
from __future__ import annotations

import time

from fastapi import APIRouter

from .. import config, db
from ..services import job_runner
from ..schemas.system import ConfigOut, HealthOut

router = APIRouter(prefix="/api/v1", tags=["system"])
_started = time.time()


@router.get("/health", response_model=HealthOut)
async def health():
  checks = {}
  ok = True
  try:
    db.list_documents(page_size=1)
    checks["db"] = "ok"
  except Exception:  # noqa: BLE001
    checks["db"] = "fail"
    ok = False
  checks["mineru_token"] = "present" if config.MINERU["token"] or config.MINERU["mode"] == "mock" else "missing"
  checks["deepseek_key"] = "present" if config.DEEPSEEK["api_key"] else "missing"
  if not checks["deepseek_key"] == "present":
    ok = False
  docs, _ = db.list_documents(status="done", page_size=100)
  checks["indexed_documents"] = len(docs)
  running = [j for j, _ in zip(db.list_jobs(page_size=100)[0], range(100))
             if j["status"] not in ("done", "failed", "canceled")]
  checks["jobs_running"] = len(running)
  checks["job_queue_depth"] = job_runner.queue.qsize() if job_runner.queue else 0
  if checks["mineru_token"] == "missing" or not config.DEEPSEEK["api_key"]:
    ok = False
  return HealthOut(
    status="ok" if ok else "degraded", version=config.VERSION,
    uptime_s=int(time.time() - _started),
    time=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    checks=checks)


@router.get("/config", response_model=ConfigOut)
async def get_config():
  return ConfigOut(
    limits=config.LIMITS,
    formats={k: v["exts"] for k, v in config.FORMAT_MAP.items()},
    qa={"mode": "kg_only", "max_grade_retries": 2, "recursion_limit": 30},
    models={"chat": config.DEEPSEEK["model"], "extract": config.DEEPSEEK["model"]})
