# 后端服务规范文档 v1.0（多模态 RAG 问答系统 · 工程化架构与 API）

> 版本：v1.0（2026-10-14）
> 本文档定义多模态 RAG 问答系统的**工程化后端服务**（新组件 `rag_server/`）：
> 在已实测打通的 5 段链路（MinerU 解析 → 语义分块 → LangExtract 抽取 → KG 构建
> → Agentic-RAG 问答）之上，提供多格式文档接入、异步索引流水线、双模式问答、
> 持久化任务与文档管理的完整服务面。
> 全部字段命名与数据格式**严格对齐上游规范**（见各节引用），响应示例取自
> 本地实测产物。上游规范：`mineru_pipeline_spec-v1.0.md`（输入格式与请求参数）、
> `bridge_pipeline_spec-v1.0.md`（产物契约 §5）、`langextract_pipeline_spec-v1.0.md`
> （抽取格式 §4.2）、`agentic_rag_pipeline_spec-v1.0.md`（问答契约 §2/§4）。
>
> **已确认决策**：① 新建独立组件（webapp 保留为可视化前端，P4 对接）；
> ② 上传格式 = MinerU 全格式；③ 问答 = SSE 流式 + 同步 JSON 双端点；
> ④ 持久化 = SQLite（产物 JSONL 仍落文件系统）。

---

## 1. 系统架构设计

### 1.1 分层架构

```
┌───────────────────────────────────────────────────────────────────────────┐
│ 接入层  routers/（FastAPI APIRouter，统一前缀 /api/v1）                     │
│   system.py(health/config) │ documents.py(上传/管理/产物)                  │
│   jobs.py(任务状态/取消/重试) │ qa.py(JSON + SSE)                           │
│   统一错误处理 errors.py · pydantic 校验 schemas/ · CORS                   │
├───────────────────────────────────────────────────────────────────────────┤
│ 服务层  services/                                                          │
│   upload_service(格式/大小校验·doc_id·落盘)                                │
│   mineru_client(MinerU 适配: 参数注入·取消事件·异常归一)                    │
│   index_pipeline(四阶段编排+进度落库) │ job_runner(队列·串行·取消·重试)      │
│   kg_service(多文档 KG 视图·@tool 工厂·缓存失效)                           │
│   agent_service(build_graph 复用·ainvoke/astream·引用复核富化)             │
│   session_service(会话与消息持久化)                                        │
├───────────────────────────────────────────────────────────────────────────┤
│ 编排约束                                                                   │
│   事件循环: 单 uvicorn loop; LangGraph ainvoke/astream 主 loop 驱动;       │
│            全部阻塞调用(requests/lx.extract/build_kg/sqlite) 经            │
│            asyncio.to_thread 下放线程池                                     │
│   问答工具: 服务路径用原生 @tool 闭包(KGStore 纯函数), 绕开 MCP stdio        │
│            的 loop 绑定约束(agentic_rag 规范 §5-4); MCP 路径保留给 CLI      │
├───────────────────────────────────────────────────────────────────────────┤
│ 索引/检索链路（复用现有组件，适配层隔离）                                    │
│   MinerU 云端解析(mineru_pipeline) → chunker.build_chunks                  │
│   → extraction.run_extraction(LangExtract+DeepSeek) → kg_builder.build_kg  │
│   → KGStore 检索三工具(lookup/expand/evidence) ← agentic_rag_mvp.build_graph│
├───────────────────────────────────────────────────────────────────────────┤
│ 存储层                                                                     │
│   SQLite(rag_server/data/rag_server.db, WAL): documents/jobs/sessions/messages│
│   文件系统: rag_server/data/uploads/<doc_id>.<ext>（原始文件）               │
│             mineru_mvp/output/<doc_id>/（解析产物，位置不变）                │
│             graphrag_pipeline/output/<doc_id>/（4 个 JSONL，位置不变）       │
└───────────────────────────────────────────────────────────────────────────┘
```

**核心设计原则：**

1. **产物位置不变**：MinerU 产物仍落 `mineru_mvp/output/<doc_id>/`，索引 JSONL
   仍落 `graphrag_pipeline/output/<doc_id>/`（按目录隔离）。`doc_id` 沿用 webapp
   已实测规则 `{uuid4.hex[:8]}_{原文件stem}`，同时作为上传文件名 stem
   （`uploads/<doc_id>.<ext>`）与 MinerU `files[].data_id`——MinerU 服务端按
   扩展名识别格式（mineru 规范 §2.2），`download_and_unpack` 以 stem 建目录，
   一个动作同时锁定 doc_id 与产物目录名。
2. **同步/异步边界**：服务进程内只有 LangGraph `ainvoke/astream` 与路由调度跑在
   事件循环上；MinerU HTTP+轮询、`lx.extract`、`build_kg`、SQLite 写全部
   `asyncio.to_thread` 下放。
