# CLAUDE.md

本目录是 **审计台前端**（GraphRAG 审计工作台 frontend 组件），路径：
`/Users/zhaoyanbo/learn/vibe-coding/GraphRAGAgent/frontend/`。
规范文档：`../docs/prd-v1.0.md`、`../docs/web_prototype_spec-v1.0.md`、
`../docs/backend_service_spec-v1.0.md`（/api/v1 契约）。

## 启动命令

无构建 SPA（单 `index.html` + hash 路由 + ES modules），**不支持 `file://` 直接打开**，
必须经 HTTP 访问：

```bash
cd /Users/zhaoyanbo/learn/vibe-coding/GraphRAGAgent/frontend
python3 -m http.server 8080 -d .
# 打开 http://localhost:8080/
```

- 端口可换（如 `python3 -m http.server 8123 -d .`），无其他构建/安装步骤。
- live 联调需先启动后端（`rag_server`，默认 `http://127.0.0.1:8100`），
  前端顶栏数据源胶囊切到 `live`，或访问时加 `?api=live`。

## 注意事项

- 本目录**无构建依赖、无 node_modules**，不要引入 npm/打包工具；改动后用
  `node --check <file>` 做语法检查即可。
- `js/mock/data.js` 由 `python3 tools/gen_mock.py` 从实测产物生成，**禁止手改**。
- `vendor/vis-network.min.js` 为本地 vendor（v10.1.2），不要删除；CDN 回退已内置。
- 后端地址默认 `http://127.0.0.1:8100`，可用 `localStorage('gqa.api_base')` 覆盖。
