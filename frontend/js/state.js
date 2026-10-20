/**
 * 全局状态：数据源模式（mock/live）+ resultCache + 轻量订阅。
 * 模式优先级：URL ?api=live|mock > localStorage('gqa.api_mode') > mock。
 */

const LS_MODE = 'gqa.api_mode';
const LS_BASE = 'gqa.api_base';

function readUrlApi() {
  // 兼容 search（http://x/?api=live#/）与 hash query（#/?api=live）
  const fromSearch = new URLSearchParams(window.location.search).get('api');
  if (fromSearch) return fromSearch;
  const h = window.location.hash.replace(/^#/, '');
  const qi = h.indexOf('?');
  if (qi >= 0) return new URLSearchParams(h.slice(qi + 1)).get('api');
  return null;
}

let mode = (() => {
  const u = readUrlApi();
  if (u === 'live' || u === 'mock') return u;
  const ls = window.localStorage.getItem(LS_MODE);
  if (ls === 'live' || ls === 'mock') return ls;
  return 'live';  // 默认 live: 对接 rag_server (mock 仅作离线演示逃生口)
})();

export function apiMode() { return mode; }

export function setApiMode(next) {
  if (next !== 'live' && next !== 'mock') return;
  mode = next;
  try { window.localStorage.setItem(LS_MODE, next); } catch { /* ignore */ }
  resultCache.clear();  // 切换清缓存防串数据
  window.dispatchEvent(new CustomEvent('apimodechange', { detail: { mode } }));
}

export function apiBase() {
  return window.localStorage.getItem(LS_BASE) || 'http://127.0.0.1:8100';
}

export function setApiBase(url) {
  if (url) window.localStorage.setItem(LS_BASE, url.replace(/\/+$/, ''));
  else window.localStorage.removeItem(LS_BASE);
  resultCache.clear();
}

// ---------------- resultCache（三视图共享产物，互切零加载） ----------------
const resultCache = new Map();
const RESULT_TTL_MS = 5 * 60 * 1000;

export function cacheGet(docId) {
  const hit = resultCache.get(docId);
  if (!hit) return null;
  if (Date.now() - hit.at > RESULT_TTL_MS) { resultCache.delete(docId); return null; }
  return hit.data;
}

export function cachePut(docId, data) {
  resultCache.set(docId, { data, at: Date.now() });
}

export function cacheInvalidate(docId) {
  if (docId) resultCache.delete(docId);
  else resultCache.clear();
}

// ---------------- 本地文档卡列表（mock 模式下记录演示上传产物） ----------------
const LS_DOCS = 'gqa.local_docs';

export function localDocs() {
  try { return JSON.parse(window.localStorage.getItem(LS_DOCS) || '[]'); }
  catch { return []; }
}

export function saveLocalDocs(docs) {
  try { window.localStorage.setItem(LS_DOCS, JSON.stringify(docs)); } catch { /* ignore */ }
}