3. **事件循环单一化**（继承 agentic_rag 规范 §5-4 实测约束）：服务路径不使用
   MCP stdio（工具工厂为同步纯函数构造，无连接生命周期），发现与执行天然同
   loop。未来若服务端接入 MCP，adapter 必须在 lifespan 内创建并存 app.state。
4. **中间产物可复用**（bridge 规范 §1 原则 4）：四阶段各自独立落盘，任务重试
   按阶段断点续跑（parse 成功则不再调 MinerU，不重复耗配额）。
5. **零新增依赖**：SQLite 用 stdlib `sqlite3`，队列用 stdlib `asyncio.Queue`；
   不引入 celery/aiosqlite/httpx，共享 venv 锁文件不动。

### 1.2 组件目录结构

```
rag_server/
├── CLAUDE.md                  # 组件规则: 复用 langextract/.venv、启动命令、--workers 1、禁止事项
├── main.py                    # 入口: uvicorn rag_server.app:create_app --factory --port 8100
├── app.py                     # create_app(): FastAPI 工厂 + lifespan(DB init/僵死任务清理)
│                              #   + 全局异常处理器 + 路由注册 + CORS
├── config.py                  # Settings: 路径/限制/格式→(model_version,is_ocr)映射;
│                              #   加载 mineru_mvp/.env 与 graphrag_pipeline/.env(沿用 load_env 解析器)
├── errors.py                  # ApiError + 错误码常量(§4) + handler 注册
├── db.py                      # sqlite3(WAL) 连接管理 + init_schema + 四表 DAO
├── schemas/                   # documents.py / jobs.py / qa.py / system.py (pydantic)
├── routers/                   # system.py / documents.py / jobs.py / qa.py
├── services/                  # upload_service / mineru_client / index_pipeline / job_runner
│                              #   / kg_service / agent_service / session_service
└── data/                      # 运行时生成: rag_server.db、uploads/（gitignore）
```

运行方式（复用 langextract/.venv，规则同 graphrag_pipeline/CLAUDE.md §8）：

```bash
cd rag_server
uv run --project ../langextract uvicorn rag_server.app:create_app --factory \
  --host 0.0.0.0 --port 8100 --workers 1    # workers 必须 = 1，见 §6-R3
```

### 1.3 与现有组件的复用关系清单

| 现有代码 | 复用方式 | 说明 |
|---|---|---|
| `mineru_pipeline.request_upload_urls` | **小改** | 签名追加 `model_version=None, is_ocr=None` 关键字参数（缺省回落模块 ENV，CLI 零影响）；`files[].data_id` 传 doc_id |
| `mineru_pipeline.upload_files` | 直接 import | 阻塞 PUT，经 to_thread |
| `mineru_pipeline.poll_results` | **小改** | 追加 `poll_interval=None, timeout=None, cancel_event=None`；间隔检查 cancel_event → 抛 `JobCanceled`；`SystemExit` 改为 `MinerUPipelineError(Exception)`（CLI main 捕获后保持原 exit 语义） |
| `mineru_pipeline.download_and_unpack` | **小改** | 追加 `out_dir=None`（默认仍 OUTPUT_DIR，向后兼容） |
| `mineru_pipeline.collect_input_files` | 不复用 | CLI 专用（只扫 *.pdf）；服务自管输入文件 |
| `chunker.find_artifact` | **小改** | `SystemExit` → `FileNotFoundError`（一行）；glob 模式 `*_content_list.json` 不变（mineru 规范 §3.1 UUID 前缀约束） |
| `chunker.build_chunks / save_chunks` | 直接 import | 纯函数；`max_chunk_chars` 由请求参数/env 传入（默认 900） |
| `extraction.run_extraction` | 直接 import | 阻塞 LLM 调用 → to_thread；env dict 由 config 提供 |
| `kg_builder.build_kg` | 直接 import | 返回 `(triples, entities, stats)`，stats 四键（dropped_ungrounded/narrative/table/resolved）落库 |
| `agentic_rag_mvp.KGStore` | **小改后直接 import** | 每文档一实例（构造已参数化 `KGStore(output_dir, fullmd_path)`） |
| `agentic_rag_mvp.build_graph` | 直接 import | 5 节点 2 条件边、`MAX_GRADE_RETRIES=2`、`recursion_limit=30` 全部沿用 |
| `agentic_rag_mvp.build_llm` | 直接 import | ChatDeepSeek（api_base/base_url 回退保留） |
| `agentic_rag_mvp` 模块级 `STORE/ENV/FULLMD_PATH` | **必须小改** | 惰性化（移入函数内），保证 `import agentic_rag_mvp` 无副作用（当前 import 即读 full.md） |
| `agentic_rag_mvp.get_agent_tools / build_mcp_server` | 服务路径不使用 | MCP 路径保留给 CLI；如需服务端 MCP 须加 store 参数化 |

### 1.4 后台任务方案（JobRunner）

