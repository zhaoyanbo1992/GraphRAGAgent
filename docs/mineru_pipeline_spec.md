# MinerU 文档解析规范文档（云端 API 方案）

> 基于 MinerU 官方文档（mineru.net API 控制台文档 / GitHub 官方 README / opendatalab.github.io 文档站）调研整理。
> 本文档面向多模态 RAG 问答系统的**文档解析层**，采用 **MinerU 云端 API（Precision Extract API，v4 接口）** 方案。
> 与本文档配套的上游文档：`docs/langextract_pipeline_spec.md`（LangExtract 抽取层规范）。

---

## 1. 支持的原始输入文件格式

### 1.1 支持格式清单

| 类别 | 扩展名 | 备注 |
|------|--------|------|
| PDF | `.pdf` | 含扫描件（走 OCR）、学术论文；`is_ocr` 控制是否强制 OCR |
| 图片 | `.png` `.jpg` `.jpeg` `.jp2` `.webp` `.gif` `.bmp` | 拍摄/扫描文档图片，自动 OCR |
| Word | `.doc` `.docx` | |
| PowerPoint | `.ppt` `.pptx` | |
| 网页 | `.html` | **必须显式设置 `model_version="MinerU-HTML"`**，否则解析失败 |

**不支持的格式**：XLS/XLSX、EPUB、OFD、MHTML、CSV/TSV 等仅 MinerU 4.0 **本地部署**支持，云端 API（v4）不支持；纯文本（`.txt/.md`）不需要解析。

### 1.2 硬性限制

| 限制项 | 值 |
|--------|-----|
| 单文件大小 | ≤ **200 MB** |
| 单文件页数 | ≤ **600 页** |
| 批量接口单次文件数 | ≤ **200 个** |
| 每日最高优先级配额 | **2000 页/账号**（超出后低优先级排队） |
| 上传链接有效期 | **24 小时**（阿里云 OSS 预签名 URL） |

### 1.3 关键解析参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `model_version` | `pipeline` | `pipeline`（经典流水线）/ `vlm`（视觉大模型，复杂版面质量更好，**推荐**）/ `MinerU-HTML`（仅 HTML 源） |
| `is_ocr` | `false` | 强制 OCR（文字版 PDF 不开更快；扫描件必开） |
| `language` | `ch` | OCR 语言 |
| `enable_formula` | `true` | 公式识别（输出 LaTeX） |
| `enable_table` | `true` | 表格识别（输出 HTML 表格） |
| `page_ranges` | 全部 | 页码选择，如 `"2,4-6"`（1-based） |
| `data_id` | — | 可选业务自定义 ID（≤128 字符），用于结果回溯 |
| `extra_formats` | — | 可选附加导出格式，仅支持 `docx`/`html`/`latex` 中一个或多个；**源文件为 HTML 时无效** |
| `callback` / `seed` | — | 可选回调通知（POST + SHA256 校验，最多重试 5 次）；不填则轮询 |

---

## 2. 云端 API 输出格式与生成文件

### 2.1 API 交互流程与输出物

```
POST /api/v4/file-urls/batch          ──► 返回 batch_id + OSS 预签名上传链接
PUT 文件到 OSS 链接                    ──► 系统自动提交解析任务（无须再调提交接口）
GET /api/v4/extract-results/batch/{batch_id}  ──► 轮询各文件 state
state == "done"                       ──► 下载 extract_result[].full_zip_url（zip 包）
```

任务状态机：`waiting-file`（等待上传）→ `pending`（排队）→ `running`（解析中）→ `converting`（格式转换）→ **`done`** / **`failed`**（终态）。

结果查询接口响应关键字段：

| 字段 | 说明 |
|------|------|
| `data.batch_id` | 批次 ID |
| `data.extract_result[].file_name` | 源文件名 |
| `data.extract_result[].state` | 任务状态（见上方状态机） |
| `data.extract_result[].full_zip_url` | **结果 zip 包的 CDN 下载地址**（`https://cdn-mineru.openxlab.org.cn/xxx.zip`） |
| `data.extract_result[].err_msg` | 失败原因（仅 `state=failed` 时有效） |

### 2.2 结果 zip 包内文件清单

