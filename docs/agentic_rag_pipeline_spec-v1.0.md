# Agentic-RAG 问答规范文档 v1.0（基于实测校准）

> 版本：v1.0（2026-10-14）
> 本文档是多模态 RAG 问答系统的 **Agentic-RAG 查询阶段规范**：在 Bridge Pipeline
> 产出的知识图谱（`kg_triples.jsonl` / `entities.jsonl`）之上，用 LangChain 官方
> 技术栈（LangGraph + ChatDeepSeek + langchain.mcp.MCPAdapter）构建 KG-only
> 问答链路。本文档基于 `graphrag_pipeline/agentic_rag_mvp.py` 的真实执行结果
> （2026-10-14，DeepSeek `deepseek-flash`）编写，全部接口与输出规范以
> **本地实测为准**。上游规范：`bridge_pipeline_spec-v1.0.md`（产物契约）、
> `langextract_pipeline_spec-v1.0.md`（DeepSeek 配置）、
> `agentic_rag_architecture-v1.0.md`（完整架构规划，本文为其 P0+P1+P2 的落地版）。

---

## 1. 完整执行思路 + 测试脚本位置

### 1.1 执行思路（已验证的 7 步流程）

```
graphrag_pipeline/output/            graphrag_pipeline/agentic_rag_mvp.py        stdout
─────────────────────               ────────────────────────────────────        ──────
                                    ┌─ 步骤0 配置加载(.env)
                                    │  OPENAI_API_KEY/DEEPSEEK_BASE_URL/DEEPSEEK_MODEL
                                    │  → os.environ 注入 + CFG dict
                                    ├─ 步骤1 KG 装载(KGStore, 只读产物):
entities.jsonl ─────► 步骤1 ───────►│  实体注册表 + canon 别名表(_canon: snake_case↔空格)
kg_triples.jsonl ───► 步骤1 ───────►│  networkx.MultiDiGraph(节点=normalized_name,
                                    │   边=predicate, 边属性携带 triple_id)
full.md ◄──────────── 步骤1 ───────►│  溯源锚点(char_interval_fullmd 切片基准)
                                    ├─ 步骤2 check1 离线自检:
                                    │  kg_expand → triple_id 列表
                                    │  fetch_evidence_text → fullmd_verbatim == text_span
                                    ├─ 步骤3 check2 LLM 连通:
                                    │  ChatDeepSeek(标准 LangChain 组件).invoke("OK")
                                    ├─ 步骤4 MCP 服务启动(子进程):
                                    │  sys.executable agentic_rag_mvp.py serve
                                    │  → fastmcp stdio server "graphrag-retrieval"
                                    ├─ 步骤5 工具发现:
                                    │  langchain.mcp.MCPAdapter(MCPConfig stdio)
                                    │  → adapter.list_tools() → 3 个 StructuredTool
                                    │  (async-only; 与步骤6/7 共用同一事件循环)
                                    ├─ 步骤6 LangGraph 编排(单一 ainvoke 驱动):
agent 工具循环 ────────── 步骤6 ───►│  generate_query_or_respond(System注入+bind_tools)
                                    │   → tools(ToolNode, MCP 异步调用)
                                    │   → route_after_tools(进度感知三路路由):
                                    │     无 triple_id → continue_retrieval(推进指令)
                                    │     有 triple_id → LLM grade: yes→作答 / no→改写
                                    │     超限(rewrite_count>=2) → 强制作答
                                    ├─ 步骤7 generate_answer:
                                    │  with_structured_output(AnswerWithCitations)
                                    │  → 引用复核(citation.triple_id ∈ kg_triples)
                                    └─ 三项验收汇总(check1/check2/check3 PASS 断言)
```

**核心设计原则：**

1. **KG-only 检索**：不接 Embedding/向量检索，全部事实来自知识图谱三元组；
   实体解析（lookup）与图扩展（expand）为两段式检索，证据切片（evidence）为
   确定性工具（零 LLM），保证引用可审计。
