# MinerU 文档解析规范文档 v1.0（基于实测校准）

> 版本：v1.0（2026-10-14）
> 本文档是 `mineru_pipeline_spec.md` 的实测校准版：MVP Pipeline 已在本地真实执行成功
> （测试日期 2026-10-14，`model_version=vlm`，返回 `_version_name=3.4.4`），
> 全部输出规范以**本地实测产物为准**，与官方文档冲突之处在 §4 中逐条列出。

---

## 1. 完整 Pipeline 执行思路 + 测试代码位置

### 1.1 执行思路（已验证的 6 步流程）

```
┌─────────────────────────────────────────────────────────────────────┐
│ 步骤 0  配置加载      读取 .env（Token/模型版本/轮询参数/输入输出路径）│
│ 步骤 0  输入扫描      扫描 input/*.pdf，生成待解析文件清单             │
├─────────────────────────────────────────────────────────────────────┤
│ 步骤 1  申请上传链接  POST /api/v4/file-urls/batch                   │
│                       请求体: model_version + files[{name,is_ocr,data_id}]
│                       响应:   batch_id + file_urls[]（OSS 预签名 PUT）│
├─────────────────────────────────────────────────────────────────────┤
│ 步骤 2  文件上传      逐个 PUT 二进制到 file_urls[i]                 │
│                       ① 无须 Content-Type 头 ② 上传即自动提交解析任务 │
├─────────────────────────────────────────────────────────────────────┤
│ 步骤 3  轮询结果      GET /api/v4/extract-results/batch/{batch_id}   │
│                       实测状态机: waiting-file → running → done      │
│                       （官方另列 pending/converting/failed）          │
├─────────────────────────────────────────────────────────────────────┤
│ 步骤 4  下载解包      GET full_zip_url（CDN zip）→ 解压到            │
│                       output/<文件名去扩展名>/ 目录                  │
├─────────────────────────────────────────────────────────────────────┤
│ 步骤 5  产物摘要      统计 artifacts 清单、full.md 字符数、           │
│                       content_list 块数与类型分布 → 打印预览          │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 测试代码位置

| 文件 | 职责 |
|------|------|
| `mineru_mvp/mineru_pipeline.py` | 主 Pipeline：`load_env → collect_input_files → request_upload_urls → upload_files → poll_results → download_and_unpack → summarize` 七个函数与上述步骤一一对应 |
| `mineru_mvp/generate_test_pdf.py` | 测试夹具：reportlab 生成 2 页 PDF（含段落 + 数值表格） |
| `mineru_mvp/.env` | 全部外部配置（见 §3） |
| `mineru_mvp/.gitignore` | 排除 `.env`（密钥）、`output/`（产物）与 `.venv/`（虚拟环境） |
| `mineru_mvp/pyproject.toml` + `uv.lock` | 组件依赖清单与锁定文件（requests、reportlab） |
| `mineru_mvp/CLAUDE.md` | 组件级 Agent 规则：**MinerU 组件运行前必须进入子虚拟环境** |
| `mineru_mvp/input/` | 待解析 PDF 的输入目录 |
| `mineru_mvp/output/<stem>/` | 每个源文件一个结果目录（zip 解包目标） |

### 1.3 虚拟环境切换说明（环境隔离规范）

为避免 MinerU 组件与项目内其他组件（如 LangExtract）之间的依赖互相污染，
`mineru_mvp/` 使用 **uv 管理的独立子虚拟环境**（`mineru_mvp/.venv/`），
依赖通过 `pyproject.toml` + `uv.lock` 锁定。组件级规则同步写入
`mineru_mvp/CLAUDE.md`，由 Claude Code 在操作该目录下文件时自动加载执行。

**启动 Pipeline 前必须完成环境切换，两种方式：**

```bash
cd mineru_mvp

# 方式一（推荐）：uv run —— 无须手动激活，自动使用 .venv 中的解释器
uv run python generate_test_pdf.py
uv run python mineru_pipeline.py

