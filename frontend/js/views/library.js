/**
 * P1 文档库（首页）：上传区置顶 + rejected 红批注行 + 文档卡栅格。
 * 客户端预校验（PRD S1）：白名单 / 非空 / ≤200MB / ≤10 个；不合法文件不上传。
 */
import adapter from '../api/adapter.js';
import { el, fmtBytes, fmtNum, fmtTime, stDot, DOC_ST_LABEL, skeleton, emptyState, errCard, toast } from '../ui/components.js';

const MAX_FILE = 200 * 1024 * 1024;
const MAX_FILES = 10;
const WHITELIST = [
  ['.pdf', 'pdf'],
  ['.png', 'image'], ['.jpg', 'image'], ['.jpeg', 'image'], ['.jp2', 'image'],
  ['.webp', 'image'], ['.gif', 'image'], ['.bmp', 'image'],
  ['.doc', 'office'], ['.docx', 'office'], ['.ppt', 'office'], ['.pptx', 'office'],
  ['.html', 'html'],
];
const FORMAT_LABEL = { pdf: 'pdf', image: '图片', office: 'office', html: 'html' };

function validate(files) {
  const ok = [];
  const rejected = [];
  for (const f of files) {
    const ext = '.' + (f.name.split('.').pop() || '').toLowerCase();
    const hit = WHITELIST.find(([e]) => e === ext);
    if (f.size === 0) rejected.push({ file: f, code: 'E_UPLOAD_EMPTY_FILE', message: '空文件' });
    else if (!hit) rejected.push({ file: f, code: 'E_UPLOAD_UNSUPPORTED_FORMAT', message: '不支持的文件格式: ' + ext });
    else if (f.size > MAX_FILE) rejected.push({ file: f, code: 'E_UPLOAD_TOO_LARGE', message: '文件超过 200MB 上限' });
    else ok.push(f);
  }
  if (files.length > MAX_FILES) {
    rejected.unshift({ file: null, code: 'E_UPLOAD_TOO_MANY_FILES', message: `单批最多 ${MAX_FILES} 个文件` });
    ok.length = 0;
  }
  return { ok, rejected };
}

function renderRejected(container, rejected) {
  container.replaceChildren();
  if (!rejected.length) return;
  const ul = el('ul', { class: 'rejected-list', role: 'alert' });
  for (const r of rejected) {
    ul.append(el('li', {}, [
      r.file ? el('span', { class: 'fname', text: r.file.name }) : el('span', { class: 'fname', text: '（本批次）' }),
      el('span', { class: 'tag err mono', text: r.code }),
      el('span', { text: r.message }),
    ]));
  }
  container.append(ul);
}

function uploadZone(onFiles) {
  const input = el('input', { type: 'file', multiple: true, 'aria-label': '选择要上传的文档' });
  const zone = el('div', {
    class: 'upload-zone',
    onclick: () => input.click(),
    onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } },
    role: 'button', tabindex: '0',
    'aria-label': '拖拽或点击上传文档，支持 pdf、图片、office、html',
  }, [
    el('h3', { text: '拖入文档，开始建索引' }),
    el('p', { text: '支持 pdf / 图片 / doc / docx / ppt / pptx / html，单文件 ≤200MB，单批 ≤10 个' }),
    el('button', { class: 'btn', type: 'button', text: '选择文件', onclick: (e) => { e.stopPropagation(); input.click(); } }),
    input,
  ]);
  input.addEventListener('change', () => { if (input.files.length) onFiles([...input.files]); input.value = ''; });
  for (const [ev, on] of [['dragover', true], ['dragleave', false], ['drop', false]]) {
    zone.addEventListener(ev, (e) => {
      e.preventDefault();
      zone.classList.toggle('drag', on);
      if (ev === 'drop' && e.dataTransfer?.files?.length) onFiles([...e.dataTransfer.files]);
    });
  }
  return zone;
}

