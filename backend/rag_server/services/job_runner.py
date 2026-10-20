"""JobRunner: asyncio.Queue + 串行 worker + 取消 + 重试 + 重启清理 (backend spec §1.4).

- 进程内队列, Semaphore(1) 语义 (串行执行, 索引任务配额重);
- 状态实时落 SQLite; lifespan 启动时扫描未终态任务标记 failed(E_JOB_INTERRUPTED);
- 协作式取消: cancel_events[job_id], 阶段间 + MinerU 轮询间隔生效.
"""
from __future__ import annotations

import asyncio
import threading

from .. import db
from ..errors import ApiError

STEP_ORDER = ["parse", "chunk", "extract", "kg"]
CANCELABLE_STATUSES = {"queued", "parsing"}

queue: asyncio.Queue[str] | None = None
cancel_events: dict[str, threading.Event] = {}
job_params: dict[str, dict] = {}
_worker_task: asyncio.Task | None = None


async def start_worker() -> None:
  global queue, _worker_task
  queue = asyncio.Queue()
  _recover_interrupted()
  _worker_task = asyncio.create_task(_worker())


def stop_worker() -> None:
  if _worker_task:
    _worker_task.cancel()


def _recover_interrupted() -> None:
  """进程重启: 未终态任务标记 failed(E_JOB_INTERRUPTED), 可 retry 断点续跑."""
  for job in db.nonterminal_jobs():
    steps = job.get("steps_json") or "[]"
    db.update_job(job["job_id"], status="failed", error_code="E_JOB_INTERRUPTED",
                  error_message="服务重启导致任务中断, 可重试断点续跑", steps_json=steps)
    db.update_document(job["document_id"], status="failed",
                       error_code="E_JOB_INTERRUPTED",
                       error_message="服务重启导致任务中断, 可重试断点续跑")


def submit(job_id: str) -> None:
  assert queue is not None, "worker 未启动"
  queue.put_nowait(job_id)


async def _worker() -> None:
  from . import index_pipeline
  while True:
    job_id = await queue.get()
    try:
      await index_pipeline.run_job_async(job_id)
    except asyncio.CancelledError:
      raise
    except Exception as exc:  # noqa: BLE001 - worker 兜底, 不让队列死掉
      db.update_job(job_id, status="failed", error_code="E_INTERNAL",
                    error_message=str(exc))
    finally:
      cancel_events.pop(job_id, None)
      queue.task_done()


async def cancel_job(job_id: str) -> str:
  """协作式取消; 返回最终状态字符串 (spec §2.2 cancel 端点)."""
  job = db.get_job(job_id)
  if not job:
    raise ApiError("E_JOB_NOT_FOUND", "任务不存在", 404)
  if job["status"] not in CANCELABLE_STATUSES:
    raise ApiError("E_JOB_NOT_CANCELABLE",
                   f"状态 {job['status']} 不可取消 (仅 queued/parsing)", 409)
  ev = cancel_events.setdefault(job_id, threading.Event())
  ev.set()
  db.update_job(job_id, cancel_requested=1)
  if job["status"] == "queued":
    # 尚未开始: 直接落终态 (worker 取到时跳过)
    steps = job.get("steps_json") or "[]"
    db.update_job(job_id, status="canceled", steps_json=steps, finished_at=db.now())
    db.update_document(job["document_id"], status="failed",
                       error_code="E_JOB_CANCELED", error_message="任务已取消")
    return "canceled"
  return "cancel_requested"


async def retry_job(job_id: str) -> dict:
  """断点续跑: attempt+1 重新入队; 仅 failed/canceled 可重试 (spec §2.2)."""
  job = db.get_job(job_id)
  if not job:
    raise ApiError("E_JOB_NOT_FOUND", "任务不存在", 404)
  if job["status"] not in ("failed", "canceled"):
    raise ApiError("E_JOB_NOT_RETRYABLE",
                   f"状态 {job['status']} 不可重试 (仅 failed/canceled)", 409)
  attempt = job["attempt"] + 1
  db.update_job(job_id, status="queued", attempt=attempt, error_code=None,
                error_message=None, cancel_requested=0, queued_at=db.now(),
                started_at=None, finished_at=None)
  db.update_document(job["document_id"], status="queued", error_code=None,
                     error_message=None)
  cancel_events.pop(job_id, None)
  submit(job_id)
  return db.get_job(job_id)