# 方式二：手动激活子虚拟环境后再运行
source .venv/bin/activate
python generate_test_pdf.py
python mineru_pipeline.py
deactivate    # 退出子环境（可选）
```

**环境管理规则：**

| 操作 | 命令 |
|------|------|
| 首次克隆 / 环境重建 | `uv sync`（按 `uv.lock` 精确还原） |
| 新增依赖 | `uv add <package>`（自动更新 `pyproject.toml` 与 `uv.lock`） |
| 环境损坏 | `rm -rf .venv && uv sync` |

**禁止事项**：禁止用系统 `python3` / 宿主机解释器直接运行组件脚本；
禁止在组件内直接 `pip install`（依赖状态会脱离锁文件）。

**实测验证**（2026-10-14）：`uv run python -c "import sys; print(sys.executable)"`
输出 `.../mineru_mvp/.venv/bin/python`（Python 3.11.9），依赖 requests 2.34.2、
reportlab 4.5.1 隔离于子环境内，`generate_test_pdf.py` 在 venv 中运行正常。

**实测运行记录**（2026-10-14）：

```
input files: ['sample_report.pdf']
[1/4] upload urls applied. batch_id=bd48a6be-5dc7-4a70-948c-39872a3b978d
[2/4] uploaded sample_report.pdf (2728 bytes)
      polling... states: {'sample_report.pdf': 'waiting-file'} → 'running' → 'done'
[4/4] unpacked sample_report.pdf -> output/sample_report
MVP pipeline finished: all files parsed successfully.
```

---

## 2. MinerU Pipeline 关键参数规范

### 2.1 本地环境配置（`.env`，Pipeline 运行必需）

| 参数 | 实测值 | 必需 | 说明 |
|------|--------|:----:|------|
| `MINERU_API_TOKEN` | （已配置） | ✅ | mineru.net 申请的 API Token，请求头 `Authorization: Bearer {token}` |
| `MINERU_API_BASE` | `https://mineru.net/api/v4` | ✅ | API 基础地址 |
| `MINERU_MODEL_VERSION` | `vlm` | ✅ | `pipeline` / `vlm`（推荐）/ `MinerU-HTML`（仅 HTML 源） |
| `MINERU_IS_OCR` | `false` | ✅ | 强制 OCR；扫描件/图片设 `true`，文字版 PDF 保持 `false` |
| `POLL_INTERVAL` | `8` | ✅ | 轮询间隔（秒） |
| `POLL_TIMEOUT` | `1800` | ✅ | 轮询超时上限（秒） |
| `INPUT_DIR` / `OUTPUT_DIR` | `input` / `output` | ✅ | 本地输入/输出目录 |

### 2.2 请求体参数（`POST /api/v4/file-urls/batch`）

| 参数 | 层级 | 必填 | 默认 | 说明 |
|------|------|:----:|------|------|
| `model_version` | 顶层 | 建议 | `pipeline` | 实测用 `vlm`（复杂版面质量更好） |
| `enable_formula` | 顶层 | 可选 | `true` | 公式识别（输出 LaTeX） |
| `enable_table` | 顶层 | 可选 | `true` | 表格识别（输出 HTML 表格） |
| `callback` / `seed` | 顶层 | 可选 | 无 | 结果回调；不填则轮询。POST + SHA256 校验，最多重试 5 次 |
| `files[].name` | 文件级 | ✅ **必填** | — | 文件名，**必须含正确扩展名**（服务端据此识别格式） |
| `files[].is_ocr` | 文件级 | 可选 | `false` | 是否强制 OCR |
| `files[].data_id` | 文件级 | 强烈建议 | — | 业务自定义 ID（≤128 字符），结果回溯/与文档库主键对齐 |
| `files[].page_ranges` | 文件级 | 可选 | 全部 | 页码选择，如 `"2,4-6"`（1-based） |
| `files[].language` | 文件级 | 可选 | `ch` | OCR 语言 |

### 2.3 上传与轮询行为约束

| 约束项 | 说明 |
|--------|------|
| 上传方式 | 对 `file_urls[i]` 执行 `PUT`，**不设置 Content-Type 头** |
| 任务触发 | 上传完成后**系统自动提交解析**，无须调用提交任务接口 |
| 上传链接有效期 | 24 小时 |
| 终态判断 | `state ∈ {done, failed}` 即该文件结束；全部文件到终态后轮询退出 |
| 结果获取 | `state == done` → 下载 `extract_result[].full_zip_url`；`failed` → 读 `err_msg` |

---

## 3. 本地实际生成的关键文件（实测为准）

### 3.1 实测 zip 包内容（`model_version=vlm`，PDF 源，2 页文档）

实测解包产物共 **7 个成员 + images 目录**：

