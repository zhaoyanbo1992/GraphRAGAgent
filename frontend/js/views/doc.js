/**
 * P3 文档详情·三视图（graph / extract / text）：共享同一份索引产物，互切零加载。
 * URL 状态分层：t=triple_id、n=normalized_name、hl=start,end 进 hash；
 * 抽屉开合、图布局、滚动位置留内存。同页 query 变化不重渲染。
 */
import adapter from '../api/adapter.js';
import { cacheGet, cachePut } from '../state.js';
import { el, monoTag, pathTag, typeColor, TYPE_LABEL, skeleton, errCard, emptyState } from '../ui/components.js';
import { buildGraph } from '../ui/graph.js';
import { openEvidenceDrawer, closeEvidenceDrawer, drawerOpen } from '../ui/drawer.js';
import { renderReading, parseHl } from '../ui/highlight.js';
import { onTeardown, navigate, currentRoute } from '../router.js';

const TABS = [
  { key: 'graph', label: '知识图谱' },
  { key: 'extract', label: '抽取数据' },
  { key: 'text', label: '原文溯源' },
];

function pageHead(result, docId) {
  const m = result._meta || {};
  return el('div', {}, [
    el('div', { class: 'doc-head' }, [
      el('h1', { class: 'page-title', style: { fontSize: '22px' } }, [
        el('span', { class: 'fname', text: docId }),
      ]),
      result._demo ? el('span', { class: 'tag', title: 'mock 演示：复用实测产物', text: 'demo' }) : null,
    ]),
    el('div', { class: 'chips' }, [
      el('span', { class: 'chip', text: `${m.n_chunks ?? '—'} 块` }),
      el('span', { class: 'chip', text: `${m.n_entities ?? '—'} 实体` }),
      el('span', { class: 'chip', text: `${m.n_triples ?? '—'} 三元组` }),
      m.page_count != null ? el('span', { class: 'chip', text: `${m.page_count} 页` }) : null,
    ]),
  ]);
}

function tabsBar(docId, active) {
  const bar = el('nav', { class: 'tabs', 'aria-label': '文档详情三视图' });
  for (const t of TABS) {
    bar.append(el('a', {
      href: `#/doc/${encodeURIComponent(docId)}/${t.key}`,
      'aria-current': t.key === active ? 'page' : null,
      'aria-label': t.label,
      text: t.label,
    }));
  }
  return bar;
}

/** 同页选中态更新：location.replace 不污染历史、不重渲染 */
function replaceSelection(docId, view, selection) {
  const path = `/doc/${encodeURIComponent(docId)}/${view}`;
  const q = {};
  if (selection.t) q.t = selection.t;
  if (selection.n) q.n = selection.n;
  if (selection.hl) q.hl = selection.hl;
  navigate(path, q, { replace: true });
}

// ---------------- 图谱视图 ----------------
function graphView(container, result, docId, query) {
  const wrap = el('div', { class: 'graph-wrap' }, [
    el('div', { class: 'graph-hint', text: '点边/点节点查看证据 · 点空白关闭 · 图例右上' }),
  ]);
  container.append(wrap);
  let graph = null;
  let destroyed = false;

  function legend(types) {
    const lg = el('div', { class: 'legend' }, [el('div', { class: 'muted', style: { fontSize: '11px' }, text: '实体类型' })]);
    for (const t of types) {
      lg.append(el('div', { class: 'lg-item' }, [
        el('span', { class: 'lg-swatch', style: { background: typeColor(t) } }),
        el('span', { text: `${TYPE_LABEL[t] || t} (${t})` }),
      ]));
    }
    return lg;
  }

  function syncFromQuery() {
    const route = currentRoute();
    const t = route.query.t, n = route.query.n;
    graph && graph.syncSelection({ tripleId: t, entityName: n });
    if (t || n) {
      openEvidenceDrawer({
        result, docId,
        tripleId: t || null,
        entityName: n || null,
        onClose: () => replaceSelection(docId, 'graph', {}),
      });
    } else if (drawerOpen()) {
      closeEvidenceDrawer();
    }
  }

  buildGraph(wrap, result, {
    onSelect: (sel) => {
      if (sel.type === 'edge') replaceSelection(docId, 'graph', { t: sel.id });
      else replaceSelection(docId, 'graph', { n: sel.id });
      syncFromQuery();
    },
    onDeselect: () => {
      closeEvidenceDrawer();
      replaceSelection(docId, 'graph', {});
    },
  }).then((g) => {
    if (destroyed) { g && g.destroy(); return; }
    if (!g) {
      wrap.replaceChildren(emptyState({
        title: '图谱组件不可用',
        desc: 'vis-network 加载失败（网络受限）。可改用「抽取数据」视图以表格浏览全部三元组。',
        action: el('a', { class: 'btn ghost small', href: `#/doc/${encodeURIComponent(docId)}/extract`, text: '转到抽取数据' }),
      }));
      return;
    }
    graph = g;
    wrap.append(legend(g.legendTypes));
    syncFromQuery();
  });

  return {
    destroy() { destroyed = true; graph && graph.destroy(); closeEvidenceDrawer(); },
    onQueryChange: () => syncFromQuery(),
  };
}

