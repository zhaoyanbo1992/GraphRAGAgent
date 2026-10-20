# Agentic-RAG 查询架构规范 v1.0（基于 Bridge Pipeline 产物）

> 版本：v1.0（2026-10-14）
> 本文档规划多模态 RAG 系统的**查询阶段**：在 Bridge Pipeline 已产出的
> `kg_triples.jsonl` / `entities.jsonl` / `chunks.jsonl` 之上，用 LangChain 官方
> 技术栈（LangGraph + MCPAdapter）构建 Agentic-RAG 问答流程。
> 技术依据：LangChain 官方文档（docs.langchain.com，2026-10 经 MCP 检索核实）：
> - Agentic RAG 模式：`oss/python/langgraph/agentic-rag`（retrieve → grade → rewrite → generate 循环）
> - MCP 接入：`oss/python/langchain/mcp`（`MCPAdapter`，`langchain[mcp]>=1.4.0`，连接生命周期 / MCPConfig 多服务器）
> - 模型接入：`oss/python/integrations/chat`（`ChatDeepSeek` 支持工具调用与结构化输出）
> 上游规范：`bridge_pipeline_spec-v1.0.md`（本方案只读其产物，不改索引阶段）。

---

## 1. 总体架构：四层结构

```
┌─ 应用层 ──────────────────────────────────────────────────────┐
│  webapp (FastAPI): 聊天 UI + 答案引用高亮 + PDF 页面回溯      │
│  CLI: rag_agent/ask.py（调试入口）                            │
├─ Agent 编排层（rag_agent/graph.py，LangGraph）────────────────┤
│  generate_query_or_respond ──► agent 工具调用循环             │
│      │  (LangGraph 条件边)                                    │
│      ▼                                                        │
│  grade_context（相关性打分, structured output）               │
│      ├─ yes ► generate_answer（带引用的结构化回答）           │
│      └─ no  ► rewrite_question ► 回到检索（重试上限 2 次）    │
├─ MCP 检索服务层（rag_agent/mcp_server.py，fastmcp stdio）─────┤
│  graphrag-retrieval MCP server 暴露 5 个检索工具：            │
│  vector_search_chunks / kg_entity_lookup / kg_expand /        │
│  fetch_evidence_text / fetch_evidence_visual                  │
│  Agent 侧经 langchain.mcp.MCPAdapter 连接（MCPConfig stdio）  │
├─ 数据/存储层（只读 Bridge 产物 + 索引缓存）───────────────────┤
│  kg_triples.jsonl / entities.jsonl / chunks.jsonl  (现有产物) │
│  full.md / *_content_list.json                    (溯源基准)  │
│  InMemoryVectorStore(chunks, bge-m3 embeddings)   (启动时构建)│
│  networkx.MultiDiGraph(kg_triples)                (启动时构建) │
└──────────────────────────────────────────────────────────────┘
```

**核心设计原则**（延续 Bridge Pipeline 的风格）：

1. **检索能力 MCP 化**：全部检索工具封装为本地 MCP server，Agent 经
   `MCPAdapter` 消费。检索层与编排层进程解耦，webapp / CLI / 未来多 Agent
   复用同一工具面，且符合"使用 LangChain MCP"的技术选型要求。
2. **双通道检索**：向量检索（语义，走 chunks.jsonl）+ 图检索（结构，走
   kg_triples.jsonl），由 Agent 自主决定调用哪个/哪些——这是 Agentic RAG
   相对固定 RAG 管道的本质差异（官方 agentic-rag 教程模式）。
3. **溯源是硬约束**：每条答案必须携带引用（triple_id/chunk_id → full.md 偏移
   → page_idx/bbox），复用 Bridge 已验证的双溯源指针，不在查询阶段重新发明。
4. **只读产物 + 派生索引**：不修改 Bridge 四个 jsonl；向量索引与内存图在
   server 启动时从产物派生构建，产物更新 = 重启重建（MVP 无增量索引）。

---

## 2. 数据/存储层设计

### 2.1 向量索引（语义通道）