| # | 实测文件 | 类型 | 官方文档 | 结论 |
|---|---------|------|---------|------|
| 1 | `{uuid}_content_list.json` | 内容列表 V1 | ✅ 官方有载 | 一致，但实测块**含 bbox**（官方示例未展示，见 §4-冲突1） |
| 2 | `{uuid}_content_list_v2.json` | 内容列表 V2 | ❌ 官方 API 文档未列 | **实测新增**（按页分组的双层数组） |
| 3 | `layout.json` | 布局中间格式（middle.json） | ✅ 官方有载 | 一致，但顶层键名与官方不同（见 §4-冲突2） |
| 4 | `{uuid}_model.json` | 模型原始输出 | ✅ 官方有载 | 一致，但实测结构为页列表（见 §4-冲突3） |
| 5 | `{uuid}_origin.pdf` | 源文件副本 | ❌ 官方 API 文档未列 | **实测新增**（PDF 1.7，2 页，与源文件同内容） |
| 6 | `full.md` | 最终 Markdown | ✅ 官方有载 | 一致 |
| 7 | `images/` | 图片素材目录 | ✅ 官方有载 | 一致，但**命名规则与官方不同**（见 §4-冲突4） |

> 命名说明：文件名前缀 `{uuid}` 为服务端生成的结果 ID（本次实测为
> `d552338a-5685-4917-a3a8-ff26eaec0d1e`），**与源文件名无关**——下游代码应使用
> glob 匹配（`*_content_list.json` 等）而非固定文件名。

### 3.2 `full.md`（实测确认）

- 标题输出为 `##`（源 PDF 的 `Helvetica-Bold 16pt` 文档主标题识别为二级标题）；
- 表格输出为单行 HTML `<table>...</table>`；
- 图片以 `images/<sha256>.jpg` 相对路径引用；
- 实测 2 页 PDF → 679 字符，段落边界与源 PDF 一致。

### 3.3 `{uuid}_content_list.json`（V1，实测字段）

顶层数组，数组顺序即阅读顺序。实测块类型分布：7 text + 1 table。

**text 块（实测）**：
```json
{
  "type": "text",
  "text": "Total revenue in Q3 was 12.5 billion CNY, up 18.2% year over year.",
  "page_idx": 0,
  "bbox": [90, 83, 534, 105]     // 0–1000 归一化坐标（官方示例未展示此字段）
}
```

**title 识别**：实测文档主标题在 V1 中输出为 `"type": "text", "text_level": 2`。

**table 块（实测）**：
```json
{
  "type": "table",
  "img_path": "images/e5c6a07...650df54.jpg",
  "table_caption": [],
  "table_footnote": [],
  "table_body": "<table><tr><td>Quarter</td><td>Revenue</td>...</table>",
  "bbox": [92, 156, 857, 280],
  "page_idx": 1
}
```

### 3.4 `{uuid}_content_list_v2.json`（V2，实测字段）

顶层为 **`pages[][]` 双层数组**（外层下标即 `page_idx`）。实测 2 页：
page0 = 6 块，page1 = 2 块。块结构为 `{type, content, bbox}`，内容嵌套在
`content` 对象中（与 4.0 Structured Content 设计一致）：

```json
// title（实测）
{
  "type": "title",
  "content": {
    "title_content": [{"type": "text", "content": "Quarterly Financial Report (Demo)"}],
    "level": 2
  },
  "bbox": [90, 83, 534, 105]
}
// table（实测）
{
  "type": "table",
  "content": {
    "image_source": {"path": "images/e5c6a07...jpg"},
    "table_caption": [], "table_footnote": [],
    "html": "<table>...</table>",
    "table_type": "simple_table",
    "table_nest_level": 1
  },
  "bbox": [92, 156, 857, 280]
}
```

### 3.5 `layout.json`（实测字段）

**顶层键（实测 5 个）**：

| 键 | 实测值 | 说明 |
|----|--------|------|
| `pdf_info` | list | 每页一个 PageInfo（数组下标即 page_idx） |
| `_backend` | `"hybrid"` | 解析后端 |
| `_effort` | `"medium"` | 算力档位（`flash/medium/high/xhigh`） |
| `_ocr_enable` | `false` | 本次 OCR 开关状态 |
| `_version_name` | `"3.4.4"` | 解析引擎版本号 |

**PageInfo（实测键）**：`preproc_blocks` / `discarded_blocks`（被过滤的页眉页脚块）/ `page_size` / `page_idx` / `para_blocks`。

**preproc_blocks 单块（实测键）**：`bbox`（**PDF 点坐标**）、`type`、`angle`、`index`、`lines`、`merge_prev`。

**行与 span（实测，数值提取的最小定位粒度）**：
```json
{
  "bbox": [57, 118, 383, 129],      // 行级坐标，PDF 点（page_size=[595,841] 为分母）
  "spans": [
    {
      "bbox": [57, 118, 383, 129],  // span 级坐标，PDF 点
      "type": "text",
      "content": "This is a sample report generated for the MinerU MVP pipeline test.",
      "score": 1.0                  // 识别置信度
    }
  ]
}
```

