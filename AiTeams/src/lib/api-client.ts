"use client";

/**
 * 前端统一请求封装
 *
 * 背景：后端受保护接口统一通过 `requireAuth(request)` 校验
 * `Authorization: Bearer <token>`（见 src/lib/api-auth.ts），
 * token 由登录接口下发并写入 localStorage.auth_token（见 src/hooks/use-auth.tsx）。
 * 各处直接写 `fetch()` 极易漏带该请求头，导致 401「未授权，请先登录」，
 * 因此统一走这里，避免再遗漏。
 */

export const AUTH_TOKEN_KEY = "auth_token";

export function getAuthToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(AUTH_TOKEN_KEY) || "";
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function redirectToLogin(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(AUTH_TOKEN_KEY);
  if (!window.location.pathname.startsWith("/login")) {
    window.location.href = "/login";
  }
}

/**
 * 带登录态的 fetch：自动附加 Authorization 请求头。
 * 401 时清理本地登录态并跳转登录页，同时把响应原样返回给调用方。
 */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getAuthToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(input, { ...init, headers });

  if (res.status === 401) {
    redirectToLogin();
  }

  return res;
}

/**
 * 带登录态的 JSON 请求：非 2xx 时抛出携带后端错误文案的 ApiError，
 * 便于页面统一 toast，而不是把错误静默吞掉。
 */
export async function apiJson<T = unknown>(input: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(input, init);
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (!res.ok) {
    const message = typeof json.error === "string" ? json.error : `请求失败（${res.status}）`;
    throw new ApiError(message, res.status);
  }

  return json as T;
}

/** 拼装带 teamId 的接口地址（teamId 为空时原样返回） */
export function withTeamId(url: string, teamId?: string | null): string {
  if (!teamId) return url;
  return `${url}${url.includes("?") ? "&" : "?"}teamId=${encodeURIComponent(teamId)}`;
}