| 项 | 决策 | 依据 |
|----|------|------|
| Document 来源 | `chunks.jsonl` 每行一个 Document，`page_content=text` | 分块已按 section 语义切好（Bridge §4.2），**不再二次切分** |
| metadata | `{chunk_id, doc_id, section_title, page_idx(首块), fullmd_start}` | 回链 chunks.jsonl 拿 blocks 映射表 |
| Embeddings | `BAAI/bge-m3`（OpenAI 兼容 base_url，如硅基流动）| 中文财报文档友好；DeepSeek 不提供 embedding API，必须独立选型 |
| VectorStore | `InMemoryVectorStore` | MVP 数据量（单文档 2 chunk）；持久化阶段升级 LanceDB/Chroma |
| Retriever | `vectorstore.as_retriever(search_kwargs={"k": 4})` | 官方 agentic-rag 教程同款 |

启动时构建并 `lru_cache` 缓存（官方教程模式）；多文档场景按 doc_id 过滤
（`search_kwargs` 动态注入）留到 Phase 4。

### 2.2 知识图谱索引（结构通道）

| 项 | 决策 | 说明 |
|----|------|------|
| 图数据 | `kg_triples.jsonl` 全量载入 `networkx.MultiDiGraph` | MVP 零运维；Neo4j（`langchain-neo4j`）留待 Phase 4 |
| 节点 | `normalized_name`（entities.jsonl 主键，天然去重） | 节点属性保留 `{name, entity_type, mentions}` |
| 边 | `(head_nid, tail_nid, key=predicate)`，边属性携带 `triple_id` + evidence | 边上带溯源，图检索结果可直接产出引用 |
| 已知缺陷应对 | Bridge §7 的跨路径同义实体（"Total revenue" vs "Revenue"）暂不合并；`kg_entity_lookup` 对未命中返回近似候选，由 Agent 二次确认 | 不静默丢弃，与 Bridge 原则一致 |

### 2.3 溯源锚点（不改任何产物）

- 文本溯源：`chunks.jsonl.blocks[]` 映射表 + triple 的
  `char_interval_fullmd` → `full.md[start:end]` 原文切片（Bridge §4.3 数学契约）。
- 视觉溯源：triple 的 `page_idx` + `bbox_normalized`(0–1000) + `table_image`
  → PDF 页面截图/表格图定位（表格路径三元组）。
- `fullmd_start/fullmd_len` 为 null 的块：换算时跳过（Bridge §5.3）。

---

## 3. MCP 检索服务层

### 3.1 Server 定义（`rag_agent/mcp_server.py`）

用 `fastmcp` 实现 stdio server，名称 `graphrag-retrieval`。5 个工具：

| 工具 | 签名（要点） | 返回 | 对应通道 |
|------|-------------|------|---------|
| `vector_search_chunks` | `(query: str, k: int = 4)` | chunk 列表 `{chunk_id, section_title, text, score, page_idx}` | 语义 |
| `kg_entity_lookup` | `(name: str)` | 实体 `{normalized_name, entity_type, mentions}` + 近似候选 | 图·入口 |
| `kg_expand` | `(entity: str, hops: int = 1, predicate: str \| null = None)` | 邻接三元组 `{head, predicate, tail, triple_id}` | 图·扩展 |
| `fetch_evidence_text` | `(triple_id: str)` | `full.md[start:end]` 原文切片 + char_interval | 溯源·文本 |
| `fetch_evidence_visual` | `(triple_id: str)` | `page_idx` + `bbox_normalized` + `table_image` 路径 | 溯源·视觉 |

设计要点：
- 工具 docstring 即 Agent 的工具选择依据，须写明适用场景（如
  `kg_expand`："查找某实体的关联事实，适合数值对比/多实体关联问题"）。
- `fetch_evidence_*` 是**确定性工具**（零 LLM），保证引用可审计——Agent
  不得凭记忆复述原文，必须调工具取证据。
- server 进程内持有向量索引 + 内存图（懒加载，首次调用时从产物构建）。

### 3.2 Agent 侧接入（LangChain MCP 官方 API）

```python
# langchain[mcp]>=1.4.0；API 为 beta，升级需关注
from langchain.mcp import MCPAdapter

CONFIG = {
    "mcpServers": {
        "graphrag": {
            "command": "uv", "args": [
                "--project", "../langextract", "python", "mcp_server.py"],
        }
    }
}

async def build_agent():
    async with MCPAdapter(CONFIG) as adapter:
        tools = await adapter.list_tools()   # 工具名自动加前缀: graphrag_vector_search_chunks...
        # agent = graph.compile()  → tools 传入 LangGraph 节点 bind_tools
```

