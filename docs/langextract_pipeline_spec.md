# LangExtract Pipeline 数据规范文档

> 基于 LangExtract v1.7.1 源码（commit `f6dc772`）分析整理。
> 本文档面向将 LangExtract 用作多模态 RAG 问答系统**数据抽取后端**的集成场景，
> 明确其 Pipeline 的**输入规范、模型接入规范、输出数据格式规范**。

---

## 1. 输入规范（Pipeline 输入侧）

### 1.1 Pipeline 总入口

LangExtract 的统一入口是 `langextract/extraction.py` 中的 `extract()` 函数：

```python
def extract(
    text_or_documents: str | Iterable[data.Document],   # 唯一的数据入口
    prompt_description: str | None = None,              # 抽取任务指令（必填，除非提供 output_schema）
    examples: Sequence[ExampleData] | None = None,      # few-shot 示例（必填，除非提供 output_schema）
    ...
) -> list[data.AnnotatedDocument] | data.AnnotatedDocument
```

**核心约束：Pipeline 只接受"纯文本"数据。** 所有输入类型最终都会被归一化为
`core/data.py` 中的 `Document(text: str)` 对象，不存在图像、表格、二进制文档的处理通道。

### 1.2 支持的输入类型

| # | 输入类型 | 传入形式 | 处理逻辑（源码位置） | 约束说明 |
|---|---------|---------|---------------------|---------|
| 1 | **纯文本字符串** | `extract(text_or_documents="...")` | 直接包装为单个 `Document`（`extraction.py:395-410`） | 任意 UTF-8 文本；返回值为单个 `AnnotatedDocument` |
| 2 | **文本 URL 字符串** | `extract(text_or_documents="https://...", fetch_urls=True)` | `io.download_text_from_url()`（`extraction.py:258-263`） | ⚠️ 默认 `fetch_urls=False`，字符串会被当作**字面文本**而非 URL；显式开启后仅支持 text/json/xml 类 Content-Type（`io.py:293-299`），按 `utf-8/latin-1/ascii/utf-16` 依次尝试解码（`io.py:330-340`），**解码失败抛 `ValueError`**；存在 SSRF 风险，仅限可信 URL |
| 3 | **Document 对象迭代器** | `extract(text_or_documents=[lx.data.Document(text=..., document_id=..., additional_context=...), ...])` | 逐个交给 `annotator.annotate_documents()`（`extraction.py:411-434`） | 返回 `list[AnnotatedDocument]`；**批量处理场景的推荐入口** |
| 4 | **CSV 文件** | 通过 `lx.io.Dataset(input_path=..., id_key=..., text_key=...)` 先 `.load()` 得到 `Document` 迭代器 | `io.py:42-82`，pandas 读取 | 仅支持 `.csv` 后缀，其余文件类型**显式抛 `NotImplementedError`**；CSV 必须包含 `text_key` 列（正文）与 `id_key` 列（文档 ID） |

### 1.3 明确不支持的输入类型

以下类型**没有解析通道**，必须在调用 LangExtract 之前由上游完成转换：

- ❌ **PDF**（无 pypdf / pdfplumber 等依赖）
- ❌ **DOCX**（无 python-docx / mammoth 等依赖）
- ❌ 图像 / 音频 / 视频等多模态文件（Pipeline 内无任何 multimodal 代码路径）
- ❌ HTML / Excel 等其他文件格式（`Dataset.load()` 中非 `.csv` 一律抛错）
- ❌ 文件路径字符串（直接传入 `"/path/to/file.pdf"` 会被当作**字面文本**处理）

### 1.4 `Document` 对象字段规范

```python
lx.data.Document(
    text: str,                       # 必填，文档正文纯文本
    document_id: str | None,         # 可选，不传时自动生成 "doc_{uuid4前8位}"
    additional_context: str | None,  # 可选，注入 prompt 的补充上下文
)
```

### 1.5 抽取任务定义规范（与数据配套的 prompt 侧输入）

数据之外，Pipeline 还要求任务定义输入，二者缺一不可：