2. **MCP 化工具面**：3 个检索工具经 fastmcp stdio server 暴露，Agent 侧经
   `langchain.mcp.MCPAdapter` 消费（官方推荐生命周期：`async with` 内发现，
   工具持有 client，上下文退出后仍可调用）；原生 `@tool` 仅作 MCP 不可用时的
   自动回退。
3. **进度感知路由**：grade 节点先检查工具结果中是否已出现 `triple_id`——
   只有实体解析结果时推进 Agent 继续调 `kg_expand`（实测修复点，见 §3.3），
   防止"查到实体就作答"的过早收敛。
4. **事件循环单一化**：MCP 工具为 async-only 且 client 绑定创建时的事件循环，
   工具发现（步骤5）与图执行（步骤6/7）必须在同一 `asyncio.run` 主流程内
   （实测修复点：分离的 `asyncio.run` 会报 `Event loop is closed`）。
5. **只读产物**：不修改 Bridge 四个 JSONL；注册表 snake_case 与三元组空格形式
   的规范形不一致（Bridge §7 已知局限的实际爆发）由 `_canon()` 别名解析兜底。

### 1.2 测试脚本位置

| 文件 | 职责 |
|------|------|
| `graphrag_pipeline/agentic_rag_mvp.py` | 主入口（单文件双模式）：`load_env` + `KGStore` + `build_mcp_server` + `get_agent_tools` + `build_llm` + `build_graph` + `check1/2/3` 自检；`serve` 参数切换 MCP server 模式 |
| `graphrag_pipeline/.env` | 全部配置（DeepSeek Key、MinerU 产物路径，与 Bridge 共用同一份） |
| `graphrag_pipeline/output/*.jsonl` | 只读消费的 Bridge 产物（见 bridge 规范 §5） |
| `../mineru_mvp/output/sample_report/full.md` | 溯源切片基准文本（`MINERU_RESULT_DIR` 定位） |
| `graphrag_pipeline/CLAUDE.md` | 组件级 Agent 规则（虚拟环境切换，见 §1.4） |

**运行方式**（复用 LangExtract 组件虚拟环境，依赖已 `uv add` 于 `../langextract`）：

```bash
cd graphrag_pipeline
uv run --project ../langextract python agentic_rag_mvp.py          # 三项自检（调真实 API）
uv run --project ../langextract python agentic_rag_mvp.py serve    # 独立 MCP server (stdio)
```

### 1.3 实测运行记录（2026-10-14，输入 Bridge 全量产物：13 triples / 11 entities）

```
[config] model=deepseek-flash base_url=https://api.deepseek.com/v1 output=output fullmd=ok
=== check1 KG 装载 + 图工具 (离线) ===
[load] entities=11 triples=13 graph_nodes=18 fullmd_chars=679
[kg_expand 'total revenue'] -> ['t_000001', 't_000002']
[fetch_evidence_text t_000001] fullmd_verbatim == text_span: True
  ('Total revenue in Q3 was 12.5 billion CNY')
check1: PASS
=== check2 DeepSeek 连通 (ChatDeepSeek, LangChain 标准组件) ===
[llm] deepseek-flash @ https://api.deepseek.com/v1 -> 'OK'
check2: PASS
[tools] via langchain.mcp.MCPAdapter (stdio, 3 tools):
  ['kg_entity_lookup', 'kg_expand', 'fetch_evidence_text']
=== check3 E2E Agentic-RAG 问答 (含引用复核) ===
[question] Q3 的总收入是多少？同比增长了多少？
[grade] -> continue_retrieval (no triples yet)     ← 步骤6 进度感知路由生效
[grade] -> yes
[answer] Q3 总收入 12.5 billion CNY，同比增长 18.2%
[citation] t_000001: exists_in_kg=True text_span='Total revenue in Q3 was 12.5 billion CNY'
[citation] t_000002: exists_in_kg=True text_span='up 18.2% year over year'
[citation] t_000011/12/13: exists_in_kg=True（Q3 表格路径三元组）
check3: PASS
```

### 1.4 虚拟环境切换说明