| 备选 | 结论 |
|---|---|
| Starlette BackgroundTasks | 否决：无并发控制/持久化/取消，长任务（POLL_TIMEOUT=1800s）占用 threadpool |
| 独立 worker（celery/arq） | MVP 否决：引入 broker，违背零新增依赖；列 P4+ 演进 |
| **进程内 JobRunner（采用）** | `asyncio.Queue` + `Semaphore(1)` 串行执行；状态实时落 SQLite；lifespan 启动时扫描未终态任务标记 `failed(E_JOB_INTERRUPTED)`，可 retry 断点续跑 |

---

## 2. API 接口规范（REST，前缀 `/api/v1`）

通用约定：JSON 响应 `Content-Type: application/json`（上传 multipart）；时间一律
ISO8601 UTC 字符串；分页参数 `page`(默认1)/`page_size`(默认20，最大100)；分页响应
统一形状 `{"items": [...], "total": int, "page": int, "page_size": int}`。

### 2.1 文档上传

#### `POST /api/v1/documents` —— 批量上传并启动索引（multipart/form-data）

| 字段 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `files` | form-data | file[] | ✅ | 1~10 个文件；扩展名白名单见下表；单文件 ≤200MB |
| `is_ocr` | form-data | bool | ❌ | 覆盖默认 OCR 开关；缺省按格式映射 |
| `model_version` | form-data | string | ❌ | `vlm`(默认)/`pipeline`/`MinerU-HTML`；`.html` 文件**强制** MinerU-HTML，冲突时该文件被拒 |
| `max_chunk_chars` | form-data | int | ❌ | 分块上限，默认 env `MAX_CHUNK_CHARS`(=900)，范围 200~4000 |
| `language` | form-data | string | ❌ | 预留（v1.0 接收不透传，mineru 规范 §2.2 可选键实测未发） |

**格式白名单与默认解析参数**（config.py 映射表，对齐 mineru 规范 §1.1）：

| 类别 | 扩展名 | model_version | is_ocr 默认 |
|---|---|---|---|
| pdf | `.pdf` | vlm | false |
| image | `.png .jpg .jpeg .jp2 .webp .gif .bmp` | vlm | true |
| office | `.doc .docx .ppt .pptx` | vlm | false |
| html | `.html` | MinerU-HTML（强制） | false |

校验顺序（逐文件独立，互不拦截）：空文件 → 扩展名 → 大小 → 数量 → html/model_version 冲突。
页数 ≤600 无法上传时零成本判定，在 parsing 阶段完成后以 `max(page_idx)+1` 校验。

响应 `202 Accepted`（**部分成功语义**）：

```json
{
  "accepted": [
    {"document_id": "a1b2c3d4_q3_report", "job_id": "j_9f8e7d6c",
     "filename": "q3_report.pdf", "format": "pdf", "size_bytes": 2728,
     "model_version": "vlm", "is_ocr": false, "status": "queued"}
  ],
  "rejected": [
    {"filename": "virus.exe", "code": "E_UPLOAD_UNSUPPORTED_FORMAT",
     "message": "不支持的文件格式: .exe"}
  ]
}
```

错误：`422 E_VALIDATION_FAILED`（缺 files）；逐文件错误走 `rejected[]`（不上 4xx，保证批量原子可见性）。

### 2.2 索引任务

状态机：`queued → parsing → chunking → extracting → kg_building → done`；
任一步失败 → `failed`（保留已达阶段产物）；`queued/parsing` 可取消 → `canceled`。
`steps[].name` 沿用 webapp 实测短名（parse/chunk/extract/kg）。

#### `GET /api/v1/jobs/{job_id}`

```json
{
  "job_id": "j_9f8e7d6c", "document_id": "a1b2c3d4_q3_report", "type": "index",
  "status": "extracting", "attempt": 1, "progress": 80,
  "steps": [
    {"name": "parse", "status": "done", "started_at": "2026-10-14T02:00:00Z",
     "finished_at": "2026-10-14T02:00:42Z", "elapsed_ms": 42100,
     "detail": {"batch_id": "bd48a6be-...", "mineru_state": "done", "page_count": 2}},
    {"name": "chunk", "status": "done", "elapsed_ms": 31, "detail": {"n_chunks": 12}},
    {"name": "extract", "status": "running", "detail": {}}
  ],
  "error": null, "queued_at": "2026-10-14T01:59:58Z",
  "started_at": "2026-10-14T02:00:00Z", "finished_at": null
}
```

| 字段 | 说明 |
|---|---|
| `status` | `queued/parsing/chunking/extracting/kg_building/done/failed/canceled` |
| `progress` | 粗粒度 0–100：queued=0，parse 内 waiting-file=10/running=40，chunking=70，extracting=80，kg_building=90，done=100（抽取为单次批量 LLM 调用，无子进度，诚实上报） |
| `steps[].detail` | parse: `batch_id/mineru_state/page_count`；chunk: `n_chunks`；extract: `n_documents/n_extractions`；kg: `n_entities/n_triples/stats{dropped_ungrounded,narrative,table,resolved}` |
| `error` | `{"code","message"}`，同 §4 |

其余任务端点：

