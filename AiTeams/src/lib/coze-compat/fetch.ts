/**
 * 网页抓取客户端（本地兼容层）
 *
 * 替代 coze-coding-dev-sdk 的 FetchClient，基于原生 fetch 实现：
 *   - 文本 / HTML / JSON 内容可提取文本
 *   - PDF 等二进制无法解析时返回错误状态码（status_code !== 0）
 */

import { Config } from "./config";

export interface FetchImage {
  url: string;
  width?: number;
  height?: number;
  shape: string;
}

export interface FetchContentItem {
  type: "text" | "image" | "link" | "list";
  text?: string;
  url?: string;
  image?: FetchImage;
  link?: { title?: string; url?: string };
  list?: string[];
}

export interface FetchDisplayInfo {
  [key: string]: unknown;
}

export interface FetchRequest {
  url: string;
}

export interface FetchResponse {
  url: string;
  status_code: number;
  status_message?: string;
  content: FetchContentItem[];
  display_info?: FetchDisplayInfo;
}

/** 简易 HTML 转文本：剥离 script/style/标签 */
function htmlToText(html: string): string {
  const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/gi, " ");
  const withoutStyles = withoutScripts.replace(/<style[\s\S]*?<\/style>/gi, " ");
  const withoutTags = withoutStyles
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
  return withoutTags.replace(/\s+/g, " ").trim();
}

export class FetchClient {
  constructor(_config?: Config, _customHeaders?: Record<string, string>, _verbose?: boolean) {}

  async fetch(url: string): Promise<FetchResponse> {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; AiTeamsBot/1.0)" },
      });
      const contentType = res.headers.get("content-type") || "";
      const buffer = Buffer.from(await res.arrayBuffer());

      if (contentType.includes("pdf")) {
        return {
          url,
          status_code: 1,
          status_message: "PDF 文档暂不支持自动解析，请上传文本或 Markdown 格式",
          content: [],
        };
      }

      if (contentType.includes("json")) {
        return {
          url,
          status_code: 0,
          status_message: "",
          content: [{ type: "text", text: buffer.toString("utf-8") }],
        };
      }

      if (contentType.includes("html")) {
        return {
          url,
          status_code: 0,
          status_message: "",
          content: [{ type: "text", text: htmlToText(buffer.toString("utf-8")).slice(0, 100000) }],
        };
      }

      // 默认按 UTF-8 文本处理
      return {
        url,
        status_code: 0,
        status_message: "",
        content: [{ type: "text", text: buffer.toString("utf-8").slice(0, 100000) }],
      };
    } catch (err) {
      return {
        url,
        status_code: 1,
        status_message: err instanceof Error ? err.message : "抓取失败",
        content: [],
      };
    }
  }
}
