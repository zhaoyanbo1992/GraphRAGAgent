/**
 * 全局壳（M2）：顶栏 56px（衬线品牌 + 数据源胶囊）+ 侧栏导航 + 移动汉堡抽屉。
 */
import { apiMode, setApiMode, apiBase, setApiBase } from '../state.js';
import { el, toast } from './components.js';
import { navigate } from '../router.js';

const NAV_ITEMS = [
  { path: '/', label: '文档库', icon: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5zm4 2v2h10V7H7zm0 4v2h10v-2H7zm0 4v2h6v-2H7z' },
  { path: '/qa', label: '问答', icon: 'M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H8l-4 4V5a1 1 0 0 1 1-1z' },
  { path: '/health', label: '系统健康', icon: 'M12 21s-7-4.6-9.5-9A5.5 5.5 0 0 1 12 6.5 5.5 5.5 0 0 1 21.5 12C19 16.4 12 21 12 21z' },
];

function icon(d) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'currentColor');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', d);
  svg.append(p);
  return svg;
}

function buildApiPill() {
  const pill = el('button', {
    class: 'api-pill',
    'data-mode': apiMode(),
    title: '点击切换数据源（mock 离线演示 / live 连接后端）',
    onclick: async () => {
      const next = apiMode() === 'mock' ? 'live' : 'mock';
      if (next === 'live') {
        // 探测可达性，失败给降级提示但允许停留
        try {
          const ctrl = new AbortController();
          setTimeout(() => ctrl.abort(), 3000);
          await fetch(apiBase() + '/api/v1/health', { signal: ctrl.signal });
          toast('已切换到 live 数据源（' + apiBase() + '）');
        } catch {
          toast('后端不可达（' + apiBase() + '），仍保持 live，可重试或切回 mock', 'err');
        }
      } else {
        toast('已切换到 mock 数据源（离线演示）');
      }
      setApiMode(next);
      navigate(location.hash.slice(1).split('?')[0] || '/', null, { replace: true });
      window.location.reload();  // 重置内存态最简且安全
    },
  }, [
    el('span', { class: 'dot', 'aria-hidden': 'true' }),
    document.createTextNode(apiMode()),
  ]);
  window.addEventListener('apimodechange', (e) => {
    pill.dataset.mode = e.detail.mode;
    pill.replaceChildren(
      el('span', { class: 'dot', 'aria-hidden': 'true' }),
      document.createTextNode(e.detail.mode),
    );
  });
  return pill;
}

export function renderShell() {
  const topbar = document.getElementById('topbar');
  topbar.replaceChildren(
    el('button', {
      class: 'nav-toggle', 'aria-label': '打开导航菜单', 'aria-expanded': 'false',
      onclick: () => {
        const open = document.body.classList.toggle('nav-open');
        topbar.querySelector('.nav-toggle').setAttribute('aria-expanded', String(open));
      },
    }, [el('span', { 'aria-hidden': 'true' })]),
    el('a', { class: 'brand', href: '#/' }, [
      el('span', { class: 'brand-mark', 'aria-hidden': 'true' }),
      el('span', { text: '审计台' }),
      el('span', { class: 'brand-sub', text: 'GraphRAG 知识问答' }),
    ]),
    el('div', { class: 'topbar-spacer' }),
    buildApiPill(),
  );

  const sidenav = document.getElementById('sidenav');
  const nav = el('div', { class: 'nav-list' });
  for (const item of NAV_ITEMS) {
    nav.append(el('a', {
      href: '#' + item.path,
      dataset: { navpath: item.path === '/' ? '/' : item.path },
      onclick: () => document.body.classList.remove('nav-open'),
    }, [icon(item.icon), el('span', { class: 'nav-label', text: item.label })]));
  }
  sidenav.replaceChildren(
    nav,
    el('div', { class: 'side-foot', text: 'audit-desk v1.0' }),
  );

  document.getElementById('nav-mask').addEventListener('click', () => {
    document.body.classList.remove('nav-open');
  });

  // 路由切换 → 侧栏选中态
  const setActive = (path) => {
    const root = path === '/' ? '/' : '/' + (path.split('/')[1] || '');
    for (const a of sidenav.querySelectorAll('a')) {
      const on = a.dataset.navpath === root;
      if (on) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
  };
  window.addEventListener('routechange', (e) => setActive(e.detail.path));
  setActive(window.location.hash.replace(/^#/, '').split('?')[0] || '/');
}
