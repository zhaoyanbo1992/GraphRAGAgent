/**
 * P4 有据问答：左会话栏 260px + 右对话区（滚动消息流 + 底部输入条）。
 * SSE 事件 → UI 映射（backend spec §2.4 / PRD §4.2 逐字对齐）：
 * session/status/tool_call/tool_result/answer_delta/citations/done/error/ping。
 * 串行提问；AbortController 贯穿；Esc 停流（焦点在输入框时除外）。
 */
import adapter, { ApiError } from '../api/adapter.js';
import { demoQuestion } from '../mock/qa.js';
import { el, fmtMs, fmtTime, skeleton, emptyState, errCard, toast } from '../ui/components.js';
import { onTeardown, navigate } from '../router.js';

const Q_MAX = 2000;
const STAGE_LABEL = { retrieval: '检索', grading: '核验', answering: '作答' };

// ---------------- 消息渲染 ----------------

function citationCard(c, idx) {
  const ci = c.char_interval_fullmd;
  const clickable = c.doc_id && (ci || c.source === 'table_body' || (c.source || '').startsWith('table'));
  const metaBits = [
    c.triple_id,
    ci ? `full.md[${ci.start_pos}:${ci.end_pos}]` : (c.bbox_normalized ? `bbox[${JSON.stringify(c.bbox_normalized)}]` : c.source),
    c.page_idx != null ? `p${c.page_idx}` : null,
  ].filter(Boolean).join(' · ');

  const card = el('button', {
    class: 'cite-card',
    disabled: clickable ? null : 'true',
    title: c.doc_id ? '跳到原文高亮' : '引用跨文档未消歧，无法跳转',
    'aria-label': `引用 [${idx}] ${c.triple_id}`,
  }, [
    el('div', { class: 'c-span' }, [
      el('span', { class: 'c-idx', text: `[${idx}]` }),
      document.createTextNode(c.text_span),
    ]),
    el('div', { class: 'c-meta', text: metaBits + (clickable ? '' : '  ·  引用跨文档未消歧') }),
  ]);
  if (clickable) {
    card.addEventListener('click', () => {
      if (ci) navigate(`/doc/${encodeURIComponent(c.doc_id)}/text`, { hl: `${ci.start_pos},${ci.end_pos}`, t: c.triple_id });
      else navigate(`/doc/${encodeURIComponent(c.doc_id)}/text`, { t: c.triple_id });
    });
  }
  return card;
}

function citationsBlock(citations) {
  const box = el('div', { class: 'citations' });
  if (!citations || !citations.length) {
    box.append(el('div', { class: 'cite-empty', text: '无引用：当前知识库中未检索到可支撑该回答的事实（上下文不足，不虚构引用）。' }));
    return box;
  }
  box.append(el('h4', { text: `引用（${citations.length}）` }));
  citations.forEach((c, i) => box.append(citationCard(c, i + 1)));
  return box;
}

function traceArea() {
  const details = el('details', { class: 'trace' }, [
    el('summary', {}, [el('span', { class: 't-title', text: '检索轨迹' })]),
    el('div', { class: 't-body' }),
  ]);
  const body = details.querySelector('.t-body');
  const itemsByCall = new Map();

  function stage(d) {
    body.append(el('div', { class: 't-stage current', text: `${STAGE_LABEL[d.stage] || d.stage} · ${d.node}${d.attempt ? ` · 第${d.attempt}次` : ''}${d.detail ? ` · ${d.detail}` : ''}` }));
    details.open = true;
  }
  function toolCall(d) {
    const item = el('div', { class: 't-item current', text: `⚙ ${d.name}(${JSON.stringify(d.args || {})})` });
    itemsByCall.set(d.call_id, item);
    body.append(item);
    details.open = true;
  }
  function toolResult(d) {
    const item = itemsByCall.get(d.call_id);
    if (!item) return;
    item.classList.remove('current');
    item.append(
      document.createTextNode(' '),
      el('span', { class: d.ok ? 't-ok' : 't-fail', text: d.ok ? '✓' : '✗' }),
      document.createTextNode(` ${d.summary || ''}`),
      el('span', { class: 't-ms', text: ` ${fmtMs(d.elapsed_ms)}` }),
    );
  }
  function finishStages() {
    for (const n of body.querySelectorAll('.current')) n.classList.remove('current');
  }
  return { node: details, stage, toolCall, toolResult, finishStages };
}

