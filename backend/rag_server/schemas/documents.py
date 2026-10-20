"""Document schemas (backend spec §2.3)."""
from __future__ import annotations

from pydantic import BaseModel, Field


class UploadAcceptedItem(BaseModel):
  document_id: str
  job_id: str
  filename: str
  format: str
  size_bytes: int
  model_version: str
  is_ocr: bool
  status: str = "queued"


class UploadRejectedItem(BaseModel):
  filename: str
  code: str
  message: str


class UploadResponse(BaseModel):
  accepted: list[UploadAcceptedItem]
  rejected: list[UploadRejectedItem]


class DocumentListItem(BaseModel):
  document_id: str
  original_filename: str
  format: str
  size_bytes: int
  page_count: int | None = None
  status: str
  n_chunks: int | None = None
  n_entities: int | None = None
  n_triples: int | None = None
  created_at: str
  indexed_at: str | None = None
  error: dict | None = None


class ArtifactInfo(BaseModel):
  name: str
  size_bytes: int
  url: str


class DocumentDetail(DocumentListItem):
  model_version: str
  is_ocr: bool
  mineru_batch_id: str | None = None
  stats: dict | None = None
  artifacts: list[ArtifactInfo] = Field(default_factory=list)


class ReindexRequest(BaseModel):
  reparse: bool = False
  is_ocr: bool | None = None
  model_version: str | None = None


class Page(BaseModel):
  page: int = 1
  page_size: int = 20

  def clamp(self) -> tuple[int, int]:
    return max(1, self.page), min(100, max(1, self.page_size))
