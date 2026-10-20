"""ApiError + 错误码常量 + handler 注册 (backend spec §4)."""
from __future__ import annotations

import time
import uuid

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

RETRYABLE_CODES = {
  "E_MINERU_APPLY_FAILED", "E_MINERU_UPLOAD_FAILED", "E_MINERU_PARSE_FAILED",
  "E_MINERU_TIMEOUT", "E_LLM_EXTRACTION_FAILED", "E_QA_LLM_FAILED",
  "E_QA_LLM_TIMEOUT", "E_JOB_INTERRUPTED", "E_INTERNAL",
}


class ApiError(Exception):
  def __init__(self, code: str, message: str, status: int = 400,
               details: dict | None = None):
    super().__init__(message)
    self.code = code
    self.message = message
    self.status = status
    self.details = details or {}


def error_payload(code: str, message: str, details: dict | None = None) -> dict:
  return {
    "error": {
      "code": code,
      "message": message,
      "details": details or {},
      "request_id": f"req_{uuid.uuid4().hex[:8]}",
    },
    "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
  }


def sse_error(code: str, message: str) -> dict:
  """SSE error 事件数据 (backend spec §2.4)."""
  return {"code": code, "message": message, "retryable": code in RETRYABLE_CODES}


def register_error_handlers(app: FastAPI) -> None:
  @app.exception_handler(RequestValidationError)
  async def validation_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(status_code=422, content=error_payload(
      "E_VALIDATION_FAILED", "请求体/参数校验失败",
      {"fields": exc.errors()[:10]}))

  @app.exception_handler(ApiError)
  async def api_error_handler(request: Request, exc: ApiError):
    return JSONResponse(status_code=exc.status,
                        content=error_payload(exc.code, exc.message, exc.details))

  @app.exception_handler(Exception)
  async def internal_handler(request: Request, exc: Exception):
    import logging
    logging.getLogger("rag_server").exception("unhandled error")
    return JSONResponse(status_code=500, content=error_payload(
      "E_INTERNAL", "内部错误", {}))