// ---------------- 抽取数据视图 ----------------
function extractView(container, result, docId) {
  const wrap = el('div', {});
  container.append(wrap);

  function syncFromQuery() {
    const t = currentRoute().query.t;
    if (t) {
      openEvidenceDrawer({ result, docId, tripleId: t, onClose: () => replaceSelection(docId, 'extract', {}) });
      const row = wrap.querySelector(`tr[data-triple="${CSS.escape(t)}"]`);
      if (row) row.setAttribute('aria-selected', 'true');
    } else if (drawerOpen()) closeEvidenceDrawer();
  }

  function render() {
    wrap.replaceChildren();
    const m = result._meta || {};

    // 上表：三元组
    wrap.append(el('h3', { style: { font: '600 16px/1.5 var(--sans)', margin: '0 0 8px' }, text: `三元组（${result.triples.length}）` }));
    const tw = el('div', { class: 'tbl-wrap', style: { maxHeight: '46vh' } });
    const tbl = el('table', { class: 'tbl' }, [
      el('thead', {}, [el('tr', {}, ['ID', '头实体', '谓词', '尾实体', '路径', '页', '溯源区间'].map((h) => el('th', { text: h })))]),
    ]);
    const tbody = el('tbody', {});
    for (const t of result.triples) {
      const ci = t.evidence.char_interval_fullmd;
      const tr = el('tr', {
        class: 'rowlink', tabindex: '0', dataset: { triple: t.triple_id },
        'aria-label': `查看证据 ${t.triple_id}`,
      }, [
        el('td', { class: 'mono', text: t.triple_id }),
        el('td', {}, [el('span', { style: { fontWeight: 600 }, text: t.head.name })]),
        el('td', { class: 'mono', text: t.predicate }),
        el('td', { text: t.tail.name }),
        el('td', {}, [pathTag(t.provenance.path)]),
        el('td', { class: 'mono', text: t.evidence.page_idx != null ? String(t.evidence.page_idx) : '—' }),
        el('td', { class: 'mono', text: ci ? `${ci.start_pos}:${ci.end_pos}` : t.evidence.bbox_normalized ? 'bbox' : '—' }),
      ]);
      const open = () => {
        replaceSelection(docId, 'extract', { t: t.triple_id });
        syncFromQuery();
      };
      tr.addEventListener('click', open);
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
      tbody.append(tr);
    }
    tbl.append(tbody);
    tw.append(tbl);
    wrap.append(tw);

    // 下表：LangExtract 抽取明细
    wrap.append(el('h3', { style: { font: '600 16px/1.5 var(--sans)', margin: '18px 0 8px' }, text: `抽取明细（${result.extractions.length}）` }));
    const tw2 = el('div', { class: 'tbl-wrap', style: { maxHeight: '40vh' } });
    const tbl2 = el('table', { class: 'tbl' }, [
      el('thead', {}, [el('tr', {}, ['定位', '类别', '文本', '属性', 'chunk'].map((h) => el('th', { text: h })))]),
    ]);
    const tbody2 = el('tbody', {});
    for (const x of result.extractions) {
      const attrs = Object.entries(x.attributes || {})
        .map(([k, v]) => `${k}=${v}`).join('; ');
      tbody2.append(el('tr', {}, [
        el('td', {}, [el('span', { class: 'tag mono', style: x.grounded ? { color: 'var(--ok)', borderColor: 'var(--ok)' } : { color: 'var(--muted)' }, text: x.grounded ? '✓ ' + (x.alignment_status || '') : '✗ 未对齐' })]),
        el('td', { class: 'mono', text: x.extraction_class }),
        el('td', { style: { fontFamily: 'var(--serif)', color: 'var(--ink)' }, text: x.extraction_text }),
        el('td', { class: 'mono muted', text: attrs || '—' }),
        el('td', { class: 'mono muted', text: (x.chunk_id || '').split('_').pop() }),
      ]));
    }
    tbl2.append(tbody2);
    tw2.append(tbl2);
    wrap.append(tw2);
  }

  render();
  syncFromQuery();
  return {
    destroy() { closeEvidenceDrawer(); },
    onQueryChange: () => syncFromQuery(),
  };
}