**实测坐标换算验证**：A4 页面 `page_size=[595, 841]`。同一表格，
layout.json 给 `[55,132,510,236]`（点），content_list 给 `[92,156,857,280]`（0–1000），
换算比对：`55/595≈9.2% = 92/1000`，`132/841≈15.7% ≈ 156/1000` —— **两套坐标一致**。

### 3.6 `{uuid}_model.json`（实测字段）

顶层为**页列表**（非对象），每页为 raw block 数组。块的 `bbox` 为 **0–1 浮点归一化**（第三种坐标系）：

```json
[
  [   // page 0
    {"type": "paragraph_title", "bbox": [0.091, 0.084, 0.535, 0.107], "angle": 0, "content": null},
    ...
  ],
  [ ... ]  // page 1
]
```

### 3.7 `images/`（实测命名）

文件名为 **64 位内容 SHA256 哈希**（如 `e5c6a07515983a7e1b483806c903a1a4aabc801131e111b83a663bd65650df54.jpg`），
**不是**官方文档描述的 `page_{page_idx}_{type}_{index}.{ext}` 模式（见 §4-冲突4）。
图片与文本块的关联靠 `content_list` / `content_list_v2` 中的 `img_path` /
`image_source.path` 字段回链。

---

## 4. 本地实测 vs 官方文档冲突清单（均以实测为准）

| # | 冲突点 | 官方文档描述 | 本地实测结果 | 采用 |
|---|--------|-------------|-------------|:----:|
| 1 | `content_list.json` 块是否含 bbox | 示例中无 bbox 字段 | **每个块均含 `bbox`，0–1000 归一化坐标** | 实测 |
| 2 | `layout.json` 顶层键名 | `backend` / `version` | **`_backend` / `_version_name`**，另含官方未提的 `_effort`、`_ocr_enable` | 实测 |
| 3 | `_model.json` 结构 | 「模型原始推理输出」未给出结构 | **顶层为页列表**，块含 `{type, bbox(0–1浮点), angle, content}` | 实测 |
| 4 | images 命名规则 | `page_{page_idx}_{parent_type}_{parent_index}.{ext}` | **内容 SHA256 哈希命名**，经 `img_path` 字段回链 | 实测 |
| 5 | zip 包文件清单 | full.md、content_list、layout.json、model.json（+HTML 源的 main.html） | **另含 `_content_list_v2.json` 与 `_origin.pdf`**，共 7 成员 + images/ | 实测 |
| 6 | PageInfo 键 | 官方 4.0 文档提及 `layout_tree` / `page_state` | 实测为 **`discarded_blocks` / `para_blocks`**，未见 layout_tree | 实测 |
| 7 | 任务状态机 | 6 态：waiting-file/pending/running/converting/done/failed | 实测观察到 `waiting-file → running → done`（2.7KB 小文件未出现 pending/converting，属正常） | 兼容 |

> **下游开发守则**：解析产物读取代码不要依赖官方文档的键名/命名规则假设，
> 一律以本文档 §3 的实测 schema 为准；对 `_content_list_v2.json` 等新增产物
> 做可选消费（存在则用，缺失不报错），保证对官方未来格式演进的兼容。

---

## 5. 下游对接要点（继承 v0 并按实测修正）

1. **文本源唯一性**：分块与 LangExtract 抽取基于同一份 `full.md`，中途不得改写。
2. **语义分块锚点**：用 `content_list.json` 的块边界 + `text_level` 开新 section。
3. **表格数值**：唯一可靠来源是 `table_body` / V2 的 `content.html`，用
   `pandas.read_html` / BeautifulSoup 解析；勿用 OCR 文本。
4. **坐标双体系**：UI 高亮/区域比较用 `content_list` 的 0–1000 归一化坐标；
   pymupdf 精确定位用 `layout.json` 的 PDF 点坐标（换算公式见 §3.5 实测验证）。
5. **证据指针**：每条抽取结果保留
   `(LangExtract document_id, char_interval)` + `(page_idx, bbox)` 双定位。

---

## 附：本文档信息来源

- 本地实测：`mineru_mvp/` 目录下 MVP Pipeline 真实运行产物（2026-10-14，
  vlm 后端，引擎版本 3.4.4）
- 官方文档：[mineru.net API Docs](https://mineru.net/apiManage/docs)、
  [MinerU GitHub README](https://github.com/opendatalab/MinerU)、
  [输出文件格式](https://opendatalab.github.io/MinerU/reference/output_files/)
- 冲突裁决规则：§4 表格，以本地实测产物数量、类型、字段为准
