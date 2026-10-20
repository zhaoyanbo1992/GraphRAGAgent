# 审计台 · 前端（frontend/）

GraphRAG 审计工作台前端 —— 文档上传 → 索引流水线 → 三视图探查 → 有据问答 → 引用回溯。

依据：`docs/prd-v1.0.md`、`docs/web_prototype_spec-v1.0.md`（视觉/交互规范）、
`docs/backend_service_spec-v1.0.md`（/api/v1 契约）。

## 启动

无构建 SPA（单 `index.html` + hash 路由 + ES modules）。ES modules 不支持 `file://`：

```bash
cd frontend
python3 -m http.server 8080 -d .
# 打开 http://localhost:8080/
```

## 数据源（顶栏胶囊切换）

| 模式 | 说明 |
|---|---|
| `mock`（默认） | 离线演示：数据逐字段拷贝实测产物（`tools/gen_mock.py` 生成，溯源断言内置） |
| `live` | 连接 rag_server（默认 `http://127.0.0.1:8100`，`localStorage.gqa.api_base` 可改） |

优先级：URL `?api=live|mock` > `localStorage('gqa.api_mode')` > mock。

## 目录结构

```
frontend/
├── index.html
├── css/{tokens,base,views}.css    # 设计令牌 / 壳与原子组件 / 视图样式
├── js/
│   ├── app.js                     # 入口：file:// 引导 + 路由注册
│   ├── router.js                  # hash 路由（同页 query 变化不重渲染；destroy 生命周期）
│   ├── state.js                   # 数据源模式 / resultCache / localStorage
│   ├── api/{adapter,client,ragserver}.js   # 契约适配层 / fetch+SSE / /api/v1 直连
│   ├── mock/{data,jobs,qa}.js     # mock 数据（自动生成）/ 8态时间线 / SSE 脚本回放
│   ├── ui/{shell,components,drawer,graph,highlight,vis-loader}.js
│   └── views/{library,pipeline,doc,qa,health}.js
├── vendor/vis-network.min.js      # v10.1.2 本地 vendor（CDN 回退）
└── tools/gen_mock.py              # mock 生成器（禁止手改 js/mock/data.js）
```

## 重新生成 mock 数据

产物更新后（`graphrag_pipeline/output/`、`mineru_mvp/output/*/full.md`）：

```bash
python3 frontend/tools/gen_mock.py
```

生成器内置溯源断言：narrative 三元组 `full_md[char_interval_fullmd] == text_span`，
失败即退出非零。

## 深链示例

- `#/doc/a00ce40c_sample_report/text?hl=231,271&t=t_000001` —— 冷启动直达原文高亮
- `#/doc/a00ce40c_sample_report/graph?t=t_000001` —— 图谱选中边并打开证据抽屉
- `#/qa/s_demo01` —— 演示会话回放

## 范围外（本期不做）

登录/权限、多租户、多轮上下文问答、table_image 原图渲染（以 bbox 示意图替代）。