遵循官方连接生命周期模式：在 `async with` 内完成工具发现与 agent 构建，
工具持有 client，上下文退出后仍可调用；每次工具调用开一个会话（reentrant），
MVP 无须长连接池。注：若未来多 server（如叠加 web-search MCP），MCPConfig
聚合即可，工具名前缀天然隔离。

---

## 4. Agent 编排层（LangGraph）

### 4.1 图结构（官方 agentic-rag 模式 + 图扩展）

```
                    ┌──────────────────────────────┐
   user question ──►│ generate_query_or_respond    │──(无工具调用)──► END
                    │ (ChatDeepSeek + bind_tools)  │
                    └──────────┬───────────────────┘
                               │ tool_calls（agent 自主选择 1..n 个检索工具）
                               ▼
                    ┌──────────────────────────────┐
                    │  ToolNode（MCP 工具执行）     │◄──────────┐
                    └──────────┬───────────────────┘           │
                               ▼                               │
                    ┌──────────────────────────────┐           │
                    │ grade_context（≤2 次重试）    │── no ─────┘
                    │ structured output: yes/no    │
                    └──────────┬───────────────────┘
                               │ yes
                               ▼
                    ┌──────────────────────────────┐
                    │ generate_answer              │
                    │ structured output:           │
                    │ {answer, citations[]}        │
                    └──────────────────────────────┘
```

与官方教程的差异点：
1. **工具集是 5 个 MCP 工具**而非单一 retriever tool——Agent 可对同一问题
   组合"向量检索 + 图扩展 + 证据取回"，多跳问题（如"Q2 到 Q3 收入变化"）
   由 Agent 自主串联 `kg_entity_lookup → kg_expand`。
2. **grade_context 打分对象是"检索上下文整体"**（多篇 chunk + 三元组混合），
   no 分支走 `rewrite_question` 重写后重试，上限 2 轮防死循环。
3. **generate_answer 强制结构化输出**（`with_structured_output(AnswerWithCitations)`），
   citations 中每条引用必须来自本轮工具调用返回的 triple_id/chunk_id——
   未出现在检索结果中的引用在输出校验层剔除（防幻觉引用）。

### 4.2 状态与模型

```python
class AgentState(TypedDict):
    messages: Annotated[list, add_messages]   # 官方 MessagesState 模式
    retrieved_triples: list[str]              # 本轮命中的 triple_id（累积去重）
    retrieved_chunks: list[str]               # 本轮命中的 chunk_id
    rewrite_count: int                        # 重试计数
```

| 模型角色 | 接入 | 说明 |
|---------|------|------|
| 编排/回答（主模型） | `init_chat_model("deepseek:deepseek-chat")`（`langchain-deepseek`）| 支持工具调用 ✅ 结构化输出 ✅；与索引阶段同一供应商，配置复用 `.env` 的 `DEEPSEEK_API_KEY` |
| grade_context（打分） | 同上但 `temperature=0`、小 max_tokens | 打分是廉价二分类，官方教程用 mini 模型同理由 |
| Embeddings | OpenAI 兼容 + bge-m3（见 §2.1） | DeepSeek 无 embedding API |

注意：LangExtract 抽取用 `provider="openai"` + `base_url` 直连（LangExtract 侧
限制）；查询阶段走 `langchain-deepseek` 原生集成，工具调用支持更完整，
两者并存不冲突（详见 `langextract_pipeline_spec` §3 的 use_schema_constraints
教训——那是 LangExtract 库的 400 兼容性问题，LangGraph 侧无此约束）。

---

## 5. 应用层

### 5.1 CLI（`rag_agent/ask.py`）

`uv run --project ../langextract python ask.py "Q3 总收入是多少？环比呢？"`
→ 打印答案 + 引用表（triple_id、text_span、page_idx）。开发调试主入口。

### 5.2 webapp 集成（`webapp/app.py` 扩展）

- 新增 `POST /api/ask`：调用编译后的 LangGraph（`astream` 流式输出）。
- 新增引用渲染：citations 中的 `char_interval_fullmd` 驱动 full.md 原文高亮；
  `page_idx + bbox_normalized` 驱动 PDF 页面定位框（表格路径）。
