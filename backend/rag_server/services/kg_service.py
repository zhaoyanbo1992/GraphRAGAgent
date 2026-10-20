"""KG service: 每文档 KGStore + 多文档聚合视图 + 缓存失效 (backend spec §1.3).

聚合视图是只读 facade: 实体查找跨文档合并; expand 在命中文档内扩展;
triple_id → doc_id 映射供引用富化与消歧 (spec §6-1).
"""
from __future__ import annotations

import json
import threading

from .. import config
from ..errors import ApiError
from ..pipeline.kg_store import KGStore

_cache: dict[str, KGStore] = {}
_lock = threading.Lock()


def get_store(doc_id: str) -> KGStore:
  with _lock:
    if doc_id in _cache:
      return _cache[doc_id]
  kg_dir = config.KG_OUTPUT_DIR / doc_id
  if not (kg_dir / "kg_triples.jsonl").exists():
    raise ApiError("E_ARTIFACT_NOT_FOUND", f"文档产物缺失: {doc_id}", 404)
  store = KGStore(kg_dir, config.MINERU_OUTPUT_DIR / doc_id / "full.md")
  with _lock:
    _cache[doc_id] = store
  return store


def invalidate(doc_id: str | None = None) -> None:
  with _lock:
    if doc_id is None:
      _cache.clear()
    else:
      _cache.pop(doc_id, None)


def resolve_scope(doc_ids: list[str] | None) -> list[str]:
  """问答 scope: 未传 = 全部 done 文档; 含非 done 文档 → 409 (spec §2.4)."""
  if doc_ids:
    if len(doc_ids) > config.LIMITS["max_doc_ids_per_query"]:
      raise ApiError("E_VALIDATION_FAILED",
                     f"doc_ids 最多 {config.LIMITS['max_doc_ids_per_query']} 个", 422)
    for d in doc_ids:
      doc = _doc_status(d)
      if doc is None:
        raise ApiError("E_DOC_NOT_FOUND", f"文档不存在: {d}", 404)
      if doc != "done":
        raise ApiError("E_DOC_NOT_INDEXED", "文档尚未完成索引", 409,
                       {"document_id": d, "status": doc})
    return doc_ids
  docs, _ = _done_docs()
  if not docs:
    raise ApiError("E_QA_NO_INDEXED_DOCS", "无可问文档 (尚未有索引完成的文档)", 409)
  return docs


def _doc_status(doc_id: str) -> str | None:
  from .. import db
  row = db.get_document(doc_id)
  return row["status"] if row else None


def _done_docs() -> tuple[list[str], int]:
  from .. import db
  rows, total = db.list_documents(status="done", page_size=100)
  return [r["document_id"] for r in rows], total


class MultiDocView:
  """跨文档聚合: 单一 store 语义的 lookup/expand/evidence + doc 归属."""

  def __init__(self, doc_ids: list[str]):
    self.doc_ids = doc_ids
    self.stores: dict[str, KGStore] = {d: get_store(d) for d in doc_ids}
    self._tid_doc: dict[str, str] = {}
    for d, s in self.stores.items():
      for tid in s.triples:
        self._tid_doc.setdefault(tid, d)   # 歧义时保留首个 (spec §6-1)

  @property
  def entities(self) -> dict[str, dict]:
    merged: dict[str, dict] = {}
    for s in self.stores.values():
      merged.update(s.entities)
    return merged

  @property
  def triples(self) -> dict[str, dict]:
    """合并 triple 字典 (agent_graph fallback 以 store.triples.get(...) 访问)."""
    merged: dict[str, dict] = {}
    for s in self.stores.values():
      merged.update(s.triples)
    return merged

  def all_triples(self) -> dict[str, dict]:
    return self.triples

  def doc_of(self, triple_id: str) -> str | None:
    return self._tid_doc.get(triple_id)

  def lookup(self, name: str) -> str:
    import json as _json
    cq = KGStore._canon(name)
    for d in self.doc_ids:
      s = self.stores[d]
      hit = s._ent_alias.get(cq)
      if hit:
        return _json.dumps({"matched": s.entities[hit], "doc_id": d}, ensure_ascii=False)
    for d in self.doc_ids:
      s = self.stores[d]
      cands = [e for k, e in s.entities.items()
               if cq and (cq in KGStore._canon(k) or KGStore._canon(k) in cq)]
      if cands:
        return _json.dumps({"matched": None, "candidates": cands[:5], "doc_id": d},
                           ensure_ascii=False)
    known = sorted(self.entities)[:30]
    return _json.dumps({"matched": None, "candidates": [], "known_entities": known},
                       ensure_ascii=False)

  def expand(self, entity: str, hops: int = 1) -> str:
    import json as _json
    for d in self.doc_ids:
      s = self.stores[d]
      if s._resolve(entity):
        out = _json.loads(s.expand(entity, hops))
        out["doc_id"] = d
        return _json.dumps(out, ensure_ascii=False)
    return self.lookup(entity)

  def evidence(self, triple_id: str) -> str:
    import json as _json
    d = self.doc_of(triple_id)
    if d:
      return self.stores[d].evidence_text(triple_id)
    return _json.dumps({"error": f"unknown triple_id: {triple_id}"}, ensure_ascii=False)

  # -- agent_graph.build_tools 期望的 store 接口别名 (entity_lookup/expand/evidence_text)
  def entity_lookup(self, name: str) -> str:
    return self.lookup(name)

  def evidence_text(self, triple_id: str) -> str:
    return self.evidence(triple_id)

  def citation_enrich(self, triple_id: str, text_span: str) -> dict:
    """引用富化 (spec §2.4 citations 字段表): evidence.* + fullmd_verbatim."""
    d = self.doc_of(triple_id)
    if not d:
      return {"triple_id": triple_id, "text_span": text_span, "doc_id": None}
    t = self.stores[d].triples.get(triple_id, {})
    ev = t.get("evidence", {})
    verbatim = None
    interval = ev.get("char_interval_fullmd")
    if interval and self.stores[d].fullmd:
      verbatim = self.stores[d].fullmd[int(interval["start_pos"]):int(interval["end_pos"])]
    return {
      "triple_id": triple_id,
      "text_span": ev.get("text_span") or text_span,   # text_span 以 KG 产物归一
      "doc_id": d,
      "page_idx": ev.get("page_idx"),
      "source": ev.get("source"),
      "chunk_id": ev.get("chunk_id"),
      "char_interval_fullmd": interval,
      "fullmd_verbatim": verbatim,
      "bbox_normalized": ev.get("bbox_normalized"),
      "table_image": ev.get("table_image"),
    }
