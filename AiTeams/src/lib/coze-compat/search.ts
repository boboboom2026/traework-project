/**
 * 网络搜索客户端（本地兼容层）
 *
 * 替代 coze-coding-dev-sdk 的 SearchClient，通过通用搜索服务（Serper.dev 协议）实现。
 *
 * 环境变量：
 *   SEARCH_API_KEY   必填（未配置时调用会抛出明确错误）
 *   SEARCH_API_BASE  可选，默认 https://google.serper.dev/search
 */

import { Config } from "./config";

export interface WebItem {
  id: string;
  sort_id: number;
  title: string;
  site_name?: string;
  url?: string;
  snippet: string;
  summary?: string;
  content?: string;
  publish_time?: string;
  logo_url?: string;
  rank_score?: number;
  auth_info_des: string;
  auth_info_level: number;
}

export interface ImageItem {
  id: string;
  sort_id: number;
  title?: string;
  site_name?: string;
  url?: string;
  publish_time?: string;
  image: { url: string; width?: number; height?: number; shape: string };
}

export interface SearchFilter {
  need_content?: boolean;
  need_url?: boolean;
  sites?: string;
  block_hosts?: string;
}

export interface SearchRequest {
  query: string;
  search_type?: "web" | "web_summary" | "image";
  count?: number;
  filter?: SearchFilter;
  need_summary?: boolean;
  time_range?: string;
}

export interface SearchResponse {
  web_items: WebItem[];
  image_items: ImageItem[];
  summary?: string;
}

interface SerperResponse {
  organic?: Array<{
    title?: string;
    link?: string;
    snippet?: string;
    date?: string;
  }>;
  knowledgeGraph?: { title?: string; description?: string };
  answerBox?: { answer?: string; title?: string; link?: string; snippet?: string };
  images?: Array<{ imageUrl?: string; title?: string; source?: string }>;
}

export class SearchClient {
  constructor(_config?: Config, _customHeaders?: Record<string, string>, _verbose?: boolean) {}

  private async call(query: string, count: number): Promise<SerperResponse> {
    const apiKey = process.env.SEARCH_API_KEY;
    if (!apiKey) {
      throw new Error(
        "未配置网络搜索服务：请设置 SEARCH_API_KEY（如 Serper.dev / 其它 Serper 兼容服务）"
      );
    }
    const base = process.env.SEARCH_API_BASE || "https://google.serper.dev/search";
    const res = await fetch(base, {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q: query, num: count }),
    });
    if (!res.ok) {
      throw new Error(`搜索服务返回 ${res.status}`);
    }
    return (await res.json()) as SerperResponse;
  }

  private convert(raw: SerperResponse): SearchResponse {
    const webItems: WebItem[] = (raw.organic || []).map((item, i) => ({
      id: `web-${i}`,
      sort_id: i,
      title: item.title || "",
      site_name: item.link ? new URL(item.link).hostname : "",
      url: item.link || "",
      snippet: item.snippet || "",
      publish_time: item.date,
      auth_info_des: "",
      auth_info_level: 0,
    }));

    const imageItems: ImageItem[] = (raw.images || []).map((img, i) => ({
      id: `img-${i}`,
      sort_id: i,
      title: img.title || "",
      site_name: img.source || "",
      url: img.imageUrl || "",
      image: { url: img.imageUrl || "", shape: "square" },
    }));

    const summary =
      raw.answerBox?.answer ||
      (raw.answerBox?.snippet
        ? `${raw.answerBox.title || ""}\n${raw.answerBox.snippet}`
        : "") ||
      raw.knowledgeGraph?.description ||
      "";

    return { web_items: webItems, image_items: imageItems, summary };
  }

  async search(request: SearchRequest): Promise<SearchResponse> {
    return this.webSearch(request.query, request.count, request.need_summary);
  }

  async webSearch(query: string, count = 10, needSummary = false): Promise<SearchResponse> {
    const raw = await this.call(query, count);
    const resp = this.convert(raw);
    if (!needSummary) resp.summary = "";
    return resp;
  }

  async webSearchWithSummary(query: string, count = 10): Promise<SearchResponse> {
    return this.webSearch(query, count, true);
  }

  async imageSearch(query: string, count = 10): Promise<SearchResponse> {
    const raw = await this.call(query, count);
    return this.convert(raw);
  }

  async advancedSearch(
    query: string,
    options?: {
      searchType?: "web" | "web_summary" | "image";
      count?: number;
      needContent?: boolean;
      needUrl?: boolean;
      sites?: string;
      blockHosts?: string;
      needSummary?: boolean;
      timeRange?: string;
    },
  ): Promise<SearchResponse> {
    const count = options?.count || 10;
    const raw = await this.call(query, count);
    const resp = this.convert(raw);
    if (options?.needSummary === false) resp.summary = "";
    return resp;
  }
}
