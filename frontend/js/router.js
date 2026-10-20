/**
 * hash 路由：同页 query 变化不重渲染（派发 querychange），
 * 视图 destroy 生命周期（清轮询 timer / abort SSE / network.destroy）。
 */

function parseHash() {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const qIdx = raw.indexOf('?');
  const path = qIdx >= 0 ? raw.slice(0, qIdx) : raw;
  const query = {};
  if (qIdx >= 0) {
    for (const [k, v] of new URLSearchParams(raw.slice(qIdx + 1))) query[k] = v;
  }
  return { path, query };
}

/** 与路由表模式匹配：'/doc/:id/graph' → 参数对象或 null */
function matchPattern(pattern, path) {
  const ps = pattern.split('/').filter(Boolean);
  const xs = path.split('/').filter(Boolean);
  if (ps.length !== xs.length) return null;
  const params = {};
  for (let i = 0; i < ps.length; i++) {
    if (ps[i].startsWith(':')) params[ps[i].slice(1)] = decodeURIComponent(xs[i]);
    else if (ps[i] !== xs[i]) return null;
  }
  return params;
}

const routes = [];
let current = { path: null, params: null, query: null, view: null, teardowns: [] };

/** 注册视图：view(root, {params, query}) → 返回 {destroy?, onQueryChange?}（可异步） */
export function register(pattern, view) {
  routes.push({ pattern, view });
}

/** 编程式导航。选中态变化用 replace（不污染历史）；跨页跳转用默认 push */
export function navigate(path, query = null, { replace = false } = {}) {
  let hash = '#' + path;
  if (query && Object.keys(query).length) {
    hash += '?' + new URLSearchParams(query).toString();
  }
  if (replace) window.location.replace(hash);
  else window.location.hash = hash;
}

export function currentRoute() {
  return current;
}

/** 视图内部注册清理函数（轮询 timer / AbortController 等） */
export function onTeardown(fn) {
  current.teardowns.push(fn);
}

function runTeardowns() {
  for (const fn of current.teardowns) {
    try { fn(); } catch (e) { console.error('[router] teardown error', e); }
  }
  current.teardowns = [];
}

async function render() {
  const { path, query } = parseHash();
  const main = document.getElementById('main');

  if (path === current.path) {
    // 同页 query 变化：不重渲染，派发 querychange（图谱物理布局不闪断）
    const prev = current.query;
    current.query = query;
    if (current.view && current.view.onQueryChange) {
      try { current.view.onQueryChange(query, prev); } catch (e) { console.error(e); }
    }
    return;
  }

  runTeardowns();
  const drawerRoot = document.getElementById('drawer-root');
  if (drawerRoot) drawerRoot.replaceChildren();
  document.body.classList.remove('dw-open');
  main.replaceChildren();
  main.scrollTop = 0;

  let matched = null;
  for (const r of routes) {
    const params = matchPattern(r.pattern, path);
    if (params) { matched = { params, view: r.view }; break; }
  }

  const inner = document.createElement('div');
  inner.className = 'main-inner';
  main.append(inner);

  if (!matched) { window.location.replace('#/'); return; }

  current = { path, params: matched.params, query, view: null, teardowns: [] };
  try {
    const v = await matched.view(inner, { params: matched.params, query });
    current.view = v || null;
  } catch (err) {
    console.error('[router] view error', err);
    inner.replaceChildren(
      Object.assign(document.createElement('div'), {
        className: 'err-card',
        innerHTML: '<div class="headline">页面加载失败</div>'
          + '<div class="raw"></div>',
      }),
    );
    inner.querySelector('.raw').textContent = String(err && err.message || err);
  }
  // 更新侧栏选中态
  window.dispatchEvent(new CustomEvent('routechange', { detail: { path } }));
}

let booted = false;
export function startRouter() {
  if (booted) return;
  booted = true;
  window.addEventListener('hashchange', render);
  render();
}