| 文件 | 说明 | 作用 |
|------|------|------|
| `full.md` | **最终 Markdown 结果**，图片以相对路径 `images/...` 引用 | 正文文本源 → 后续分块与 LangExtract 输入 |
| `*_content_list.json` | **内容列表 JSON**：按阅读顺序排列的结构化内容块数组 | 语义分块、阅读顺序消费的首选 |
| `*_content_list_v2.json` | 内容列表 V2：按页分组的块列表（`pages[][]` 双层结构） | V2 消费形态，字段同 V1 |
| `layout.json` | 即 `middle.json`：**中间格式 JSON**，含页面尺寸、块/行/span 级 bbox、布局树 | **布局与坐标信息，精确数值提取依赖此文件** |
| `*_model.json` | 模型原始推理输出（raw blocks） | 调试/审计用，一般不直接消费 |
| `*_origin.pdf` | 原始文件副本（与源文件同内容） | 归档用 |
| `images/` | 抽取的图片素材（页图、表格截图、图片、公式图），文件名为内容 SHA256 | 多模态 RAG 的图片-文本对齐素材 |
| `main.html` | 仅 HTML 源文件时出现：提取的主内容 HTML | HTML 源场景的补充 |

> ⚠️ **坐标系实测确认**（2026-10，`vlm` 后端）：`content_list.json` 的 `bbox` 为
> **0–1000 归一化坐标**（`[x0,y0,x1,y1]`，左上原点）；`layout.json` 的 `bbox` 为
> **PDF 点坐标**（A4 页面 595×841 pt）。两者除以各自分母后指向同一页面区域。
> 使用时务必区分：归一化坐标直接用于 UI 高亮/区域比较，PDF 点坐标用于 pymupdf 等库精确定位。

### 2.3 `*_content_list.json` 字段说明（按阅读顺序的块数组）

顶层为 JSON 数组，**数组顺序即文档阅读顺序**。每个元素为一个内容块，`type` 区分：

**文本块**
```json
{
  "type": "text",
  "text": "营业收入为 12.5 亿元",
  "text_level": 1,          // 可选：标题层级（1=章标题，2=节标题...）；普通正文无此字段
  "page_idx": 0,            // 0-based 源页码
  "bbox": [92, 156, 857, 280] // 块级坐标，**0–1000 归一化**（实测确认，2026-10 vlm 后端）
}
```

**图片块**
```json
{
  "type": "image",
  "img_path": "images/page_3_img_0.jpeg",   // zip 包内相对路径
  "img_caption": ["图3：营收趋势"],           // 可选：图片题注（span 列表）
  "img_footnote": [],                        // 可选：脚注
  "page_idx": 3
}
```

**表格块**
```json
{
  "type": "table",
  "img_path": "images/page_5_table_0.jpeg",  // 表格区域截图
  "table_caption": ["表2：分季度财务数据"],
  "table_body": "<table><tr><td>...</td></tr></table>",  // **表格 HTML 正文，结构化数值提取的关键**
  "table_footnote": [],
  "page_idx": 5
}
```

**公式块**
```json
{
  "type": "equation",
  "text": "E = mc^2",       // LaTeX 内容（不含定界符）
  "text_format": "latex",
  "page_idx": 0
}
```

### 2.4 `layout.json`（middle.json）字段说明（布局/坐标信息）

顶层核心结构：

```json
{
  "backend": "vlm",               // 使用的解析后端
  "version": "1.x.x",             // 解析引擎版本
  "pdf_info": [ /* 每页一个 PageInfo */ ]
}
```

**PageInfo（数组下标即 page_idx，0-based）**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `page_idx` | int | 0-based 页码 |
| `page_size` | `[width, height]` | 页面尺寸（PDF 点，1 点 = 1/72 英寸）——**bbox 归一化的分母** |
| `preproc_blocks` | list | 后处理后的语义块列表（阅读顺序） |
| `layout_tree` | object | 版面布局树（区域层级：标题/正文/表格区/图区等） |
| `page_state` | object | 页面处理状态 |

**preproc_blocks 内的单个块**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | str | 块类型（text/table/image/equation 等） |
| `bbox` | `[x0, y0, x1, y1]` | **块级边框坐标**，PDF 点坐标，左上原点（y 轴向下），`(x0,y0)` 左上角、`(x1,y1)` 右下角 |
| `lines` | list | 行列表 |
| `num` | int | 块序号 |

**lines 内的单行 → spans（最小文本单元）**：

```json
{
  "bbox": [72.5, 120.3, 540.1, 133.8],   // 行/span 级精确坐标（PDF 点）
  "type": "text",                         // text / table / image / interline_equation
  "content": "营业收入为 12.5 亿元"        // 该 span 的文本内容
}
```

### 2.5 `full.md` 与 `images/` 说明

