# 移植自 graphrag_pipeline/kg_builder.py (独立副本, 原样移植)。
# Stage 3: LangExtract JSONL + chunks + content_list tables -> KG triples
#
# Per the integration plan:
#   - drop ungrounded extractions (char_interval is None)
#   - entities -> entity registry; relations -> (head, predicate, tail) triples
#   - tables bypass the LLM entirely: table_body HTML -> pandas-style parsing
#   - dual provenance: (chunk char_interval -> full.md offset) + (page_idx, bbox)
"""Assemble knowledge-graph triples from extraction results and tables."""
from __future__ import annotations

import json
import pathlib
import re
from html.parser import HTMLParser


class _TableHTMLParser(HTMLParser):
  """Minimal flat-table parser (rows of cells) - no external deps."""

  def __init__(self):
    super().__init__()
    self.rows: list[list[str]] = []
    self._row: list[str] | None = None
    self._cell: list[str] | None = None

  def handle_starttag(self, tag, attrs):
    if tag == "tr":
      self._row = []
    elif tag == "td" and self._row is not None:
      self._cell = []

  def handle_data(self, data):
    if self._cell is not None:
      self._cell.append(data)

  def handle_endtag(self, tag):
    if tag == "td" and self._cell is not None:
      self._row.append("".join(self._cell).strip())
      self._cell = None
    elif tag == "tr" and self._row is not None:
      if any(self._row):
        self.rows.append(self._row)
      self._row = None


def parse_flat_table(html: str) -> list[list[str]]:
  parser = _TableHTMLParser()
  parser.feed(html)
  return parser.rows


def normalize(name: str | None) -> str | None:
  """Rule-based normalization for MVP entity matching."""
  if not name:
    return None
  n = name.strip().lower()
  n = re.sub(r"\b(corporation|corp|inc|ltd|co\.?|company)\b", "", n)
  return n.strip() or name.strip().lower()


def _to_fullmd_interval(blocks: list[dict], s: int, e: int) -> tuple[int, int] | None:
  """Map a chunk-text char interval to full.md offsets via the block table."""
  for b in blocks:
    bs, blen = b["chunk_start"], b["chunk_len"]
    if b["fullmd_start"] is None:
      continue
    if bs <= s < bs + blen:
      fs = b["fullmd_start"] + (s - bs)
      fe = b["fullmd_start"] + (min(e, bs + blen) - bs)
      return fs, fe
  return None


