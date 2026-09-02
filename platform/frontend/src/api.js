export const BASE = import.meta.env.VITE_API_BASE || "";

export async function api(path, opts = {}) {
  const res = await fetch(BASE + path, {
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${txt.slice(0, 120)}`);
  }
  const ct = res.headers.get("content-type") || "";
  return ct.includes("json") ? res.json() : res.text();
}

export const get = (p) => api(p);
export const post = (p, body) =>
  api(p, { method: "POST", body: JSON.stringify(body ?? {}) });
export const put = (p, body) =>
  api(p, { method: "PUT", body: JSON.stringify(body ?? {}) });
export const del = (p) => api(p, { method: "DELETE" });

/** 解析 SSE 流，逐事件回调 onEvent(json)，结束回调 onDone(err?) */
export async function streamSSE(url, { body, onEvent, onDone }) {
  try {
    const res = await fetch(BASE + url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        const raw = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        for (const line of raw.split("\n")) {
          if (line.startsWith("data: ")) {
            try {
              onEvent(JSON.parse(line.slice(6)));
            } catch {
              /* 忽略无法解析的行 */
            }
          }
        }
      }
    }
    onDone?.(null);
  } catch (e) {
    onDone?.(e);
  }
}