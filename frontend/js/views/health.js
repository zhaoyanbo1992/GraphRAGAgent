/**
 * P5 系统健康：整体状态大数字卡 + 检查项小卡 + 四组配置键值表（不含密钥）。
 */
import adapter from '../api/adapter.js';
import { el, fmtMs, skeleton, errCard, warnBar } from '../ui/components.js';

const CHECK_LABEL = {
  db: 'SQLite', mineru_token: 'MinerU Token', deepseek_key: 'DeepSeek Key',
  indexed_documents: '已索引文档', jobs_running: '运行中任务', job_queue_depth: '队列深度',
};

function checkVal(key, v) {
  if (key === 'indexed_documents' || key === 'jobs_running' || key === 'job_queue_depth') {
    return { text: String(v), cls: 'ok' };
  }
  const ok = v === 'ok' || v === 'present';
  return { text: String(v), cls: ok ? 'ok' : 'fail' };
}

export default async function healthView(root) {
  root.append(
    el('h1', { class: 'page-title', text: '系统健康' }),
    el('p', { class: 'page-desc', text: '部署后自检与演示前确认：服务状态、依赖凭证、容量与问答参数。' }),
  );
  const wrap = el('div', {});
  root.append(wrap);
  wrap.replaceChildren(skeleton(4));

  try {
    const [health, config] = await Promise.all([adapter.health(), adapter.config()]);
    wrap.replaceChildren();

    const okAll = health.status === 'ok';
    const degraded = !okAll
      ? warnBar('部分检查未通过（degraded）：下方检查项卡片标红项需要处理；服务仍可探活。')
      : null;
    if (degraded) wrap.append(degraded);

    // 大状态卡 + 检查项卡
    const grid = el('div', { class: 'health-grid' });
    grid.append(el('div', { class: 'card pad health-big' }, [
      el('div', { class: 'h-label', text: '整体状态' }),
      el('div', { class: 'big-val ' + (okAll ? 'ok' : 'degraded'), text: okAll ? '正常' : '降级' }),
      el('div', { class: 'muted', style: { font: '11.5px/1.7 var(--mono)' }, text: `v${health.version} · uptime ${fmtMs((health.uptime_s || 0) * 1000)}` }),
    ]));
    for (const [k, v] of Object.entries(health.checks || {})) {
      const { text, cls } = checkVal(k, v);
      grid.append(el('div', { class: 'card health-card' }, [
        el('div', { class: 'h-label', text: CHECK_LABEL[k] || k }),
        el('div', { class: 'h-val ' + cls, text }),
      ]));
    }
    wrap.append(grid);

    // 四组配置键值表
    const kvBlock = (title, obj) => {
      const dl = el('dl', { class: 'kv' });
      const flat = (o, prefix = '') => {
        for (const [k, v] of Object.entries(o || {})) {
          if (v && typeof v === 'object' && !Array.isArray(v)) flat(v, prefix + k + '.');
          else dl.append(
            el('dt', { text: prefix + k }),
            el('dd', { text: Array.isArray(v) ? v.join(' ') : String(v) }),
          );
        }
      };
      flat(obj);
      return el('div', { class: 'card pad' }, [
        el('h4', { style: { margin: '0 0 8px', font: '600 14px/1.6 var(--sans)' }, text: title }),
        dl,
      ]);
    };
    wrap.append(el('div', { class: 'health-configs' }, [
      kvBlock('限制（limits）', config.limits),
      kvBlock('格式白名单（formats）', config.formats),
      kvBlock('问答参数（qa）', config.qa),
      kvBlock('模型（models）', config.models),
    ]));
    wrap.append(el('p', { class: 'muted', style: { fontSize: '12px' }, text: '配置接口不含任何密钥。' }));
  } catch (e) {
    wrap.replaceChildren(errCard({
      code: e.code || 'E_NETWORK',
      message: e.message || '健康检查失败：无法连接后端服务',
      details: e.details,
      actions: [el('button', { class: 'btn ghost small', text: '重试', onclick: () => window.location.reload() })],
    }));
  }
  return { destroy() {} };
}
