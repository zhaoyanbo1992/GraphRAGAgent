# Bridge Pipeline 规范文档 v1.0（GraphRAG 索引阶段，基于实测校准）

> 版本：v1.0（2026-10-14）
> Bridge Pipeline 是多模态 RAG 问答系统的 **GraphRAG 索引阶段核心流程**：
> 将 MinerU 文档解析产物对接到 LangExtract 抽取引擎，最终产出知识图谱三元组。
> 本文档基于 `graphrag_pipeline/` 组件的真实执行结果（2026-10-14）编写，
> 全部接口与输出规范以**本地实测产物为准**。
> 上游规范：`mineru_pipeline_spec-v1.0.md`、`langextract_pipeline_spec-v1.0.md`。

---

## 1. Bridge Pipeline 完整执行思路 + 测试脚本位置

### 1.1 执行思路（已验证的 3 阶段 9 步流程）

```
mineru_mvp/output/<doc>/                 graphrag_pipeline/                        output/
────────────────────────                ─────────────────────────────────         ─────────────────
                                        ┌─ 步骤0 配置加载(.env) + 产物定位(glob)
full.md ──────────────► 步骤1 ─────────►│ 阶段1 chunker.py:
*_content_list.json ──► 步骤2 ─────────►│   块边界语义分块(text_level 开新 section)
                                        │   表格块剥离 → 并行路径
                                        │   逐块计算 full.md 偏移映射表
                                        │   → chunks.jsonl
                                        ├─ 步骤3 阶段2 extraction.py:
                                        │   Document 迭代器(text=chunk文本,
                                        │   document_id=chunk_id,
                                        │   additional_context=section标题)
                                        │   → DeepSeek 抽取(实测参数 §4.2)
                                        │   → extraction_results.jsonl
                                        ├─ 步骤4 阶段3 kg_builder.py 叙事路径:
                                        │   过滤 char_interval=None →
                                        │   entity 注册表 + relation→三元组
                                        ├─ 步骤5 阶段3 kg_builder.py 表格路径:
table_body (content_list) ──► 步骤5 ───►│   HTML 解析(零 LLM) → 数值三元组
                                        ├─ 步骤6 双溯源拼接:
full.md 偏移 ◄────────── 步骤6 ────────►│   chunk内char_interval --块映射表--> full.md全文偏移
                                        │   + page_idx/bbox(0-1000) → PDF页面定位
                                        ├─ 步骤7 → entities.jsonl + kg_triples.jsonl
                                        └─ 步骤8 验收自检(§7 三项 PASS 断言)
```

**核心设计原则：**
1. **双路径抽取**：叙事文本走 LLM（LangExtract + DeepSeek）；表格数值走
   `table_body` HTML 解析（零 LLM 成本，规避模型抽取 HTML 标签的不可靠性）。
2. **双溯源指针**：每条三元组同时携带 `char_interval_fullmd`（相对 full.md，服务
   文本溯源）与 `page_idx + bbox_normalized`（相对 PDF 页面，服务视觉回溯）。
3. **full.md 不可改写**：它是全链路唯一文本坐标系基准（MinerU 规范 §5-1）。
4. **中间产物可复用**：阶段 1/2 的输出落盘，阶段 3 调试无须重复消耗 API 配额。

### 1.2 测试脚本位置

| 文件 | 职责 |
|------|------|
| `graphrag_pipeline/kg_pipeline.py` | 主入口：三阶段串联 + 验收自检（步骤 0→8） |
| `graphrag_pipeline/chunker.py` | 阶段 1：`find_artifact`（UUID 前缀产物定位）+ `build_chunks`（分块与偏移映射）+ `save_chunks` |
| `graphrag_pipeline/extraction.py` | 阶段 2：`run_extraction`（Document 迭代器批量抽取，DeepSeek 接入） |
| `graphrag_pipeline/kg_builder.py` | 阶段 3：`build_kg`（叙事/表格双路径 + 溯源拼接）+ `parse_flat_table` + `normalize` |
| `graphrag_pipeline/.env` | 全部配置（DeepSeek Key、MinerU 产物路径、分块参数） |
| `graphrag_pipeline/CLAUDE.md` | 组件级 Agent 规则（虚拟环境切换，见 §8） |
| `graphrag_pipeline/output/*.jsonl` | 实测产物（见 §6） |

