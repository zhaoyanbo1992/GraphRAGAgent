"""System schemas (backend spec §2.5; config 不含任何密钥)."""
from __future__ import annotations

from pydantic import BaseModel


class HealthOut(BaseModel):
  status: str                       # ok | degraded
  version: str
  uptime_s: int
  time: str
  checks: dict


class ConfigOut(BaseModel):
  limits: dict
  formats: dict
  qa: dict
  models: dict