// ---------------- 原文溯源视图 ----------------
function textView(container, result, docId, query) {
  const wrap = el('div', {});
  container.append(wrap);
  const fullMd = result.full_md || '';

  function render() {
    wrap.replaceChildren();
    const hl = parseHl(query);
    const tId = query.t || null;
    const triple = tId ? result.triples.find((x) => x.triple_id === tId) : null;

    // 顶部批注条
    if (triple) {
      const ci = triple.evidence.char_interval_fullmd;
      const isTable = triple.provenance.path !== 'narrative';
      const bar = el('div', { class: 'annotate-bar', role: 'status' }, [
        el('span', {}, [document.createTextNode('证据 '), el('span', { class: 'mono', text: triple.triple_id })]),
        el('span', { class: 'quote-frag', text: `「${triple.evidence.text_span.slice(0, 40)}${triple.evidence.text_span.length > 40 ? '…' : ''}」` }),
        el('span', { style: { flex: 1 } }),
        el('a', {
          href: `#/doc/${encodeURIComponent(docId)}/graph${tId ? '?t=' + encodeURIComponent(tId) : ''}`,
          text: '← 返回图谱',
        }),
      ]);
      wrap.append(bar);
      if (isTable && triple.evidence.bbox_normalized) {
        // 表格路径：bbox 红框页面示意图（char_interval_fullmd 高亮无意义）
        const bbox = triple.evidence.bbox_normalized;
        const [x0, y0, x1, y1] = Array.isArray(bbox) ? bbox : [0, 0, 0, 0];
        wrap.append(el('div', { class: 'card pad bbox-card' }, [
          el('h4', { style: { margin: '0 0 10px', font: '600 14px/1.6 var(--sans)' }, text: '表格证据 · bbox 页面示意' }),
          el('div', { class: 'bbox-schematic', role: 'img', 'aria-label': `表格在页面中的位置示意 bbox=${JSON.stringify(bbox)}` }, [
            el('div', {
              class: 'frame-rect',
              style: {
                left: (x0 * 100) + '%', top: (y0 * 100) + '%',
                width: Math.max((x1 - x0) * 100, 6) + '%',
                height: Math.max((y1 - y0) * 100, 6) + '%',
              },
            }),
            el('span', { class: 'pg-no', text: `p${triple.evidence.page_idx ?? '?'}` }),
          ]),
          el('p', { class: 'muted', style: { font: '11.5px/1.7 var(--mono)', margin: '8px 0 0' }, text: `bbox_normalized = [${[x0, y0, x1, y1].map((v) => v).join(', ')}]` }),
          el('p', { class: 'muted', style: { font: '11.5px/1.7 var(--sans)', margin: '4px 0 0' }, text: '表格原图渲染 · 未开发（后端暂无 table_image 静态端点）' }),
          el('blockquote', { class: 'dw-quote', style: { marginTop: '10px', marginBottom: 0 }, text: triple.evidence.text_span }),
        ]));
        return;
      }
    }

    const { root, hasHighlight } = renderReading(fullMd, hl);
    wrap.append(root);
    // 非法/越界 hl 静默忽略（PRD §4.1），不报错不提示
    if (hasHighlight) {
      requestAnimationFrame(() => {
        const target = wrap.querySelector('.hl-target');
        if (target) target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      });
    }
  }

  render();
  return {
    destroy() {},
    onQueryChange: (q) => { /* text 视图 hl/t 变化 = 新证据定位：重渲染正文 */ replaceAndRerender(q); },
  };

  function replaceAndRerender(newQuery) {
    Object.assign(query, newQuery);
    render();
  }
}

// ---------------- 视图入口 ----------------
export default async function docView(root, { params, query }) {
  const docId = params.id;
  const view = params.view || 'graph';

  // 三视图共享 resultCache，互切零加载
  let result = cacheGet(docId);
  if (!result) {
    root.append(skeleton(5));
    try {
      result = await adapter.getResult(docId);
      cachePut(docId, result);
    } catch (e) {
      root.replaceChildren(errCard({
        code: e.code || 'E_NETWORK', message: e.message || '文档产物加载失败', details: e.details,
        actions: [el('button', { class: 'btn ghost small', text: '重试', onclick: () => window.location.reload() })],
      }));
      return {};
    }
    root.replaceChildren();
  }

  root.append(pageHead(result, docId), tabsBar(docId, view));
  const content = el('div', { class: 'doc-content' });
  root.append(content);

  let sub;
  if (view === 'extract') sub = extractView(content, result, docId);
  else if (view === 'text') sub = textView(content, result, docId, { ...query });
  else sub = graphView(content, result, docId);

  return sub;
}