**运行方式**（复用 LangExtract 组件虚拟环境）：

```bash
cd graphrag_pipeline
uv run --project ../langextract python kg_pipeline.py
```

### 1.3 实测运行记录（2026-10-14，输入 MinerU 2 页样例报告）

```
[input]  full.md (679 chars) + d552338a..._content_list.json
[stage1] 2 chunks (366 + 37 chars)
[stage2] 2 documents -> extraction_results.jsonl（1 次 LLM 调用）
[stage3] 13 triples, 11 entities
=== acceptance checks ===
check1 chunks >= 2: PASS (2)
check2 dual paths: narrative=4, table=9
check3 provenance restoration: 4/4 exact matches (PASS)
```

---

## 2. 实际本地生成的文档（以实测为准）

Bridge Pipeline 实际产出 **4 个文件**（`graphrag_pipeline/output/`）：

| 文件 | 行数 | 角色 |
|------|:----:|------|
| `chunks.jsonl` | 2 | 阶段 1 中间产物（可审计、可复用） |
| `extraction_results.jsonl` | 2 | 阶段 2 中间产物（LangExtract 原生 JSONL 格式，字段规范见 LangExtract 规范 v1.0 §4.2） |
| `entities.jsonl` | 11 | 实体注册表（实体归一化与 mentions 计数） |
| `kg_triples.jsonl` | 13 | **最终交付物**：KG 三元组（下游图数据库导入格式，见 §6） |

实测实体类型分布（11 实体）：`metric`×4（Total revenue/Gross margin/operating
expenses/Quarterly Results）、`period`×3（Q1/Q2/Q3）、`currency_value`×2、
`percentage`×2。

---

## 3. MinerU / LangExtract 各自的关键参数规范（Bridge 视角）

### 3.1 MinerU 侧（Bridge 只读其产物，不调用解析 API）

| Bridge 消费的产物 | 消费字段 | 用途 |
|------------------|---------|------|
| `full.md` | 全文 | chunk 文本基准 + char 坐标系 |
| `*_content_list.json` | `type` / `text` / `text_level` / `page_idx` / `bbox`(0–1000) / `table_body` / `img_path` | 分块锚点 / section 划分 / 溯源 / 表格路径 |
| `layout.json` | （本阶段未消费） | span 级点坐标留待视觉回溯阶段 |
| `images/` | （本阶段未消费） | 多模态扩展预留 |

产物定位约束：MinerU 产物文件名带服务端 UUID 前缀（MinerU 规范 §3.1），
Bridge 用 glob 模式（`*_content_list.json`）定位，禁止硬编码文件名。

### 3.2 LangExtract 侧（抽取调用参数，全部实测验证）

| 参数 | 实测值 | 说明 |
|------|--------|------|
| `text_or_documents` | `list[lx.data.Document]` | 批量入口；`document_id=chunk_id` 保证结果可回链 |
| `prompt_description` | 实体+关系混合抽取指令 | 单 pass 同时产出 entity 与 relation |
| `examples` | 1 个 ExampleData / 6 条 Extraction | few-shot 硬约束：`extraction_text` 必须是示例 text 的逐字子串 |
| `temperature` | `0.0` | 抽取任务确定性输出 |
| `use_schema_constraints` | **`False`** | DeepSeek 必须关闭（400 兼容性问题，LangExtract 规范 v1.0 §3） |
| `config` | `ModelConfig(model_id, provider="openai", provider_kwargs={api_key, base_url})` | 非 GPT 命名模型的强制接入方式 |

**few-shot 的 extraction_class 体系（KG 导向设计）：**