| 方法/路径 | 响应 | 说明 |
|---|---|---|
| `GET /api/v1/jobs?document_id=&status=&page=&page_size=` | 分页 JobOut[]（queued_at 倒序） | 任务列表 |
| `POST /api/v1/jobs/{job_id}/cancel` | `200 {"job_id","status":"canceled"\|"cancel_requested"}` | 协作式取消：阶段间 + MinerU 轮询间隔生效；MinerU 云端任务无法撤回（配额照耗，如实文档化）；非 queued/parsing → `409 E_JOB_NOT_CANCELABLE` |
| `POST /api/v1/jobs/{job_id}/retry` | `202 JobOut`（attempt+1，status=queued） | 断点续跑：从首个未完成阶段继续；仅 `failed/canceled` 可重试 |

### 2.3 文档管理

| 方法/路径 | 响应/说明 |
|---|---|
| `GET /api/v1/documents?status=&q=&page=&page_size=` | 分页 DocumentListItem[]（q 匹配 original_filename LIKE） |
| `GET /api/v1/documents/{document_id}` | DocumentDetail |
| `GET /api/v1/documents/{document_id}/result` | **webapp 兼容 payload**（见下） |
| `GET /api/v1/documents/{document_id}/artifacts/{name}` | name ∈ `kg_triples.jsonl/entities.jsonl/chunks.jsonl/extraction_results.jsonl/full.md`；文件流或 `404 E_ARTIFACT_NOT_FOUND` |
| `DELETE /api/v1/documents/{document_id}` | `204`；级联删 DB 行 + `graphrag_pipeline/output/<doc_id>/` + `mineru_mvp/output/<doc_id>/` + `uploads/<doc_id>.*`；任务运行中 → `409 E_JOB_RUNNING` |
| `POST /api/v1/documents/{document_id}/reindex` | body `{"reparse": false, "is_ocr": null, "model_version": null}` → `202 JobOut`；`reparse=false` 且 MinerU 产物在 → 从 chunking 起跑 |

**DocumentListItem**：

```json
{"document_id": "a1b2c3d4_q3_report", "original_filename": "q3_report.pdf",
 "format": "pdf", "size_bytes": 2728, "page_count": 2, "status": "done",
 "n_chunks": 12, "n_entities": 11, "n_triples": 13,
 "created_at": "2026-10-14T01:59:58Z", "indexed_at": "2026-10-14T02:00:45Z", "error": null}
```

`status` ∈ `queued/indexing/done/failed`；`page_count = max(page_idx)+1`（bridge §5.1，0-based）。

**DocumentDetail** = DocumentListItem + `{"model_version","is_ocr","mineru_batch_id",
"stats":{...kg stats 四键...},"artifacts":[{"name","size_bytes","url"}]}`。

**`GET /documents/{id}/result` —— 与 webapp `/api/result/{doc_id}` 逐字段对齐**
（webapp/app.py L152–176 超集，前端可无缝切换）：

```json
{
  "doc_id": "a1b2c3d4_q3_report",
  "full_md": "## Quarterly Financial Report ...",
  "chunks": [{"chunk_id": "a1b2c3d4_q3_report_chunk_001", "section_title": "Quarterly Results",
              "n_chars": 366, "blocks": [{"chunk_start": 0, "chunk_len": 366,
              "fullmd_start": 3, "fullmd_len": 366, "page_idx": 0,
              "bbox": [52, 84, 947, 233], "block_type": "text"}]}],
  "extractions": [
    {"chunk_id": "a1b2c3d4_q3_report_chunk_001", "extraction_class": "relation",
     "extraction_text": "Total revenue in Q3 was 12.5 billion CNY",
     "attributes": {"head": "Total revenue", "predicate": "has_value", "tail": "12.5 billion CNY"},
     "char_interval": {"start_pos": 228, "end_pos": 268},
     "alignment_status": "match_exact", "grounded": true}
  ],
  "entities": [{"name": "Total revenue", "entity_type": "metric",
                "normalized_name": "total_revenue", "mentions": 1}],
  "triples": [
    {"triple_id": "t_000001",
     "head": {"name": "Total revenue", "type": "metric", "normalized_name": "total revenue"},
     "predicate": "has_value",
     "tail": {"name": "12.5 billion CNY", "type": "currency_value",
              "normalized_name": "12.5 billion cny",
              "attributes": {"value": "12.5 billion CNY", "period": "Q3"}},
     "evidence": {"text_span": "Total revenue in Q3 was 12.5 billion CNY", "source": "full.md",
                  "chunk_id": "a1b2c3d4_q3_report_chunk_001",
                  "char_interval_chunk": {"start_pos": 228, "end_pos": 268},
                  "char_interval_fullmd": {"start_pos": 231, "end_pos": 271},
                  "page_idx": 0, "bbox_normalized": null, "table_image": null},
     "provenance": {"path": "narrative"}}
  ]
}
```