沿用 `graphrag_pipeline/CLAUDE.md` §8 规则：不建独立 venv，复用 `langextract/.venv`。
本阶段在该环境新增依赖（经 `../langextract/` 下 `uv add`，非 pip install）：

```
langchain  langgraph  langchain-deepseek  "langchain[mcp]"  networkx
```

实测版本要点：`langchain.mcp.MCPAdapter` 需 `langchain[mcp]>=1.4.0`（beta API，
导入时发 `LangChainBetaWarning`，属预期）；fastmcp 4.1.0 承载 stdio 传输。

---

## 2. 接入 LangChain Agent 后的输入与输出（对接契约总表）

### 2.1 接口契约总表

```
Bridge 产物                      Agentic-RAG 转换层                    LangChain Agent 消费面
────────────                    ─────────────────────                 ─────────────────────
entities.jsonl            ──►   KGStore.entities + _ent_alias   ──►   kg_entity_lookup 工具返回
(normalized_name 主键,          (canon: 下划线/空格互认)               (matched / candidates)
 snake_case 实测形)
kg_triples.jsonl          ──►   MultiDiGraph 边(携带triple_id)  ──►   kg_expand 工具返回
(head/predicate/tail,            _resolve(canon) 定位节点               (triples[{triple_id,...}])
 normalized_name 空格形)
evidence.text_span        ──►   full.md[char_interval_fullmd]   ──►   fetch_evidence_text 返回
char_interval_fullmd            (Bridge §4.3 数学契约)                 (fullmd_verbatim 逐字切片)
page_idx/bbox/table_image ──►   KGStore.evidence_text 组装      ──►   (visual 字段, 视觉回溯预留)
─────────────────────────────────────────────────────────────────────────────────────────
用户问题                  ──►   AgentState.messages[0]          ──►   generate_query_or_respond
(HumanMessage)                                                        (Agent 唯一文本入口)
工具返回                  ──►   ToolNode → ToolMessage          ──►   grade/answer 节点的
(MCP 工具 JSON 字符串)          (追加进 messages)                      唯一事实来源
─────────────────────────────────────────────────────────────────────────────────────────
最终输出                  ◄──   generate_answer 节点            ◄──   AnswerWithCitations
(§4 返回格式规范)               (structured output + 引用复核)         (Pydantic schema 强约束)
```

### 2.2 输入规范（Agent 侧）

| 输入项 | 类型 | 说明 |
|--------|------|------|
| 用户问题 | `HumanMessage` | 状态首个 Human 消息；中文/英文均可，实体名须能对齐 `entities.jsonl` 的 name/normalized_name |
| 系统指令 | `SystemMessage` | 首次进入决策节点时自动注入（工具使用策略：先 lookup → 再 expand → 后 evidence；寒暄直答不调工具） |
| 检索状态 | `AgentState.rewrite_count: int` | 重试计数（初始 0），同时约束 continue_retrieval 与 rewrite_question 两类重试的总轮次上限 `MAX_GRADE_RETRIES=2` |

### 2.3 输出规范（Agent 侧）

| 输出项 | 类型 | 说明 |
|--------|------|------|
| 最终答案 | `AIMessage` → JSON | `generate_answer` 节点产出 `{"answer", "citations"}` JSON（schema 见 §4.1），以 `[FINAL]` 标记消息定位 |
| 检索轨迹 | `ToolMessage` 列表 | 全部工具调用的 JSON 结果保留在 state.messages 中（可审计）；最终交付只取 `[FINAL]` 后的消息 |
| 引用集合 | `citations[]` | 每条引用 `{triple_id, text_span}`，`text_span` 以 KG 产物为基准复核（见 §4.3） |

---

## 3. 与 LangChain 构建 Agentic-RAG 对接的关键参数（全部实测验证）

### 3.1 模型接入参数（`langextract_pipeline_spec §2` 配置 → LangChain 标准组件）

