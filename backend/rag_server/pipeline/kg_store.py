# 移植自 graphrag_pipeline/agentic_rag_mvp.py 的 KGStore (独立副本)。
# 改动: 模块级 STORE 惰性化 —— 每文档一实例 (backend spec §1.3), 构造已参数化。
"""In-memory KG view over entities.jsonl + kg_triples.jsonl + full.md."""
from __future__ import annotations

import json
import pathlib
import re
from typing import Any

import networkx as nx


class KGStore:
  """entities.jsonl + kg_triples.jsonl + full.md 的内存装载与检索."""

  @staticmethod
  def _canon(name: str) -> str:
    """规范形: 小写 + 下划线/多空白归一为单空格 (bridge §7 已知局限的兜底:
    entities.jsonl 用 snake_case, kg_triples.jsonl 用空格形式, 两边需对齐)."""
    return re.sub(r"\s+", " ", name.strip().lower().replace("_", " "))

  def __init__(self, output_dir: pathlib.Path, fullmd_path: pathlib.Path) -> None:
    self.output_dir = output_dir
    self.fullmd = fullmd_path.read_text(encoding="utf-8") if fullmd_path.exists() else ""
    self.entities: dict[str, dict] = {}
    self._ent_alias: dict[str, str] = {}  # canon -> normalized_name
    ent_path = output_dir / "entities.jsonl"
    if ent_path.exists():
      for line in ent_path.read_text(encoding="utf-8").splitlines():
        if line.strip():
          e = json.loads(line)
          self.entities[e["normalized_name"]] = e
          self._ent_alias[self._canon(e["normalized_name"])] = e["normalized_name"]
    self.triples: dict[str, dict] = {}
    self.graph = nx.MultiDiGraph()
    self._graph_alias: dict[str, str] = {}  # canon -> graph node key
    tri_path = output_dir / "kg_triples.jsonl"
    if tri_path.exists():
      for line in tri_path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
          continue
        t = json.loads(line)
        h, tl = t["head"], t["tail"]
        # 防御历史脏数据: 空实体名的三元组 (normalized_name 为 null/空) 无法成图, 跳过.
        if not (h.get("normalized_name") and tl.get("normalized_name")):
          continue
        self.triples[t["triple_id"]] = t
        for side in (h, tl):
          nid = side["normalized_name"]
          self._graph_alias.setdefault(self._canon(nid), nid)
          if not self.graph.has_node(nid):
            ent = self.entities.get(nid) or self.entities.get(
              self._ent_alias.get(self._canon(nid), ""), {})
            self.graph.add_node(nid, **{
              "name": side["name"],
              "entity_type": ent.get("entity_type", side.get("type", "unknown")),
              "mentions": ent.get("mentions", 0),
            })
        self.graph.add_edge(
          h["normalized_name"], tl["normalized_name"],
          key=t["predicate"], triple_id=t["triple_id"],
          predicate=t["predicate"], value=t["tail"].get("attributes", {}).get("value"),
        )

  def _resolve(self, name: str) -> str | None:
    return self._graph_alias.get(self._canon(name))

  # -- 检索工具实现 (纯函数, 由 services/kg_service 包装为 @tool) ----------
  def entity_lookup(self, name: str) -> str:
    cq = self._canon(name)
    hit = self._ent_alias.get(cq)
    if hit:
      return json.dumps({"matched": self.entities[hit]}, ensure_ascii=False)
    candidates = [e for k, e in self.entities.items()
                  if cq and (cq in self._canon(k) or self._canon(k) in cq)]
    if not candidates:
      return json.dumps({"matched": None, "candidates": [],
                         "known_entities": sorted(self.entities)[:30]}, ensure_ascii=False)
    return json.dumps({"matched": None, "candidates": candidates[:5]}, ensure_ascii=False)

  def expand(self, entity: str, hops: int = 1) -> str:
    node = self._resolve(entity)
    if node is None:
      hit = self.entity_lookup(entity)
      return json.dumps({"error": f"entity not in graph: {entity}",
                         "lookup_hint": json.loads(hit)}, ensure_ascii=False)
    found: list[dict] = []
    seen: set[str] = set()
    frontier = {node}
    for _ in range(max(1, hops)):
      nxt: set[str] = set()
      for node in frontier:
        for _, tgt, key, data in self.graph.edges(node, keys=True, data=True):
          tid = data.get("triple_id", "")
          if tid and tid not in seen:
            seen.add(tid)
            t = self.triples.get(tid, {})
            found.append({
              "triple_id": tid, "head": t.get("head", {}).get("name"),
              "predicate": data.get("predicate", key),
              "tail": t.get("tail", {}).get("name"),
              "attributes": t.get("tail", {}).get("attributes", {}),
              "page_idx": t.get("evidence", {}).get("page_idx"),
            })
            nxt.add(tgt)
        for src, _, key, data in self.graph.in_edges(node, keys=True, data=True):
          tid = data.get("triple_id", "")
          if tid and tid not in seen:
            seen.add(tid)
            t = self.triples.get(tid, {})
            found.append({
              "triple_id": tid, "head": t.get("head", {}).get("name"),
              "predicate": data.get("predicate", key),
              "tail": t.get("tail", {}).get("name"),
              "attributes": t.get("tail", {}).get("attributes", {}),
              "page_idx": t.get("evidence", {}).get("page_idx"),
            })
            nxt.add(src)
      frontier = nxt
    return json.dumps({"entity": entity, "triples": found}, ensure_ascii=False)

  def evidence_text(self, triple_id: str) -> str:
    t = self.triples.get(triple_id.strip())
    if not t:
      return json.dumps({"error": f"unknown triple_id: {triple_id}"}, ensure_ascii=False)
    ev = t.get("evidence", {})
    out: dict[str, Any] = {
      "triple_id": triple_id,
      "text_span": ev.get("text_span"),
      "source": ev.get("source"),
      "chunk_id": ev.get("chunk_id"),
      "page_idx": ev.get("page_idx"),
    }
    interval = ev.get("char_interval_fullmd")
    if interval and self.fullmd:
      s, e = int(interval["start_pos"]), int(interval["end_pos"])
      out["fullmd_verbatim"] = self.fullmd[s:e]  # bridge §4.3 数学契约还原
    if ev.get("bbox_normalized") or ev.get("table_image"):
      out["visual"] = {"bbox_normalized": ev.get("bbox_normalized"),
                       "table_image": ev.get("table_image")}
    return json.dumps(out, ensure_ascii=False)
