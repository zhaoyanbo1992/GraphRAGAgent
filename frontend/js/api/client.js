/**
 * fetch 封装 + postSSE（POST + ReadableStream 分帧，EventSource 不支持 POST）。
 */

/** 统一 ApiError：{code, message, details, status}（对齐 backend spec §4 形状） */
export class ApiError extends Error {
  constructor(code, message, { status = 0, details = null } = {}) {
    super(message);
    this.code = code || 'E_INTERNAL';
    this.status = status;
    this.details = details;
  }
}

async function parseError(res) {
  let code = 'E_HTTP_' + res.status;
  let message = res.statusText || '请求失败';
  let details = null;
  try {
    const body = await res.json();
    const err = body && body.error;
    if (err) {
      code = err.code || code;
      message = err.message || message;
      details = err.details || null;
    }
  } catch { /* 非 JSON 响应体，保留默认 */ }
  return new ApiError(code, message, { status: res.status, details });
}

export async function fetchJSON(base, path, { method = 'GET', body = null, signal } = {}) {
  let res;
  try {
    res = await fetch(base + path, {
      method,
      signal,
      headers: body ? undefined : undefined, // multipart 由浏览器自动设 Content-Type
      body,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError('E_NETWORK', '无法连接后端服务（' + base + '）', { details: { err_msg: String(e) } });
  }
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return null;
  return res.json();
}

/**
 * SSE 消费：fetch POST → reader.read() → '\n\n' 分帧 → event:/data: 行解析。
 * onEvent({event, data})；ping 忽略由调用方处理；AbortError 正常返回。
 */
export async function postSSE(base, path, body, { signal, onEvent }) {
  let res;
  try {
    res = await fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') return;
    throw new ApiError('E_NETWORK', '无法连接后端服务（' + base + '）', { details: { err_msg: String(e) } });
  }
  if (!res.ok) throw await parseError(res);
  if (!res.body) throw new ApiError('E_INTERNAL', '响应缺少可读流');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  const handleFrame = (frame) => {
    let event = 'message';
    const dataLines = [];
    for (const line of frame.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    if (!dataLines.length) return;
    let data;
    try { data = JSON.parse(dataLines.join('\n')); }
    catch { data = { raw: dataLines.join('\n') }; }
    onEvent({ event, data });
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        if (frame.trim()) handleFrame(frame);
      }
    }
    if (buf.trim()) handleFrame(buf);
  } catch (e) {
    if (e.name === 'AbortError') return;  // 用户停止，正常返回
    throw e;
  }
}