| 参数 | 实测值 | 说明 |
|------|--------|------|
| 组件 | `langchain_deepseek.ChatDeepSeek` | LangChain 标准聊天模型；与 LangExtract 侧 `ModelConfig(provider="openai", base_url=...)` 同一账号配置，但走原生集成（工具调用/结构化输出支持更完整） |
| `model` | `.env DEEPSEEK_MODEL` = `deepseek-flash` | 实测可用（同 LangExtract 侧实测记录） |
| `api_key` | `.env OPENAI_API_KEY` | DeepSeek Key；同时注入 `DEEPSEEK_API_KEY`/`OPENAI_API_KEY` 环境变量 |
| `api_base` | `.env DEEPSEEK_BASE_URL` = `https://api.deepseek.com/v1` | 字段名实测为 `api_base`（代码保留 `base_url` 旧名 TypeError 回退） |
| `temperature` | `0` | 问答确定性输出 |
| 工具调用 | `.bind_tools(tools)` 实测 ✅ | 决策节点多工具并发调用正常（lookup 一次并行两个实体） |
| 结构化输出 | `.with_structured_output(Pydantic)` 实测 ✅ | `Grade` / `AnswerWithCitations` 均走通；代码保留裸文本+正则提取 `t_\d{6}` 的降级路径 |
| 降级约束 | 无 LangExtract 侧 400 问题 | LangExtract 的 `use_schema_constraints=False` 是该库 OpenAI provider 的限制；LangChain 侧无此约束，未实测到 response_format 报错 |

### 3.2 MCP 接入参数（`langchain.mcp.MCPAdapter`，官方 2.x API）

| 参数 | 实测值 | 说明 |
|------|--------|------|
| 导入 | `from langchain.mcp import MCPAdapter` | 需 `langchain[mcp]>=1.4.0`；beta（`LangChainBetaWarning` 属预期）；官方兼容回退为 `langchain-mcp-adapters.MultiServerMCPClient` |
| MCPConfig | `{"mcpServers": {"graphrag": {"command": sys.executable, "args": ["agentic_rag_mvp.py", "serve"]}}}` | stdio 传输；`sys.executable` 保证子进程复用同一 venv（避免 uv 重入） |
| Server 实现 | `fastmcp.FastMCP("graphrag-retrieval")`，`mcp.run()` 默认 stdio | 工具 docstring 即 Agent 的工具选择依据，须写明调用时机 |
| 发现 | `async with MCPAdapter(config) as adapter: tools = await adapter.list_tools()` | 实测 3 工具全量发现；工具持有 client，上下文退出后仍可调用（官方连接生命周期模式） |
| 调用语义 | **async-only**（`StructuredTool` 不支持 sync invoke） | 图必须 `ainvoke` 驱动；且发现与执行须同一事件循环（实测 `Event loop is closed` 教训） |
| 回退路径 | MCP 连接失败 → 原生 `@tool` 包装同三个函数 | 同一批 `KGStore` 纯函数实现，语义等价，保证链路可用性 |

### 3.3 LangGraph 编排参数（官方 agentic-rag 模式的实测修正）

| 参数 | 实测值 | 说明 |
|------|--------|------|
| 状态 | `AgentState(MessagesState) + rewrite_count` | messages 累积全部轮次；`rewrite_count` 统一计数两类重试 |
| 节点 | `generate_query_or_respond / tools(ToolNode) / continue_retrieval / rewrite_question / generate_answer` | 官方教程四节点 + 实测新增 `continue_retrieval` |
| 条件边① | `tools_condition`（官方 prebuilt） | 决策节点：有 tool_calls → tools；无 → END（寒暄直答路径） |
| 条件边② | `route_after_tools`（**进度感知三路**） | ① 工具结果无 `"triple_id"` → `continue_retrieval`（实测修复：deepseek-flash 首轮只做实体 lookup 就停手，须注入推进指令回到决策点）；② 有 triple_id → LLM grade yes/no；③ no → `rewrite_question` |
| 重试上限 | `MAX_GRADE_RETRIES = 2` | `rewrite_count` 达上限强制进入 `generate_answer`，防死循环 |
| 运行时 | `agent.ainvoke(..., config={"recursion_limit": 30})` | 覆盖 3 轮工具循环 + grade + 作答的步数余量 |
| 首轮决策点注记 | grade 打分对象为**全部工具结果拼接**（非仅末条 ToolMessage） | 多轮工具循环后上下文跨轮累积 |

