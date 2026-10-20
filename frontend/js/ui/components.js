/**
 * 原子组件：DOM 构造助手 / 格式化 / 骨架 / toast / 空态 / 错误卡。
 */

/** 创建元素。attrs: {class, text, html, ...其他属性}; children: 节点数组 */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else node.setAttribute(k, v);
  }
  for (const c of children) if (c != null) node.append(c);
  return node;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export const fmtBytes = (n) => {
  if (n == null) return '—';
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1048576).toFixed(1) + ' MB';
};

export const fmtNum = (n) => (n == null ? '—' : String(n));

/** ISO8601 → 'MM-DD HH:mm'（本地时区） */
export function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const p = (x) => String(x).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 毫秒 → 'm:ss' 或 'h:mm:ss' */
export function fmtClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  const p = (x) => String(x).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(ss)}` : `${m}:${p(ss)}`;
}

export const fmtMs = (ms) => (ms == null ? '—' : ms >= 1000 ? (ms / 1000).toFixed(1) + 's' : ms + 'ms');

// ---------- 任务/文档状态 ----------
export const JOB_ST_LABEL = {
  queued: '排队中', parsing: '解析中', chunking: '分块中', extracting: '抽取中',
  kg_building: '图谱构建中', done: '已完成', failed: '失败', canceled: '已取消',
};
export const DOC_ST_LABEL = {
  queued: '排队中', indexing: '索引中', done: '可提问', failed: '失败',
};

export function stDot(status) {
  return el('span', { class: 'st-dot ' + status, role: 'img', 'aria-label': JOB_ST_LABEL[status] || status });
}

// ---------- 骨架 ----------
export function skeleton(n = 3) {
  const box = el('div', { 'aria-hidden': 'true' });
  for (let i = 0; i < n; i++) {
    const row = el('div', { class: 'skel' });
    row.style.width = (100 - i * 18) + '%';
    box.append(row);
  }
  return box;
}

// ---------- toast ----------
export function toast(msg, type = 'info') {
  const root = document.getElementById('toast-root');
  const t = el('div', { class: 'toast' + (type === 'err' ? ' err' : ''), role: 'status', text: msg });
  root.append(t);
  setTimeout(() => t.remove(), 3200);
}

// ---------- 空态 ----------
export function emptyState({ title, desc, action = null }) {
  return el('div', { class: 'empty' }, [
    el('h3', { text: title }),
    desc ? el('p', { text: desc }) : null,
    action,
  ]);
}

// ---------- 错误批注卡 ----------
export function errCard({ code, message, details = null, actions = [] }) {
  const card = el('div', { class: 'err-card', role: 'alert' }, [
    el('div', { class: 'headline' }, [
      el('span', { class: 'tag err mono', text: code || 'E_ERROR' }),
      el('span', { text: message }),
    ]),
  ]);
  const rawParts = [];
  if (details) {
    try { rawParts.push(JSON.stringify(details)); } catch { /* ignore */ }
  }
  if (rawParts.length) card.append(el('div', { class: 'raw', text: rawParts.join('\n') }));
  if (actions.length) card.append(el('div', { class: 'actions' }, actions));
  return card;
}

/** 黄色降级条 */
export function warnBar(msg, extra = null) {
  const b = el('div', { class: 'bar warn', role: 'status' }, [el('span', { text: msg })]);
  if (extra) b.append(extra);
  return b;
}

// ---------- tag ----------
export function pathTag(path) {
  const narrative = path === 'narrative';
  return el('span', {
    class: 'tag ' + (narrative ? 'path-narrative' : 'path-table'),
    title: narrative ? '叙事实线：证据为正文句子' : '表格虚线：证据为表格单元格（bbox 定位）',
    text: narrative ? 'narrative' : 'table',
  });
}

export function monoTag(text, cls = '') {
  return el('span', { class: 'tag mono ' + cls, text });
}

// ---------- 实体类型色 ----------
// HEX 供 canvas（vis-network）使用；CSS 变量供 DOM 使用
export const TYPE_HEX = {
  metric: '#2B5D8C',
  period: '#B26A00',
  currency_value: '#2E7D46',
  percentage: '#7B3FA0',
  company: '#C2447A',
  metric_value: '#43566B',
  unknown: '#6B7A88',
};
export const TYPE_COLOR = {
  metric: 'var(--type-metric)',
  period: 'var(--type-period)',
  currency_value: 'var(--type-currency_value)',
  percentage: 'var(--type-percentage)',
  company: 'var(--type-company)',
  unknown: 'var(--type-unknown)',
};
export const TYPE_LABEL = {
  metric: '指标', period: '期间', currency_value: '金额', percentage: '百分比',
  company: '机构', metric_value: '指标值', unknown: '未分类',
};
export const typeColor = (t) => TYPE_HEX[t] || TYPE_HEX.unknown;