def build_kg(
    chunks_path: pathlib.Path,
    extraction_path: pathlib.Path,
    content_list_path: pathlib.Path,
    full_md_path: pathlib.Path,
    output_dir: pathlib.Path,
) -> tuple[list[dict], list[dict], dict]:
  """Produce entities.jsonl and kg_triples.jsonl; return (triples, entities, stats)."""
  chunks = {c["chunk_id"]: c for c in _read_jsonl(chunks_path)}
  docs = _read_jsonl(extraction_path)
  content_blocks = json.loads(content_list_path.read_text(encoding="utf-8"))

  entities: dict[str, dict] = {}
  triples: list[dict] = []
  stats = {"dropped_ungrounded": 0, "dropped_empty_node": 0, "narrative": 0, "table": 0, "resolved": 0}

  def _register_entity(name: str, etype: str, norm: str | None) -> None:
    key = norm or normalize(name)
    if not key:
      return
    ent = entities.setdefault(key, {"name": name, "entity_type": etype, "normalized_name": key, "mentions": 0})
    ent["mentions"] += 1

  def _add_triple(
      head: str, head_type: str, predicate: str, tail: str, tail_type: str,
      attrs: dict, evidence: dict, path: str,
  ) -> None:
    if not (head and head.strip()) or not (tail and tail.strip()):
      # 空实体名 (如表格空单元格) 无法构成图节点, 丢弃以免污染 KG (normalized_name=null).
      stats["dropped_empty_node"] += 1
      return
    triple_id = f"t_{len(triples) + 1:06d}"
    triples.append(
        {
            "triple_id": triple_id,
            "head": {"name": head, "type": head_type, "normalized_name": normalize(head)},
            "predicate": predicate,
            "tail": {"name": tail, "type": tail_type, "normalized_name": normalize(tail), "attributes": attrs},
            "evidence": evidence,
            "provenance": {"path": path},
        }
      )
    stats[path] += 1

  # ---- narrative path: LangExtract extractions ----
  for doc in docs:
    chunk = chunks.get(doc["document_id"])
    for e in doc.get("extractions", []):
      if e.get("char_interval") is None:
        stats["dropped_ungrounded"] += 1
        continue
      attrs = e.get("attributes") or {}
      cls = e["extraction_class"]
      if cls == "entity":
        _register_entity(e["extraction_text"], attrs.get("entity_type", "unknown"), attrs.get("normalized_name"))
        continue
      if cls != "relation":
        continue
      ci = e["char_interval"]
      s, en = ci["start_pos"], ci["end_pos"]
      mapped = _to_fullmd_interval(chunk["blocks"], s, en) if chunk else None
      span = e["extraction_text"]
      head, tail, pred = attrs.get("head", ""), attrs.get("tail", ""), attrs.get("predicate", "related_to")
      head_ok = bool(head) and (normalize(head) in entities or normalize(head) == normalize(head))
      tail_ok = bool(tail)
      if head_ok and tail_ok:
        stats["resolved"] += 1
      _add_triple(
          head=head or span, head_type="unknown",
          predicate=pred,
          tail=tail or (attrs.get("value") or ""), tail_type="unknown",
          attrs={k: v for k, v in attrs.items() if k not in ("head", "predicate", "tail")},
          evidence={
              "text_span": span,
              "source": "full.md",
              "chunk_id": doc["document_id"],
              "char_interval_chunk": {"start_pos": s, "end_pos": en},
              "char_interval_fullmd": {"start_pos": mapped[0], "end_pos": mapped[1]} if mapped else None,
              "page_idx": chunk["blocks"][0]["page_idx"] if chunk else None,
          },
          path="narrative",
      )

  # ---- table path: table_body HTML -> triples (no LLM) ----
  doc_id = next(iter({c["doc_id"] for c in chunks.values()}), "doc")
  # Unit is declared in narrative text like "(Unit: billion CNY)"; track the
  # latest declaration seen in reading order and apply it to following tables.
  unit = None
  for b in content_blocks:
    if b.get("type") != "table":
      m = re.search(r"\(Unit:\s*([^)]+)\)", b.get("text") or "")
      if m:
        unit = m.group(1).strip()
      continue
    rows = parse_flat_table(b.get("table_body") or "")
    if len(rows) < 2:
      continue
    header, data_rows = rows[0], rows[1:]
    for row in data_rows:
      period = row[0] if row else ""
      _register_entity(period, "period", period.lower())
      for col, value in zip(header[1:], row[1:]):
        pred = "has_" + re.sub(r"[^a-z0-9]+", "_", col.lower()).strip("_")
        bare_number = bool(re.fullmatch(r"[\d.]+", value or ""))
        tail_value = f"{value} {unit}".strip() if unit and bare_number else value
        _add_triple(
            head=period, head_type="period",
            predicate=pred,
            tail=tail_value, tail_type="metric_value",
            attrs={"column": col, **({"unit": unit} if unit and bare_number else {})},
            evidence={
                "text_span": value,
                "source": "table_body",
                "chunk_id": None,
                "char_interval_fullmd": None,
                "page_idx": b.get("page_idx"),
                "bbox_normalized": b.get("bbox"),
                "table_image": b.get("img_path"),
            },
            path="table",
        )

  # ---- persist ----
  output_dir.mkdir(parents=True, exist_ok=True)
  _write_jsonl(output_dir / "entities.jsonl", list(entities.values()))
  _write_jsonl(output_dir / "kg_triples.jsonl", triples)
  return triples, list(entities.values()), stats


def _read_jsonl(path: pathlib.Path) -> list[dict]:
  return [json.loads(l) for l in path.read_text(encoding="utf-8").splitlines() if l.strip()]


def _write_jsonl(path: pathlib.Path, rows: list[dict]) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  with open(path, "w", encoding="utf-8") as f:
    for r in rows:
      f.write(json.dumps(r, ensure_ascii=False) + "\n")
