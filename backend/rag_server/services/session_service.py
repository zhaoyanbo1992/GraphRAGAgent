"""Session service: 会话与消息持久化 (backend spec §2.4 会话端点)."""
from __future__ import annotations

import uuid

from .. import db
from ..errors import ApiError

now = db.now


def create_session(title: str) -> str:
  session_id = f"s_{uuid.uuid4().hex[:8]}"
  db.insert_session({"session_id": session_id, "title": title or "新会话"})
  return session_id


def get_session(session_id: str) -> dict | None:
  return db.get_session(session_id)


def require_session(session_id: str) -> dict:
  s = db.get_session(session_id)
  if not s:
    raise ApiError("E_QA_SESSION_NOT_FOUND", "会话不存在", 404)
  return s


def list_sessions(page: int = 1, page_size: int = 20) -> tuple[list[dict], int]:
  return db.list_sessions(page, page_size)


def delete_session(session_id: str) -> None:
  require_session(session_id)
  db.delete_session(session_id)


def append_message(session_id: str, msg: dict) -> None:
  db.insert_message({"message_id": msg["message_id"], "session_id": session_id,
                     "question": msg["question"], "answer": msg.get("answer"),
                     "citations": msg.get("citations"), "doc_ids": msg.get("doc_ids"),
                     "mode": msg.get("mode", "json"), "latency": msg.get("latency"),
                     "error_code": msg.get("error_code")})
  db.touch_session(session_id)


def list_messages(session_id: str) -> list[dict]:
  return db.list_messages(session_id)
