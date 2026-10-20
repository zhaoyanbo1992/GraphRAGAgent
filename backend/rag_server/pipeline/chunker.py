# 移植自 graphrag_pipeline/chunker.py (独立副本, SystemExit→FileNotFoundError)。
# Stage 1: MinerU content_list.json -> semantic chunks.jsonl
#
# Per docs/mineru_pipeline_spec-v1.0.md §5-2: chunking is anchored on
# content_list block boundaries (text_level opens a new section); full.md is
# never rewritten and stays the coordinate base for char tracing.
"""Semantic chunker over MinerU content_list blocks."""
from __future__ import annotations

import json
import pathlib


def find_artifact(result_dir: pathlib.Path, pattern: str) -> pathlib.Path:
  """Locate a MinerU artifact by glob (server prefixes filenames with a UUID)."""
  matches = sorted(result_dir.glob(pattern))
  if not matches:
    raise FileNotFoundError(f"artifact not found in {result_dir}: {pattern}")
  return matches[0]


def build_chunks(
    content_list_path: pathlib.Path,
    full_md_path: pathlib.Path,
    doc_id: str,
    max_chunk_chars: int = 900,
) -> list[dict]:
  """Build section-anchored chunks with full.md offset mapping.

  Returns a list of chunk dicts:
    {chunk_id, doc_id, section_title, text,
     blocks: [{chunk_start, chunk_len, fullmd_start, fullmd_len,
               page_idx, bbox, block_type}]}
  Tables are excluded from chunk text (handled by the parallel table path).
  """
  blocks = json.loads(content_list_path.read_text(encoding="utf-8"))
  full_md = full_md_path.read_text(encoding="utf-8")

  # ---- group blocks into sections (text_level opens a new section) ----
  sections: list[dict] = []
  current: dict | None = None
  cursor = 0  # forward search cursor into full_md (reading order)
  for b in blocks:
    if b.get("type") != "text":
      continue  # tables/images handled by the parallel table path
    text = (b.get("text") or "").strip()
    if not text:
      continue
    is_title = "text_level" in b
    if is_title or current is None:
      if current is not None:
        sections.append(current)
      current = {"title": text if is_title else "", "blocks": []}
    # locate the block text inside full.md, searching forward
    pos = full_md.find(text, cursor)
    if pos >= 0:
      cursor = pos + len(text)
      fullmd_start, fullmd_len = pos, len(text)
    else:
      # block text not found verbatim (markdown rewriting); keep mapping None
      fullmd_start, fullmd_len = None, None
    current["blocks"].append(
        {
            "text": text,
            "fullmd_start": fullmd_start,
            "fullmd_len": fullmd_len,
            "page_idx": b.get("page_idx"),
            "bbox": b.get("bbox"),
            "block_type": "title" if is_title else "text",
        }
    )
  if current is not None:
    sections.append(current)

  # ---- split oversized sections into multiple chunks at block boundaries ----
  chunks: list[dict] = []
  for section in sections:
    part: list[dict] = []
    size = 0
    for blk in section["blocks"]:
      if part and size + len(blk["text"]) + 2 > max_chunk_chars:
        chunks.append(_make_chunk(doc_id, section["title"], part, len(chunks)))
        part, size = [], 0
      part.append(blk)
      size += len(blk["text"]) + 2
    if part:
      chunks.append(_make_chunk(doc_id, section["title"], part, len(chunks)))
  return chunks


def _make_chunk(doc_id: str, title: str, blocks: list[dict], seq: int) -> dict:
  """Assemble chunk text and per-block offset table."""
  text_parts: list[str] = []
  offset_blocks: list[dict] = []
  chunk_start = 0
  for blk in blocks:
    if text_parts:
      text_parts.append("\n\n")  # 2-char separator counted in offsets
      chunk_start += 2
    offset_blocks.append(
        {
            "chunk_start": chunk_start,
            "chunk_len": len(blk["text"]),
            "fullmd_start": blk["fullmd_start"],
            "fullmd_len": blk["fullmd_len"],
            "page_idx": blk["page_idx"],
            "bbox": blk["bbox"],
            "block_type": blk["block_type"],
        }
    )
    text_parts.append(blk["text"])
    chunk_start += len(blk["text"])
  return {
      "chunk_id": f"{doc_id}_chunk_{seq + 1:03d}",
      "doc_id": doc_id,
      "section_title": title,
      "text": "".join(text_parts),
      "blocks": offset_blocks,
  }


def save_chunks(chunks: list[dict], out_path: pathlib.Path) -> None:
  out_path.parent.mkdir(parents=True, exist_ok=True)
  with open(out_path, "w", encoding="utf-8") as f:
    for c in chunks:
      f.write(json.dumps(c, ensure_ascii=False) + "\n")
