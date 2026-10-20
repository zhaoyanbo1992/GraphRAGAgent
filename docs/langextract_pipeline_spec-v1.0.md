# LangExtract 抽取规范文档 v1.0（基于实测校准）

> 版本：v1.0（2026-10-14）
> 本文档是 `langextract_pipeline_spec.md`（v0，源码静态分析版）的实测校准版：
> LangExtract MVP Pipeline 已本地真实执行成功（2026-10-14，DeepSeek `deepseek-flash`
> 后端，输入为 MinerU 解析产物 `full.md`），全部输出规范以**本地实测产物为准**，
> 与 v0 规范冲突之处在 §5 中逐条列出。

---

## 1. 完整 Pipeline 执行思路 + 测试脚本位置

### 1.1 执行思路（已验证的 6 步流程）

```
┌───────────────────────────────────────────────────────────────────────────┐
│ 步骤 0  配置加载   读取 langextract_mvp/.env（API Key/端点/模型名/输入输出路径）│
│ 步骤 0  输入读取   读取 MinerU 产物 full.md（缺失时回退内置 mock 文本）        │
├───────────────────────────────────────────────────────────────────────────┤
│ 步骤 1  任务定义   prompt_description（抽取指令）+ few-shot ExampleData       │
│                    （extraction_text 必须是示例 text 的原文子串，对齐校验）    │
├───────────────────────────────────────────────────────────────────────────┤
│ 步骤 2  模型接入   ModelConfig(provider="openai", base_url=DeepSeek 兼容端点) │
│                    use_schema_constraints=False → 降级 JSON mode             │
├───────────────────────────────────────────────────────────────────────────┤
│ 步骤 3  抽取执行   lx.extract(): 正则分词分块(max_char_buffer=1000) →         │
│                    组装 prompt → LLM 推理(deepseek-flash) → 解析 JSON 输出   │
├───────────────────────────────────────────────────────────────────────────┤
│ 步骤 4  字符对齐   每条抽取结果回溯定位到原文 char_interval（左闭右开）+       │
│                    alignment_status 标注（match_exact/match_fuzzy/None）     │
├───────────────────────────────────────────────────────────────────────────┤
│ 步骤 5  落盘输出   过滤 char_interval=None 的未定位项 →                       │
│                    lx.io.save_annotated_documents() 输出 JSONL               │
└───────────────────────────────────────────────────────────────────────────┘
```

### 1.2 测试脚本位置

| 文件 | 职责 |
|------|------|
| `langextract_mvp/langextract_pipeline.py` | 主 Pipeline：`load_env → read_input_text → lx.extract → 溯源过滤 → save_annotated_documents → 结果打印`，与上述步骤一一对应 |
| `langextract_mvp/.env` | 全部外部配置（API Key、端点、模型名、输入输出路径） |
| `langextract_mvp/.gitignore` | 排除 `.env`（密钥）与 `output/`（产物） |
| `langextract_mvp/output/extraction_results.jsonl` | 实测输出产物（见 §4） |
| `langextract/` | LangExtract v1.7.1 源码克隆 + 组件 uv 虚拟环境（`.venv/`） |
| `langextract/CLAUDE.md` | 组件级 Agent 规则：**LangExtract 组件运行前必须进入子虚拟环境** |
| `mineru_mvp/output/sample_report/full.md` | 上游输入（MinerU 解析产物，本次实测的实际输入源） |

**运行方式**（组件虚拟环境隔离，见 §6 与 `langextract/CLAUDE.md`）：

```bash
cd langextract
uv run --project . python ../langextract_mvp/langextract_pipeline.py
```

### 1.3 实测运行记录（2026-10-14）

```
[input] MinerU full.md: 679 chars from mineru_mvp/output/sample_report/full.md
[extract] 13 extractions, 13 grounded        ← char_interval 全部非空
[output] JSONL saved: langextract_mvp/output/extraction_results.jsonl
[output] first JSONL line keys: ['extractions', 'text', 'document_id']
```

实测抽取结果明细（全部 `financial_metric` 类）：

| 来源 | 条数 | 示例（原文 → attributes） |
|------|:----:|--------------------------|
| 正文叙事段落 | 4 | `Total revenue in Q3 was 12.5 billion CNY` → `{revenue, 12.5, billion CNY, Q3}`；`up 18.2%`；`Gross margin reached 41.6%`；`operating expenses were 4.8 billion` |
| HTML 表格单元格 | 9 | `<td>8.3</td>` → `{revenue, 8.3, billion CNY, Q1}` 等（Q1–Q3 三季 × revenue/net_profit/margin） |

**对齐质量**：13 条全部 `alignment_status = "match_exact"`，0 条 `char_interval = None`。

---

## 2. LangExtract Pipeline 关键参数规范

### 2.1 本地环境配置（`.env`，Pipeline 运行必需）

