#!/usr/bin/env python3
"""生成 frontend/js/mock/data.js —— mock 数据逐字段拷贝自实测产物。

来源（只读）：
  graphrag_pipeline/output/<doc_id>/{kg_triples,entities,chunks,extraction_results}.jsonl
  mineru_mvp/output/<doc_id>/full.md

内置溯源数学契约断言（PRD §6 验收基线）：
  对 narrative 三元组：full_md[char_interval_fullmd] == text_span

用法（在仓库任意位置）：
  python3 frontend/tools/gen_mock.py
生成文件 js/mock/data.js 禁止手改。
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PIPE_OUT = ROOT / "graphrag_pipeline" / "output"
MINERU_OUT = ROOT / "mineru_mvp" / "output"
DEST = ROOT / "frontend" / "js" / "mock" / "data.js"

DOCS = [
    ("a00ce40c_sample_report", "sample_report.pdf", "pdf", 2728,
     "2026-10-14T01:59:58Z", "2026-10-14T02:00:45Z"),
    ("dd68cea4_sample_graphrag_overview", "sample_graphrag_overview.pdf", "pdf", 9214,
     "2026-10-14T02:05:00Z", "2026-10-14T02:05:52Z"),
]


def read_jsonl(path):
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def build_doc(doc_id, filename, fmt, size, created_at, indexed_at):
    pipe = PIPE_OUT / doc_id
    full_md = (MINERU_OUT / doc_id / "full.md").read_text(encoding="utf-8")

    triples = read_jsonl(pipe / "kg_triples.jsonl")
    entities = read_jsonl(pipe / "entities.jsonl")
    chunks = read_jsonl(pipe / "chunks.jsonl")
    ext_records = read_jsonl(pipe / "extraction_results.jsonl")

    # 展平抽取明细（webapp 语义：grounded = char_interval is not null）
    extractions = []
    for i, rec in enumerate(ext_records):
        chunk_id = chunks[i]["chunk_id"] if i < len(chunks) else None
        for e in rec.get("extractions", []):
            extractions.append({
                "chunk_id": chunk_id,
                "extraction_class": e.get("extraction_class"),
                "extraction_text": e.get("extraction_text"),
                "attributes": e.get("attributes") or {},
                "char_interval": e.get("char_interval"),
                "alignment_status": e.get("alignment_status"),
                "grounded": e.get("char_interval") is not None,
            })

    page_idxes = [t["evidence"].get("page_idx") for t in triples
                  if t["evidence"].get("page_idx") is not None]
    page_idxes += [b.get("page_idx") for c in chunks for b in c.get("blocks", [])
                   if b.get("page_idx") is not None]
    page_count = (max(page_idxes) + 1) if page_idxes else None

    # 溯源数学契约断言
    failures = []
    for t in triples:
        ci = t["evidence"].get("char_interval_fullmd")
        if t["provenance"]["path"] == "narrative" and ci:
            span = full_md[ci["start_pos"]:ci["end_pos"]]
            if span != t["evidence"]["text_span"]:
                failures.append((t["triple_id"], t["evidence"]["text_span"], span))

    result = {
        "doc_id": doc_id,
        "full_md": full_md,
        "chunks": chunks,
        "extractions": extractions,
        "entities": entities,
        "triples": triples,
        "_meta": {
            "page_count": page_count,
            "n_chunks": len(chunks),
            "n_entities": len(entities),
            "n_triples": len(triples),
        },
    }
    doc_item = {
        "document_id": doc_id,
        "original_filename": filename,
        "format": fmt,
        "size_bytes": size,
        "page_count": page_count,
        "status": "done",
        "n_chunks": len(chunks),
        "n_entities": len(entities),
        "n_triples": len(triples),
        "created_at": created_at,
        "indexed_at": indexed_at,
        "error": None,
    }
    return doc_item, result, failures


def build_session():
    """s_demo01 会话回放：引用取自实测三元组（narrative 2 + table 3）。"""
    doc_id = "dd68cea4_sample_graphrag_overview"
    _, result, _ = build_doc(*DOCS[1])
    full_md = result["full_md"]

    def to_citation(t):
        ev = t["evidence"]
        ci = ev.get("char_interval_fullmd")
        return {
            "triple_id": t["triple_id"],
            "text_span": ev["text_span"],
            "doc_id": doc_id,
            "page_idx": ev.get("page_idx"),
            "source": ev.get("source"),
            "chunk_id": ev.get("chunk_id"),
            "char_interval_fullmd": ci,
            "fullmd_verbatim": full_md[ci["start_pos"]:ci["end_pos"]] if ci else None,
            "bbox_normalized": ev.get("bbox_normalized"),
            "table_image": ev.get("table_image"),
        }

    narrative = [t for t in result["triples"] if t["provenance"]["path"] == "narrative"]
    table = [t for t in result["triples"] if t["provenance"]["path"] == "table"]
    picked = narrative[:2] + table[:3]
    question = "GraphRAG 系统的核心组件有哪些？各自负责什么？"
    answer = (
        "GraphRAG 系统由 Document Processor、Entity Extractor 与 Knowledge Graph "
        "Builder 三个核心组件构成：Document Processor 负责多格式文档解析与结构化，"
        "Entity Extractor 基于 LLM 抽取实体与关系，Knowledge Graph Builder 将抽取"
        "结果融合为可检索的知识图谱。"
    )
    msg = {
        "message_id": "m_demo0001",
        "question": question,
        "answer": answer,
        "citations": [to_citation(t) for t in picked],
        "doc_ids": [doc_id],
        "mode": "sse",
        "latency_ms": {"total": 8420, "retrieval": 6100, "answer": 2300},
        "error_code": None,
        "created_at": "2026-10-15T03:00:00Z",
    }
    return {
        "session_id": "s_demo01",
        "title": question[:30],
        "created_at": "2026-10-15T02:59:00Z",
        "last_message_at": "2026-10-15T03:00:00Z",
        "message_count": 1,
        "messages": [msg],
    }


def main():
    docs, results, all_failures = [], {}, []
    for spec in DOCS:
        item, result, failures = build_doc(*spec)
        docs.append(item)
        results[spec[0]] = result
        all_failures += [(spec[0],) + f for f in failures]

    if all_failures:
        for doc_id, tid, expect, got in all_failures:
            print(f"ASSERT FAIL {doc_id} {tid}: text_span != full_md[ci]\n"
                  f"  span: {expect!r}\n  slice: {got!r}", file=sys.stderr)
        sys.exit(1)

    session = build_session()
    system = {
        "health": {
            "status": "ok", "version": "1.0.0", "uptime_s": 3600,
            "time": "2026-10-15T03:00:00Z",
            "checks": {
                "db": "ok", "mineru_token": "present", "deepseek_key": "present",
                "indexed_documents": len(docs), "jobs_running": 0, "job_queue_depth": 0,
            },
        },
        "config": {
            "limits": {
                "max_file_bytes": 209715200, "max_files_per_request": 10,
                "max_pages": 600, "max_doc_ids_per_query": 5, "question_max_chars": 2000,
            },
            "formats": {
                "pdf": [".pdf"], "image": [".png", ".jpg", ".jpeg", ".jp2", ".webp", ".gif", ".bmp"],
                "office": [".doc", ".docx", ".ppt", ".pptx"], "html": [".html"],
            },
            "qa": {"mode": "kg_only", "max_grade_retries": 2, "recursion_limit": 30},
            "models": {"chat": "deepseek-chat", "extract": "deepseek-chat"},
        },
    }

    def js(v):
        return json.dumps(v, ensure_ascii=False, indent=1)

    body = (
        "// 自动生成：tools/gen_mock.py —— 逐字段拷贝实测产物，禁止手改。\n"
        f"// 来源 snapshot：{DOCS[0][0]} / {DOCS[1][0]}；溯源断言已通过。\n"
        "export const MOCK = {\n"
        f"  docs: {js(docs)},\n"
        f"  results: {js(results)},\n"
        f"  system: {js(system)},\n"
        f"  sessions: [{js(session)}],\n"
        "};\n"
    )
    DEST.write_text(body, encoding="utf-8")
    print(f"OK -> {DEST} ({DEST.stat().st_size} bytes); docs={len(docs)}")


if __name__ == "__main__":
    main()
