/**
 * P2 索引流水线：8 态横向步骤条 + 细进度条 + 等宽计时器；
 * 轮询 1.5s×10 → 3s，总超时 30min，连续失败 ≥3 出黄条；
 * done 2.5s 自动跳详情（可"留在此页"；批次内还有任务在跑时不自动跳）；
 * failed → 红批注错误卡 + 重试（断点续跑）；queued/parsing 可取消。
 */
import adapter from '../api/adapter.js';
import { el, fmtClock, stDot, JOB_ST_LABEL, skeleton, errCard, warnBar, monoTag } from '../ui/components.js';
import { onTeardown } from '../router.js';

const STEP_LABEL = { parse: '解析', chunk: '分块', extract: '抽取', kg: '图谱', done: '完成' };

function stepsBar(job) {
  const seq = ['parse', 'chunk', 'extract', 'kg'];
  const statusByName = new Map((job.steps || []).map((s) => [s.name, s.status]));
  const doneAll = job.status === 'done';
  const wrap = el('div', { class: 'steps', role: 'list', 'aria-label': '索引流水线阶段' });

  const items = seq.map((name) => {
    let st = statusByName.get(name) || 'pending';
    if (doneAll) st = 'done';
    return { name, st };
  });
  if (doneAll) items.push({ name: 'done', st: 'done' });
  else if (job.status === 'failed') items.push({ name: 'done', st: 'failed' });
  else if (job.status !== 'canceled') items.push({ name: 'done', st: 'pending' });

  items.forEach(({ name, st }, i) => {
    const cls = st === 'done' ? 'done' : st === 'running' ? 'running current' : st === 'failed' ? 'failed' : '';
    const node = el('div', { class: 'step ' + cls, role: 'listitem' }, [
      el('div', { class: 'node', 'aria-hidden': 'true' },
        [document.createTextNode(st === 'done' ? '✓' : st === 'failed' ? '✗' : String(i + 1))]),
      el('span', { class: 's-name', text: STEP_LABEL[name] || name }),
    ]);
    if (st === 'running') node.setAttribute('aria-current', 'step');
    wrap.append(node);
  });
  return wrap;
}

function progressTrack(job) {
  const cls = job.status === 'done' ? 'done' : job.status === 'failed' ? 'failed' : '';
  return el('div', { class: 'progress-track', role: 'progressbar', 'aria-valuenow': job.progress, 'aria-valuemin': 0, 'aria-valuemax': 100 }, [
    el('div', { class: 'progress-fill ' + cls, style: { width: Math.max(job.progress, 2) + '%' } }),
  ]);
}

function stageCards(job) {
  const steps = (job.steps || []).filter((s) => s.status !== 'pending');
  if (!steps.length) return null;
  const wrap = el('div', { class: 'pipe-detail' });
  for (const s of steps) {
    const dl = el('dl', { class: 'kv' });
    let has = false;
    for (const [k, v] of Object.entries(s.detail || {})) {
      has = true;
      dl.append(el('dt', { text: k }), el('dd', { text: typeof v === 'object' ? JSON.stringify(v) : String(v) }));
    }
    if (s.elapsed_ms != null) {
      dl.append(el('dt', { text: 'elapsed_ms' }), el('dd', { text: String(s.elapsed_ms) }));
    }
    wrap.append(el('div', { class: 'card pad pipe-stage' }, [
      el('h4', {}, [stDot(s.status === 'running' ? 'running' : s.status), el('span', { text: STEP_LABEL[s.name] || s.name })]),
      has ? dl : el('p', { class: 'muted', style: { margin: 0, fontSize: '13px' }, text: '（诚实上报：该阶段为单次批量处理，无子进度）' }),
    ]));
  }
  return wrap;
}