1. **`prompt_description: str`** — 自然语言抽取指令。
2. **`examples: Sequence[ExampleData]`** — few-shot 示例，**与 `output_schema` 二选一必填**
   （`extraction.py:210-215`：两者皆缺抛 `ValueError`）：

   ```python
   lx.data.ExampleData(
       text="...",                          # 示例原文
       extractions=[
           lx.data.Extraction(
               extraction_class="character",          # 抽取类别名
               extraction_text="ROMEO",               # 必须是 text 的原文子串（不可改写）
               attributes={"emotional_state": "wonder"},  # 属性 dict[str, str | list[str]]
           ),
       ],
   )
   ```

   对齐校验（`prompt_validation.py`）要求 `extraction_text` 与示例 `text` 逐字一致，
   默认 `prompt_validation_level=WARNING`，可设为 `ERROR` 强制失败。
3. **`output_schema: JsonSchema`（可选）** — 显式 JSON Schema 约束，替代 example 推导的
   schema；仅 Gemini / OpenAI 支持，与 `fence_output=True` 互斥（`extraction.py:219-220`）。

### 1.6 长文档处理参数规范

Pipeline 内置基于 token 的分块（`chunking.py`，正则分词器），相关参数：

| 参数 | 默认值 | 说明 |
|------|-------|------|
| `max_char_buffer` | 1000 | 每个 chunk 的最大字符数，越小精度越高但 API 调用越多 |
| `batch_length` | 10 | 每批处理的 chunk 数 |
| `max_workers` | 10 | 并行 worker 数，有效并发 = `min(batch_length, max_workers)` |
| `extraction_passes` | 1 | 多 pass 抽取提升召回，`>1` 时 token 成本按倍数增长 |
| `context_window_chars` | None | 跨 chunk 的上文窗口（用于指代消解） |
| `tokenizer` | RegexTokenizer | 自定义分词器 |

### 1.7 输入侧安全边界（SSRF）

`fetch_urls=True` 时使用 `requests.get` 直接抓取，无任何 URL 净化
（源码注释明确列出风险：内网元数据、loopback、重定向、DNS rebinding）。
集成时若 URL 来自外部用户输入，**必须在传入前自行做 SSRF 校验**。

---

## 2. 文本模型接入规范（LLM Provider 侧）

### 2.1 模型接口约定

所有模型通过抽象基类 `core/base_model.py:BaseLanguageModel` 接入，核心方法签名：

```python
def infer(self, batch_prompts: Sequence[str], **kwargs) -> Iterator[ScoredOutput]
```

- 输入/输出均为**纯文本字符串** —— 因此**只需接入文本 LLM，不需要多模态模型，
  也不需要 Embedding 模型**（Pipeline 无向量检索环节，溯源靠字符对齐实现）。
- 模型输出必须是 **JSON 或 YAML 格式的结构化字符串**（`extraction_class` +
  `extraction_text` + `attributes`），由 `resolver.Resolver` 解析并与原文对齐。

### 2.2 Provider 路由规范（model_id 前缀匹配）

`factory.create_model()` 根据 `model_id` 的正则前缀自动路由到内置 Provider
（`providers/patterns.py`、`providers/builtin_registry.py`）：

| Provider | model_id 匹配规则（正则） | 依赖安装 | 优先级 |
|----------|--------------------------|---------|-------|
| **Gemini** | `^gemini` | 内置（`google-genai`） | 10 |
| **OpenAI** | `^gpt-3\.5`, `^gpt-4`, `^gpt4\.`, `^gpt-5`, `^gpt5\.`, `^o[1-9]` | `pip install langextract[openai]` | 10 |
| **Ollama** | `^gemma`, `^llama`, `^mistral`, `^mixtral`, `^phi`, `^qwen`, `^deepseek`, `^command-r`, `^starcoder`, `^codellama`, `^codegemma`, `^tinyllama`, `^wizardcoder`, `^gpt-oss`, 以及 `meta-llama/`、`Qwen/`、`deepseek-ai/` 等 HF 前缀 | 需本地运行 Ollama 服务 | 10 |

**匹配不到任何前缀的 model_id 会抛出找不到 provider 的错误**，此时必须使用
`config` 参数显式指定 provider。

### 2.3 三种接入方式

**方式一：`model_id` 自动路由（推荐，最简）**

```python
result = lx.extract(
    text_or_documents=text,
    prompt_description=prompt,
    examples=examples,
    model_id="gemini-3.5-flash",   # 自动选择 Gemini provider
    # model_id="gpt-4o",           # 自动选择 OpenAI provider
    # model_id="gemma2:2b",        # 自动选择 Ollama provider
    model_url="http://localhost:11434",  # 仅 Ollama 需要
)
```