| class | extraction_text | attributes（承载图结构） |
|-------|----------------|------------------------|
| `entity` | 实体名原文片段 | `entity_type`（company/metric/period/percentage/currency_value）、`normalized_name` |
| `relation` | 关系证据短语原文 | `head`、`predicate`、`tail`（须与同文本 entity 对应）、`value`/`unit`/`period`（可选） |

---

## 4. MinerU ↔ LangExtract 接口对接规范（Bridge 核心）

### 4.1 接口契约总表

```
MinerU 产物                     Bridge 转换层                     LangExtract 输入
────────────                   ────────────                     ────────────────
full.md(全文)            ──►   chunk.text（不改写）        ──►   Document.text
{doc目录名}              ──►   doc_id = 目录名             ──►   (document_id 前缀)
content_list.text_level  ──►   section 划分                ──►   Document.additional_context
                               ("Document section: {标题}")       (辅助指代消解)
chunk_id(自生成)         ──►   "{doc_id}_chunk_{seq:03d}"  ──►   Document.document_id
content_list.table_body  ──►   表格并行路径(绕开 LLM)       ──►   （不进入 Document.text）
```

### 4.2 分块规则（对接的正确性前提）

1. 只消费 `type == "text"` 的块；`text_level` 存在 → 开新 section（标题文本作为
   section 首块进入 chunk）。
2. chunk 文本 = 块文本按序以 `"\n\n"` 连接；**连接符计入偏移**（2 字符）。
3. 单 chunk 上限 `MAX_CHUNK_CHARS=900`（对齐 LangExtract `max_char_buffer=1000`
   减 prompt 余量）；超长按块边界切分，section 标题通过 `additional_context`
   传递给所有分片。
4. **逐块偏移映射表**（chunks.jsonl 的 `blocks` 数组）是 char 坐标换算的依据：
   `chunk_start/chunk_len`（chunk 内）+ `fullmd_start/fullmd_len`（full.md 内，
   通过前向 `str.find` 顺序定位）。

### 4.3 溯源坐标换算规范（接口的数学契约）

LangExtract 输出的 `char_interval` 相对 **chunk 文本**；Bridge 换算到 full.md：

```
对 chunk 内区间 [s, e)，在 blocks 映射表中定位包含 s 的块:
  fullmd_start_pos = block.fullmd_start + (s - block.chunk_start)
  fullmd_end_pos   = block.fullmd_start + (min(e, block.chunk_start+block.chunk_len) - block.chunk_start)
```

实测验证：4/4 叙事三元组换算后 `full.md[start:end] == text_span` 精确还原
（ acceptance check3 PASS）。

### 4.4 表格旁路规范

`type == "table"` 的块**不进入任何 Document**，走独立路径：
`table_body`（HTML）→ 轻量 HTMLParser 解析行/列 → 表头列名生成谓词
（`has_revenue` 等 snake_case）→ 行首列（如 Q1）作为 head 实体 → 每个数值单元格
一条三元组。单位声明从阅读顺序中最近的 `(Unit: X)` 文本继承，**纯数字值才附加
单位**（百分比列豁免，实测修正项）。

---

## 5. Bridge Pipeline 最终输出关键参数规范

### 5.1 `kg_triples.jsonl`（最终交付物，实测 5 键）

```json
{
  "triple_id": "t_000001",
  "head": {"name": "Total revenue", "type": "metric", "normalized_name": "total revenue"},
  "predicate": "has_value",
  "tail": {"name": "12.5 billion CNY", "type": "currency_value",
           "normalized_name": "12.5 billion cny",
           "attributes": {"value": "12.5 billion CNY", "period": "Q3"}},
  "evidence": {
    "text_span": "Total revenue in Q3 was 12.5 billion CNY",
    "source": "full.md",
    "chunk_id": "sample_report_chunk_001",
    "char_interval_chunk": {"start_pos": 228, "end_pos": 268},
    "char_interval_fullmd": {"start_pos": 231, "end_pos": 271},
    "page_idx": 0
  },
  "provenance": {"path": "narrative"}
}
```

