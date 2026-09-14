import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseCredentials, getSupabaseServiceRoleKey } from "@/storage/database/supabase-client";

export interface AuthUser {
  id: string;
  platformRole?: string;
}

// Platform admin roles
export type PlatformRole = "super_admin" | "admin" | "user";
export const ADMIN_ROLES: PlatformRole[] = ["super_admin", "admin"];

/**
 * Extract the Bearer token from the request's Authorization header.
 */
function extractToken(request: NextRequest): string | null {
  const auth = request.headers.get("Authorization");
  if (!auth || !auth.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

/**
 * Generate a cryptographically random session token.
 */
function generateToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const array = new Uint8Array(64);
  crypto.getRandomValues(array);
  for (let i = 0; i < 64; i++) {
    result += chars[array[i] % chars.length];
  }
  return result;
}

/**
 * Create a session token for a user and store it in the database.
 * Returns the token string.
 */
export async function createSession(userId: string): Promise<string> {
  const { url, anonKey } = getSupabaseCredentials();
  const serviceRoleKey = getSupabaseServiceRoleKey();
  const supabase = createClient(url, serviceRoleKey ?? anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const token = generateToken();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

  const { error } = await supabase.from("sessions").insert({
    user_id: userId,
    token,
    expires_at: expiresAt,
  });

  if (error) {
    console.error("创建会话失败:", error);
    throw new Error("创建会话失败");
  }

  return token;
}

/**
 * Validate a session token and return the authenticated user.
 * Throws a NextResponse (401) if invalid or expired.
 */
export async function requireAuth(request: NextRequest): Promise<AuthUser> {
  const token = extractToken(request);
  if (!token) {
    throw new NextResponse(
      JSON.stringify({ error: "未授权，请先登录" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const { url, anonKey } = getSupabaseCredentials();
  const serviceRoleKey = getSupabaseServiceRoleKey();
  const supabase = createClient(url, serviceRoleKey ?? anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: session, error } = await supabase
    .from("sessions")
    .select("user_id, expires_at")
    .eq("token", token)
    .single();

  if (error || !session) {
    throw new NextResponse(
      JSON.stringify({ error: "登录已过期，请重新登录" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  if (new Date(session.expires_at) < new Date()) {
    // Clean up expired session
    await supabase.from("sessions").delete().eq("token", token);
    throw new NextResponse(
      JSON.stringify({ error: "登录已过期，请重新登录" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  // Update last_used_at
  await supabase
    .from("sessions")
    .update({ last_used_at: new Date().toISOString() })
    .eq("token", token);

  return { id: session.user_id };
}

/**
 * Require platform admin role (super_admin or admin).
 * Throws 401 if not authenticated, 403 if not admin.
 */
export async function requireAdmin(request: NextRequest): Promise<AuthUser> {
  const user = await requireAuth(request);

  const { url, anonKey } = getSupabaseCredentials();
  const serviceRoleKey = getSupabaseServiceRoleKey();
  const supabase = createClient(url, serviceRoleKey ?? anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error } = await supabase
    .from("users")
    .select("platform_role")
    .eq("id", user.id)
    .single();

  if (error || !userData) {
    throw new NextResponse(
      JSON.stringify({ error: "用户不存在" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const platformRole = userData.platform_role || "user";
  if (!ADMIN_ROLES.includes(platformRole as PlatformRole)) {
    throw new NextResponse(
      JSON.stringify({ error: "无权限访问，仅限平台管理员" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  return { id: user.id, platformRole };
}

/**
 * Extract the auth token from the request (no validation).
 * Returns null if no token is present.
 */
export function getTokenFromRequest(request: NextRequest): string | null {
  return extractToken(request);
}

/** 与 getSupabaseClient() 返回值结构兼容的客户端类型 */
export type ApiSupabaseClient = SupabaseClient;

/**
 * 查询用户在指定团队中的成员关系（含角色）。
 * 返回 null 表示不是该团队成员。
 */
export async function getTeamMembership(
  client: ApiSupabaseClient,
  userId: string,
  teamId: string
): Promise<{ role: string | null } | null> {
  const { data } = await client
    .from("team_members")
    .select("role")
    .eq("user_id", userId)
    .eq("team_id", teamId)
    .maybeSingle();

  return data ? { role: (data.role as string | null) ?? null } : null;
}

/** 用户是否为团队管理者（owner / admin） */
export async function isTeamAdmin(
  client: ApiSupabaseClient,
  userId: string,
  teamId: string
): Promise<boolean> {
  const membership = await getTeamMembership(client, userId, teamId);
  return membership?.role === "owner" || membership?.role === "admin";
}

/**
 * 解析"当前用户可操作的团队 ID"。
 *
 * 规则：
 *  1. 显式传入 requestedTeamId 且用户是其成员 → 采用（多团队用户切换团队的正确姿势）
 *  2. 否则兜底取该用户所属的第一个团队
 *  3. 都不是 → null（调用方返回 400）
 *
 * 注意：**不要**再使用 `team_members.select("team_id").limit(1)` 这种不带 user_id
 * 过滤的写法，它会拿到全表第一条成员记录，造成跨团队越权。
 */
export async function resolveUserTeamId(
  client: ApiSupabaseClient,
  userId: string,
  requestedTeamId?: string | null
): Promise<string | null> {
  if (requestedTeamId) {
    const membership = await getTeamMembership(client, userId, requestedTeamId);
    if (membership) return requestedTeamId;
  }

  const { data } = await client
    .from("team_members")
    .select("team_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  return (data?.team_id as string | undefined) ?? null;
}

/**
 * API success response helper — unified format.
 */
export function apiSuccess(data: unknown, status = 200): NextResponse {
  return NextResponse.json({ success: true, data }, { status });
}

/**
 * API error response helper — unified error format.
 */
export function apiError(
  error: string,
  status = 400,
  details?: unknown
): NextResponse {
  return NextResponse.json(
    { success: false, error, ...(details !== undefined ? { details } : {}) },
    { status }
  );
}