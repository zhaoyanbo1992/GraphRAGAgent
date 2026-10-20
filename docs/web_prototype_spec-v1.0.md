# Web 原型规范文档 v1.0（"审计台"多模态 RAG 问答系统前端）

> 版本：v1.0（2026-10-15）
> 本文档定义 Web 原型组件 `web_prototype/` 的设计系统、架构、页面清单、交互逻辑
> 与响应式规范。原型基于 `backend_service_spec-v1.0.md`（/api/v1 契约）与
> `agentic_rag_pipeline_spec-v1.0.md`（问答返回格式）设计，mock 数据**逐字段
> 拷贝自实测产物**（`graphrag_pipeline/output/a00ce40c_sample_report/` 等），
> 由 `tools/gen_mock.py` 自动生成。全部页面经 Chrome headless 截图实测验证
> （2026-10-15，桌面 1440px + 移动 390px）。

---

## 1. 设计概念与视觉系统

### 1.1 设计概念："审计台"

主题本体是**文档 → 知识图谱 → 可溯源问答**，用户核心诉求是"每条断言都能划回
原文"。设计语言取自审计/批注世界：冷调纸面、墨蓝正文、**批注红**（审计红线）
作为引用与溯源的专用色。这是对 webapp 暗色默认形态（#10161F + 单一亮青色）的
有意差异化。

### 1.2 设计令牌（`css/tokens.css`）

| 令牌 | 值 | 用途 |
|---|---|---|
| `--paper` | `#EFF2F5` | 冷纸面底色 |
| `--card` / `--card-tint` | `#FFFFFF` / `#F7F9FB` | 卡片面 / 内嵌面 |
| `--ink` / `--ink-2` / `--muted` | `#1B2A3A` / `#43566B` / `#6E7E8E` | 墨蓝正文 / 次级 / 辅助 |
| `--line` / `--line-strong` | `#D8DEE5` / `#B9C4CF` | 细边线分层（少阴影） |
| `--ink-blue` / `--ink-blue-deep` / `--ink-blue-wash` | `#2B5D8C` / `#1E4668` / `#E3EDF5` | 主交互色 |
| `--redline` / `--redline-wash` | `#C4442E` / `#F9ECE8` | **批注红：仅用于引用下划线、证据标记、溯源跳转**，不得作普通装饰 |
| `--ok` / `--warn` | `#2E7D46` / `#9A6B00` | 状态色 |

实体类型色（亮色调校，语义沿用 webapp TYPE_COLOR）：

| type | 色值 | type | 色值 |
|---|---|---|---|
| metric | `#2B5D8C` | percentage | `#7B3FA0` |
| period | `#B26A00` | company | `#C2447A` |
| currency_value | `#2E7D46` | unknown | `#6B7A88` |

### 1.3 字体与组件语言

| 栈 | 字体 | 用途 |
|---|---|---|
| `--serif` | Songti SC / Noto Serif SC / Georgia | 文档正文、引文、页标题（文档世界的衬线） |
| `--sans` | PingFang SC 系统栈 | UI 文字 |
| `--mono` | SF Mono / JetBrains Mono | triple_id、char 坐标、统计数字（数据本体用等宽） |

组件语言：细边线分层 + 极少量阴影两档；引用句 = 衬线 + 红下划线
（`text-decoration-color: --redline`）+ 上标序号；证据抽屉左缘 2px 红线。
对比度：`--redline` on `#FFFFFF` ≈ 4.9:1、`--ink` on `--paper` ≥ 10:1（过 4.5:1）。
动画仅三处：步骤 pulse、骨架条、toast 进入；`prefers-reduced-motion` 全部关闭。

---

## 2. 前端整体架构

### 2.1 技术形态

**SPA 单 `index.html` + hash 路由 + ES modules 多文件拆分，无构建。**
选型理由：证据跨视图跳转（图谱→抽屉→原文高亮、问答引用→原文）需要在视图间
共享 result payload——多 HTML 会迫使 sessionStorage 序列化大对象并重复初始化
vis-network；hash 路由让深链（`?t=/hl=`）可粘贴收藏后退。代价：`file://` 无法
运行 ES modules，README 首行给出 `python3 -m http.server 8080 -d web_prototype`
启动命令，`app.js` 检测 `file:` 协议渲染引导卡。

### 2.2 目录结构与分层

