import { NextResponse } from "next/server";

/**
 * 统一 API 响应格式
 * 所有 API 路由必须使用此工具返回响应
 */

export type ApiResponse<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
  errors?: { field: string; message: string }[];
};

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ success: true, data }, { status });
}

export function fail(error: string, status = 400): NextResponse {
  return NextResponse.json({ success: false, error }, { status });
}

export function notFound(message = "资源不存在"): NextResponse {
  return NextResponse.json({ success: false, error: message }, { status: 404 });
}

export function unauthorized(message = "未登录或登录已过期"): NextResponse {
  return NextResponse.json({ success: false, error: message }, { status: 401 });
}

export function forbidden(message = "权限不足"): NextResponse {
  return NextResponse.json({ success: false, error: message }, { status: 403 });
}

export function validationError(errors: { field: string; message: string }[]): NextResponse {
  return NextResponse.json(
    { success: false, error: "输入参数校验失败", errors },
    { status: 422 }
  );
}

export function serverError(error?: unknown): NextResponse {
  const message = error instanceof Error ? error.message : "服务器内部错误";
  return NextResponse.json({ success: false, error: message }, { status: 500 });
}