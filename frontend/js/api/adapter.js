/**
 * 数据源适配层（统一契约分发）：视图零分支。
 *   views → adapter → { mock | ragserver(live) }
 * mock 上传文档复用实测产物演示；刷新后未终态任务标记 failed（对齐后端重启语义）。
 */
import { MOCK } from '../mock/data.js';
import * as jobs from '../mock/jobs.js';
import { replayStream } from '../mock/qa.js';
import live from './ragserver.js';
import { apiMode, localDocs, saveLocalDocs } from '../state.js';
import { ApiError } from './client.js';

const LS_SESSIONS = 'gqa.mock_sessions';

// ---------- mock 内部 ----------
const uploadSource = new Map(); // doc_id → 复用的实测产物 doc_id

function uuid8() { return Math.random().toString(16).slice(2, 10); }

function markInterruptedOnBoot() {
  const docs = localDocs();
  let dirty = false;
  for (const d of docs) {
    if (['queued', 'indexing'].includes(d.status)) {
      d.status = 'failed';
      d.error = { code: 'E_JOB_INTERRUPTED', message: '页面刷新中断了演示任务，可重试（断点续跑）' };
      dirty = true;
    }
  }
  if (dirty) saveLocalDocs(docs);
}
markInterruptedOnBoot();

function mockUpload(files, opts = {}) {
  const accepted = [];
  const rejected = [];
  for (const f of files) {
    const ext = '.' + (f.name.split('.').pop() || '').toLowerCase();
    if (f.size === 0) { rejected.push({ filename: f.name, code: 'E_UPLOAD_EMPTY_FILE', message: '空文件' }); continue; }
    if (ext === '.html' && opts.model_version && opts.model_version !== 'MinerU-HTML') {
      rejected.push({ filename: f.name, code: 'E_UPLOAD_MODEL_VERSION_CONFLICT', message: 'html 文件强制使用 MinerU-HTML 解析' });
      continue;
    }
    const docId = uuid8() + '_' + f.name.replace(/\.[^.]+$/, '');
    const src = MOCK.docs[0].document_id; // 复用 sample_report 产物演示
    uploadSource.set(docId, src);
    const sample = MOCK.results[src]._meta;
    const entry = {
      document_id: docId,
      original_filename: f.name,
      format: ext === '.pdf' ? 'pdf' : ext === '.html' ? 'html'
        : ['.png', '.jpg', '.jpeg', '.jp2', '.webp', '.gif', '.bmp'].includes(ext) ? 'image' : 'office',
      size_bytes: f.size,
      page_count: sample.page_count,
      status: 'indexing',
      n_chunks: null, n_entities: null, n_triples: null,
      created_at: new Date().toISOString(),
      indexed_at: null,
      error: null,
      _demo: true,
    };
    const docs = localDocs();
    docs.unshift(entry);
    saveLocalDocs(docs);
    const jobId = jobs.createJob(docId, f.name, {
      page_count: sample.page_count,
      n_chunks: sample.n_chunks,
      n_extractions: MOCK.results[src].extractions.length,
      n_entities: sample.n_entities,
      n_triples: sample.n_triples,
      n_narrative: MOCK.results[src].triples.filter((t) => t.provenance.path === 'narrative').length,
      n_table: MOCK.results[src].triples.filter((t) => t.provenance.path === 'table').length,
    }, {
      onDone: () => {
        const ds = localDocs();
        const hit = ds.find((x) => x.document_id === docId);
        if (hit) {
          hit.status = 'done';
          hit.n_chunks = sample.n_chunks;
          hit.n_entities = sample.n_entities;
          hit.n_triples = sample.n_triples;
          hit.indexed_at = new Date().toISOString();
          saveLocalDocs(ds);
        }
      },
    });
    accepted.push({
      document_id: docId, job_id: jobId, filename: f.name,
      format: entry.format, size_bytes: f.size,
      model_version: 'vlm', is_ocr: false, status: 'queued',
    });
  }
  return { accepted, rejected };
}

// ---------- mock 会话持久化 ----------
function mockSessions() {
  try { return JSON.parse(localStorage.getItem(LS_SESSIONS) || '[]'); }
  catch { return []; }
}
function saveMockSessions(s) {
  try { localStorage.setItem(LS_SESSIONS, JSON.stringify(s)); } catch { /* ignore */ }
}