```
web_prototype/
├── index.html              # 唯一入口
├── css/{tokens,base,views}.css   # 设计令牌 / 基础组件 / 视图样式
├── js/
│   ├── app.js              # 入口: file:// 检测 + 路由注册 + 全局错误兜底
│   ├── router.js           # hash 路由: 同页 query 变化不重渲染(派发 querychange),
│   │                       #   视图 destroy 生命周期 (修 webapp 轮询无清理缺陷)
│   ├── state.js            # 数据源模式(?api/localStorage/默认mock) + resultCache
│   ├── api/                # 统一契约适配层:
│   │   ├── adapter.js      #   三数据源分发 (视图零分支)
│   │   ├── client.js       #   fetch 封装 + postSSE(POST+ReadableStream 分帧)
│   │   ├── webapp.js       #   旧 webapp API 归一 (3态job→8态等)
│   │   └── ragserver.js    #   /api/v1 直连 (rag_server 就绪后零改动联调)
│   ├── mock/               # data.js(自动生成,勿手改) / jobs.js(8态时间线) / qa.js(事件脚本回放)
│   ├── ui/                 # shell / components(全转义) / graph(vis惰性加载) / highlight / vis-loader
│   └── views/              # library / pipeline / doc / qa / health
├── vendor/vis-network.min.js  # 本地 vendor (v10.1.2, CDN 回退)
└── tools/gen_mock.py       # mock 数据生成器
```

数据流：`views → state(resultCache) → api/adapter → {mock | webapp | ragserver}`。
视图为纯函数 `async view(root, params, query) → destroy()`；router 在 hash 变化时
先调 destroy（清轮询 timer / abort SSE / `network.destroy()`），同一视图仅 query
变化（如 `?t=` 选中边）时只派发 `querychange` 不重渲染——保证图谱物理布局稳定。

### 2.3 数据源适配层统一契约

| 方法 | mock | webapp 适配 | ragserver |
|---|---|---|---|
| `upload(files)` | 时间线脚本 | `POST /api/upload` 逐文件 | `POST /api/v1/documents` |
| `getJob(id)` | mock/jobs 推进 | 3 态→8 态归一（按 steps 末项推断阶段） | `GET /api/v1/jobs/{id}` |
| `getResult(docId)` | 实测产物 | `GET /api/result/{id}`（补 `blocks:[]`） | `GET .../result` |
| `listDocuments()` | MOCK.docs + localStorage | KNOWN_DOCS + localStorage | `GET /api/v1/documents` |
| `askStream(body,{signal,onEvent})` | `replayStream()` 脚本回放 | **不支持**（抛 `E_QA_UNSUPPORTED`，UI 明示降级+一键切 mock） | `postSSE(POST /qa/ask/stream)` |
| `listSessions/getSession/...` | 内置 s_demo01 + localStorage | 空 | `/api/v1/qa/sessions*` |
| `health()/config()` | MOCK.system | 探测可达性降级版 | `/api/v1/health|config` |

开关优先级：URL `?api=live|mock` > `localStorage('gqa.api_mode')` > mock；
顶栏"数据源胶囊"点击切换（切 live 清 resultCache 防串数据）。

### 2.4 SSE 双实现同构

mock 侧 `replayStream(question, {onEvent, signal})`：事件脚本数组（严格
backend spec §2.4 次序与字段），`setTimeout` 链按脚本 delay×(0.8~1.2) 抖动推送，
abort 清全部 timer。live 侧 `client.postSSE`：fetch POST → `reader.read()` →
`\n\n` 分帧 → `event:`/`data:` 行解析 → 同构 `{event, data}` 回调，`ping` 忽略，
`done`/`error` 终结。两者共享同一事件形状，QA 视图对数据源无感知。

### 2.5 mock 数据契约（`tools/gen_mock.py`）

- `MOCK.results.<doc_id>` 逐字段拷贝 `graphrag_pipeline/output/<doc_id>/*.jsonl`
  + `mineru_mvp/output/<doc_id>/full.md`；extractions 按 webapp 语义展平
  （`grounded = char_interval is not null`）；`_meta` 附 page_count/n_* 统计。
- **溯源数学契约在 mock 中成立**：`full_md[char_interval_fullmd] == text_span`
  （t_000001 → "Total revenue in Q3 was 12.5 billion CNY"，生成后自动断言验证）。