| 字段 | 实测类型 | 说明 |
|------|---------|------|
| `triple_id` | str | `t_{6位序号}`，全局唯一 |
| `head` / `tail` | object | `{name(原文), type, normalized_name(小写规则归一化)}`；`tail.attributes` 携带 value/period 等量化属性 |
| `predicate` | str | snake_case 关系谓词（`has_value`/`grew_by`/`has_revenue`…） |
| `evidence.source` | str | `"full.md"`（叙事）/ `"table_body"`（表格） |
| `evidence.char_interval_chunk` | object/null | chunk 内字符区间（仅叙事路径） |
| `evidence.char_interval_fullmd` | object/null | full.md 全文字符区间（仅叙事路径；表格路径为 null） |
| `evidence.page_idx` | int | 0-based 源页码（双路径均有） |
| `evidence.bbox_normalized` | list/null | 0–1000 归一化坐标（仅表格路径，来自 content_list 块） |
| `evidence.table_image` | str/null | 表格截图相对路径（仅表格路径） |
| `provenance.path` | str | `"narrative"` / `"table"`，区分抽取来源 |

**实测差异提示**：两条路径的 evidence 键集不同（叙事有 char_interval 双区间、
表格有 bbox/table_image）——下游消费时按 `provenance.path` 判别，不要假设键集一致。

### 5.2 `entities.jsonl`（实体注册表，实测 4 键）

```json
{"name": "Total revenue", "entity_type": "metric", "normalized_name": "total revenue", "mentions": 1}
```

| 字段 | 说明 |
|------|------|
| `normalized_name` | 主键：MVP 规则归一化（小写 + 剥离 Corp/Inc/Ltd 等后缀）；跨 chunk 同名实体自动合并 |
| `mentions` | 出现次数（跨 chunk 计数，MVP 版本） |

### 5.3 中间产物 `chunks.jsonl`（实测 5 键）

`{chunk_id, doc_id, section_title, text, blocks[]}`；`blocks[]` 元素含
`{chunk_start, chunk_len, fullmd_start, fullmd_len, page_idx, bbox, block_type}`。
full.md 中定位失败的块 `fullmd_start/fullmd_len` 为 null（下游换算时须跳过）。

---

## 6. 验收标准（已固化为 kg_pipeline.py 自检）

| 检查项 | 断言 | 实测 |
|--------|------|:----:|
| check1 分块 | chunks ≥ 2（多 section 文档） | ✅ PASS (2) |
| check2 双路径 | narrative 与 table 三元组均 > 0 且按 path 正确区分 | ✅ PASS (4/9) |
| check3 溯源还原 | `full.md[char_interval_fullmd] == text_span` 逐条精确匹配 | ✅ PASS (4/4) |

## 7. 已知局限与实测记录

1. 实体消歧未做：标题 "Quarterly Results" 被抽为 metric 实体（LLM 噪声，MVP 接受）；
   跨路径同义实体（叙事 "Total revenue" vs 表格列 "Revenue"）未合并。
2. 关系 head/tail 为模型推断值（非 verbatim），可能存在改写；`normalized_name`
   匹配兜底，未匹配项按原样输出（不静默丢弃）。
3. 少量属性缺失（如 Gross margin 未推断 period）。

## 8. 虚拟环境切换说明

Bridge Pipeline 组件**不建独立 venv**，复用 `langextract/.venv`（依赖声明与锁定
归 LangExtract 组件管理）。组件级规则见 `graphrag_pipeline/CLAUDE.md`，核心命令：

```bash
cd graphrag_pipeline
uv run --project ../langextract python kg_pipeline.py
```

禁止事项：系统 python3 / MinerU 的 `.venv` 直跑；在组件内 `pip install`（新依赖
须经 `../langextract` 下 `uv add`）。

---

## 附：信息来源

- 实测：`graphrag_pipeline/` 真实运行（2026-10-14）及 `output/` 四个产物逐字段核查
- 上游规范：`docs/mineru_pipeline_spec-v1.0.md`、`docs/langextract_pipeline_spec-v1.0.md`
- 组件环境规则：`graphrag_pipeline/CLAUDE.md`
