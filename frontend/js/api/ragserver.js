/**
 * live 适配：/api/v1 直连（backend spec §2），rag_server 就绪后零改动联调。
 */
import { apiBase } from '../state.js';
import { fetchJSON, postSSE, ApiError } from './client.js';

const B = () => apiBase();

function withMeta(result) {
  // live /result 无 _meta：按 mock 契约补齐，视图层零分支
  if (!result || result._meta) return result;
  result._meta = {
    page_count: result.chunks?.flatMap((c) => c.blocks || [])
      .reduce((m, b) => Math.max(m, (b.page_idx ?? -1) + 1), 0) ?? null,
    n_chunks: result.chunks?.length ?? 0,
    n_entities: result.entities?.length ?? 0,
    n_triples: result.triples?.length ?? 0,
  };
  return result;
}

export default {
  mode: 'live',

  async listDocuments({ q = '', status = '', page = 1, page_size = 50 } = {}) {
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (status) qs.set('status', status);
    qs.set('page', page); qs.set('page_size', page_size);
    const out = await fetchJSON(B(), '/api/v1/documents?' + qs);
    return out.items || [];
  },

  async upload(files, opts = {}) {
    const fd = new FormData();
    for (const f of files) fd.append('files', f, f.name);
    if (opts.is_ocr != null) fd.append('is_ocr', String(opts.is_ocr));
    if (opts.model_version) fd.append('model_version', opts.model_version);
    if (opts.max_chunk_chars) fd.append('max_chunk_chars', String(opts.max_chunk_chars));
    return fetchJSON(B(), '/api/v1/documents', { method: 'POST', body: fd });
  },

  getJob: (id) => fetchJSON(B(), `/api/v1/jobs/${encodeURIComponent(id)}`),
  listJobs: (params = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
    return fetchJSON(B(), '/api/v1/jobs?' + qs);
  },
  cancelJob: (id) => fetchJSON(B(), `/api/v1/jobs/${encodeURIComponent(id)}/cancel`, { method: 'POST' }),
  retryJob: (id) => fetchJSON(B(), `/api/v1/jobs/${encodeURIComponent(id)}/retry`, { method: 'POST' }),

  async getResult(docId) {
    const r = await fetchJSON(B(), `/api/v1/documents/${encodeURIComponent(docId)}/result`);
    return withMeta(r);
  },

  deleteDocument: (id) => fetchJSON(B(), `/api/v1/documents/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  askStream(body, { signal, onEvent }) {
    return postSSE(B(), '/api/v1/qa/ask/stream', body, { signal, onEvent });
  },

  async listSessions({ page = 1, page_size = 50 } = {}) {
    const out = await fetchJSON(B(), `/api/v1/qa/sessions?page=${page}&page_size=${page_size}`);
    return out.items || [];
  },
  getSession: (id) => fetchJSON(B(), `/api/v1/qa/sessions/${encodeURIComponent(id)}`),
  deleteSession: (id) => fetchJSON(B(), `/api/v1/qa/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  health: () => fetchJSON(B(), '/api/v1/health'),
  config: () => fetchJSON(B(), '/api/v1/config'),
};

export { ApiError };