- 两个文档：a00ce40c_sample_report（2 块/10 实体/13 三元组/2 页）、
  dd68cea4_sample_graphrag_overview（14/17/25/4）。
- 产物更新后重跑 `python3 tools/gen_mock.py` 再生成；**禁止手改 data.js**。

---

## 3. 页面清单与路由表

| hash 路由 | 页面 | 数据依赖 | 核心交互 |
|---|---|---|---|
| `#/` | 文档库 | `listDocuments()` | 批量拖拽上传、客户端预校验、rejected 红批注行、卡片栅格 |
| `#/pipeline/:jobId` | 索引流水线 | `getJob(id)` 轮询 | 8 态横向步骤条、detail 键值、done 2.5s 自动跳详情（可取消）、failed retry |
| `#/doc/:id/graph?t=&n=` | 文档详情·图谱 | `getResult(id)` | vis 画布、点边/点节点→证据抽屉、`?t/n` 深链定位 |
| `#/doc/:id/extract?t=` | 文档详情·抽取 | 同上 | 三元组表 + 抽取明细表，行点击→抽屉+深链 |
| `#/doc/:id/text?hl=s,e&t=` | 文档详情·原文 | 同上 | 衬线文档流、红下划线高亮滚动、批注条、表格 bbox 证据卡 |
| `#/qa(/:sessionId)` | 问答 | `askStream`/sessions | SSE 流式渲染、检索轨迹、引用卡跳原文、会话回放、[停止] |
| `#/health` | 系统健康 | `health()/config()` | 检查项卡栅格 + config 键值表 |

未匹配 hash → 重定向 `#/`。三视图是同一 doc 视图的子路由，共享 resultCache
不重取。

### 3.1 全局壳

顶栏 56px（衬线品牌"审计台" + 数据源胶囊）+ 侧栏 200px（文档库/问答/系统健康，
当前项左缘 2px 墨蓝指示条）。移动 <768px：汉堡 → 侧栏左滑抽屉 + 遮罩。

---

## 4. 交互逻辑规范

### 4.1 上传 → 轮询 → 自动跳转

1. 客户端预校验（backend spec §2.1 白名单）：扩展名/空文件/≤200MB/≤10 个，
   不合法者**不上传**，直接渲染红批注行（`{filename} {code} {message}`）。
2. `upload()` → 跳 `#/pipeline/{job_id}`；多文件批次显示互链。
3. 轮询：1.5s×10 → 3s，总超时 30min；AbortController + destroy 清理
   （修 webapp 无超时/无清理缺陷）。
4. done → 完成卡（含三元组统计）+ 2.5s 自动跳 `#/doc/{id}/graph`（"留在此页"
   可取消）；failed → 红批注错误卡 + retry（mock 断点续跑时间线）。

### 4.2 溯源跳转链（核心交互，URL 状态分层）

**可分享状态进 hash，瞬态留内存。** `t=triple_id`、`n=normalized_name`、
`hl=start,end`；抽屉开合、图稳定等不进 hash。非法 `hl`（越界/非数字/倒序）静默忽略。

```
图谱点边/点节点 → location.replace(?t= / ?n=) → 证据抽屉(右侧360px, 全部 esc 转义)
  ├─ narrative: [在原文中查看] → push #/doc/:id/text?hl=s,e&t=tid
  │     → 衬线原文红下划线高亮 + scrollIntoView 居中 + 批注条"证据 t_xxx · [返回图谱]"
  └─ table: [查看表格证据] → #/doc/:id/text?t=tid
        → bbox 红框页面示意图 (char_interval_fullmd=null, 无可高亮原文)
抽取表行点击 → 同抽屉 + ?t= 深链 (表↔图↔文三向互跳)
```

### 4.3 问答 SSE 事件 → UI 映射

| 事件 | UI |
|---|---|
| `session` | 消息占位；侧栏会话置顶 |
| `status` | "检索轨迹"区节点徽标（stage + node + attempt/detail），当前项 pulse |
| `tool_call` | 轨迹项：⚙ 工具名（mono）+ args |
| `tool_result` | 按 call_id 配对：✓/✗ + summary + elapsed_ms |
| `answer_delta` | 追加正文（`aria-live="polite"`）；自动滚底，用户上滚暂停并出"↓ 回到底部" |
| `citations` | 引用卡列表：`[n]` 上标 + 衬线 text_span 红下划线 + `triple_id · full.md[s:e] 或 bbox · p{n}`；点击 → 4.2 跳转链 |
| `done` | latency 三段（total/retrieval/answer）；消息持久化 |
| `error` | 红批注错误卡（retryable 才显重试）；流关闭 |
| `ping` | 忽略 |

