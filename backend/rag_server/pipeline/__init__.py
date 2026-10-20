"""独立移植的上游 pipeline 功能 (backend spec §1.3: 适配层隔离, 不 import 旧组件).

移植来源与改动:
- mineru_client.py  ← mineru_mvp/mineru_pipeline.py (SystemExit→异常; 参数化
  model_version/is_ocr/poll_interval/timeout/cancel_event/out_dir; CLI 部分不移植)
- chunker.py        ← graphrag_pipeline/chunker.py (find_artifact 的 SystemExit→FileNotFoundError)
- extraction.py     ← graphrag_pipeline/extraction.py (env dict 由 config 注入)
- kg_builder.py     ← graphrag_pipeline/kg_builder.py (原样移植)
- kg_store.py       ← graphrag_pipeline/agentic_rag_mvp.py KGStore (模块级 STORE 惰性化,
  每文档一实例; _canon 别名解析保留)
- agent_graph.py    ← graphrag_pipeline/agentic_rag_mvp.py build_llm/build_graph
  (去 MCP 路径 — 服务路径用原生 @tool 工厂, backend spec §1.1-3; [FINAL] 契约保留)
"""
