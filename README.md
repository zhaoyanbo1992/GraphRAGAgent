# GraphRAG 审计台（GraphRAGAgent）

一个**面向文档密集型团队的本地知识问答工作台**：上传 PDF / 图片 / Word / PPT / HTML 文档，系统自动完成「云端解析 → 知识图谱构建」索引流水线；用户以自然语言提问，**每条回答都附带可一键跳回原文的知识图谱引用**。

## 一、项目背景

通用 LLM 问答给不出证据，用户不敢采信；传统向量 RAG 对精确数值、跨行对比类问题（如「Q3 收入是多少」）经常失手，且检索过程对用户完全不可见。对于财务分析师、知识管理运营等文档密集型用户，痛点集中在：

| 痛点 | 审计台的解法 |
|------|-------------|
| 黑盒式 AI 回答不可信，无法核对 | 知识图谱三元组 + 双溯源指针（full.md 字符区间 + 页码/bbox），回答强制引用、点击即达原文高亮 |
| 文档解析门槛高（表格、扫描件、Office 格式） | MinerU 云端解析 + 表格旁路，格式白名单直传 |
| 检索过程不可见 | 问答界面实时展示检索轨迹（实体解析 → 图扩展 → 证据核验的工具调用明细与耗时） |
| 长流程索引任务状态焦虑、失败只能重跑 | 8 态流水线状态机（queued→parsing→chunking→extracting→kg_building→done/failed/canceled）+ 阶段级断点续跑 |
| 数值型问题语义检索答不准 | KG-only 双通道：实体解析 + 图扩展直接命中三元组，表格数值来自 HTML 结构化解析 |

**核心目标**：上传即可问答（全流程无人工整理）、回答 100% 可审计（引用复核：`triple_id` 存在于 KG 且 `fullmd_verbatim == text_span`）、索引过程透明可控、多格式批量接入。

## 二、模块介绍

```
GraphRAGAgent/
├── backend/    # FastAPI 后端服务（rag_server）
├── frontend/   # 无构建 SPA 前端（审计工作台 UI）
└── docs/       # 全套设计与规范文档
```

### backend/ —— 后端服务（rag_server）

独立 FastAPI 服务，实现 `/api/v1` 全部端点，上游 pipeline 功能已移植为 `rag_server/pipeline/` 独立模块（不依赖旧组件）。使用 `uv` 管理虚拟环境与依赖。

- **`rag_server/routers/`** — API 路由层：`documents`（批量上传，部分成功语义）、`jobs`（任务 8 态状态机 + cancel/retry）、`qa`（问答 + SSE 事件流）、`system`（health/config）
- **`rag_server/pipeline/`** — 索引与问答流水线：
  - `mineru_client.py` — MinerU 云端解析客户端（支持 mock / live 双模式）
  - `chunker.py` — 文档分块
  - `extraction.py` — LangExtract 信息抽取（三元组抽取）
  - `kg_builder.py` / `kg_store.py` — 知识图谱构建与存储（`kg_triples.jsonl` / `entities.jsonl` / `chunks.jsonl`）
  - `agent_graph.py` — Agentic-RAG 查询编排（实体解析 → 图扩展 → 证据核验 → 生成，含引用复核）
- **`rag_server/services/`** — 业务服务层：`job_runner`（进程内任务队列，`--workers 1` 单进程约束）、`upload_service`、`index_pipeline`、`agent_service`、`kg_service`、`session_service`（会话 CRUD）
- **`rag_server/schemas/` / `db.py` / `errors.py` / `config.py`** — Pydantic 契约、持久化、错误码、外部配置（全部来自 `backend/.env`，不入库）
- **`scripts/smoke_test.sh`** — 接口冒烟测试（34/34 PASS：上传、状态机、QA 引用复核、SSE 事件序列、会话 CRUD 等）

### frontend/ —— 审计工作台前端

无构建 SPA（单 `index.html` + hash 路由 + ES modules），支持 `mock`（离线演示，逐字段拷贝实测产物）/ `live`（连接 rag_server）双数据源切换。

- **`js/views/`** — 页面视图：`library`（文档库与批量上传）、`pipeline`（索引流水线进度）、`doc`（文档详情/图谱探查）、`qa`（有据问答 + 引用卡片跳回原文高亮）、`health`（系统状态）
- **`js/ui/`** — UI 组件：`graph.js`（知识图谱可视化）、`highlight.js`（原文定位高亮）、`drawer.js`（节点关系抽屉）、`components.js` / `shell.js`（布局与通用组件）
- **`js/api/` / `js/state.js` / `js/router.js`** — API 客户端、全局状态、hash 路由
- **`tools/gen_mock.py`** — mock 数据生成器

### docs/ —— 设计文档（v1.0）

| 文档 | 内容 |
|------|------|
| `prd-v1.0.md` | 产品需求：定位、目标、用户画像、核心场景 |
| `backend_service_spec-v1.0.md` | 后端架构与 `/api/v1` API 契约 |
| `web_prototype_spec-v1.0.md` | 前端原型与视觉系统规范 |
| `mineru_pipeline_spec-v1.0.md` | MinerU 多格式文档解析规范 |
| `langextract_pipeline_spec-v1.0.md` | LangExtract 信息抽取规范 |
| `bridge_pipeline_spec-v1.0.md` | 解析产物 → KG 三元组的桥接规范 |
| `agentic_rag_pipeline_spec-v1.0.md` / `agentic_rag_architecture-v1.0.md` | 查询阶段 Agentic-RAG 架构（LangGraph：retrieve → grade → rewrite → generate） |

## 三、快速开始

### 后端

```bash
cd backend
uv sync                                  # 创建独立 .venv（uv 锁定依赖）
# 编辑 backend/.env：OPENAI_API_KEY 必填；MINERU_MODE=mock(默认, 零配额) 或 live(需 MINERU_API_TOKEN)
uv run uvicorn rag_server.app:create_app --factory --host 0.0.0.0 --port 8100 --workers 1
```

服务地址 `http://127.0.0.1:8100`，API 前缀 `/api/v1`（健康检查 `GET /api/v1/health`）；测试：`bash scripts/smoke_test.sh`。

### 前端

```bash
cd frontend
python3 -m http.server 8080 -d .
# 打开 http://localhost:8080/ ，顶栏可切换 mock / live 数据源
```

## 四、说明

- 外部配置（API Key、Base URL、模型名等）统一在 `.env` 管理，已 gitignore，严禁提交。
- 本地另有 `mineru_mvp/`、`langextract_mvp/`、`langextract/`、`graphrag_pipeline/` 等上游实验/原型目录，仅用于本地开发验证，未纳入版本库。