字段命名严格沿用上游 spec：`chunks[].blocks[]` 完整返回（bridge §5.3，`fullmd_start`
为 null 的块照实返回）；`extractions[].grounded` = `char_interval is not null`
（webapp 语义，langextract §4.2）；triples 键集按 `provenance.path` 判别——
narrative 有双 char_interval，table 有 `bbox_normalized/table_image`（bridge §5.1
差异提示，不要假设键集一致）。

### 2.4 问答（双端点共享同一 service）

#### `POST /api/v1/qa/ask` —— 同步 JSON 模式

请求：

```json
{"question": "Q3 的总收入是多少？同比增长了多少？",
 "session_id": null,
 "doc_ids": ["a1b2c3d4_q3_report"],
 "include_evidence": true}
```

| 字段 | 类型 | 必填 | 校验/默认 |
|---|---|---|---|
| `question` | string | ✅ | 1–2000 字符（trim 后非空） |
| `session_id` | string/null | ❌ | null 自动创建会话；不存在 → `404 E_QA_SESSION_NOT_FOUND` |
| `doc_ids` | string[] | ❌ | 默认 = 全部 `status=done` 文档；最多 5 个；含非 done 文档 → `409 E_DOC_NOT_INDEXED`；空数组视为未传 |
| `include_evidence` | bool | ❌ | 默认 true：citations 富化（false 仅返回上游两键） |

响应 `200`（`{answer, citations}` 两键严格对齐 agentic_rag 规范 §4.1，其余为服务层附加键）：

```json
{
  "message_id": "m_5a4b3c2d",
  "session_id": "s_1a2b3c4d",
  "question": "Q3 的总收入是多少？同比增长了多少？",
  "answer": "Q3 总收入 12.5 billion CNY，同比增长 18.2%。",
  "citations": [
    {"triple_id": "t_000001", "text_span": "Total revenue in Q3 was 12.5 billion CNY",
     "doc_id": "a1b2c3d4_q3_report", "page_idx": 0, "source": "full.md",
     "chunk_id": "a1b2c3d4_q3_report_chunk_001",
     "char_interval_fullmd": {"start_pos": 231, "end_pos": 271},
     "fullmd_verbatim": "Total revenue in Q3 was 12.5 billion CNY",
     "bbox_normalized": null, "table_image": null}
  ],
  "doc_ids": ["a1b2c3d4_q3_report"],
  "latency_ms": {"total": 8420, "retrieval": 6100, "answer": 2300},
  "created_at": "2026-10-14T03:00:00Z"
}
```

| 字段 | 说明 |
|---|---|
| `citations[].triple_id/text_span` | **上游原样**（`t_{6位序号}`；text_span 经 KG 产物 `evidence.text_span` 归一，agentic_rag §4.3 规则 2） |
| `citations[].doc_id` | 服务层富化：单文档 scope 必填；多文档由引用复核回填，歧义时 null（§6-1） |
| `citations[].page_idx/source/chunk_id/bbox_normalized/table_image` | 取自 KG 产物 `evidence.*`（bridge §5.1 键名） |
| `citations[].fullmd_verbatim` | `full.md[char_interval_fullmd]` 逐字切片（bridge §4.3 数学契约；表格路径为 null） |
| `latency_ms.retrieval/answer` | 首个工具调用→[FINAL] / 作答节点耗时（best-effort） |

错误：`409 E_QA_NO_INDEXED_DOCS` / `422 E_VALIDATION_FAILED` / `502 E_QA_LLM_FAILED` / `504 E_QA_LLM_TIMEOUT`。

#### `POST /api/v1/qa/ask/stream` —— SSE 流式模式

请求体同上（`include_evidence` 忽略，流中 citations 恒富化）。响应 `200`，
`Content-Type: text/event-stream`、`Cache-Control: no-cache`、`X-Accel-Buffering: no`。
前端经 `fetch` + ReadableStream 消费（**EventSource 不支持 POST**）。心跳：每 15s `ping`。

事件序列（`event:` / `data:` 均为单行 JSON）：

```
event: session
data: {"session_id": "s_1a2b3c4d", "message_id": "m_5a4b3c2d"}

event: status                          ← LangGraph 节点迁移（astream stream_mode="updates"）
data: {"stage": "retrieval", "node": "generate_query_or_respond", "attempt": 1}
data: {"stage": "grading",   "node": "tools", "detail": "grade→yes"}

event: tool_call                       ← AIMessage.tool_calls
data: {"call_id": "call_1", "name": "kg_entity_lookup", "args": {"name": "总收入"}}

event: tool_result                     ← ToolMessage 摘要（防超大 payload）
data: {"call_id": "call_1", "name": "kg_entity_lookup", "ok": true,
       "summary": "matched: total revenue", "elapsed_ms": 12}

event: answer_delta
data: {"delta": "Q3 总收入 "}

event: citations                       ← 富化后的引用（§4.3 复核完成后）
data: {"citations": [ ...同 JSON 模式 citations[]... ]}

event: done
data: {"message_id": "m_5a4b3c2d", "finish_reason": "stop",
       "latency_ms": {"total": 8420, "retrieval": 6100, "answer": 2300}}

event: error                           ← 任一阶段失败；随后流关闭
data: {"code": "E_QA_LLM_FAILED", "message": "DeepSeek 调用失败", "retryable": true}
```

