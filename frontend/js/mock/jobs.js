/**
 * mock 索引任务：8 态时间线（按真实经过时间推导状态，轮询无关实现）。
 * 时间线脚本固定（PRD：索引 mock 时间线 ≈9s）；failed 场景支持断点续跑重试。
 */

const TL = [ // [step 短名, 阶段名(8态), 时长 ms, 进入该阶段时的 progress]
  { step: 'parse',   phase: 'parsing',     ms: 2600 },
  { step: 'chunk',   phase: 'chunking',    ms: 400 },
  { step: 'extract', phase: 'extracting',  ms: 2400 },
  { step: 'kg',      phase: 'kg_building', ms: 1200 },
];
const QUEUED_MS = 800;
// 各阶段完成时刻（自任务启动起）：parse 完成 = QUEUED+2600 …
const CUM = (() => {
  let t = QUEUED_MS; const out = [];
  for (const s of TL) { t += s.ms; out.push(t); }
  return out; // done 时刻 = CUM[3]
})();
const PROGRESS = { queued: 0, parse_wait: 10, parse: 40, chunk: 70, extract: 80, kg: 90, done: 100 };

const jobs = new Map(); // job_id → record

function uuid8() {
  return Math.random().toString(16).slice(2, 10);
}

function iso(ts) { return new Date(ts).toISOString().replace(/\.\d{3}Z$/, 'Z'); }

function stepDetail(name, meta) {
  switch (name) {
    case 'parse': return { batch_id: 'bd48a6be-' + uuid8() + '-mock', mineru_state: 'done', page_count: meta.page_count };
    case 'chunk': return { n_chunks: meta.n_chunks };
    case 'extract': return { n_documents: meta.n_chunks, n_extractions: meta.n_extractions };
    case 'kg': return {
      n_entities: meta.n_entities, n_triples: meta.n_triples,
      stats: { dropped_ungrounded: 0, narrative: meta.n_narrative, table: meta.n_table, resolved: 0 },
    };
    default: return {};
  }
}

function snapshot(rec) {
  const { job, meta, failAt } = rec;
  const now = Date.now();
  const elapsed = now - job.started_ts;
  const steps = [];
  const stepOf = { parse: 'parsing', chunk: 'chunking', extract: 'extracting', kg: 'kg_building' };

  const mkStep = (name, status, detailMeta) => ({
    name,
    status,
    started_at: job.started_at,
    finished_at: status === 'done' ? iso(now) : null,
    elapsed_ms: status === 'done' ? undefined : undefined,
    detail: status === 'pending' ? {} : stepDetail(name, detailMeta),
  });

  let status = 'queued';
  let progress = 0;
  let error = null;

  if (job.status === 'canceled') {
    status = 'canceled';
    // 取消时已完成的阶段照实保留
  }

  if (job.status === 'queued') {
    status = 'queued'; progress = 0;
  } else if (['canceled', 'failed'].includes(job.status)) {
    status = job.status; error = job.error;
    // 补齐已冻结的阶段产物
    for (let i = 0; i < TL.length; i++) {
      const st = (rec.frozen && rec.frozen[i]) || 'pending';
      if (st === 'pending') break;
      steps.push(mkStep(TL[i].step, st === 'running' ? 'pending' : st, meta));
      if (st === 'failed') break;
    }
    if (status === 'failed' && rec.frozenStep != null) {
      steps.push(mkStep(TL[rec.frozenStep].step, 'failed', meta));
    }
  } else {
    // queued → 运行中：按 elapsed 推导
    if (elapsed < QUEUED_MS) {
      status = 'queued'; progress = PROGRESS.queued;
    } else {
      let doneCount = 0;
      for (let i = 0; i < TL.length; i++) {
        const startT = QUEUED_MS + (i === 0 ? 0 : CUM[i - 1] - QUEUED_MS);
        const endT = CUM[i];
        if (failAt === i && elapsed >= startT + Math.min(TL[i].ms * 0.6, 1600)) {
          // 该阶段中途失败
          steps.push(mkStep(TL[i].step, 'failed', meta));
          status = 'failed';
          error = i === 0
            ? { code: 'E_MINERU_TIMEOUT', message: 'MinerU 云端解析超时（mock 演示：600 页 PPT 场景）' }
            : { code: 'E_LLM_EXTRACTION_FAILED', message: 'LangExtract 抽取失败（mock 演示）' };
          rec.frozen = TL.map((_, k) => (k < doneCount ? 'done' : k === i ? 'failed' : 'pending'));
          rec.frozenStep = i;
          break;
        }
        if (elapsed >= endT) {
          steps.push(mkStep(TL[i].step, 'done', meta));
          doneCount++;
        } else if (elapsed >= startT) {
          steps.push(mkStep(TL[i].step, 'running', meta));
          status = stepOf[TL[i].step];
          progress = i === 0 && elapsed - startT < 800 ? PROGRESS.parse_wait : PROGRESS[TL[i].step];
          break;
        } else {
          status = 'queued'; // 理论不可达
          break;
        }
      }
      if (!error && doneCount === TL.length) {
        status = 'done'; progress = PROGRESS.done;
        if (!job.finished_at) {
          job.finished_at = iso(now);
          rec.onDone && rec.onDone();
        }
      }
    }
  }

  return {
    job_id: job.job_id,
    document_id: job.document_id,
    type: 'index',
    status,
    attempt: job.attempt,
    progress: job.status === 'canceled' ? 0 : progress,
    steps,
    error,
    queued_at: job.queued_at,
    started_at: job.started_at,
    finished_at: job.finished_at || null,
  };
}

