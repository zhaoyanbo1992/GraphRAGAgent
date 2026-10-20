/**
 * 前后端接口集成测试 —— 直接加载前端 live 适配层 (js/api/ragserver.js + client.js)
 * 对真实后端逐接口验证（与浏览器内完全同一条代码路径）。
 *
 * 前置: 后端已启动 (:8100, MINERU_MODE=mock)。
 * 运行: node frontend/tools/integration_test.mjs
 */
// ---- node 环境浏览器 shim (state.js 模块加载期访问 window/localStorage) ----
const lsStore = new Map();
globalThis.window = {
  location: { search: '', hash: '' },
  localStorage: {
    getItem: (k) => (lsStore.has(k) ? lsStore.get(k) : null),
    setItem: (k, v) => lsStore.set(k, String(v)),
    removeItem: (k) => lsStore.delete(k),
  },
  dispatchEvent: () => true,
  addEventListener: () => {},
  matchMedia: () => ({ matches: false }),
};
globalThis.localStorage = globalThis.window.localStorage;

const { default: live } = await import('../js/api/ragserver.js');
const { ApiError } = await import('../js/api/client.js');

let pass = 0, fail = 0;
const ok = (name) => { pass++; console.log('PASS ', name); };
const bad = (name, extra = '') => { fail++; console.log('FAIL ', name, extra); };
const assert = (cond, name, extra = '') => (cond ? ok(name) : bad(name, extra));

// ---- check1 health / config ----
const health = await live.health();
assert(health.status === 'ok' || health.status === 'degraded', 'GET /health', JSON.stringify(health.checks));
const config = await live.config();
assert(config.limits && config.formats, 'GET /config');

// ---- check2 上传（部分成功语义: 合法 pdf + 非法 exe）----
const pdf = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])], 'it_sample_report.pdf', { type: 'application/pdf' });
const exe = new File([new Uint8Array([0x4d, 0x5a])], 'virus.exe', { type: 'application/octet-stream' });
const up = await live.upload([pdf, exe]);
assert(up.accepted?.length === 1, 'POST /documents accepted=1', JSON.stringify(up.accepted));
assert(up.rejected?.some((r) => r.code === 'E_UPLOAD_UNSUPPORTED_FORMAT'), 'rejected 含 E_UPLOAD_UNSUPPORTED_FORMAT');
const { document_id: DOC, job_id: JOB } = up.accepted[0];
console.log(`   doc=${DOC} job=${JOB}`);

// ---- check3 任务状态机轮询至 done ----
let job = null;
for (let i = 0; i < 90; i++) {
  job = await live.getJob(JOB);
  if (['done', 'failed'].includes(job.status)) break;
  await new Promise((r) => setTimeout(r, 2000));
}
assert(job.status === 'done', 'GET /jobs/{id} -> done', `status=${job.status} err=${JSON.stringify(job.error)}`);
assert(job.steps.some((s) => s.name === 'kg' && s.detail?.n_triples > 0), 'steps[kg].detail.n_triples');
assert(job.document_id === DOC, 'job.document_id 回链');

// ---- check4 文档列表 / result ----
const docs = await live.listDocuments();
assert(docs.some((d) => d.document_id === DOC && d.status === 'done'), 'GET /documents 列表含新文档');
const result = await live.getResult(DOC);
assert(result._meta && result._meta.n_triples > 0, 'getResult 补齐 _meta');
const t1 = result.triples.find((t) => t.triple_id === 't_000001');
assert(!!t1, 'result.triples 含 t_000001');
assert(t1.evidence.char_interval_fullmd && result.full_md.slice(
  t1.evidence.char_interval_fullmd.start_pos, t1.evidence.char_interval_fullmd.end_pos,
) === t1.evidence.text_span, '溯源数学契约 full_md[interval]==text_span');

// ---- check5 QA SSE 流（完整事件序列 + 引用复核）----
const events = [];
await live.askStream(
  { question: 'Q3 的总收入是多少？同比增长了多少？', session_id: null, doc_ids: [DOC], include_evidence: true },
  { onEvent: (ev) => events.push(ev) });
const names = events.map((e) => e.event);
console.log('   events:', names.join(' '));
for (const e of ['session', 'status', 'tool_call', 'tool_result', 'answer_delta', 'citations', 'done']) {
  assert(names.includes(e), `SSE 含 ${e}`);
}
assert(names[0] === 'session', 'SSE 首事件为 session');
const answer = events.filter((e) => e.event === 'answer_delta').map((e) => e.data.delta).join('');
assert(answer.length > 0, 'answer_delta 拼接非空', answer.slice(0, 50));
const citations = events.find((e) => e.event === 'citations')?.data.citations || [];
assert(citations.length > 0, 'SSE citations 非空');
const triples = new Set(result.triples.map((t) => t.triple_id));
assert(citations.every((c) => triples.has(c.triple_id)), '引用复核: citations 全部 exists_in_kg');
const sid = events[0].data.session_id;

// ---- check6 会话 CRUD + latency_ms 字段对齐 ----
const sessions = await live.listSessions();
assert(sessions.some((s) => s.session_id === sid), 'GET /qa/sessions 含新会话');
const detail = await live.getSession(sid);
assert(detail.messages?.length >= 1, 'GET /qa/sessions/{id} 有消息');
assert(detail.messages[0].latency_ms !== undefined, 'MessageOut.latency_ms 字段对齐 spec');
await live.deleteSession(sid);
try { await live.getSession(sid); bad('DELETE /qa/sessions/{id} 后应 404'); }
catch (e) { assert(e instanceof ApiError && e.status === 404, 'DELETE 后 404 (ApiError)'); }

// ---- check7 错误路径 / 前置条件 ----
try { await live.getJob('j_not_exist'); bad('GET /jobs/not_exist 应 404'); }
catch (e) { assert(e instanceof ApiError && e.status === 404, 'GET /jobs/not_exist -> 404 ApiError'); }
try { await live.retryJob(JOB); bad('done 任务 retry 应 409'); }
catch (e) { assert(e.status === 409, 'done 任务 retry -> 409 E_JOB_NOT_RETRYABLE'); }
try { await live.askStream({ question: 'x', session_id: null, doc_ids: ['not_exist_doc'] }, { onEvent: () => {} }); bad('未知 doc 提问应 404'); }
catch (e) { assert(e.status === 404, '未知 doc 提问 -> 404 E_DOC_NOT_FOUND'); }

console.log(`\n=== integration summary: PASS=${pass} FAIL=${fail} ===`);
process.exit(fail ? 1 : 0);
