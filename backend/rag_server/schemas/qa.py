"""QA schemas (backend spec §2.4; citations 对齐 agentic_rag spec §4.1 富化形状)."""
from __future__ import annotations

from pydantic import BaseModel, Field


class AskRequest(BaseModel):
  question: str = Field(min_length=1, max_length=2000)
  session_id: str | None = None
  doc_ids: list[str] | None = None
  include_evidence: bool = True


class Citation(BaseModel):
  triple_id: str
  text_span: str
  doc_id: str | None = None
  page_idx: int | None = None
  source: str | None = None
  chunk_id: str | None = None
  char_interval_fullmd: dict | None = None
  fullmd_verbatim: str | None = None
  bbox_normalized: list | None = None
  table_image: str | None = None


class AnswerOut(BaseModel):
  message_id: str
  session_id: str
  question: str
  answer: str
  citations: list[Citation] = []
  doc_ids: list[str] = []
  latency_ms: dict = {}
  created_at: str


class MessageOut(BaseModel):
  message_id: str
  question: str
  answer: str | None = None
  citations: list = []
  doc_ids: list = []
  mode: str
  latency_ms: dict = {}
  error_code: str | None = None
  created_at: str


class SessionSummary(BaseModel):
  session_id: str
  title: str
  created_at: str
  last_message_at: str | None = None
  message_count: int = 0


class SessionDetail(BaseModel):
  session_id: str
  title: str
  created_at: str
  messages: list[MessageOut] = []