function docCard(d, demo) {
  const st = d.status;
  const card = el('a', { class: 'card hoverable doc-card' + (demo ? ' is-demo' : ''), href: `#/doc/${encodeURIComponent(d.document_id)}/graph` }, [
    el('div', { class: 'd-name' }, [
      stDot(st === 'indexing' ? 'indexing' : st),
      el('span', { class: 'fn', text: d.original_filename }),
      demo ? el('span', { class: 'tag', title: '演示：复用实测产物', text: 'demo' }) : null,
    ]),
    el('div', { class: 'd-row' }, [
      el('span', { class: 'tag', text: FORMAT_LABEL[d.format] || d.format }),
      el('span', { class: 'muted', style: { fontSize: '12px' }, text: `${fmtBytes(d.size_bytes)}${d.page_count != null ? ' · ' + d.page_count + ' 页' : ''}` }),
      st !== 'done' ? el('span', { class: 'tag mono' + (st === 'failed' ? ' err' : ''), text: DOC_ST_LABEL[st] || st }) : null,
    ]),
    el('div', { class: 'd-stats' }, [
      el('span', {}, [el('b', { text: fmtNum(d.n_chunks) }), ' 块']),
      el('span', {}, [el('b', { text: fmtNum(d.n_entities) }), ' 实体']),
      el('span', {}, [el('b', { text: fmtNum(d.n_triples) }), ' 三元组']),
    ]),
    el('div', { class: 'd-time', text: d.indexed_at ? '索引于 ' + fmtTime(d.indexed_at) : '上传于 ' + fmtTime(d.created_at) }),
  ]);
  if (st === 'failed') {
    card.append(el('div', { class: 'tag err mono', text: d.error?.code || 'E_FAILED' }));
  }
  return card;
}

export default async function libraryView(root) {
  root.append(
    el('div', { class: 'page-head-row' }, [
      el('h1', { class: 'page-title', text: '文档库' }),
    ]),
    el('p', { class: 'page-desc', text: '上传文档自动完成「解析 → 分块 → 抽取 → 图谱构建」，完成后即可有据提问。' }),
  );

  const rejectedBox = el('div', {});
  let uploading = false;

  async function handleFiles(files) {
    if (uploading) return;
    const { ok, rejected } = validate(files);
    renderRejected(rejectedBox, rejected);
    if (!ok.length) return;
    uploading = true;
    const btn = root.querySelector('.upload-zone .btn');
    btn.disabled = true;
    btn.textContent = '提交中…';
    try {
      const res = await adapter.upload(ok);
      if (res.rejected?.length) {
        renderRejected(rejectedBox, res.rejected.map((r) => ({ file: r.filename ? { name: r.filename } : null, code: r.code, message: r.message })));
      }
      if (res.accepted?.length) {
        try { sessionStorage.setItem('gqa.last_batch', JSON.stringify(res.accepted.map((a) => ({ job_id: a.job_id, document_id: a.document_id, filename: a.filename })))); } catch { /* ignore */ }
        window.location.hash = `#/pipeline/${encodeURIComponent(res.accepted[0].job_id)}`;
        return;
      }
    } catch (e) {
      root.append(errCard({ code: e.code, message: e.message, details: e.details }));
    } finally {
      uploading = false;
      if (btn) { btn.disabled = false; btn.textContent = '选择文件'; }
    }
  }

  root.append(uploadZone(handleFiles), rejectedBox);

  const gridWrap = el('div', {});
  root.append(gridWrap);

  async function loadDocs() {
    gridWrap.replaceChildren(skeleton(4));
    try {
      const docs = await adapter.listDocuments();
      const live = adapter.mode() === 'live';
      gridWrap.replaceChildren();
      if (!docs.length) {
        gridWrap.append(emptyState({
          title: '还没有文档',
          desc: '上传第一份文档，索引完成后即可围绕它提问。',
        }));
        return;
      }
      const grid = el('div', { class: 'doc-grid' });
      for (const d of docs) grid.append(docCard(d, !live));
      gridWrap.append(grid);
    } catch (e) {
      gridWrap.replaceChildren(errCard({
        code: e.code || 'E_NETWORK', message: e.message || '文档列表加载失败',
        details: e.details, actions: [el('button', { class: 'btn ghost small', text: '重试', onclick: loadDocs })],
      }));
    }
  }
  await loadDocs();

  return { destroy() { /* 无轮询 */ } };
}