- `full.md`：人类可读的最终结果。标题为 `#`/`##`，表格为 HTML `<table>`，公式为 `$$LaTeX$$`，图片为 `![](images/xxx.jpeg)`。**注意：Markdown 的文本内容不能作为字符定位基准用于跨文件对齐**（MinerU 输出的 md 与原文不保证字符级一致），字符溯源请以 `full.md` 自身为坐标系（LangExtract 的 `char_interval` 基于 `full.md` 文本计算）。
- `images/`：命名规则 `page_{page_idx}_{类型}_{序号}.{ext}`（页码 0-based）；同名同字节复用，不同字节加 `_duplicate_n` 后缀。多模态 RAG 可通过 `page_idx` + `content_list.json` 中的相邻块实现图片-文本对齐。

---

## 3. 布局信息梳理（面向精确数值提取）

数值提取（财务报表、实验数据、表格数字等）是后续抽取的核心难点，MinerU 提供**三层粒度**的定位信息：

### 3.1 三层定位粒度

| 粒度 | 载体 | 坐标系 | 适用场景 |
|------|------|--------|---------|
| **块级** | `content_list.json`（无坐标，仅阅读顺序）+ `middle.json` 块级 `bbox` | PDF 点坐标 | 定位"这个数字在第几页的哪个区域" |
| **行/span 级** | `middle.json` → `preproc_blocks[].lines[].spans[]` 的 `bbox` + `content` | PDF 点坐标（`page_size` 为分母） | **精确数值提取的首选粒度**：可还原"某个数字在原始 PDF 上的确切位置"，用于人工核对、高亮、证据回溯 |
| **归一化坐标** | `content_list.json` 的 `bbox`（实测 v4 云端已提供）；4.0 Structured Content（`bbox.normalized`） | **0–1000 整数** `[x0,y0,x1,y1]`，左上原点 | 跨页面/跨文档统一坐标系，直接用于 UI 高亮与区域比较 |

### 3.2 坐标换算公式

middle.json 的 bbox 为 **PDF 点坐标，左上角为原点，y 轴向下**：

```
归一化相对位置:
  rel_x0 = bbox[0] / page_size[0]     # 相对页面宽度
  rel_y0 = bbox[1] / page_size[1]     # 相对页面高度（原点在页面顶部）

还原 PDF 原生坐标系（左下角原点，用于 pymupdf 等库高亮）:
  pdf_y0 = page_height - bbox[3]      # 注意 y 翻转
  pdf_y1 = page_height - bbox[1]
```

### 3.3 数值提取推荐管道

```
1. 读 content_list.json → 找到 type="table" 的块
2. 解析 table_body（HTML 表格）→ 用 pandas.read_html / BeautifulSoup
   提取行列结构化数值（这是表格数值的**唯一可靠来源**，勿用 OCR 文本）
3. 需要正文数值时：读 middle.json → 按块 type=text 过滤 →
   在 spans[].content 中正则匹配数值模式（金额/百分比/单位）
4. 每个提取出的数值附带证据元组:
   (page_idx, span_bbox, content_text) → 存入知识库作为溯源指针
5. 表格数值附代表格 bbox（middle.json 对应块的 bbox）+ table_body HTML
```

### 3.4 布局树与阅读顺序

- `layout_tree` 描述版面区域层级（单栏/双栏、标题区、正文区、图表区），**跨栏 PDF 的文本交错问题**由 MinerU 阅读序恢复算法处理过，`content_list.json` 数组顺序已是修正后的阅读顺序，直接按序消费即可。
- 页眉/页脚/页码在 content_list 中通常已被过滤或单独标注，**数值提取时注意排除页眉中的重复数字**（如页码、日期）。

---

## 4. MVP 执行的必要与必须字段

### 4.1 前置配置（必需）

| 配置项 | 必需？ | 说明 |
|--------|--------|------|
| MinerU API Token | ✅ **必须** | 在 mineru.net API 管理页申请；建议存入 `.env`：`MINERU_API_TOKEN=xxx`，并加入 `.gitignore` |
| 网络 | ✅ 必须 | 需可访问 `mineru.net` 与 `cdn-mineru.openxlab.org.cn`（结果下载走 CDN）；本机需验证直连/代理连通性 |

### 4.2 接口 1：申请上传链接（POST `/api/v4/file-urls/batch`）

**请求头（必须）**：

```http
Content-Type: application/json
Authorization: Bearer {MINERU_API_TOKEN}
```

**请求体最小 MVP 字段**：

```json
{
  "model_version": "vlm",
  "files": [
    {
      "name": "test.pdf",        // ✅ 必填：文件名（必须含正确扩展名，用于格式识别）
      "is_ocr": false,           // 可选：默认 false；扫描件必须 true
      "data_id": "biz-001"       // 可选：业务 ID，结果回溯用（强烈建议填写）
    }
  ]
}
```