**方式二：`config = ModelConfig(...)` 显式指定（用于 OpenAI 兼容端点 / 非 GPT 命名模型）**

```python
from langextract.factory import ModelConfig

result = lx.extract(
    ...,
    config=ModelConfig(
        model_id="my-openai-compatible-model",
        provider="openai",
        provider_kwargs={"api_key": "sk-...", "base_url": "https://your-endpoint/v1"},
    ),
)
```

> 这是接入 **vLLM / DeepSeek / 通义千问 OpenAI 兼容接口** 等自建服务的标准方式。
> `config` 优先级高于 `model_id` / `api_key` / `language_model_type`。

**方式三：`model` 参数注入预构建实例（优先级最高）**

直接传入配置好的 `BaseLanguageModel` 实例，适合运行时动态切换模型或完全自定义推理逻辑。

### 2.4 鉴权规范

| Provider | 鉴权方式 |
|----------|---------|
| Gemini | 环境变量 `LANGEXTRACT_API_KEY`、`.env` 文件、`api_key=` 参数，或 Vertex AI 服务账号（`language_model_params={"vertexai": True, "project": ..., "location": ...}`） |
| OpenAI | 环境变量 `OPENAI_API_KEY` 或 `provider_kwargs={"api_key": ...}` |
| Ollama | 无需鉴权（本地服务） |

### 2.5 结构化输出（Schema 约束）支持矩阵

`use_schema_constraints=True`（默认）时，Provider 会依据 few-shot 示例自动生成
JSON Schema 并启用受控生成：

| Provider | Schema 约束（示例推导） | 显式 `output_schema` | Fence 行为 |
|----------|----------------------|---------------------|-----------|
| Gemini | ✅ 受控生成（controlled generation） | ✅ | 自动判定，schema 生效时不加 fence |
| OpenAI | ✅ structured outputs / JSON mode | ✅ | 自动判定 |
| Ollama | ✅ JSON mode（`FormatModeSchema`） | ❌ 不支持 | 自动判定 |

`format_type` 支持 `JSON`（默认）与 `YAML`；`output_schema` 模式下强制 JSON 且禁用 fence。

### 2.6 自定义 Provider 插件规范

通过 entry-point 插件机制扩展新模型（`providers/router.py`）：

```python
from langextract.providers import router

@router.register(name="my-provider", patterns=(r"^my-model",), priority=20)
class MyModel(base_model.BaseLanguageModel):
    def infer(self, batch_prompts, **kwargs): ...
    @classmethod
    def get_schema_class(cls): ...  # 可选，返回结构化输出 schema 类
```

以独立包发布，在 `pyproject.toml` 中声明 entry point group `langextract.providers` 即可被自动发现；`priority > 10` 可覆盖内置路由。

### 2.7 Provider 专属参数（`language_model_params`）

- Gemini：`max_retries`、`retry_delay`、`max_retry_delay`、`max_output_tokens`、`top_p`、`top_k`、`http_options`、Vertex batch 配置
- OpenAI：`batch` 配置（`{"enabled": True, "threshold": 50, "poll_interval": 10}`，批量任务走 Batch API）
- 通用：`temperature`（`extract()` 顶层参数，None 时用模型默认）

---

## 3. 输出数据格式规范（Pipeline 输出侧）

### 3.1 内存对象格式：`AnnotatedDocument`

`extract()` 的返回值（`core/data.py:222-289`）：

```python
@dataclasses.dataclass
class AnnotatedDocument:
    document_id: str              # 文档唯一 ID；未设置时自动生成 "doc_{uuid4.hex[:8]}"
    extractions: list[Extraction] # 该文档的全部抽取结果
    text: str | None              # 源文档原文（用于字符定位回溯）
```

### 3.2 单条抽取结果 `Extraction` 字段规范

