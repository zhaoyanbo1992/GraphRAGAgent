# GraphRAG 审计台后端 (rag_server)

独立后端服务，严格实现 `../docs/backend_service_spec-v1.0.md`（/api/v1 全部端点）。
上游 pipeline 功能（MinerU 解析 / 分块 / LangExtract 抽取 / KG 构建 / Agentic-RAG 图）
已**移植为 `rag_server/pipeline/` 独立模块**，不 import 旧组件。

## 启动

```bash
cd backend
uv sync                                                  # 创建独立 .venv (uv 锁定)
# 编辑 .env: OPENAI_API_KEY 必填; MINERU_MODE=mock(默认, 零配额) 或 live(需 MINERU_API_TOKEN)
uv run uvicorn rag_server.app:create_app --factory --host 0.0.0.0 --port 8100 --workers 1
```

## 接口测试

```bash
bash scripts/smoke_test.sh    # 服务启动后执行; 2026-10-15 实测 34/34 PASS
```

覆盖：health/config、批量上传部分成功语义（rejected 分列 + html 强制 MinerU-HTML）、
任务 8 态状态机（真实 LangExtract+DeepSeek 抽取）、result/artifacts、
QA JSON（引用复核：exists_in_kg + fullmd_verbatim==text_span）、QA SSE 完整事件序列、
会话 CRUD、cancel/retry 前置条件。

## 结构

```
rag_server/
├── app.py / config.py / errors.py / db.py     # 工厂+ lifespan / .env 配置 / 错误码 / SQLite WAL
├── schemas/    documents | jobs | qa | system  # pydantic (字段对齐 spec §2)
├── routers/    system | documents | jobs | qa  # /api/v1 (spec §2.1–2.5)
├── services/   upload_service | mineru_client(mock/live) | index_pipeline | job_runner
│               | kg_service(多文档视图) | agent_service(ainvoke/astream+引用富化) | session_service
├── pipeline/   # 上游功能独立移植副本 (见 pipeline/__init__.py 移植清单)
└── fixtures/   # mock MinerU 解析产物 (sample_report)
```

## 关键约束（见 CLAUDE.md）

- `--workers 1`；LangGraph 在主 loop，阻塞调用 `asyncio.to_thread`；服务路径不用 MCP。
- DeepSeek 结构化输出必须 `method="json_mode"`（默认 function_calling 发送
  `tool_choice`，与 deepseek-flash 思考模式 400 冲突——实测修复记录）。
- `.env` 为配置唯一来源（优先级高于环境变量），已 gitignore。