> MVP 最小集：**只填 `name` 即可提交**；`model_version` 建议显式设为 `vlm`（质量更好）。
> HTML 源文件必须加 `"model_version": "MinerU-HTML"`。

**响应（必须提取的字段）**：

| 字段 | 用途 |
|------|------|
| `code == 0` | 成功判断 |
| `data.batch_id` | **轮询结果的凭据** |
| `data.file_urls[]` | **OSS PUT 上传链接**（与 files 顺序一一对应） |

**上传（第二步，必须）**：对每个 `file_urls[i]` 执行 `PUT` 上传二进制；**无须设置 Content-Type 请求头**；上传后**无须调用提交任务接口**（系统自动扫描提交）。

### 4.3 接口 2：轮询结果（GET `/api/v4/extract-results/batch/{batch_id}`）

```http
Authorization: Bearer {MINERU_API_TOKEN}
```

**必须判断的字段**：

| 字段 | MVP 判断逻辑 |
|------|-------------|
| `data.extract_result[].state` | 循环轮询直至每个文件为 `done` 或 `failed`（建议间隔 5–10s，超时上限 10–30 分钟） |
| `data.extract_result[].full_zip_url` | `state == "done"` 时下载此 zip |
| `data.extract_result[].err_msg` | `state == "failed"` 时记录原因 |

### 4.4 MVP 必须消费的输出字段（与第 3 节衔接）

下游抽取管道 MVP 至少消费：

1. `full.md` → 分块 + LangExtract 抽取的文本源；
2. `*_content_list.json` → 语义分块依据（`type` + `page_idx` + 阅读顺序）；
3. 表格数值 → `table_body` HTML；
4. 溯源指针 → `middle.json` 的 span 级 `bbox` + `page_idx`；
5. 图片素材 → `images/`（多模态扩展阶段使用，MVP 可暂不消费）。

### 4.5 MVP Python 参考骨架

```python
import os, time, requests

TOKEN = os.environ["MINERU_API_TOKEN"]
BASE = "https://mineru.net/api/v4"
HDR = {"Content-Type": "application/json", "Authorization": f"Bearer {TOKEN}"}

def submit(files: list[str]) -> tuple[str, list[str]]:
    body = {
        "model_version": "vlm",
        "files": [{"name": os.path.basename(p), "is_ocr": False} for p in files],
    }
    r = requests.post(f"{BASE}/file-urls/batch", headers=HDR, json=body).json()
    assert r["code"] == 0, r
    return r["data"]["batch_id"], r["data"]["file_urls"]

def poll(batch_id: str, timeout_s: int = 1800):
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        r = requests.get(f"{BASE}/extract-results/batch/{batch_id}", headers=HDR).json()
        states = {x["file_name"]: x for x in r["data"]["extract_result"]}
        if all(x["state"] in ("done", "failed") for x in states.values()):
            return states
        time.sleep(8)
    raise TimeoutError(batch_id)

# 用法: submit(["test.pdf"]) → PUT 上传到 file_urls → poll(batch_id) → 下载 full_zip_url 并解压
```

---

## 5. 与 LangExtract 层的对接约束（重要）

1. **文本源唯一性**：分块与抽取必须基于同一份 `full.md` 文本，中途不得改写（LangExtract 的 `char_interval` 溯源基于该文本）。
2. **分块建议**：以 `content_list.json` 的块边界为锚做语义分块（标题块 `text_level` 开新 section），而非对 `full.md` 盲切固定长度。
3. **证据指针**：知识库中每条抽取结果应同时保留两套定位——LangExtract 的 `(document_id, char_interval)`（相对 full.md）+ MinerU 的 `(page_idx, bbox)`（相对原始 PDF 页面），分别服务文本溯源与原文视觉回溯。
4. **文件名对齐**：`data_id` 建议填业务文档 ID，使 MinerU 结果与系统文档库主键对齐。

---

## 参考链接

- [MinerU 官方 README（中文，含 API 参数表与示例）](https://mineru.net/doc/docs/)
- [MinerU 官方 README（英文）](https://mineru.net/doc/docs/index_en/)
- [MinerU GitHub 仓库](https://github.com/opendatalab/MinerU)
- [输出文件格式 — 官方文档](https://opendatalab.github.io/MinerU/reference/output_files/)
- [Middle JSON 协议（schema 2.0）— 官方设计文档](https://github.com/opendatalab/MinerU/blob/master/docs/next/middle-json/README.md)
- [Structured Content Schema — 官方设计文档](https://github.com/opendatalab/MinerU/blob/master/docs/next/middle-json/structured-content-schema.md)