| 事件 | 次数 | 数据键 |
|---|---|---|
| `session` | 恰 1（首事件） | session_id, message_id |
| `status` | ≥0 | stage(`retrieval/grading/answering`), node, attempt, detail? |
| `tool_call`/`tool_result` | 成对 ≥0 | call_id, name, args / ok, summary, elapsed_ms |
| `answer_delta` | ≥0 | delta |
| `citations` | ≤1（done 前） | citations[] |
| `done` | 恰 1（成功终态） | message_id, finish_reason, latency_ms |
| `error` | ≤1（失败终态） | code, message, retryable |
| `ping` | 周期 | t |

**answer_delta 粒度的诚实说明**：`generate_answer` 走
`with_structured_output(AnswerWithCitations)`（agentic_rag §3.1 实测），结构化
输出为整块 JSON，不产 token 级流。MVP 实现：拿到最终 answer 后按句子/换行切分
为多个 `answer_delta`（准流式体验）；P4 可改裸文本流 + 事后引用抽取
（agentic_rag §4.1 已有降级正则路径）实现真 token 流。

#### 会话端点

| 方法/路径 | 响应 |
|---|---|
| `GET /api/v1/qa/sessions?page=&page_size=` | 分页 `{"session_id","title","created_at","last_message_at","message_count"}` |
| `GET /api/v1/qa/sessions/{session_id}` | `{"session_id","title","created_at","messages":[MessageOut]}` |
| `DELETE /api/v1/qa/sessions/{session_id}` | `204` |

`MessageOut = {"message_id","question","answer","citations","doc_ids",
"mode":"json"|"sse","latency_ms","error_code","created_at"}`（一次问答一行）。

**多轮上下文范围声明（MVP）**：session 仅做记录与回放；`use_history`（历史注入
AgentState）为预留参数、v1.0 恒 false——现有 5 节点图为单问单答
（agentic_rag §2.2），多轮改造列 P4。

### 2.5 系统

`GET /api/v1/health` →

```json
{"status": "ok", "version": "1.0.0", "uptime_s": 3600, "time": "2026-10-14T03:00:00Z",
 "checks": {"db": "ok", "mineru_token": "present", "deepseek_key": "present",
            "indexed_documents": 3, "jobs_running": 0, "job_queue_depth": 0}}
```

`status` = ok（全过）/ degraded（某项 fail，仍 200，便于探活区分）。
`GET /api/v1/config` 返回 limits（max_file_bytes=209715200、max_files_per_request=10、
max_pages=600、max_doc_ids_per_query=5、question_max_chars=2000）、formats 白名单、
qa 参数（mode:"kg_only", max_grade_retries:2, recursion_limit:30）、models（chat/extract
模型名）——**不含任何密钥**。

---

## 3. SQLite Schema 设计

DB：`rag_server/data/rag_server.db`，`PRAGMA journal_mode=WAL; foreign_keys=ON;
busy_timeout=5000`。访问方式：stdlib `sqlite3`，短连接 contextmanager；写经
`asyncio.to_thread`。`schema_migrations(version)` 表支持后续迁移。

```sql
CREATE TABLE documents (
  document_id      TEXT PRIMARY KEY,              -- {uuid8}_{stem}
  original_filename TEXT NOT NULL,
  stored_path      TEXT NOT NULL,                 -- rag_server/data/uploads/<doc_id>.<ext>
  format           TEXT NOT NULL,                 -- pdf|image|office|html
  size_bytes       INTEGER NOT NULL,
  page_count       INTEGER,                       -- parsing 完成后回填 max(page_idx)+1
  status           TEXT NOT NULL,                 -- queued|indexing|done|failed
  model_version    TEXT NOT NULL,
  is_ocr           INTEGER NOT NULL DEFAULT 0,
  mineru_batch_id  TEXT,
  n_chunks         INTEGER, n_entities INTEGER, n_triples INTEGER,
  stats_json       TEXT,                          -- kg stats 四键
  error_code       TEXT, error_message TEXT,
  created_at       TEXT NOT NULL, updated_at TEXT NOT NULL, indexed_at TEXT
);
CREATE INDEX idx_documents_status  ON documents(status);
CREATE INDEX idx_documents_created ON documents(created_at DESC);

CREATE TABLE jobs (
  job_id        TEXT PRIMARY KEY,                 -- j_{uuid8}
  document_id   TEXT NOT NULL REFERENCES documents(document_id) ON DELETE CASCADE,
  type          TEXT NOT NULL DEFAULT 'index',
  status        TEXT NOT NULL,                    -- 8 态，见 §2.2
  attempt       INTEGER NOT NULL DEFAULT 1,
  current_step  TEXT,                             -- parse|chunk|extract|kg
  steps_json    TEXT NOT NULL DEFAULT '[]',
  error_code    TEXT, error_message TEXT,
  cancel_requested INTEGER NOT NULL DEFAULT 0,
  queued_at TEXT NOT NULL, started_at TEXT, finished_at TEXT
);
CREATE INDEX idx_jobs_document ON jobs(document_id);
CREATE INDEX idx_jobs_status   ON jobs(status);
CREATE INDEX idx_jobs_queued   ON jobs(queued_at DESC);

CREATE TABLE sessions (
  session_id TEXT PRIMARY KEY,                    -- s_{uuid8}
  title      TEXT NOT NULL,                       -- 首问前 30 字符
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE messages (
  message_id   TEXT PRIMARY KEY,                  -- m_{uuid8}
  session_id   TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  question     TEXT NOT NULL,
  answer       TEXT,                              -- 失败时 NULL
  citations_json TEXT,                            -- 富化后 citations[]
  doc_ids_json TEXT NOT NULL,
  mode         TEXT NOT NULL,                     -- json|sse
  latency_json TEXT,
  error_code   TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX idx_messages_session ON messages(session_id, created_at);
```

