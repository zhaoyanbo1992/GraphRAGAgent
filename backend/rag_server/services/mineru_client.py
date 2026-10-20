"""MinerU 适配层 (backend spec §1.3): mock/live 双模式 + 异常归一为 ApiError.

mock 模式: 使用内置 fixtures (fixtures/sample_report) 模拟解析产物, 零配额,
供接口测试与离线演示; live 模式走 pipeline.mineru_client 真实云端 API.
"""
from __future__ import annotations

import json
import pathlib
import shutil
import time

from .. import config
from ..errors import ApiError
from ..pipeline import mineru_client as core


def _page_count(content_list: pathlib.Path) -> int:
  blocks = json.loads(content_list.read_text(encoding="utf-8"))
  pages = [b["page_idx"] for b in blocks if b.get("page_idx") is not None]
  return (max(pages) + 1) if pages else 1


def _mock_parse(doc_id: str) -> tuple[pathlib.Path, int, str]:
  """模拟解析: 复制内置 fixtures 到 mineru_output/<doc_id>/ (~1.5s 拟真延迟)."""
  time.sleep(1.5)
  out_dir = config.MINERU_OUTPUT_DIR / doc_id
  out_dir.mkdir(parents=True, exist_ok=True)
  shutil.copy(config.FIXTURES_DIR / "full.md", out_dir / "full.md")
  shutil.copy(config.FIXTURES_DIR / "sample_content_list.json",
              out_dir / f"{doc_id}_content_list.json")
  page_count = _page_count(out_dir / f"{doc_id}_content_list.json")
  return out_dir, page_count, f"mock-{doc_id}"


def _live_parse(uploaded: pathlib.Path, model_version: str, is_ocr: bool,
                cancel_event) -> tuple[pathlib.Path, int, str]:
  """真实云端解析 (pipeline.mineru_client 移植副本)."""
  token = config.MINERU["token"]
  if not token:
    raise ApiError("E_MINERU_APPLY_FAILED", "缺少 MINERU_API_TOKEN", 502)
  base = config.MINERU["base"]
  try:
    batch_id, urls = core.request_upload_urls(
      [uploaded], token, base, model_version=model_version, is_ocr=is_ocr)
  except Exception as exc:  # noqa: BLE001
    raise ApiError("E_MINERU_APPLY_FAILED", f"MinerU 申请上传链接失败: {exc}", 502) from exc
  try:
    core.upload_files([uploaded], urls)
  except Exception as exc:  # noqa: BLE001
    raise ApiError("E_MINERU_UPLOAD_FAILED", f"MinerU 上传失败: {exc}", 502) from exc
  try:
    results = core.poll_results(
      batch_id, token, base,
      poll_interval=config.MINERU["poll_interval"],
      timeout=config.MINERU["poll_timeout"],
      cancel_event=cancel_event)
  except core.JobCanceled:
    raise
  except TimeoutError as exc:
    raise ApiError("E_MINERU_TIMEOUT", f"MinerU 轮询超时 ({config.MINERU['poll_timeout']}s)",
                   504) from exc
  except Exception as exc:  # noqa: BLE001
    raise ApiError("E_MINERU_PARSE_FAILED", "MinerU 轮询失败", 502,
                   {"err_msg": str(exc)}) from exc
  name, result = next(iter(results.items()))
  if result["state"] == "failed":
    raise ApiError("E_MINERU_PARSE_FAILED", "MinerU 解析失败", 502,
                   {"err_msg": result.get("err_msg", "unknown")})
  out_dir = core.download_and_unpack(name, result["full_zip_url"],
                                     config.MINERU_OUTPUT_DIR)
  content_list = sorted(out_dir.glob("*_content_list.json"))[0]
  return out_dir, _page_count(content_list), batch_id


def parse(uploaded: pathlib.Path, doc_id: str, model_version: str, is_ocr: bool,
          cancel_event=None) -> tuple[pathlib.Path, int, str]:
  """返回 (产物目录, page_count, mineru_batch_id); JobCanceled 向上透传."""
  if config.MINERU["mode"] == "mock":
    return _mock_parse(doc_id)
  return _live_parse(uploaded, model_version, is_ocr, cancel_event)
