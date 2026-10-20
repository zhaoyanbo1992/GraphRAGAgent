/**
 * 证据抽屉（跨页组件 M1，审计台信息中枢）：
 * 三视图与问答共用；桌面右缘推挤 / 中屏固定覆盖 / 移动底部弹层。
 * 左缘 2px 批注红是其唯一视觉身份。
 */
import { el, esc, pathTag, monoTag, typeColor, TYPE_LABEL, fmtMs } from './components.js';
import { navigate } from '../router.js';

let drawerEl = null;
let lastFocus = null;
let onCloseCb = null;

function close() {
  if (drawerEl) drawerEl.remove();
  drawerEl = null;
  document.body.classList.remove('dw-open');
  document.removeEventListener('keydown', onKeydown);
  if (lastFocus && document.contains(lastFocus)) { try { lastFocus.focus(); } catch { /* ignore */ } }
  lastFocus = null;
  const cb = onCloseCb;
  onCloseCb = null;
  if (cb) cb();
}

function onKeydown(e) {
  if (e.key === 'Escape') { e.stopPropagation(); close(); }
}

function metaKv(triple, result) {
  const ev = triple.evidence;
  const ci = ev.char_interval_fullmd;
  const rows = [
    ['source', ev.source],
    ['chunk_id', ev.chunk_id],
    ['char_interval_chunk', ev.char_interval_chunk ? `${ev.char_interval_chunk.start_pos}:${ev.char_interval_chunk.end_pos}` : null],
    ['char_interval_fullmd', ci ? `${ci.start_pos}:${ci.end_pos}` : null],
    ['page_idx', ev.page_idx],
    ['bbox_normalized', ev.bbox_normalized ? JSON.stringify(ev.bbox_normalized) : null],
    ['doc_id', result.doc_id],
  ].filter(([, v]) => v != null);
  const dl = el('dl', { class: 'kv dw-meta' });
  for (const [k, v] of rows) {
    dl.append(el('dt', { text: k }), el('dd', { text: String(v) }));
  }
  return dl;
}

function entityChip(name, type) {
  return el('span', {
    class: 'ent',
    style: { background: typeColor(type) },
    title: `${TYPE_LABEL[type] || type} · ${type}`,
    text: name,
  });
}

/** 单条三元组视图（抽屉主体） */
function tripleBody(result, triple, docId) {
  const ev = triple.evidence;
  const isNarrative = triple.provenance.path === 'narrative';
  const body = el('div', { class: 'dw-body' }, [
    el('div', { class: 'dw-triple' }, [
      entityChip(triple.head.name, triple.head.type),
      el('span', { class: 'pred', text: triple.predicate }),
      entityChip(triple.tail.name, triple.tail.type),
    ]),
  ]);
  if (isNarrative && ev.char_interval_fullmd) {
    body.append(el('blockquote', { class: 'dw-quote', text: ev.text_span }));
  } else {
    body.append(el('blockquote', {
      class: 'dw-quote',
      html: esc(ev.text_span) + ' <span class="muted" style="font-family:var(--sans);font-size:12px">（表格证据：以 bbox 定位原文）</span>',
    }));
  }
  body.append(metaKv(triple, result));

  const foot = el('div', { class: 'dw-foot' });
  if (docId) {
    if (isNarrative && ev.char_interval_fullmd) {
      foot.append(el('button', {
        class: 'btn small',
        text: '在原文中查看',
        onclick: () => {
          close();
          navigate(`/doc/${encodeURIComponent(docId)}/text`, {
            hl: `${ev.char_interval_fullmd.start_pos},${ev.char_interval_fullmd.end_pos}`,
            t: triple.triple_id,
          }); // push：可后退回图谱
        },
      }));
    } else {
      foot.append(el('button', {
        class: 'btn small',
        text: '查看表格证据',
        onclick: () => {
          close();
          navigate(`/doc/${encodeURIComponent(docId)}/text`, { t: triple.triple_id });
        },
      }));
    }
  }
  return { body, foot };
}

/** 实体模式：列出该实体全部关系（可逐条切换） */
function entityBody(result, entity, docId, currentTripleId) {
  const norm = entity.normalized_name;
  const rels = result.triples.filter((t) =>
    t.head.normalized_name === norm || t.tail.normalized_name === norm);
  const body = el('div', { class: 'dw-body' });
  if (!rels.length) {
    body.append(el('p', { class: 'muted', text: '该实体暂无关系三元组。' }));
    return { body, foot: el('div', { class: 'dw-foot' }) };
  }
  const list = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } });
  for (const t of rels) {
    const item = el('button', {
      class: 'cite-card',
      style: { borderLeft: '2px solid ' + (t.triple_id === currentTripleId ? 'var(--redline)' : 'var(--line)') },
      onclick: () => {
        // 同页 query 变化：replace 不污染历史；抽屉切换三元组
        navigate(`${location.hash.slice(1).split('?')[0]}`, { t: t.triple_id, n: undefined }, { replace: true });
      },
    }, [
      el('div', { class: 'c-span', text: t.evidence.text_span }),
      el('div', { class: 'c-meta' }, [
        el('span', { class: 'c-idx', text: t.triple_id }),
        el('span', { text: `${t.head.name} —${t.predicate}→ ${t.tail.name}` }),
      ]),
    ]);
    list.append(item);
  }
  body.append(el('p', { class: 'muted', style: { margin: '0 0 10px', fontSize: '13px' } },
    [`实体「${entity.name}」共 ${rels.length} 条关系，点击切换：`]), list);
  return { body, foot: el('div', { class: 'dw-foot' }) };
}

/**
 * 打开证据抽屉。
 * @param {object} o {result, docId, tripleId?, entityName?, onClose?, onSwitchTriple?}
 */
export function openEvidenceDrawer(o) {
  close();
  lastFocus = document.activeElement;
  onCloseCb = o.onClose || null;

  const result = o.result;
  const triple = o.tripleId ? result.triples.find((t) => t.triple_id === o.tripleId) : null;
  const entity = o.entityName
    ? result.entities.find((e) => e.normalized_name === o.entityName
      || e.name === o.entityName) : null;

  const head = el('h3', {});
  if (triple) {
    head.append(
      monoTag(triple.triple_id),
      pathTag(triple.provenance.path),
    );
  } else if (entity) {
    head.append(
      el('span', { text: '实体关系' }),
      entityChip(entity.name, entity.entity_type),
    );
  }

  const bodyWrap = triple ? tripleBody(result, triple, o.docId) : entityBody(result, entity, o.docId, o.tripleId);

  drawerEl = el('aside', {
    class: 'evidence-drawer',
    role: 'dialog',
    'aria-modal': 'false',
    'aria-label': triple ? `证据 ${triple.triple_id}` : `实体 ${entity ? entity.name : ''}`,
  }, [
    el('div', { class: 'dw-head' }, [
      head,
      el('button', {
        class: 'dw-close', 'aria-label': '关闭证据抽屉', title: '关闭 (Esc)',
        text: '✕',
        onclick: close,
      }),
    ]),
    bodyWrap.body,
    bodyWrap.foot,
  ]);
  document.body.classList.add('dw-open');
  document.getElementById('drawer-root').append(drawerEl);
  document.addEventListener('keydown', onKeydown);
  drawerEl.querySelector('.dw-close').focus();
}

export function closeEvidenceDrawer() {
  if (drawerEl) close();
}

export function drawerOpen() {
  return !!drawerEl;
}