### 3.4 核心技术架构（分层视图）

```
┌─ 应用层 ─────────────────────────────────────────────────────┐
│  CLI 自检(agentic_rag_mvp.py main) ｜ webapp /api/ask (P3 预留)│
├─ Agent 编排层（LangGraph StateGraph）────────────────────────┤
│  5 节点 + 2 条件边（§3.3）；ChatDeepSeek 三角色:               │
│  决策模型(bind_tools) / grader / answerer(structured output)  │
├─ MCP 检索服务层（fastmcp stdio 子进程 "graphrag-retrieval"）──┤
│  kg_entity_lookup / kg_expand / fetch_evidence_text           │
│  ← langchain.mcp.MCPAdapter (stdio, async-only, 单 loop)      │
├─ 数据/存储层（只读 Bridge 产物）─────────────────────────────┤
│  entities.jsonl → 注册表+别名 ｜ kg_triples.jsonl → MultiDiGraph│
│  full.md → 溯源切片 ｜ page_idx/bbox/table_image → 视觉回溯预留 │
└──────────────────────────────────────────────────────────────┘
```

---

## 4. 问答流程最终数据返回格式规范（实测为准）

### 4.1 最终返回 JSON（`generate_answer` 交付物）

```json
{
  "answer": "**Q3 总收入：12.5 billion CNY**，**同比增长 18.2%**。\n\n- 总收入：`12.5 billion CNY`（`t_000001`...）",
  "citations": [
    {"triple_id": "t_000001", "text_span": "Total revenue in Q3 was 12.5 billion CNY"},
    {"triple_id": "t_000002", "text_span": "up 18.2% year over year"}
  ]
}
```

| 字段 | 实测类型 | 说明 |
|------|---------|------|
| `answer` | str | 面向用户的自然语言回答（跟随提问语言）；事实性断言须内联标注 `triple_id` |
| `citations` | list[object] | 支撑断言的引用列表；**可为空仅当 answer 明示"上下文不足"** |
| `citations[].triple_id` | str | 格式 `t_{6位序号}`，必须存在于 `kg_triples.jsonl`（复核断言，见 §4.3） |
| `citations[].text_span` | str | 模型给出的证据原文；交付前以 KG 产物 `evidence.text_span` 为基准归一（§4.3） |

Pydantic schema（`AnswerWithCitations`，结构化输出硬约束）：

```python
class Citation(BaseModel):
    triple_id: str   # 支撑断言的三元组 ID
    text_span: str   # 逐字证据原文

class AnswerWithCitations(BaseModel):
    answer: str
    citations: list[Citation] = Field(default_factory=list)
```

降级路径：`with_structured_output` 异常时，裸文本回答 + 从 ToolMessage 正则提取
全部 `t_\d{6}` 自动生成 citations（不静默丢弃检索结果）。

### 4.2 工具层返回 JSON 格式（ToolMessage 内容，消费于 grade/answer）

**`kg_entity_lookup(name)`**（三态：精确命中 / 近似候选 / 未命中）：

```json
{"matched": {"name": "Total revenue", "entity_type": "metric",
             "normalized_name": "total_revenue", "mentions": 1}}
{"matched": null, "candidates": [ ... 同上实体对象，至多 5 条 ... ]}
{"matched": null, "candidates": [], "known_entities": ["12.5_billion_cny", "..."]}
```

**`kg_expand(entity, hops=1)`**：

```json
{"entity": "total revenue", "triples": [
  {"triple_id": "t_000001", "head": "Total revenue", "predicate": "has_value",
   "tail": "12.5 billion CNY", "attributes": {"value": "12.5 billion CNY", "period": "Q3"},
   "page_idx": 0}
]}
```

未命中实体时返回 `{"error": "entity not in graph: ...", "lookup_hint": {...entity_lookup 三态...}}`。

