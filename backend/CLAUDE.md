# CLAUDE.md

后端项目路径：`/Users/zhaoyanbo/learn/vibe-coding/GraphRAGAgent/backend`
（FastAPI 服务包：`backend/rag_server/`）

## 启动命令

```bash
cd /Users/zhaoyanbo/learn/vibe-coding/GraphRAGAgent/backend

uv sync                                  # 首次/重建虚拟环境 (.venv, uv 锁定)
uv run uvicorn rag_server.app:create_app --factory --host 0.0.0.0 --port 8100 --workers 1
```

- 服务地址：`http://127.0.0.1:8100`，API 前缀 `/api/v1`（健康检查 `GET /api/v1/health`）
- `--workers 1` 必须保留（JobRunner/缓存/队列为进程内实现）
- 接口测试：服务启动后执行 `bash scripts/smoke_test.sh`

## 环境与配置

- **uv 独立虚拟环境**：所有命令经 `uv run`；依赖一律 `uv add <package>`，禁止 `pip install`、禁止复用其他组件环境。
- **配置**：全部外部配置（`OPENAI_API_KEY` / `MINERU_API_TOKEN` / `MINERU_MODE` 等）在 `backend/.env` 管理，已 gitignore，严禁提交 git、严禁硬编码进代码。
- `MINERU_MODE=mock` 使用内置 fixtures（零配额）；`live` 走真实 MinerU 云端 API。