| 参数 | 实测值 | 必需 | 说明 |
|------|--------|:----:|------|
| `OPENAI_API_KEY` | （已配置） | ✅ | DeepSeek API Key（OpenAI 兼容鉴权） |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com/v1` | ✅ | OpenAI 兼容端点 |
| `DEEPSEEK_MODEL` | `deepseek-flash` | ✅ | 实测可用：`deepseek-flash`（V4.1-Flash）/ `deepseek-v4-pro` |
| `INPUT_TEXT` | `../mineru_mvp/output/sample_report/full.md` | ✅ | 输入纯文本（MinerU 产物） |
| `OUTPUT_DIR` | `output` | ✅ | JSONL 输出目录 |

### 2.2 `lx.extract()` 调用参数（实测生效组合）

| 参数 | 实测值 | 必需 | 说明 |
|------|--------|:----:|------|
| `text_or_documents` | full.md 文本字符串 | ✅ | 纯文本输入（规范 v0 §1.2 类型 1） |
| `prompt_description` | 财务指标抽取指令 | ✅ | 自然语言抽取任务定义 |
| `examples` | 1 个 `ExampleData`（3 条 Extraction） | ✅ | few-shot 示例；**`extraction_text` 必须是示例 text 的逐字子串**，否则对齐校验告警 |
| `temperature` | `0.0` | 建议 | 抽取任务需确定性输出 |
| `use_schema_constraints` | **`False`** | ✅（DeepSeek 场景） | **实测必须关闭**：LangExtract 默认向 OpenAI 兼容端点发送 structured-outputs 的 `json_schema` response_format，DeepSeek 返回 400；关闭后降级为 `json_object` 模式（`providers/openai.py:226-227`） |
| `config` | `ModelConfig(...)` | ✅ | 见 §2.3 |

### 2.3 模型接入参数（`ModelConfig`，DeepSeek 强制显式指定）

```python
config=ModelConfig(
    model_id="deepseek-flash",        # 不匹配 ^gpt 前缀路由 → 必须显式 provider
    provider="openai",
    provider_kwargs={
        "api_key": "<OPENAI_API_KEY>",
        "base_url": "https://api.deepseek.com/v1",
    },
)
```

| 参数 | 必需 | 说明 |
|------|:----:|------|
| `model_id` | ✅ | DeepSeek 模型名；**不匹配任何内置 provider 前缀正则（v0 §2.2），必须用 config 显式指定** |
| `provider` | ✅ | 固定 `"openai"`（走 OpenAI 兼容协议） |
| `provider_kwargs.api_key` | ✅ | 也可用环境变量 `OPENAI_API_KEY`（`os.environ.setdefault` 注入） |
| `provider_kwargs.base_url` | ✅ | DeepSeek 兼容端点；自建 vLLM 同样走此参数 |

### 2.4 行为约束

| 约束项 | 说明 |
|--------|------|
| 对齐校验 | `prompt_validation_level=WARNING`（默认）：few-shot 的 `extraction_text` 与示例 text 不逐字一致时告警；可设 `ERROR` 强制失败 |
| 分块 | 输入按 `max_char_buffer=1000`（默认）分块；679 字符实测单块，1 次 API 调用 |
| 解析容错 | `suppress_parse_errors=True`（默认）：单块解析失败丢弃并告警，不中断整个文档 |
| 溯源过滤 | `char_interval is None` 表示未对齐（疑似幻觉），生产管道必须过滤 |

---

## 3. DeepSeek 接入兼容性问题（实测解决记录）

| # | 现象 | 根因 | 解决方案（实测验证） |
|---|------|------|---------------------|
| 1 | 首次运行返回 `400 - This response_format type is unavailable now` | LangExtract OpenAI provider 默认启用 schema 约束，发送 structured-outputs 的 `response_format: {type: json_schema}`；DeepSeek 仅支持 `json_object` | `lx.extract(use_schema_constraints=False)`，provider 自动降级为 `response_format: {type: json_object}`（`openai.py:226-227`），few-shot 示例仍在 prompt 中引导输出结构 |

> **接入守则**：任何 OpenAI 兼容端点（DeepSeek/通义/Kimi/vLLM 自建）接入时，
> 先按默认配置尝试；若报 response_format 400 类错误，统一加
> `use_schema_constraints=False`。此经验适用于所有非 OpenAI 官方端点。

---

## 4. 本地实际生成的关键文件（实测为准）

### 4.1 实测产物清单

`langextract_mvp/output/` 下实测生成 **1 个文件**：

| 文件 | 类型 | 大小 | 内容 |
|------|------|------|------|
| `extraction_results.jsonl` | JSONL（每行一个文档） | 4999 B | 1 行 = 1 个 `AnnotatedDocument` 序列化结果 |

> LangExtract 不生成其他文件类型。HTML 可视化（`lx.visualize`）为可选步骤，
> 本次 MVP 未执行；除 JSONL 与内存对象外无任何其他输出形态（无数据库/向量库写入）。

### 4.2 JSONL 实测结构（逐字段实测确认）

**文档层（实测 3 个键，`['extractions', 'text', 'document_id']`）**：

| 字段 | 实测值 | 说明 |
|------|--------|------|
| `document_id` | `"doc_acf85660"` | 未显式传入时自动生成：`doc_` + uuid4.hex 前 8 位 |
| `text` | 679 字符 | 输入原文全文（char_interval 的坐标系基准） |
| `extractions` | 13 个对象 | 抽取结果数组 |

**抽取层（实测 8 个键）**：

```json
{
  "extraction_class": "financial_metric",
  "extraction_text": "Total revenue in Q3 was 12.5 billion CNY",
  "char_interval": {"start_pos": 231, "end_pos": 271},
  "alignment_status": "match_exact",
  "extraction_index": 1,
  "group_index": 0,
  "description": null,
  "attributes": {"metric": "revenue", "value": "12.5", "unit": "billion CNY", "period": "Q3"}
}
```

| 字段 | 实测类型 | 说明 |
|------|---------|------|
| `extraction_class` | str | 抽取类别（由 few-shot 示例定义） |
| `extraction_text` | str | 原文片段（verbatim） |
| `char_interval` | `{start_pos, end_pos}` 或 null | 字符级定位，**左闭右开**；实测 13/13 非空 |
| `alignment_status` | str 或 null | 实测全部 `"match_exact"` |
| `extraction_index` | int | **实测从 1 开始编号**（1–13） |
| `group_index` | int | 实测全部 0（单 pass 场景） |
| `description` | null | 未使用时序列化为 null |
| `attributes` | dict[str, str] | few-shot 定义的属性 KV |

---

## 5. 本地实测 vs v0 规范冲突清单（均以实测为准）

| # | 冲突点 | v0 规范描述（静态源码分析） | 本地实测结果 | 采用 |
|---|--------|---------------------------|-------------|:----:|
| 1 | JSONL 是否含 `token_interval` | §3.2 称「token 级定位……JSONL 序列化时包含」 | **实测 JSONL 中无 `token_interval` 键**（私有字段 `_token_interval` 被 `data_lib` 的下划线跳过规则过滤） | 实测 |
| 2 | `extraction_index` 起始编号 | 未明确（隐含从 0 开始） | **实测从 1 开始**（1–13） | 实测 |
| 3 | OpenAI 兼容端点可用性 | §2.3 称方式二为标准接入方式（正确），但未提示 response_format 兼容性问题 | **DeepSeek 必须 `use_schema_constraints=False`**，否则 400（见 §3） | 实测 |
| 4 | 表格内容的抽取形态 | 未描述 | 模型将 full.md 内嵌 HTML 表格的单元格以 `<td>8.3</td>` 形式 verbatim 抽取（定位正确）；**表格数值的可靠来源仍是 `table_body` 结构化解析**，LangExtract 定位为正文实体/关系抽取 | 实测 |

> **下游开发守则**：消费 JSONL 时不要假设存在 `token_interval` 字段；
> `extraction_index` 不作为排序依据（阅读顺序以数组顺序 + char_interval 为准）。

---

## 6. 虚拟环境切换说明（环境隔离规范）

LangExtract 组件使用 **uv 管理的独立虚拟环境**（`langextract/.venv/`，含
openai + test extras），与 MinerU 组件（`mineru_mvp/.venv`）完全隔离。
组件级规则同步写入 `langextract/CLAUDE.md`，由 Claude Code 自动加载执行。

**启动 Pipeline 前必须完成环境切换：**

```bash
# 方式一（推荐）：uv run --project —— 无须手动激活，跨目录调用组件环境
cd langextract
uv run --project . python ../langextract_mvp/langextract_pipeline.py