/** 一条回答消息容器（流式 / 回放共用） */
function answerMessage() {
  const trace = traceArea();
  const text = el('div', { class: 'a-text', 'aria-live': 'polite' });
  const box = el('div', { class: 'qa-msg msg-answer' }, [
    el('div', { class: 'm-role', text: '审计台回答' }),
    el('div', { class: 'bubble' }, [text, trace.node]),
  ]);
  return {
    node: box, trace, text,
    appendDelta(d) { text.append(document.createTextNode(d)); },
    addCitations(cs) { box.append(citationsBlock(cs)); },
    addLatency(l) {
      if (!l) return;
      box.append(el('div', { class: 'latency-line', text: `耗时 总 ${fmtMs(l.total)} ｜ 检索 ${fmtMs(l.retrieval)} ｜ 作答 ${fmtMs(l.answer)}` }));
    },
    addInterrupted() { box.append(el('div', { class: 'msg-interrupted', text: '已中断。' })); },
    addError(code, message, retryable, onRetry) {
      const actions = retryable && onRetry
        ? [el('button', { class: 'btn danger small', text: '重试', onclick: onRetry })]
        : [];
      box.append(errCard({ code, message, actions }));
    },
    finish() { trace.finishStages(); },
  };
}

// ---------------- 主视图 ----------------