进行中：输入框禁用 + [停止]（abort → 中断）；同一会话串行。Enter 发送 /
Shift+Enter 换行；Esc 停流（焦点在输入框时除外）。

### 4.4 状态与可达性规范

- 加载 = 骨架条（非 spinner）；空态 = 虚线卡 + 引导动作（"试试示例问题"预填
  check3 问题）；错误 = 行内红批注 / 页级错误卡；降级 = 黄条。
- skip link、`aria-current`、抽屉 `role="dialog"` + Esc 归还焦点、图谱画布提供
  抽取表等价键盘路径。

---

## 5. 响应式规范（≥1280 / 768–1279 / <768）

| 区域 | ≥1280 | 768–1279 | <768 |
|---|---|---|---|
| 侧栏 | 200px | 64px 图标 | 汉堡抽屉+遮罩 |
| 文档卡 | 3 列 | 2 列 | 1 列 |
| 流水线步骤条 | 横向 | 横向滚动 | 纵向（小屏简化） |
| 证据抽屉 | 右缘 360px 推挤 | 固定覆盖 | **底部弹层**（上滑把手，max-height 62vh） |
| 图谱画布 | 全高 | 全高 | 55vh + stabilization 60 次 |
| 问答会话栏 | 260px | 240px | 隐藏（顶部入口待接） |
| 原文栏 | 76ch 居中 | 同 | 100%−32px |

移动端截图实测：底部弹层抽屉、汉堡导航、图谱触控均正常（390×844）。

---

## 6. 验收清单（已执行）

| 项 | 结果 |
|---|---|
| mock 与实测 JSONL 逐字段同构（gen_mock.py 生成 + 溯源断言） | ✅ |
| 深链冷启动 `#/doc/a00ce40c_sample_report/text?hl=231,271&t=t_000001` 直达高亮 | ✅ 截图 |
| 图谱点边 → 抽屉（红缘卡 + 衬线引文 + meta 表）→ 在原文中查看 | ✅ 截图 |
| 问答 s_demo01 回放：5 张引用卡（2 narrative + 3 table）+ latency | ✅ 截图 |
| 抽取视图双表 + 路径徽章 + 溯源区间列 | ✅ 截图 |
| 移动 390px：底部弹层 / 汉堡 / 55vh 图谱 | ✅ 截图 |
| CDN 失败降级空态（首版实测触发，后改 vendor 优先 + CDN 回退） | ✅ |
| file:// 引导卡、node --check 全部 JS、import 路径完整性 | ✅ |

---

## 7. 风险与开放问题

1. **vendor 版本**：本地 vendor 为 vis-network 10.1.2（npmmirror 可得版本），
   CDN 回退为 9.3.6（webapp 同款）；两者 API 兼容本原型用量，升级需回归图谱页。
2. **table_image 无图片端点**：以 bbox 红框示意图呈现，原始图片待 rag_server
   静态挂载（backend spec §6-8）。
3. **mock 上传文档**复用 sample_report 产物演示（卡片与详情页打 mock/演示徽标），
   刷新后任务时间线不保留（localStorage 仅存文档卡）。
4. **webapp live 模式**问答/会话/健康检查不可用（旧 API 缺失），UI 明示降级；
   rag_server 就绪后切 `adapter.pick()` 即可联调。
5. **会话多轮上下文**未实现（backend spec 同此边界）；SSE 为准流式
   （structured output 整块限制，backend spec §2.4 已声明）。

---

## 附：信息来源

- 后端契约：`docs/backend_service_spec-v1.0.md`（§2 API / §2.4 SSE 事件）
- 产物契约：`docs/bridge_pipeline_spec-v1.0.md` §5、`docs/agentic_rag_pipeline_spec-v1.0.md` §4
- 实测产物：`graphrag_pipeline/output/a00ce40c_sample_report/`（mock 同构基准）
- 复用改造：`webapp/static/index.html`（图谱配置/证据卡/jumpText/图例模式）
- 视觉验证：Chrome headless 截图 7 张（2026-10-15）
