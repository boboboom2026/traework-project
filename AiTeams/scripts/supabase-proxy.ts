/**
 * 本地 Supabase 兼容代理
 *
 * supabase-js 的请求路径固定以 /rest/v1/ 开头（REST + PostgREST 协议）。
 * 本地 PostgREST 直接挂在根路径，因此用本代理把 /rest/v1/* 改写为 /* 后转发，
 * 让项目无需任何 Supabase 云凭证即可在沙箱内运行。
 *
 * 用法：pnpm tsx scripts/supabase-proxy.ts（默认监听 3001，转发到 3000）
 */
import { createServer } from "http";

const LISTEN_PORT = parseInt(process.env.SUPABASE_PROXY_PORT || "3001", 10);
const TARGET = process.env.POSTGREST_URL || "http://127.0.0.1:3000";

const server = createServer((req, res) => {
  const target = new URL(TARGET);
  const rawPath = (req.url ?? "/").split("?")[0];
  const query = (req.url ?? "").includes("?") ? (req.url as string).split("?")[1] : "";

  // /rest/v1/xxx -> /xxx（兼容带/不带前缀与尾斜杠）
  const path = rawPath.startsWith("/rest/v1")
    ? rawPath.replace(/^\/rest\/v1/, "") || "/"
    : rawPath;

  const dest = `${target.origin}${path}${query ? `?${query}` : ""}`;

  const upstream = fetch(dest, {
    method: req.method,
    headers: Object.fromEntries(
      Object.entries(req.headers).filter(
        ([k]) => !["host", "content-length", "connection"].includes(k.toLowerCase()),
      ),
    ),
    body: ["GET", "HEAD"].includes(req.method ?? "GET") ? undefined : req,
    duplex: "half",
  } as RequestInit);

  upstream
    .then(async (up) => {
      res.writeHead(up.status, Object.fromEntries(up.headers.entries()));
      const body = Buffer.from(await up.arrayBuffer());
      res.end(body);
    })
    .catch((err) => {
      console.error("[supabase-proxy] 转发失败:", err.message);
      res.writeHead(502).end("bad gateway");
    });
});

server.listen(LISTEN_PORT, () => {
  console.log(`[supabase-proxy] 监听 http://127.0.0.1:${LISTEN_PORT} -> ${TARGET}`);
});