- 索引任务完成（现有 JOBS 流程）后提示"可提问"——查询服务复用同一次
  Bridge 产物，索引与查询共用数据目录。

---

## 6. 目录结构与组件规则

新建组件 `rag_agent/`，沿用项目既有组件模式（**不建独立 venv**，复用
`langextract/.venv`，规范同 `graphrag_pipeline/CLAUDE.md` §8）：

```
rag_agent/
├── CLAUDE.md            # 组件规则（复用 langextract venv + uv add 装依赖）
├── mcp_server.py        # fastmcp stdio server（§3.1 五工具）
├── indexer.py           # 产物装载：chunks→向量索引、triples→networkx、溯源锚点
├── graph.py             # LangGraph 编排（§4 图结构、状态、条件边）
├── models.py            # init_chat_model 配置 + AnswerWithCitations 等 Pydantic schema
├── ask.py               # CLI 入口
└── output/              # （可选）问答 trace 落盘
```

新增依赖（在 `../langextract/` 下 `uv add`，禁止 pip install）：

```
langchain langgraph langchain-deepseek "langchain[mcp]" fastmcp networkx
+ embeddings 所需包（bge-m3 经 OpenAI 兼容 API 调用则复用 langchain-openai/openai）
```

---

## 7. 实施路线图（4 个 Phase，每 Phase 可独立验收）

| Phase | 内容 | 验收标准 |
|-------|------|---------|
| P0 产物装载 | `indexer.py`：加载 4 个 jsonl + full.md，构建 InMemoryVectorStore + MultiDiGraph；单测直查 | `kg_expand("total revenue")` 返回 t_000001/t_000002；`fetch_evidence_text("t_000001")` 还原 `"Total revenue in Q3 was 12.5 billion CNY"`（对照 Bridge check3 基准） |
| P1 MCP server | `mcp_server.py` 五工具 + `ask.py` 用 MCPAdapter 连接后直接调工具（无 agent） | MCP Inspector / 脚本冒烟：5 工具全部可达且返回符合 §3.1 契约 |
| P2 Agent 编排 | `graph.py` 全图 + structured output 回答 | 3 类问题全通：①事实型（向量通道）②数值对比型（图通道）③寒暄（不检索直答）；答案引用 100% 可通过 char_interval 复核 |
| P3 webapp 集成 | `/api/ask` 流式 + 引用高亮/PDF 定位 | 浏览器端问答，引用点击可跳转 full.md 高亮或表格图 |
| P4 生产化（后续） | 持久向量库（LanceDB）、Neo4j 图库、跨路径实体合并、多文档过滤、LangSmith tracing | 视需求另立规范 |

---

## 8. 已知风险与对策

1. **MCPAdapter beta**：`langchain.mcp` 命名空间为 beta（要求 `langchain[mcp]>=1.4.0`），
   API 可能变动；`langchain-mcp-adapters` 的 `MultiServerMCPClient` 为兼容回退，
   迁移成本小（接口一一对应，见官方 migrate 文档）。
2. **DeepSeek 工具调用质量**：抽取阶段已见实体类型噪声（Bridge §7）；MVP 用
   grade_context 重试循环 + 引用校验兜底，工具 docstring 尽量具体。
3. **单文档记忆膨胀**：多文档后 InMemoryVectorStore 全库检索会跨文档串扰，
   `doc_id` 过滤参数预留于工具签名（P4 实现）。
4. **Embedding 供应商**：bge-m3 需要额外 API（硅基流动等）或本地推理；P0 先用
   OpenAI 兼容远端，若离线需求出现再换 sentence-transformers 本地加载。

---

## 附：与官方文档的对应关系

| 本方案组件 | 官方文档页 |
|-----------|-----------|
| Agent 图结构与 grade/rewrite 循环 | `oss/python/langgraph/agentic-rag` |
| 检索器工具（@tool + as_retriever） | 同上（Create a retriever tool 节） |
| MCPAdapter / MCPConfig / 生命周期 | `oss/python/langchain/mcp`（index + connections） |
| ChatDeepSeek（工具调用✅/结构化输出✅） | `oss/python/integrations/chat`（集成矩阵） |
| InMemoryVectorStore | `oss/python/langgraph/agentic-rag`（示例代码） |