**`fetch_evidence_text(triple_id)`**（确定性，零 LLM）：

```json
{"triple_id": "t_000001",
 "text_span": "Total revenue in Q3 was 12.5 billion CNY",
 "source": "full.md", "chunk_id": "sample_report_chunk_001", "page_idx": 0,
 "fullmd_verbatim": "Total revenue in Q3 was 12.5 billion CNY"}
```

| 字段 | 说明 |
|------|------|
| `fullmd_verbatim` | `full.md[char_interval_fullmd]` 逐字切片（Bridge §4.3 数学契约）；`char_interval_fullmd` 为 null（表格路径）或缺 full.md 时该字段缺省 |
| `visual` | 表格路径三元组额外携带 `{"bbox_normalized": [...], "table_image": "..."}`（视觉回溯预留，MVP 未消费） |

### 4.3 返回校验规则（`check3` 固化断言）

1. **引用存在性**：每条 `citations[].triple_id` 必须能在 `kg_triples.jsonl`
   定位（`exists_in_kg=True`）；不存在即 check3 FAIL。
2. **text_span 归一**：交付以 KG 产物 `evidence.text_span` 为准（模型改写不落盘）。
3. **溯源可还原**：`fullmd_verbatim == evidence.text_span` 逐字相等
   （继承 Bridge acceptance check3 数学契约，check1 固化）。
4. **进度前置**：进入作答前工具结果中必须出现过 `triple_id`（route_after_tools
   进度门控），否则属编排异常。

### 4.4 中间消息流（state.messages 形态，调试/审计用）

```
[0]  HumanMessage      用户问题
[1]  SystemMessage     工具使用策略（决策节点自动注入，仅一次）
[2]  AIMessage         首轮决策（tool_calls: kg_entity_lookup×N）
[3+] ToolMessage       MCP 工具 JSON 返回（§4.2 格式）
[..] HumanMessage      (rewritten query) ... 或 continue_retrieval 推进指令
[..] HumanMessage      "[FINAL]" 分隔标记
[-1] HumanMessage      '{"answer": ..., "citations": [...]} ' ← §4.1 最终交付物
```

提取方式：自尾向前找首条 content 以 `{"answer"` 开头的消息（`check3` 实测逻辑）。

---

## 5. 已知局限与实测记录

1. **首轮停手问题**：deepseek-flash 决策模型首轮倾向只调 entity_lookup（实体解析）
   就直接作答——已由 `continue_retrieval` 进度门控修复，但提示词依赖较重，
   换模型须回归 check3。
2. **跨路径实体噪声**：Q3 问题会连带召回表格路径的 t_000011~13（同页三元组），
   引用偏多但不影响正确性（引用复核全 PASS）；按 `evidence.source` 过滤留待 P4。
3. **grade 降级**：结构化打分异常时默认放行（`decision="yes"`），依赖引用复核
   兜底；未观察到实际触发（deepseek-flash 结构化输出稳定）。
4. **单事件循环约束**：MCPAdapter 工具与 `asyncio.run` 生命周期强耦合，
   webapp 集成（P3）须在应用级事件循环内完成发现 + 执行，禁止拆分。

---

## 附：信息来源

- 实测：`graphrag_pipeline/agentic_rag_mvp.py` 真实运行（2026-10-14，三项
  check 全 PASS）及三次失败迭代（sync invoke / Event loop closed / 实体规范形
  不一致）的修复记录
- 上游规范：`docs/bridge_pipeline_spec-v1.0.md`（产物契约）、
  `docs/langextract_pipeline_spec-v1.0.md`（DeepSeek 配置）、
  `docs/mineru_pipeline_spec-v1.0.md`（文档体例）
- 架构规划：`docs/agentic_rag_architecture-v1.0.md`（本文为其 P0–P2 落地版）
- LangChain 官方文档（docs.langchain.com，2026-10 经 MCP 核实）：
  `oss/python/langgraph/agentic-rag`、`oss/python/langchain/mcp`、
  `oss/python/integrations/chat`（ChatDeepSeek）
