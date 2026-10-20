"""SQLite (WAL) 连接管理 + schema + DAO (backend spec §3).

访问方式: stdlib sqlite3 短连接 contextmanager; 写经 asyncio.to_thread 下放
(由调用方负责); PRAGMA journal_mode=WAL + foreign_keys=ON + busy_timeout=5000.
"""
from __future__ import annotations

import json
import sqlite3
import time
from contextlib import contextmanager

from .config import DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY);
CREATE TABLE IF NOT EXISTS documents (
  document_id      TEXT PRIMARY KEY,
  original_filename TEXT NOT NULL,
  stored_path      TEXT NOT NULL,
  format           TEXT NOT NULL,
  size_bytes       INTEGER NOT NULL,
  page_count       INTEGER,
  status           TEXT NOT NULL,
  model_version    TEXT NOT NULL,
  is_ocr           INTEGER NOT NULL DEFAULT 0,
  mineru_batch_id  TEXT,
  n_chunks         INTEGER, n_entities INTEGER, n_triples INTEGER,
  stats_json       TEXT,
  error_code       TEXT, error_message TEXT,
  created_at       TEXT NOT NULL, updated_at TEXT NOT NULL, indexed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_documents_status  ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_created ON documents(created_at DESC);

CREATE TABLE IF NOT EXISTS jobs (
  job_id        TEXT PRIMARY KEY,
  document_id   TEXT NOT NULL REFERENCES documents(document_id) ON DELETE CASCADE,
  type          TEXT NOT NULL DEFAULT 'index',
  status        TEXT NOT NULL,
  attempt       INTEGER NOT NULL DEFAULT 1,
  current_step  TEXT,
  steps_json    TEXT NOT NULL DEFAULT '[]',
  error_code    TEXT, error_message TEXT,
  cancel_requested INTEGER NOT NULL DEFAULT 0,
  queued_at TEXT NOT NULL, started_at TEXT, finished_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_jobs_document ON jobs(document_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status   ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_queued   ON jobs(queued_at DESC);

CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  message_id   TEXT PRIMARY KEY,
  session_id   TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  question     TEXT NOT NULL,
  answer       TEXT,
  citations_json TEXT,
  doc_ids_json TEXT NOT NULL,
  mode         TEXT NOT NULL,
  latency_json TEXT,
  error_code   TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at);
"""


def now() -> str:
  return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


@contextmanager
def connect():
  conn = sqlite3.connect(DB_PATH, timeout=10)
  conn.row_factory = sqlite3.Row
  conn.execute("PRAGMA journal_mode=WAL")
  conn.execute("PRAGMA foreign_keys=ON")
  conn.execute("PRAGMA busy_timeout=5000")
  try:
    yield conn
    conn.commit()
  finally:
    conn.close()


def init_schema() -> None:
  DB_PATH.parent.mkdir(parents=True, exist_ok=True)
  with connect() as conn:
    conn.executescript(SCHEMA)


# ---- documents DAO ----
def insert_document(row: dict) -> None:
  row = {**row, "created_at": row.get("created_at") or now(),
         "updated_at": row.get("updated_at") or now()}
  cols = ",".join(row)
  marks = ",".join("?" for _ in row)
  with connect() as conn:
    conn.execute(f"INSERT INTO documents ({cols}) VALUES ({marks})", list(row.values()))


def get_document(document_id: str) -> dict | None:
  with connect() as conn:
    row = conn.execute("SELECT * FROM documents WHERE document_id=?",
                       (document_id,)).fetchone()
    return dict(row) if row else None


def update_document(document_id: str, **fields) -> None:
  fields["updated_at"] = now()
  sets = ",".join(f"{k}=?" for k in fields)
  with connect() as conn:
    conn.execute(f"UPDATE documents SET {sets} WHERE document_id=?",
                 [*fields.values(), document_id])


def list_documents(status: str | None = None, q: str | None = None,
                   page: int = 1, page_size: int = 20) -> tuple[list[dict], int]:
  where, params = [], []
  if status:
    where.append("status=?")
    params.append(status)
  if q:
    where.append("original_filename LIKE ?")
    params.append(f"%{q}%")
  cond = f"WHERE {' AND '.join(where)}" if where else ""
  with connect() as conn:
    total = conn.execute(f"SELECT COUNT(*) c FROM documents {cond}", params).fetchone()["c"]
    rows = conn.execute(
      f"SELECT * FROM documents {cond} ORDER BY created_at DESC LIMIT ? OFFSET ?",
      [*params, page_size, (page - 1) * page_size]).fetchall()
  return [dict(r) for r in rows], total


def delete_document(document_id: str) -> None:
  with connect() as conn:
    conn.execute("DELETE FROM documents WHERE document_id=?", (document_id,))


# ---- jobs DAO ----
def insert_job(row: dict) -> None:
  row = {**row, "queued_at": row.get("queued_at") or now()}
  cols = ",".join(row)
  marks = ",".join("?" for _ in row)
  with connect() as conn:
    conn.execute(f"INSERT INTO jobs ({cols}) VALUES ({marks})", list(row.values()))


def get_job(job_id: str) -> dict | None:
  with connect() as conn:
    row = conn.execute("SELECT * FROM jobs WHERE job_id=?", (job_id,)).fetchone()
    return dict(row) if row else None


def update_job(job_id: str, **fields) -> None:
  sets = ",".join(f"{k}=?" for k in fields)
  with connect() as conn:
    conn.execute(f"UPDATE jobs SET {sets} WHERE job_id=?", [*fields.values(), job_id])


def list_jobs(document_id: str | None = None, status: str | None = None,
              page: int = 1, page_size: int = 20) -> tuple[list[dict], int]:
  where, params = [], []
  if document_id:
    where.append("document_id=?")
    params.append(document_id)
  if status:
    where.append("status=?")
    params.append(status)
  cond = f"WHERE {' AND '.join(where)}" if where else ""
  with connect() as conn:
    total = conn.execute(f"SELECT COUNT(*) c FROM jobs {cond}", params).fetchone()["c"]
    rows = conn.execute(
      f"SELECT * FROM jobs {cond} ORDER BY queued_at DESC LIMIT ? OFFSET ?",
      [*params, page_size, (page - 1) * page_size]).fetchall()
  return [dict(r) for r in rows], total


def nonterminal_jobs() -> list[dict]:
  with connect() as conn:
    rows = conn.execute(
      "SELECT * FROM jobs WHERE status NOT IN ('done','failed','canceled')").fetchall()
  return [dict(r) for r in rows]


# ---- sessions / messages DAO ----
def insert_session(row: dict) -> None:
  row = {**row, "created_at": row.get("created_at") or now(),
         "updated_at": row.get("updated_at") or now()}
  cols = ",".join(row)
  marks = ",".join("?" for _ in row)
  with connect() as conn:
    conn.execute(f"INSERT INTO sessions ({cols}) VALUES ({marks})", list(row.values()))


def get_session(session_id: str) -> dict | None:
  with connect() as conn:
    row = conn.execute("SELECT * FROM sessions WHERE session_id=?",
                       (session_id,)).fetchone()
    return dict(row) if row else None


def list_sessions(page: int = 1, page_size: int = 20) -> tuple[list[dict], int]:
  with connect() as conn:
    total = conn.execute("SELECT COUNT(*) c FROM sessions").fetchone()["c"]
    rows = conn.execute(
      "SELECT s.*, (SELECT COUNT(*) FROM messages m WHERE m.session_id=s.session_id) message_count,"
      " COALESCE((SELECT MAX(created_at) FROM messages m2 WHERE m2.session_id=s.session_id), s.updated_at) last_message_at"
      " FROM sessions s ORDER BY s.updated_at DESC LIMIT ? OFFSET ?",
      [page_size, (page - 1) * page_size]).fetchall()
  return [dict(r) for r in rows], total


def delete_session(session_id: str) -> None:
  with connect() as conn:
    conn.execute("DELETE FROM sessions WHERE session_id=?", (session_id,))


def touch_session(session_id: str) -> None:
  with connect() as conn:
    conn.execute("UPDATE sessions SET updated_at=? WHERE session_id=?", (now(), session_id))


def insert_message(row: dict) -> None:
  row = {**row, "created_at": row.get("created_at") or now()}
  row["citations_json"] = json.dumps(row.get("citations") or [], ensure_ascii=False)
  row["doc_ids_json"] = json.dumps(row.get("doc_ids") or [], ensure_ascii=False)
  row["latency_json"] = json.dumps(row.get("latency") or {}, ensure_ascii=False)
  row = {k: v for k, v in row.items() if k in (
    "message_id", "session_id", "question", "answer", "citations_json",
    "doc_ids_json", "mode", "latency_json", "error_code", "created_at")}
  cols = ",".join(row)
  marks = ",".join("?" for _ in row)
  with connect() as conn:
    conn.execute(f"INSERT INTO messages ({cols}) VALUES ({marks})", list(row.values()))


def list_messages(session_id: str) -> list[dict]:
  with connect() as conn:
    rows = conn.execute(
      "SELECT * FROM messages WHERE session_id=? ORDER BY created_at",
      (session_id,)).fetchall()
  out = []
  for r in rows:
    d = dict(r)
    d["citations"] = json.loads(d.pop("citations_json") or "[]")
    d["doc_ids"] = json.loads(d.pop("doc_ids_json") or "[]")
    d["latency_ms"] = json.loads(d.pop("latency_json") or "{}")
    out.append(d)
  return out