产物 JSONL 不入库（文件系统为唯一事实源，DB 只存统计与指针）；删除文档 = 删行 + 删目录。

---

## 4. 错误码与异常规范

统一响应形状（所有非 2xx 与 SSE `error` 事件共用）：

```json
{"error": {"code": "E_DOC_NOT_INDEXED", "message": "文档尚未完成索引",
           "details": {"document_id": "a1b2c3d4_q3_report", "status": "extracting"},
           "request_id": "req_7f6e5d4c"},
 "timestamp": "2026-10-14T03:00:00Z"}
```

注册三类 FastAPI handler：`RequestValidationError` → `422 E_VALIDATION_FAILED`；
`ApiError`（服务层统一抛出）→ 对应 status；兜底 `Exception` → `500 E_INTERNAL`
（堆栈入日志不回传）。MinerU/LLM 原始错误信息放 `details`（如 `{"err_msg": "..."}`），不吞不猜。

| 错误码 | HTTP | 场景 | retryable |
|---|---|---|---|
| `E_VALIDATION_FAILED` | 422 | 请求体/参数校验失败 | 否 |
| `E_UPLOAD_EMPTY_FILE` | 200(rejected) | 空文件 | 否 |
| `E_UPLOAD_UNSUPPORTED_FORMAT` | 200(rejected) | 扩展名不在白名单 | 否 |
| `E_UPLOAD_TOO_LARGE` | 200(rejected) | >200MB（mineru 规范 §1.2 硬限制） | 否 |
| `E_UPLOAD_TOO_MANY_FILES` | 200(rejected) | 批量 >10 | 否 |
| `E_UPLOAD_MODEL_VERSION_CONFLICT` | 200(rejected) | html 与非 MinerU-HTML 冲突 | 否 |
| `E_DOC_NOT_FOUND` / `E_JOB_NOT_FOUND` / `E_QA_SESSION_NOT_FOUND` | 404 | 资源不存在 | 否 |
| `E_DOC_NOT_INDEXED` | 409 | 问答 scope 含未 done 文档 | 否（等索引） |
| `E_JOB_RUNNING` / `E_JOB_NOT_CANCELABLE` / `E_JOB_NOT_RETRYABLE` | 409 | 删除/取消/重试前置条件不满足 | 否 |
| `E_ARTIFACT_NOT_FOUND` | 404 | 产物文件缺失 | 否 |
| `E_MINERU_APPLY_FAILED` / `E_MINERU_UPLOAD_FAILED` | 502 | MinerU 申请链接/PUT 失败 | 是 |
| `E_MINERU_PARSE_FAILED` | 502 | state=failed，details 携带 `err_msg` | 是 |
| `E_MINERU_TIMEOUT` | 504 | 轮询超 POLL_TIMEOUT=1800s | 是 |
| `E_MINERU_PAGE_LIMIT` | 422 | 解析后页数 >600 | 否 |
| `E_LLM_EXTRACTION_FAILED` | 502 | 阶段2 LangExtract/DeepSeek 失败 | 是 |
| `E_QA_LLM_FAILED` / `E_QA_LLM_TIMEOUT` | 502/504 | 问答链路 LLM 失败/超时 | 是 |
| `E_QA_NO_INDEXED_DOCS` | 409 | 无可问文档 | 否 |
| `E_JOB_INTERRUPTED` | —（重启标记） | 进程重启时未终态任务被标记 | 是（retry） |
| `E_INTERNAL` | 500 | 未捕获异常 | 是 |

---

## 5. 实施计划（4 阶段，每阶段独立验收）