export default async function pipelineView(root, { params }) {
  const jobId = params.jobId;
  let pollTimer = null;
  let tickTimer = null;
  let failStreak = 0;
  let autoJumpTimer = null;
  let stay = false;
  const POLL_FAST = 1500, POLL_SLOW = 3000, FAST_COUNT = 10, TOTAL_TIMEOUT = 30 * 60 * 1000;
  let pollCount = 0;
  const startTs = Date.now();

  onTeardown(() => {
    clearTimeout(pollTimer); clearInterval(tickTimer); clearTimeout(autoJumpTimer);
  });

  let batch = [];
  try { batch = JSON.parse(sessionStorage.getItem('gqa.last_batch') || '[]'); } catch { /* ignore */ }

  const batchBox = el('div', { class: 'chips' });
  if (batch.length > 1) {
    for (const b of batch) {
      batchBox.append(el('a', {
        class: 'chip',
        href: '#/pipeline/' + encodeURIComponent(b.job_id),
        style: b.job_id === jobId ? { color: 'var(--ink-blue)', borderColor: 'var(--ink-blue)' } : {},
        text: b.filename,
      }));
    }
  }

  const statusLine = el('p', { class: 'page-desc' });
  const timer = el('span', { class: 'pipe-timer', text: '0:00' });
  const head = el('div', { class: 'pipe-head' }, [
    el('h1', { class: 'page-title', text: '索引流水线' }),
    timer,
    monoTag('job ' + jobId),
  ]);
  const dynamic = el('div', {});
  root.append(head, batchBox, statusLine, dynamic);

  function renderJob(job) {
    statusLine.replaceChildren(
      stDot(job.status),
      document.createTextNode(' ' + (JOB_ST_LABEL[job.status] || job.status)),
      el('span', { class: 'muted', text: `  ·  attempt ${job.attempt}  ·  ${job.document_id}` }),
    );
    dynamic.replaceChildren(
      stepsBar(job),
      progressTrack(job),
      stageCards(job) || el('div', {}),
    );

    // 完成卡 / 失败卡 / 取消卡 —— 尾屏视觉终点
    if (job.status === 'done') {
      const kg = (job.steps || []).find((s) => s.name === 'kg');
      const stats = kg?.detail?.stats || {};
      const card = el('div', { class: 'card pad', style: { marginTop: '18px', borderLeft: '3px solid var(--ok)' } }, [
        el('h3', { style: { font: '600 18px/1.5 var(--serif)', margin: '0 0 6px' }, text: '索引完成，文档可提问' }),
        el('p', { class: 'muted', style: { margin: '0 0 12px', font: '12px/1.7 var(--mono)' }, text:
          `chunk ${kg?.detail?.n_chunks ?? '—'} · entity ${kg?.detail?.n_entities ?? '—'} · triple ${kg?.detail?.n_triples ?? '—'}`
          + (stats.narrative != null ? ` · narrative ${stats.narrative} · table ${stats.table}` : '') }),
        el('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap' } }, [
          el('a', { class: 'btn', href: `#/doc/${encodeURIComponent(job.document_id)}/graph`, text: '查看文档详情' }),
          el('button', { class: 'btn ghost', text: '留在此页', onclick: () => { stay = true; card.remove(); } }),
        ]),
        el('p', { class: 'muted', style: { margin: '10px 0 0', fontSize: '12px' }, text: stay ? '已取消自动跳转' : '2.5 秒后自动进入文档详情…' }),
      ]);
      dynamic.append(card);
      if (!stay && !(batch.length > 1)) {
        autoJumpTimer = setTimeout(() => {
          window.location.hash = `#/doc/${encodeURIComponent(job.document_id)}/graph`;
        }, 2500);
      }
      return true; // 终态
    }

    if (job.status === 'failed' && job.error) {
      dynamic.append(errCard({
        code: job.error.code,
        message: job.error.message,
        details: job.error.details,
        actions: [
          el('button', {
            class: 'btn danger',
            text: '重试（断点续跑）',
            onclick: async () => {
              try {
                await adapter.retryJob(jobId);
                pollCount = 0; failStreak = 0;
                poll(true);
              } catch (e) { toastErr(e); }
            },
          }),
        ],
      }));
      return true;
    }

    if (job.status === 'canceled') {
      dynamic.append(el('div', { class: 'bar', style: { borderLeftColor: 'var(--line-strong)' } }, [
        el('span', {}, [
          document.createTextNode('任务已取消。'),
          el('span', { class: 'muted', text: 'MinerU 云端解析无法撤回，已消耗配额不退。' }),
        ]),
        el('button', { class: 'btn ghost small', text: '重新入队', onclick: async () => { try { await adapter.retryJob(jobId); poll(true); } catch (e) { toastErr(e); } } }),
      ]));
      return true;
    }

    if (['queued', 'parsing'].includes(job.status)) {
      dynamic.append(el('div', { style: { marginTop: '14px' } }, [
        el('button', {
          class: 'btn danger small',
          text: '取消任务',
          onclick: async () => {
            try { await adapter.cancelJob(jobId); poll(true); }
            catch (e) { toastErr(e); }
          },
        }),
        el('span', { class: 'muted', style: { fontSize: '12px', marginLeft: '8px' }, text: '仅 queued/parsing 阶段可取消' }),
      ]));
    }
    return false;
  }

  function toastErr(e) {
    import('../ui/components.js').then(({ toast }) => toast(e.message || String(e), 'err'));
  }

  function tick() {
    const base = jobCache?.started_at ? Date.now() - new Date(jobCache.started_at).getTime() : Date.now() - startTs;
    timer.textContent = fmtClock(base) + (jobCache && ['done', 'failed', 'canceled'].includes(jobCache.status) ? '' : ' ⟳');
  }

  let jobCache = null;

  async function poll(immediate = false) {
    clearTimeout(pollTimer);
    try {
      const job = await adapter.getJob(jobId);
      failStreak = 0;
      jobCache = job;
      const terminal = renderJob(job);
      tick();
      if (terminal) { clearInterval(tickTimer); return; }
    } catch (e) {
      failStreak++;
      if (failStreak >= 3 && !root.querySelector('.bar.warn')) {
        dynamic.prepend(warnBar('任务状态获取连续失败，正在降级重试（轮询继续）'));
      }
      if (failStreak >= 6) {
        dynamic.replaceChildren(errCard({
          code: e.code || 'E_NETWORK', message: e.message || '任务查询失败', details: e.details,
          actions: [el('button', { class: 'btn small', text: '重新加载', onclick: () => { failStreak = 0; poll(true); } })],
        }));
        return;
      }
    }
    pollCount++;
    if (Date.now() - startTs > TOTAL_TIMEOUT) {
      dynamic.prepend(warnBar('轮询总超时（30 分钟），任务仍在后台执行；可稍后手动刷新'));
      clearInterval(tickTimer);
      return;
    }
    pollTimer = setTimeout(poll, pollCount <= FAST_COUNT ? POLL_FAST : POLL_SLOW);
  }

  dynamic.replaceChildren(skeleton(3));
  await poll(true);
  tickTimer = setInterval(tick, 1000);
  return {
    destroy() {
      clearTimeout(pollTimer); clearInterval(tickTimer); clearTimeout(autoJumpTimer);
    },
  };
}
