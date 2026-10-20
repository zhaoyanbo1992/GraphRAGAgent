# 移植自 mineru_mvp/mineru_pipeline.py (独立副本, 不 import 旧组件)。
# 改动: SystemExit → MinerUPipelineError; 参数化 model_version/is_ocr/
# poll_interval/timeout/cancel_event/out_dir; 移除 CLI 与模块级 .env 依赖。
"""MinerU cloud parse pipeline: apply urls -> PUT -> poll -> download & unpack."""
from __future__ import annotations

import io
import pathlib
import time
import zipfile

import requests

TERMINAL_STATES = {"done", "failed"}


class MinerUPipelineError(Exception):
  """MinerU pipeline failure (replaces upstream SystemExit)."""


class JobCanceled(Exception):
  """Raised when cancel_event is set during polling."""


def make_headers(token: str) -> dict:
  return {"Content-Type": "application/json", "Authorization": f"Bearer {token}"}


def request_upload_urls(
    files: list[pathlib.Path], token: str, base: str,
    model_version: str = "vlm", is_ocr: bool = False,
) -> tuple[str, list[str]]:
  """Step 1: apply for batch upload urls (auto-submits parse tasks)."""
  body = {
      "model_version": model_version,
      "files": [{"name": p.name, "is_ocr": is_ocr, "data_id": p.stem} for p in files],
  }
  resp = requests.post(f"{base}/file-urls/batch", headers=make_headers(token),
                       json=body, timeout=30)
  resp.raise_for_status()
  data = resp.json()
  if data.get("code") != 0:
    raise MinerUPipelineError(f"apply upload urls failed: {data}")
  return data["data"]["batch_id"], data["data"]["file_urls"]


def upload_files(files: list[pathlib.Path], urls: list[str]) -> None:
  """Step 2: PUT local file bytes to the presigned OSS urls."""
  for path, url in zip(files, urls):
    with open(path, "rb") as f:
      resp = requests.put(url, data=f, timeout=300)
    if resp.status_code not in (200, 201):
      raise MinerUPipelineError(f"upload failed for {path.name}: HTTP {resp.status_code}")


def poll_results(
    batch_id: str, token: str, base: str,
    poll_interval: int = 8, timeout: int = 1800,
    cancel_event=None,
) -> dict[str, dict]:
  """Step 3: poll batch results until every file reaches a terminal state."""
  deadline = time.time() + timeout
  while time.time() < deadline:
    if cancel_event is not None and cancel_event.is_set():
      raise JobCanceled("canceled during MinerU polling")
    resp = requests.get(f"{base}/extract-results/batch/{batch_id}",
                        headers=make_headers(token), timeout=30)
    resp.raise_for_status()
    data = resp.json()
    if data.get("code") != 0:
      raise MinerUPipelineError(f"poll failed: {data}")
    results = data["data"]["extract_result"]
    if all(r["state"] in TERMINAL_STATES for r in results):
      return {r["file_name"]: r for r in results}
    time.sleep(poll_interval)
  raise TimeoutError(f"polling exceeded {timeout}s for batch {batch_id}")


def download_and_unpack(
    file_name: str, zip_url: str, out_dir: pathlib.Path,
) -> pathlib.Path:
  """Step 4: download result zip and unpack under out_dir/<stem>/."""
  resp = requests.get(zip_url, timeout=300)
  resp.raise_for_status()
  stem = pathlib.Path(file_name).stem
  target = out_dir / stem
  target.mkdir(parents=True, exist_ok=True)
  with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
    zf.extractall(target)
  return target
