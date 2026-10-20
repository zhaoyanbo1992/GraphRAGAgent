/**
 * vis-network 惰性加载：本地 vendor 优先，CDN 回退；失败返回 null（图谱空态降级）。
 */

let promise = null;
const CDNS = [
  'vendor/vis-network.min.js',
  'https://unpkg.com/vis-network@10.1.2/dist/vis-network.min.js',
  'https://cdn.jsdelivr.net/npm/vis-network@9.3.6/dist/vis-network.min.js',
];

function loadOne(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('load fail: ' + src));
    document.head.append(s);
  });
}

export function loadVis() {
  if (promise) return promise;
  promise = (async () => {
    for (const src of CDNS) {
      try {
        await loadOne(src);
        if (window.vis && window.vis.Network) return window.vis;
      } catch { /* 尝试下一个源 */ }
    }
    return null;
  })();
  return promise;
}