// ---------- mock 实现 ----------
const mock = {
  mode: 'mock',

  async listDocuments() {
    return [...localDocs(), ...MOCK.docs];
  },

  upload: (files, opts) => mockUpload(files, opts),

  getJob: (id) => jobs.getJob(id),
  async cancelJob(id) { return jobs.cancelJob(id); },
  retryJob: (id) => jobs.retryJob(id),

  async getResult(docId) {
    if (MOCK.results[docId]) return MOCK.results[docId];
    const src = uploadSource.get(docId);
    if (src) {
      const base = MOCK.results[src];
      return { ...base, doc_id: docId, _demo: true };
    }
    const e = new Error('文档不存在'); e.code = 'E_DOC_NOT_FOUND'; throw e;
  },

  async deleteDocument(docId) {
    saveLocalDocs(localDocs().filter((d) => d.document_id !== docId));
    uploadSource.delete(docId);
  },

  async askStream(body, { signal, onEvent }) {
    const citations = { v: null };
    const answer = { v: '' };
    const session = { v: null };
    const enriched = (ev) => {
      if (ev.event === 'session') session.v = ev.data.session_id;
      if (ev.event === 'answer_delta') answer.v += ev.data.delta;
      if (ev.event === 'citations') citations.v = ev.data.citations;
      onEvent(ev);
    };
    await replayStream(body.question, { signal, onEvent: enriched });
    // 消息持久化到 mock 会话（PRD Q6a）
    if (session.v && !signal?.aborted) {
      const ss = mockSessions();
      let s = ss.find((x) => x.session_id === session.v);
      if (!s) {
        s = {
          session_id: session.v,
          title: body.question.slice(0, 30),
          created_at: new Date().toISOString(),
          last_message_at: new Date().toISOString(),
          message_count: 0,
          messages: [],
        };
        ss.unshift(s);
      }
      s.messages.push({
        message_id: 'm_' + uuid8(),
        question: body.question,
        answer: answer.v || null,
        citations: citations.v || [],
        doc_ids: body.doc_ids || null,
        mode: 'sse',
        latency_ms: null,
        error_code: null,
        created_at: new Date().toISOString(),
      });
      s.message_count = s.messages.length;
      s.last_message_at = new Date().toISOString();
      saveMockSessions(ss);
    }
  },

  async listSessions() {
    return [...mockSessions(), ...MOCK.sessions].map((s) => ({
      session_id: s.session_id,
      title: s.title,
      created_at: s.created_at,
      last_message_at: s.last_message_at,
      message_count: s.messages ? s.messages.length : s.message_count,
    }));
  },

  async getSession(id) {
    const all = [...mockSessions(), ...MOCK.sessions];
    const s = all.find((x) => x.session_id === id);
    if (!s) { const e = new Error('会话不存在'); e.code = 'E_QA_SESSION_NOT_FOUND'; throw e; }
    return { session_id: s.session_id, title: s.title, created_at: s.created_at, messages: s.messages || [] };
  },

  async deleteSession(id) {
    saveMockSessions(mockSessions().filter((s) => s.session_id !== id));
  },

  async health() { return MOCK.system.health; },
  async config() { return MOCK.system.config; },
};

function impl() {
  return apiMode() === 'live' ? live : mock;
}

// ---------- 统一契约（视图只 import 这个对象） ----------
export default {
  mode: () => apiMode(),

  listDocuments: (...a) => impl().listDocuments(...a),
  upload: (...a) => impl().upload(...a),
  getJob: (...a) => impl().getJob(...a),
  cancelJob: (...a) => impl().cancelJob(...a),
  retryJob: (...a) => impl().retryJob(...a),
  getResult: (...a) => impl().getResult(...a),
  deleteDocument: (...a) => impl().deleteDocument(...a),
  askStream: (...a) => impl().askStream(...a),
  listSessions: (...a) => impl().listSessions(...a),
  getSession: (...a) => impl().getSession(...a),
  deleteSession: (...a) => impl().deleteSession(...a),
  health: (...a) => impl().health(...a),
  config: (...a) => impl().config(...a),
};

export { ApiError };
