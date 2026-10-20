"""Job schemas (backend spec §2.2)."""
from __future__ import annotations

from pydantic import BaseModel


class JobStep(BaseModel):
  name: str
  status: str                      # pending|running|done|error
  started_at: str | None = None
  finished_at: str | None = None
  elapsed_ms: int | None = None
  detail: dict = {}


class JobOut(BaseModel):
  job_id: str
  document_id: str
  type: str = "index"
  status: str                      # 8 态 (backend spec §2.2)
  attempt: int = 1
  progress: int
  steps: list[JobStep] = []
  error: dict | None = None
  queued_at: str | None = None
  started_at: str | None = None
  finished_at: str | None = None


class CancelResponse(BaseModel):
  job_id: str
  status: str
