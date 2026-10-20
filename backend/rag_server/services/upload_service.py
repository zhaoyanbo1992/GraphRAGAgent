"""Upload service: 格式/大小/数量校验 · doc_id 生成 · uploads/ 落盘 (backend spec §2.1)."""
from __future__ import annotations

import shutil
import uuid
from pathlib import Path

from .. import config, db
from ..errors import ApiError
from ..schemas.documents import UploadAcceptedItem, UploadRejectedItem, UploadResponse

STEP_ORDER = ["parse", "chunk", "extract", "kg"]
JOB_STAGES = ["parsing", "chunking", "extracting", "kg_building"]
PROGRESS = {"queued": 0, "parsing": 40, "chunking": 70, "extracting": 80,
            "kg_building": 90, "done": 100}


def new_doc_id(filename: str) -> str:
  stem = Path(filename).stem[:40] or "doc"
  return f"{uuid.uuid4().hex[:8]}_{stem}"


def validate_one(filename: str, size: int) -> tuple[str, str] | None:
  """返回 (code, message) 或 None (合法). 校验顺序: 空→扩展名→大小 (spec §2.1)."""
  ext = Path(filename).suffix.lower()
  if size == 0:
    return "E_UPLOAD_EMPTY_FILE", "空文件"
  if config.find_format(ext) is None:
    return "E_UPLOAD_UNSUPPORTED_FORMAT", f"不支持的文件格式: {ext}"
  if size > config.LIMITS["max_file_bytes"]:
    return "E_UPLOAD_TOO_LARGE", f"超过 200MB 限制 ({size} bytes)"
  return None


def _initial_steps() -> list[dict]:
  return [{"name": n, "status": "pending", "detail": {}} for n in STEP_ORDER]


def save_upload(data: bytes, doc_id: str, ext: str) -> Path:
  path = config.UPLOADS_DIR / f"{doc_id}{ext}"
  path.write_bytes(data)
  return path


def handle_upload(files: list[tuple[str, bytes]], is_ocr: bool | None,
                  model_version: str | None, max_chunk_chars: int | None) -> UploadResponse:
  """批量上传, 部分成功语义 (202): accepted/rejected 分列, 逐文件独立校验."""
  if not files:
    raise ApiError("E_VALIDATION_FAILED", "缺少文件", 422)
  if len(files) > config.LIMITS["max_files_per_request"]:
    raise ApiError("E_UPLOAD_TOO_MANY_FILES",
                   f"单批最多 {config.LIMITS['max_files_per_request']} 个文件", 200)
  accepted, rejected = [], []
  for filename, data in files:
    err = validate_one(filename, len(data))
    if err:
      rejected.append(UploadRejectedItem(filename=filename, code=err[0], message=err[1]))
      continue
    ext = Path(filename).suffix.lower()
    fmt = config.find_format(ext)
    # html 强制 MinerU-HTML, 冲突即拒 (spec §2.1)
    forced = config.FORMAT_MAP[fmt]["model_version"]
    mv = model_version or "vlm"
    if mv not in config.ALLOWED_MODEL_VERSIONS:
      rejected.append(UploadRejectedItem(
        filename=filename, code="E_UPLOAD_MODEL_VERSION_CONFLICT",
        message=f"未知 model_version: {mv}"))
      continue
    if fmt == "html" and mv != "MinerU-HTML":
      rejected.append(UploadRejectedItem(
        filename=filename, code="E_UPLOAD_MODEL_VERSION_CONFLICT",
        message=".html 文件强制 model_version=MinerU-HTML"))
      continue
    if fmt != "html" and mv == "MinerU-HTML":
      rejected.append(UploadRejectedItem(
        filename=filename, code="E_UPLOAD_MODEL_VERSION_CONFLICT",
        message="MinerU-HTML 仅适用于 .html 文件"))
      continue
    ocr = is_ocr if is_ocr is not None else config.FORMAT_MAP[fmt]["is_ocr"]

    doc_id = new_doc_id(filename)
    stored = save_upload(data, doc_id, ext)
    db.insert_document({
      "document_id": doc_id, "original_filename": filename,
      "stored_path": str(stored), "format": fmt, "size_bytes": len(data),
      "status": "queued", "model_version": mv, "is_ocr": int(ocr),
    })
    job_id = f"j_{uuid.uuid4().hex[:8]}"
    db.insert_job({
      "job_id": job_id, "document_id": doc_id, "type": "index", "status": "queued",
      "attempt": 1, "current_step": None, "steps_json": "[]",
    })
    # max_chunk_chars 为请求级参数: 内存登记 (进程内 JobRunner; 重启后回落默认 900)
    from . import job_runner
    job_runner.job_params[job_id] = {"max_chunk_chars": max_chunk_chars or 900}
    accepted.append(UploadAcceptedItem(
      document_id=doc_id, job_id=job_id, filename=filename, format=fmt,
      size_bytes=len(data), model_version=mv, is_ocr=ocr, status="queued"))
  return UploadResponse(accepted=accepted, rejected=rejected)