# 方式二：手动激活子虚拟环境
source langextract/.venv/bin/activate
python ../langextract_mvp/langextract_pipeline.py
deactivate
```

**环境管理：**

| 操作 | 命令 |
|------|------|
| 首次克隆 / 环境重建 | `uv sync --extra openai --extra test` |
| 新增依赖 | `uv add <package>` 或 `uv sync --extra <extra>` |
| 环境损坏 | `rm -rf .venv && uv sync --extra openai --extra test` |

**禁止事项**：禁止系统 `python3` 直跑组件脚本；禁止绕过锁文件直接 `pip install`。

**实测验证**（2026-10-14）：`uv run --project .` 确认解释器为
`langextract/.venv/bin/python`；离线单元测试 51 用例通过；MVP Pipeline 在该环境下
调用 DeepSeek 真实 API 成功产出 JSONL。

---

## 附：本文档信息来源

- 本地实测：`langextract_mvp/` MVP Pipeline 真实运行（2026-10-14，DeepSeek
  `deepseek-flash`，输入 MinerU `full.md`，输出 `extraction_results.jsonl`）
- 静态源码分析（v0 规范，仍有效的部分）：`docs/langextract_pipeline_spec.md`
- 组件环境规则：`langextract/CLAUDE.md`
- 冲突裁决规则：§5 表格，以本地实测产物数量、类型、字段为准
