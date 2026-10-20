"""Settings: .env 加载 + 路径/限制/格式映射 (backend spec §1.2 config.py)."""
from __future__ import annotations

import os
import pathlib


def load_env(path: pathlib.Path) -> dict[str, str]:
  env: dict[str, str] = {}
  if not path.exists():
    return env
  for raw in path.read_text(encoding="utf-8").splitlines():
    line = raw.strip()
    if not line or line.startswith("#") or "=" not in line:
      continue
    key, _, value = line.partition("=")
    env[key.strip()] = value.strip()
  return env


PKG_DIR = pathlib.Path(__file__).resolve().parent       # backend/rag_server
BACKEND_DIR = PKG_DIR.parent                            # backend/
# 优先级: .env > 环境变量 (根 CLAUDE.md 规范: 全部外部配置以 .env 为准)
ENV = {**os.environ, **load_env(BACKEND_DIR / ".env")}

# ---- DeepSeek (LangChain + LangExtract 共用) ----
DEEPSEEK = {
  "api_key": ENV.get("OPENAI_API_KEY", ""),
  "base_url": ENV.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1"),
  "model": ENV.get("DEEPSEEK_MODEL", "deepseek-flash"),
}

# ---- MinerU ----
MINERU = {
  "token": ENV.get("MINERU_API_TOKEN", ""),
  "base": ENV.get("MINERU_API_BASE", "https://mineru.net/api/v4").rstrip("/"),
  "mode": ENV.get("MINERU_MODE", "mock").lower(),       # mock | live
  "poll_interval": int(ENV.get("POLL_INTERVAL", "8")),
  "poll_timeout": int(ENV.get("POLL_TIMEOUT", "1800")),
}

# ---- 路径 (独立项目, 产物落 backend/rag_server/data/) ----
DATA_DIR = PKG_DIR / "data"
UPLOADS_DIR = DATA_DIR / "uploads"
MINERU_OUTPUT_DIR = DATA_DIR / "mineru_output"
KG_OUTPUT_DIR = DATA_DIR / "kg_output"
DB_PATH = DATA_DIR / "rag_server.db"
FIXTURES_DIR = PKG_DIR / "fixtures" / "sample_report"

# ---- 限制与格式白名单 (backend spec §2.1, 对齐 mineru 规范 §1.1) ----
LIMITS = {
  "max_file_bytes": 200 * 1024 * 1024,
  "max_files_per_request": 10,
  "max_pages": 600,
  "max_doc_ids_per_query": 5,
  "question_max_chars": 2000,
}
FORMAT_MAP: dict[str, dict] = {
  "pdf": {"exts": [".pdf"], "model_version": "vlm", "is_ocr": False},
  "image": {"exts": [".png", ".jpg", ".jpeg", ".jp2", ".webp", ".gif", ".bmp"],
            "model_version": "vlm", "is_ocr": True},
  "office": {"exts": [".doc", ".docx", ".ppt", ".pptx"], "model_version": "vlm",
             "is_ocr": False},
  "html": {"exts": [".html"], "model_version": "MinerU-HTML", "is_ocr": False},
}
# html 强制 MinerU-HTML; 用户指定的其他合法值
ALLOWED_MODEL_VERSIONS = {"vlm", "pipeline", "MinerU-HTML"}

VERSION = "1.0.0"
STARTED_AT = None  # lifespan 内赋值


def find_format(ext: str) -> str | None:
  for fmt, spec in FORMAT_MAP.items():
    if ext in spec["exts"]:
      return fmt
  return None


def ensure_dirs() -> None:
  for d in (DATA_DIR, UPLOADS_DIR, MINERU_OUTPUT_DIR, KG_OUTPUT_DIR):
    d.mkdir(parents=True, exist_ok=True)