/**
 * 创建 mock 任务。filename 含 'fail' → 解析阶段中途失败（演示断点重试）。
 * meta 提供产物统计（来自将展示的 mock result）。
 */
export function createJob(docId, filename, meta, { onDone } = {}) {
  const now = Date.now();
  const job = {
    job_id: 'j_' + uuid8(),
    document_id: docId,
    status: 'running',
    attempt: 1,
    queued_at: iso(now),
    started_at: iso(now),
    started_ts: now,
    finished_at: null,
    error: null,
  };
  const rec = {
    job,
    meta,
    failAt: /fail/i.test(filename) ? 0 : null,
    frozen: null,
    frozenStep: null,
    onDone,
  };
  jobs.set(job.job_id, rec);
  return job.job_id;
}

export function getJob(jobId) {
  const rec = jobs.get(jobId);
  if (!rec) return null;
  const snap = snapshot(rec);
  // 仅终态写回（供 retry/cancel 前置判断）；queued/running 等中间态始终按时间推导
  if (['done', 'failed'].includes(snap.status)) {
    rec.job.status = snap.status;
    rec.job.error = snap.error;
    if (!rec.job.finished_at) rec.job.finished_at = iso(Date.now());
  }
  return snap;
}

/** 重试：仅 failed/canceled；断点续跑——已完成阶段不重跑（起始时刻平移到首个未完成阶段） */
export function retryJob(jobId) {
  const rec = jobs.get(jobId);
  if (!rec) return null;
  if (!['failed', 'canceled'].includes(rec.job.status)) {
    const e = new Error('任务当前状态不可重试'); e.code = 'E_JOB_NOT_RETRYABLE'; throw e;
  }
  const now = Date.now();
  const doneStages = (rec.frozen || []).filter((s) => s === 'done').length;
  const skipMs = doneStages === 0 ? 0 : CUM[doneStages - 1];
  rec.job.attempt += 1;
  rec.job.status = 'running';
  rec.job.error = null;
  rec.job.started_at = iso(now);
  rec.job.started_ts = now - skipMs; // 时间线平移 → 跳过已完成阶段
  rec.job.finished_at = null;
  rec.failAt = null; // 演示语义：瞬时故障重试后成功
  rec.frozen = null;
  rec.frozenStep = null;
  return getJob(jobId);
}

export function cancelJob(jobId) {
  const rec = jobs.get(jobId);
  if (!rec) return null;
  const snap = getJob(jobId); // 先写回推导状态
  if (!['queued', 'parsing'].includes(snap.status)) {
    const e = new Error('仅 queued/parsing 阶段可取消'); e.code = 'E_JOB_NOT_CANCELABLE'; throw e;
  }
  rec.job.status = 'canceled';
  rec.job.finished_at = iso(Date.now());
  return getJob(jobId);
}
