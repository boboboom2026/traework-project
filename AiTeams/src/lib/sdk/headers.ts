/**
 * 请求头工具
 *
 * extractForwardHeaders 按白名单提取需要透传到下游服务的请求头。
 */

export const FORWARD_HEADER_KEYS = [
  "x-request-id",
  "x-trace-id",
  "x-correlation-id",
  "traceparent",
] as const;

export type ForwardHeaderKey = (typeof FORWARD_HEADER_KEYS)[number];

export class HeaderUtils {
  static extractForwardHeaders(headers: Headers | Record<string, string>): Record<string, string> {
    const result: Record<string, string> = {};
    const get = (key: string): string | null => {
      if (typeof Headers !== "undefined" && headers instanceof Headers) {
        return headers.get(key);
      }
      const rec = headers as Record<string, string>;
      return rec[key] ?? null;
    };
    for (const key of FORWARD_HEADER_KEYS) {
      const value = get(key);
      if (value) result[key] = value;
    }
    return result;
  }
}