export default async function qaView(root, { params }) {
  let sessionId = params.sessionId || null;
  let abortCtrl = null;
  let streaming = false;
  let lastQuestion = null;

  onTeardown(() => { if (abortCtrl) abortCtrl.abort(); });

  // ---- 会话栏 ----
  const sessList = el('div', { class: 's-list', 'aria-label': '历史会话' });
  const sessBar = el('aside', { class: 'qa-sessions' }, [
    el('a', { class: 'btn ghost small', href: '#/qa', text: '＋ 新会话', style: { textAlign: 'center' } }),
    sessList,
  ]);

  async function loadSessions() {
    try {
      const sessions = await adapter.listSessions();
      sessList.replaceChildren();
      for (const s of sessions) {
        const item = el('div', { class: 's-item-wrap', style: { position: 'relative' } }, [
          el('a', {
            class: 's-item',
            href: '#/qa/' + encodeURIComponent(s.session_id),
            'aria-current': s.session_id === sessionId ? 'page' : null,
          }, [
            el('button', {
              class: 's-del', 'aria-label': '删除会话', title: '删除会话', text: '✕',
              onclick: async (e) => {
                e.preventDefault(); e.stopPropagation();
                try {
                  await adapter.deleteSession(s.session_id);
                  if (s.session_id === sessionId) navigate('/qa', null, { replace: true });
                  loadSessions();
                } catch (err) { toast(err.message, 'err'); }
              },
            }),
            el('div', { class: 's-title', text: s.title || '(无标题)' }),
            el('div', { class: 's-meta', text: `${s.message_count} 问 · ${fmtTime(s.last_message_at)}` }),
          ]),
        ]);
        sessList.append(item);
      }
      if (!sessions.length) sessList.append(el('p', { class: 'muted', style: { fontSize: '12px', padding: '8px 12px' }, text: '暂无历史会话' }));
    } catch (e) {
      sessList.replaceChildren(el('p', { class: 'muted', style: { fontSize: '12px' }, text: '会话列表加载失败' }));
    }
  }
  await loadSessions();

  // ---- 对话区 ----
  const scroll = el('div', { class: 'qa-scroll' });
  const textarea = el('textarea', {
    placeholder: '输入问题，Enter 发送（Shift+Enter 换行）',
    'aria-label': '问题输入框', maxlength: String(Q_MAX), rows: 1,
  });
  const counter = el('span', { class: 'qa-counter', text: `0/${Q_MAX}` });
  const sendBtn = el('button', { class: 'btn', text: '发送', 'aria-label': '发送问题' });
  const inputBar = el('div', { class: 'qa-inputbar' }, [
    el('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' } }, [
      textarea, el('div', { style: { textAlign: 'right', display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' } }, [counter, el('span', { class: 'tag', title: '当前后端为单问单答（use_history 恒 false），会话仅记录与回放', text: '多轮上下文 · 未开发' })]),
    ]),
    sendBtn,
  ]);
  const main = el('section', { class: 'qa-main', 'aria-label': '对话区' }, [scroll, inputBar]);
  root.append(el('div', { class: 'qa-layout' }, [sessBar, main]));

  // 滚动跟随
  let follow = true;
  scroll.addEventListener('scroll', () => {
    follow = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 60;
    jumpBtn.hidden = follow;
  });
  const jumpBtn = el('button', { class: 'qa-scroll-jump', text: '↓ 回到底部', hidden: true, onclick: () => { follow = true; toBottom(); } });
  main.append(jumpBtn);
  const toBottom = () => { if (follow) scroll.scrollTop = scroll.scrollHeight; };

  function setStreaming(on) {
    streaming = on;
    textarea.disabled = on;
    sendBtn.textContent = on ? '停止' : '发送';
    sendBtn.classList.toggle('danger', on);
    counter.textContent = `${textarea.value.length}/${Q_MAX}`;
  }

  // ---- 会话回放 / 空态 ----
  async function replaySession() {
    scroll.replaceChildren();
    if (!sessionId) {
      scroll.append(emptyState({
        title: '围绕已索引的文档提问',
        desc: '每条回答都附带知识图谱引用，点击即可跳回原文高亮。',
        action: el('button', {
          class: 'btn ghost', text: '试试示例问题',
          onclick: () => { textarea.value = demoQuestion; textarea.focus(); counter.textContent = `${textarea.value.length}/${Q_MAX}`; },
        }),
      }));
      return;
    }
    scroll.replaceChildren(skeleton(4));
    try {
      const s = await adapter.getSession(sessionId);
      scroll.replaceChildren();
      if (!s.messages.length) scroll.append(emptyState({ title: '会话为空', desc: '输入第一个问题开始。' }));
      for (const m of s.messages) {
        scroll.append(userMsgNode(m.question));
        const am = answerMessage();
        am.appendDelta(m.answer || '（无回答）');
        am.addCitations(m.citations);
        am.addLatency(m.latency_ms);
        if (m.error_code) am.addError(m.error_code, '该轮问答失败', false, null);
        am.finish();
        scroll.append(am.node);
      }
    } catch (e) {
      scroll.replaceChildren(errCard({ code: e.code, message: e.message, details: e.details }));
    }
  }

  function userMsgNode(q) {
    return el('div', { class: 'qa-msg msg-user' }, [
      el('div', { class: 'bubble', text: q }),
    ]);
  }

  // ---- 发送 / 停止 ----
  async function ask() {
    if (streaming) { // 停止
      if (abortCtrl) abortCtrl.abort();
      return;
    }
    const q = textarea.value.trim();
    if (!q) { toast('问题不能为空', 'err'); return; }
    if (q.length > Q_MAX) { toast(`问题超过 ${Q_MAX} 字符上限`, 'err'); return; }

    lastQuestion = q;
    textarea.value = '';
    counter.textContent = `0/${Q_MAX}`;
    setStreaming(true);
    if (scroll.querySelector('.empty')) scroll.replaceChildren();
    scroll.append(userMsgNode(q));
    const am = answerMessage();
    scroll.append(am.node);
    follow = true; toBottom();

    abortCtrl = new AbortController();
    let citationCount = 0;
    let errored = false;
    try {
      await adapter.askStream(
        { question: q, session_id: sessionId, doc_ids: null, include_evidence: true },
        {
          signal: abortCtrl.signal,
          onEvent: ({ event, data }) => {
            switch (event) {
              case 'session':
                // 会话建立：静默更新本地 sessionId 与地址栏（replaceState 不触发
                // hashchange 重渲染 —— 若走 navigate 会在流中途 teardown 并 abort
                // 正在进行的 SSE，新会话首问必失败即此根因）
                if (!sessionId) {
                  sessionId = data.session_id;
                  history.replaceState(null, '', '#/qa/' + encodeURIComponent(sessionId));
                }
                am.node.dataset.mid = data.message_id || '';
                break;
              case 'status': am.trace.stage(data); break;
              case 'tool_call': am.trace.toolCall(data); break;
              case 'tool_result': am.trace.toolResult(data); break;
              case 'answer_delta': am.appendDelta(data.delta); break;
              case 'citations': citationCount = (data.citations || []).length; am.addCitations(data.citations); break;
              case 'done':
                am.addLatency(data.latency_ms);
                am.finish();
                break;
              case 'error':
                errored = true;
                am.addError(data.code, data.message, data.retryable, () => {
                  textarea.value = lastQuestion;
                  ask();
                });
                break;
              case 'ping': default: break;
            }
            toBottom();
          },
        },
      );
    } catch (e) {
      if (e instanceof ApiError || (e && e.code)) {
        am.addError(e.code, e.message, e.status >= 500, () => { textarea.value = lastQuestion; ask(); });
      } else {
        am.addError('E_STREAM', '回答流异常中断', false, null);
      }
    }
    if (abortCtrl.signal.aborted) am.addInterrupted();
    am.finish();
    setStreaming(false);
    abortCtrl = null;
    loadSessions();
    if (!errored && !citationCount && !am.text.textContent) {
      am.appendDelta('（无回答内容）');
    }
  }

  sendBtn.addEventListener('click', ask);
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); }
    e.stopPropagation(); // Esc 停流的非输入焦点约束：输入框内 Esc 不触发停流
  });
  textarea.addEventListener('input', () => { counter.textContent = `${textarea.value.length}/${Q_MAX}`; });
  document.addEventListener('keydown', escHandler);
  function escHandler(e) {
    if (e.key === 'Escape' && streaming && document.activeElement !== textarea) {
      if (abortCtrl) abortCtrl.abort();
    }
  }
  onTeardown(() => document.removeEventListener('keydown', escHandler));

  await replaySession();
  return {
    destroy() {
      document.removeEventListener('keydown', escHandler);
      if (abortCtrl) abortCtrl.abort();
    },
  };
}