| 阶段 | 范围 | 验收标准 |
|---|---|---|
| **P1 服务骨架+上传+SQLite** | 目录骨架、CLAUDE.md、config/errors/db（四表+DAO）、upload_service、documents/jobs 路由（job_runner 先空转）、health/config | 多文件混合格式上传返回 202 且 accepted/rejected 正确分列（含 .exe 拒绝、html 强制 MinerU-HTML）；DB 行正确；重启自恢复（WAL）；错误响应全部符合 §4 形状 |
| **P2 索引链路接入** | §1.3 三处上游小改；mineru_client；index_pipeline 四阶段编排 + job_runner（取消/重试/重启清理）；页数校验；统计回填 | PDF 全链路跑通，job 8 态机与 steps.detail 符合 §2.2；产物落 `<doc_id>/` 目录；`/documents/{id}/result` 与 webapp `/api/result/{doc_id}` 字段级一致（同一 PDF 双跑 diff）；MinerU 失败 → failed + retry 断点续跑；kill 后重启标 `E_JOB_INTERRUPTED`；docx/pptx/html/图片各实测 ≥1 份并回填 mineru spec |
| **P3 问答双模式** | agentic_rag_mvp 惰性化；kg_service（每文档 KGStore + 多文档视图 + 缓存失效）；agent_service（ainvoke/astream、[FINAL] 提取、引用复核富化）；qa 路由；session_service | 单文档问答复现 agentic_rag check3 基准（citations 全部 exists_in_kg 且 `fullmd_verbatim == text_span`）；JSON 模式符合 §2.4 字段表；SSE 事件序列完整、error 后流关闭；未索引文档提问 → 409；`doc_ids` 过滤生效（scope 外三元组不可被引用）；并发 3 路 SSE 无交叉 |
| **P4 webapp 对接改造** | webapp 改调 `http://127.0.0.1:8100/api/v1`（JOBS dict 退役）；前端加问答面板（fetch 流式消费 SSE；citations 渲染：char_interval_fullmd 高亮 full.md、page_idx+bbox 定位表格图） | 上传→可视化→提问全流程走新 API；引用点击可回跳证据原文；旧 webapp 后端保留只读兼容或下线（记录于文档） |

---

## 6. 风险与开放问题

1. **triple_id 跨文档命名空间冲突**：`t_{6位序号}` 仅单文档内唯一（bridge §5.1）。
   多文档问答时模型可能引用无法消歧的 triple_id。方案：工具返回统一携带 doc_id，
   Citation 扩展可选 `doc_id`，消歧失败置 null。开放问题：是否改用
   `{doc_id}#t_000001` 复合 ID（会破坏上游 `t_\d{6}` 正则降级路径，需回归 check3）。
2. **answer_delta 非真 token 流**：受 `with_structured_output` 整块输出限制（§2.4）。
   开放问题：流式模式是否切裸文本作答换真流式（牺牲 schema 硬约束）。
3. **单进程约束**：`--workers 1` 强制（JobRunner/缓存/队列在进程内）；横向扩容
   = job_runner 换独立 worker + DB 锁升级（P4+）。
4. **非 PDF 格式的 MinerU 产物未实测**：docx/pptx/图片/HTML 的 content_list/full.md
   结构是否与 mineru 规范 §3.1 实测 schema 一致未验证。P2 必须逐格式实测并回填
   mineru spec；chunker 只消费 `type=="text"/"table"` 块，理论上格式无关，但
   HTML 源可能整文档单块，分块质量待验。
5. **取消的云端残留**：MinerU 无取消 API，cancel 后云端解析继续跑并耗配额，文档明示。
6. **并发配额竞争**：索引（串行）与问答（并发）同时打 DeepSeek；MVP 无应用级
   速率限制，依赖 DeepSeek 侧限流 + `429` 映射 `E_QA_LLM_FAILED`（retryable）。
7. **共享 venv 依赖漂移**：本设计零新增依赖（stdlib sqlite3/asyncio）；后续如需
   测试客户端 httpx，须经 `../langextract` 下 `uv add` 并记录。
8. **table_image 静态资源**：`evidence.table_image`（`images/<sha256>.jpg` 相对
   路径）前端渲染需挂载 `mineru_mvp/output/` 静态目录，P4 决定挂载路径（本版
   未定义图片端点）。
9. **会话多轮上下文**：session 目前是记录层；`use_history` 注入 AgentState 涉及
   5 节点图的多轮改写（messages 累积语义与 grade 拼接逻辑需回归），列 P4。

---

## 附：信息来源

- 复用代码核实：`webapp/app.py`（索引流程与 /api/result 形状）、
  `graphrag_pipeline/agentic_rag_mvp.py`（KGStore/build_graph/build_llm 签名与
  事件循环约束）、`mineru_mvp/mineru_pipeline.py`（函数签名与参数化改造点）
- 上游规范（字段命名权威来源）：`bridge_pipeline_spec-v1.0.md` §5、
  `langextract_pipeline_spec-v1.0.md` §4.2、`agentic_rag_pipeline_spec-v1.0.md`
  §2/§4、`mineru_pipeline_spec-v1.0.md` §1/§2
- 实测数据：`graphrag_pipeline/output/kg_triples.jsonl`（t_000001 证据链）、
  webapp `/api/result` 实际返回形状
