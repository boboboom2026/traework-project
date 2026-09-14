/**
 * 请求头工具（本地兼容层）
 *
 * 替代 coze-coding-dev-sdk 的 HeaderUtils。Coze 专用转发头在本地无意义，
 * extractForwardHeaders 保留白名单提取逻辑（本地通常返回空对象）。
 */

export const FORWARD_HEADER_KEYS = [
  "x-tt-logid",
  "x-tt-env",
  "x-use-ppe",
  "x-tt-env-fe",
  "x-run-mode",
  "rpc-persist-res-rec-biz-scene",
  "rpc-persist-coze-record-root-id",
  "rpc-persist-res-rec-root-entity-type",
  "rpc-persist-res-rec-root-entity-id",
  "rpc-persist-res-rec-ext-info",
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
