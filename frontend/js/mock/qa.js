/**
 * mock 问答：事件脚本回放（严格 backend spec §2.4 次序与字段）。
 * setTimeout 链按脚本 delay×(0.8~1.2) 抖动推送；abort 清全部 timer。
 * 命中演示问题 → s_demo01 脚本（5 张引用卡）；其他问题 → 引用空态脚本（Q6d）。
 */
import { MOCK } from './data.js';

const DEMO_Q = MOCK.sessions[0].messages[0].question;

// delay(ms) × 抖动
const jit = (ms) => Math.round(ms * (0.8 + Math.random() * 0.4));

/** 由 s_demo01 消息构造完整事件脚本 */
function demoScript(msg) {
  const c = msg.citations;
  const narr = c.filter((x) => x.char_interval_fullmd);
  const tab = c.filter((x) => !x.char_interval_fullmd && x.bbox_normalized);
  return [
    { ev: 'session', d: 150, data: { session_id: MOCK.sessions[0].session_id, message_id: msg.message_id } },
    { ev: 'status', d: 350, data: { stage: 'retrieval', node: 'generate_query_or_respond', attempt: 1 } },
    { ev: 'tool_call', d: 300, data: { call_id: 'call_1', name: 'kg_entity_lookup', args: { name: '核心组件' } } },
    { ev: 'tool_result', d: 420, data: { call_id: 'call_1', name: 'kg_entity_lookup', ok: true, summary: 'matched: graphrag_system, document_processor', elapsed_ms: 14 } },
    { ev: 'status', d: 300, data: { stage: 'retrieval', node: 'tools', attempt: 1 } },
    { ev: 'tool_call', d: 350, data: { call_id: 'call_2', name: 'kg_expand', args: { normalized_names: ['document_processor', 'entity_extractor'], hops: 1 } } },
    { ev: 'tool_result', d: 500, data: { call_id: 'call_2', name: 'kg_expand', ok: true, summary: `expanded: ${c.length} triples`, elapsed_ms: 9 } },
    { ev: 'tool_call', d: 320, data: { call_id: 'call_3', name: 'fetch_evidence_text', args: { triple_ids: c.map((x) => x.triple_id) } } },
    { ev: 'tool_result', d: 600, data: { call_id: 'call_3', name: 'fetch_evidence_text', ok: true, summary: `verified: ${c.length}/${c.length} evidence grounded`, elapsed_ms: 21 } },
    { ev: 'status', d: 350, data: { stage: 'grading', node: 'grade_documents', detail: 'grade→yes' } },
    { ev: 'status', d: 300, data: { stage: 'answering', node: 'generate_answer', attempt: 1 } },
    { ev: 'answer_delta', d: 300, data: { delta: msg.answer.slice(0, 28) } },
    { ev: 'answer_delta', d: 260, data: { delta: msg.answer.slice(28, 66) } },
    { ev: 'answer_delta', d: 280, data: { delta: msg.answer.slice(66) } },
    { ev: 'citations', d: 420, data: { citations: c } },
    {
      ev: 'done', d: 260, data: {
        message_id: msg.message_id, finish_reason: 'stop',
        latency_ms: msg.latency_ms,
        _narr: narr.length, _tab: tab.length,
      },
    },
  ];
}

/** 空引用脚本：mock 对未命中问题如实返回"上下文不足"（Q6d，不虚构引用） */
function emptyScript(question) {
  const answer = '当前知识库中没有检索到与该问题相关的事实，无法给出有依据的回答。'
    + '你可以尝试上传包含相关内容的文档，或换一种问法（例如围绕文档中的数值、'
    + '实体关系提问）。';
  return [
    { ev: 'session', d: 150, data: { session_id: 's_' + Math.random().toString(16).slice(2, 10), message_id: 'm_' + Math.random().toString(16).slice(2, 10) } },
    { ev: 'status', d: 400, data: { stage: 'retrieval', node: 'generate_query_or_respond', attempt: 1 } },
    { ev: 'tool_call', d: 350, data: { call_id: 'call_1', name: 'kg_entity_lookup', args: { name: question.slice(0, 12) } } },
    { ev: 'tool_result', d: 450, data: { call_id: 'call_1', name: 'kg_entity_lookup', ok: true, summary: 'matched: （无）', elapsed_ms: 8 } },
    { ev: 'status', d: 300, data: { stage: 'grading', node: 'grade_documents', detail: 'grade→no' } },
    { ev: 'status', d: 300, data: { stage: 'answering', node: 'generate_answer', attempt: 1 } },
    { ev: 'answer_delta', d: 320, data: { delta: answer } },
    { ev: 'citations', d: 260, data: { citations: [] } },
    { ev: 'done', d: 220, data: { message_id: 'm_mock', finish_reason: 'stop', latency_ms: { total: 2380, retrieval: 1650, answer: 730 } } },
  ];
}

/**
 * 回放事件流。onEvent({event, data})；signal.abort 后停止并清空 timer。
 * 返回 Promise（done/error 事件后 resolve）。
 */
export function replayStream(question, { signal, onEvent }) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) { resolve(); return; }
    const msg = MOCK.sessions[0].messages[0];
    const script = question.trim() === DEMO_Q ? demoScript(msg) : emptyScript(question);
    const timers = [];
    let acc = 0;
    for (const s of script) {
      acc += jit(s.d);
      timers.push(setTimeout(() => {
        if (signal && signal.aborted) return;
        try { onEvent({ event: s.ev, data: s.data }); }
        catch (e) { console.error('[mock/qa] onEvent error', e); }
        if (s.ev === 'done' || s.ev === 'error') resolve();
      }, acc));
    }
    const onAbort = () => {
      for (const t of timers) clearTimeout(t);
      resolve();
    };
    if (signal) {
      if (signal.aborted) { resolve(); return; }
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

export const demoQuestion = DEMO_Q;
