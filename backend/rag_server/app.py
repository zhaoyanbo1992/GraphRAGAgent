"""create_app(): FastAPI 工厂 + lifespan + 错误处理 + 路由 + CORS (backend spec §1.2)."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html

from . import config, db
from .errors import register_error_handlers
from .routers import documents, jobs, qa, system
from .services import job_runner, kg_service


@asynccontextmanager
async def lifespan(app: FastAPI):
  config.ensure_dirs()
  db.init_schema()
  await job_runner.start_worker()
  yield
  job_runner.stop_worker()
  kg_service.invalidate()


def create_app() -> FastAPI:
  # docs_url=None: 默认 /docs 引 cdn.jsdelivr.net (当前网络不可达, 页面空白),
  # 下方用国内可达 CDN (bootcdn) 重挂同路径.
  app = FastAPI(title="GraphRAG 审计台后端", version=config.VERSION,
                lifespan=lifespan, docs_url=None)

  @app.get("/docs", include_in_schema=False)
  async def swagger_ui():
    return get_swagger_ui_html(
      openapi_url="/openapi.json", title=f"{app.title} - Swagger UI",
      swagger_js_url="https://cdn.bootcdn.net/ajax/libs/swagger-ui/5.17.14/swagger-ui-bundle.js",
      swagger_css_url="https://cdn.bootcdn.net/ajax/libs/swagger-ui/5.17.14/swagger-ui.css")
  app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
  register_error_handlers(app)
  app.include_router(system.router)
  app.include_router(documents.router)
  app.include_router(jobs.router)
  app.include_router(qa.router)
  return app