`core/data.py:63-128`，这是 Pipeline 对外交付的**最小数据单元**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `extraction_class` | `str` | 抽取类别名（由 few-shot 示例 / output_schema 定义） |
| `extraction_text` | `str` | 抽取的原文片段（verbatim，非改写） |
| `char_interval` | `CharInterval \| None` | **字符级定位**：`{start_pos, end_pos}`（左闭右开），指向 `text` 中的精确区间；**`None` 表示无法在原文中定位（未对齐/幻觉），生产环境应过滤** |
| `alignment_status` | `AlignmentStatus \| None` | 对齐状态，见 3.3 |
| `extraction_index` | `int \| None` | 抽取结果的序号 |
| `group_index` | `int \| None` | 所属抽取组的序号 |
| `description` | `str \| None` | 描述信息 |
| `attributes` | `dict[str, str \| list[str]] \| None` | 附加属性（KV 对） |
| `token_interval` | `TokenInterval \| None` | token 级定位（属性访问，JSONL 序列化时包含） |

### 3.3 对齐状态枚举

```python
class AlignmentStatus(enum.Enum):
    MATCH_EXACT  = "match_exact"   # 与原文精确匹配
    MATCH_GREATER = "match_greater" # 对齐范围大于抽取文本
    MATCH_LESSER  = "match_lesser"  # 对齐范围小于抽取文本
    MATCH_FUZZY   = "match_fuzzy"   # 模糊对齐（默认阈值 0.75）
```

`char_interval is None`（完全无法定位）时该值也为 `None`。

### 3.4 JSONL 持久化格式（跨系统交付格式）

通过 `lx.io.save_annotated_documents()` 落盘（`io.py:85-141`），
**这是与下游（图谱构建、检索层）对接的标准交换格式**。每行一个 JSON 对象：

```json
{
  "document_id": "doc_a1b2c3d4",
  "text": "Lady Juliet gazed longingly at the stars, her heart aching for Romeo",
  "extractions": [
    {
      "extraction_class": "character",
      "extraction_text": "Juliet",
      "char_interval": {"start_pos": 5, "end_pos": 11},
      "alignment_status": "match_exact",
      "extraction_index": 0,
      "group_index": 0,
      "token_interval": {"start_index": 1, "end_index": 2},
      "attributes": {"emotional_state": "longing"},
      "description": null
    }
  ]
}
```

序列化规则（`data_lib.annotated_document_to_dict`）：
- 下划线开头的私有字段（如 `_tokenized_text`）被跳过；
- Enum 序列化为字符串值（如 `"match_exact"`）；
- `char_interval` / `token_interval` 为嵌套对象，缺失时为 `null`；
- 反序列化使用 `lx.io.load_annotated_documents_jsonl()`，可完整还原为
  `AnnotatedDocument` 对象。

### 3.5 可视化输出（可选）

`lx.visualize(jsonl_path)` 生成**自包含交互式 HTML**（Plotly 内嵌），在原文中
高亮全部实体——适合人工审核抽取质量，不适合程序消费。

### 3.6 输出侧消费建议（对接 GraphRAG 下游）

1. **溯源过滤**：仅保留 `char_interval is not None` 的抽取项（README 明确建议
   `[e for e in result.extractions if e.char_interval]`），剔除模型幻觉。
2. **图谱映射**：`extraction_class` → 实体/关系类型；`extraction_text` → 节点/边的
   原文证据；`attributes` → 节点/边属性；`document_id + char_interval` →
   证据溯源指针（可回链到 chunk 原文）。
3. **成本提示**：多 pass（`extraction_passes`）合并时重叠结果以第一 pass 为准；
   解析失败的 chunk 默认被丢弃并告警（`suppress_parse_errors=True`）。

---

## 附录：Pipeline 端到端数据流总览

```
输入侧                          Pipeline 内部                         输出侧
────────                       ──────────────                        ────────
str / URL / Document迭代器      ┌─ 正则分词 + token 分块 (chunking.py)
CSV(Dataset.load) ───────────► ├─ prompt 组装(few-shot + schema约束)
                               ├─ 文本LLM推理 (providers/*)   ──►  AnnotatedDocument
【仅接受纯文本】                ├─ JSON/YAML 解析 (resolver.py)       │ (内存对象)
                               └─ 字符级对齐 (char_interval)          ├─ JSONL 文件 (save_annotated_documents)
PDF/DOCX/图像 ❌ 需上游自行解析                                        ├─ HTML 可视化 (lx.visualize)
Embedding 模型 ❌ 不需要                                              └─ 无任何数据库/向量库依赖
```
