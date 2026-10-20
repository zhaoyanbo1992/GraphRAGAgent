/**
 * full.md 衬线渲染 + 红下划线高亮（char 区间精确映射）。
 * 段落/标题以白空格原样渲染保证 char 偏移精确；表格还原为 <table>（内不参与高亮）。
 * 非法 hl（越界/非数字/倒序）静默忽略。
 */

function parseMarkdownBlocks(fullMd) {
  // 返回 [{kind:'h'|'p'|'table', raw, start, prefixLen}]
  const lines = fullMd.split('\n');
  const blocks = [];
  let i = 0;
  let offset = 0;
  const lineLens = lines.map((l) => l.length + 1); // +1 = '\n'（末行多算 1，无害）

  while (i < lines.length) {
    const line = lines[i];
    const start = offset;
    if (!line.trim()) { offset += lineLens[i]; i++; continue; }
    if (/^#{1,6}\s/.test(line)) {
      const hashes = line.match(/^#+/)[0].length;
      blocks.push({ kind: 'h', level: Math.min(hashes, 4), raw: line, start, prefixLen: hashes + 1 });
      offset += lineLens[i]; i++;
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const tblStart = start;
      const rows = [];
      let j = i;
      let off = start;
      while (j < lines.length && /^\s*\|.*\|\s*$/.test(lines[j])) {
        if (!/^\s*\|[\s:\-|]+\|\s*$/.test(lines[j])) rows.push(lines[j]); // 跳过分隔行
        off += lineLens[j];
        j++;
      }
      blocks.push({ kind: 'table', raw: rows.join('\n'), start: tblStart, end: off - 1 });
      offset = off; i = j;
      continue;
    }
    // 段落：连续非空、非结构行
    const pStart = start;
    const buf = [line];
    let j = i + 1;
    let off = start + lineLens[i];
    while (j < lines.length && lines[j].trim() && !/^#{1,6}\s/.test(lines[j]) && !/^\s*\|.*\|\s*$/.test(lines[j])) {
      buf.push(lines[j]);
      off += lineLens[j];
      j++;
    }
    const raw = buf.join('\n');
    // MinerU 产物可能内嵌 HTML 表格：<table>…</table> 整段还原为真实表格（不参与 char 高亮）
    blocks.push({ kind: raw.includes('<table') ? 'htmltable' : 'p', raw, start: pStart, end: off - 1 });
    offset = off; i = j;
  }
  return blocks;
}

function renderSlice(parent, raw, textStart, hl, withBreaks) {
  // raw 的 full.md 起始偏移是 textStart；将 [hlStart,hlEnd) 部分包上 .hl-target
  const parts = [];
  if (!hl || hl.end <= textStart || hl.start >= textStart + raw.length) {
    parts.push({ s: raw, off: textStart, hl: false });
  } else {
    const hs = Math.max(hl.start, textStart);
    const he = Math.min(hl.end, textStart + raw.length);
    const i0 = hs - textStart, i1 = he - textStart;
    if (i0 > 0) parts.push({ s: raw.slice(0, i0), off: textStart, hl: false });
    parts.push({ s: raw.slice(i0, i1), off: hs, hl: true });
    if (i1 < raw.length) parts.push({ s: raw.slice(i1), off: he, hl: false });
  }
  for (const p of parts) {
    if (!p.s) continue;
    if (p.hl) parent.append(mkSpan(p.s, p.off));
    else if (withBreaks) {
      // 段落内保留换行：逐行生成文本节点（偏移连续），不做高亮切分的跨行处理——
      // 跨行高亮段落在上方按整体切分，此处仅对未高亮部分兜底
      let off = p.off;
      const lines = p.s.split('\n');
      lines.forEach((ln, idx) => {
        if (idx) parent.append(document.createTextNode('\n'));
        parent.append(document.createTextNode(ln));
        off += ln.length + (idx < lines.length - 1 ? 1 : 0);
      });
    } else {
      parent.append(document.createTextNode(p.s));
    }
  }
}

function mkSpan(text, start) {
  const span = document.createElement('span');
  span.className = 'hl-target';
  span.dataset.start = start;
  span.dataset.end = start + text.length;
  span.textContent = text;
  return span;
}

/**
 * 渲染原文。
 * @returns {{root: HTMLElement, hasHighlight: boolean}}
 */
export function renderReading(fullMd, hl = null) {
  const root = document.createElement('article');
  root.className = 'reading';
  const blocks = parseMarkdownBlocks(fullMd);
  let hasHighlight = false;

  for (const b of blocks) {
    if (b.kind === 'h') {
      const node = document.createElement('h' + (b.level + 1 > 4 ? 4 : b.level + 1));
      renderSlice(node, b.raw.slice(b.prefixLen), b.start + b.prefixLen, hl, false);
      root.append(node);
    } else if (b.kind === 'p') {
      const p = document.createElement('p');
      // 段落 raw 含内部 '\n'：逐字符偏移精确，直接按区间切分（跨行高亮也精确）
      const seg = (raw, off, parent) => {
        if (!hl || hl.end <= off || hl.start >= off + raw.length) {
          parent.append(document.createTextNode(raw));
          return;
        }
        hasHighlight = true;
        const hs = Math.max(hl.start, off), he = Math.min(hl.end, off + raw.length);
        if (hs > off) parent.append(document.createTextNode(raw.slice(0, hs - off)));
        parent.append(mkSpan(raw.slice(hs - off, he - off), hs));
        if (he < off + raw.length) parent.append(document.createTextNode(raw.slice(he - off)));
      };
      seg(b.raw, b.start, p);
      root.append(p);
    } else if (b.kind === 'htmltable') {
      // MinerU 内嵌 HTML 表格：白名单重建为真实 <table>（不参与 char 高亮）
      root.append(sanitizeHtmlTable(b.raw));
    } else {
      // 表格：还原 <table>（单元格内不做 char 高亮——表格证据走 bbox 卡）
      const rows = b.raw.split('\n').map((r) => r.split('|').slice(1, -1).map((c) => c.trim()));
      const table = document.createElement('table');
      rows.forEach((cells, ri) => {
        const tr = document.createElement('tr');
        cells.forEach((c) => {
          const td = document.createElement(ri === 0 ? 'th' : 'td');
          td.textContent = c;
          tr.append(td);
        });
        table.append(tr);
      });
      root.append(table);
    }
  }
  return { root, hasHighlight };
}

/** 白名单重建内嵌 HTML 表格（table/tr/td/th/thead/tbody 之外的标签一律丢弃） */
function sanitizeHtmlTable(raw) {
  const ALLOWED = new Set(['TABLE', 'TR', 'TD', 'TH', 'THEAD', 'TBODY']);
  const build = (src, dst) => {
    for (const child of src.children) {
      if (!ALLOWED.has(child.tagName)) { build(child, dst); continue; }
      const node = document.createElement(child.tagName);
      build(child, node);
      if (!node.children.length && !node.textContent.trim()) {
        node.textContent = child.textContent;
      }
      dst.append(node);
    }
  };
  let table = document.createElement('table');
  try {
    const doc = new DOMParser().parseFromString(raw, 'text/html');
    const src = doc.querySelector('table');
    if (src) { table = document.createElement('table'); build(src, table); }
    else table = null;
  } catch { table = null; }
  if (!table || !table.children.length) {
    // 解析失败兜底：按纯文本段落呈现
    const p = document.createElement('p');
    p.textContent = raw;
    return p;
  }
  return table;
}

export function parseHl(query) {
  // 'hl=231,271' → {start, end}；非法静默忽略返回 null
  if (!query.hl) return null;
  const m = /^(\d+),(\d+)$/.exec(query.hl);
  if (!m) return null;
  const start = +m[1], end = +m[2];
  if (!(end > start)) return null;
  return { start, end };
}
