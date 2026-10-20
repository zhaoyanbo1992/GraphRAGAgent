/**
 * 入口：file:// 检测引导卡 + 全局壳 + 路由注册 + 全局错误兜底。
 */
import { startRouter, register } from './router.js';
import { renderShell } from './ui/shell.js';
import libraryView from './views/library.js';
import pipelineView from './views/pipeline.js';
import docView from './views/doc.js';
import qaView from './views/qa.js';
import healthView from './views/health.js';

window.addEventListener('error', (e) => {
  console.error('[app] uncaught', e.error || e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[app] unhandled rejection', e.reason);
});

function bootstrapGuide() {
  document.getElementById('main').innerHTML = `
    <div class="main-inner"><div class="err-card" style="max-width:640px;margin:60px auto;">
      <div class="headline">需要通过 HTTP 访问（ES modules 不支持 file:// 协议）</div>
      <div class="raw">在 frontend 目录执行：

  python3 -m http.server 8080 -d .

然后打开 http://localhost:8080/</div>
    </div></div>`;
}

try {
  if (window.location.protocol === 'file:') {
    bootstrapGuide();
  } else {
    renderShell();
    register('/', libraryView);
    register('/pipeline/:jobId', pipelineView);
    register('/doc/:id/:view', docView);
    // /doc/:id 无视图段 → 默认图谱
    register('/doc/:id', (root, args) => docView(root, { ...args, params: { ...args.params, view: 'graph' } }));
    register('/qa', qaView);
    register('/qa/:sessionId', qaView);
    register('/health', healthView);
    startRouter();
  }
} catch (err) {
  console.error('[app] boot failure', err);
  document.getElementById('main').innerHTML =
    `<div class="main-inner"><div class="err-card"><div class="headline">应用初始化失败</div><div class="raw">${String(err && err.message || err)}</div></div></div>`;
}
