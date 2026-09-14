/**
 * Embedding 客户端（本地兼容层）
 *
 * 替代 coze-coding-dev-sdk 的 EmbeddingClient，基于 openai SDK 实现：
 *   - embedText(text, { dimensions })       -> number[]
 *   - embedTexts(texts, { dimensions })     -> number[]（单条向量，语义与 embedText 一致）
 *   - embed / embedImage / embedVideo 等    -> 基础实现（文本向量）
 *
 * 环境变量：
 *   EMBEDDING_MODEL  可选，默认 text-embedding-3-small
 *   EMBEDDING_DIMENSIONS 可选，默认 1024（与项目内 1024 维约定一致）
 */

import OpenAI from "openai";
import { Config } from "./config";

const DEFAULT_MODEL = "text-embedding-3-small";
const DEFAULT_DIMENSIONS = 1024;

export interface EmbedOptions {
  dimensions?: number;
}

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  const config = new Config();
  if (!_client) {
    _client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl || undefined,
      timeout: config.timeout,
      maxRetries: config.retryTimes,
    });
  }
  return _client;
}

export class EmbeddingClient {
  private model: string;

  constructor(_config?: Config, _customHeaders?: Record<string, string>, _verbose?: boolean) {
    this.model = process.env.EMBEDDING_MODEL || DEFAULT_MODEL;
  }

  private async embedOne(text: string, dimensions: number): Promise<number[]> {
    if (!text?.trim()) {
      throw new Error("Embedding 输入不能为空");
    }
    const client = getClient();
    const res = await client.embeddings.create({
      model: this.model,
      input: text.slice(0, 8000),
      ...(dimensions ? { dimensions } : {}),
    });
    return res.data?.[0]?.embedding ?? [];
  }

  async embedText(text: string, options?: EmbedOptions): Promise<number[]> {
    const dimensions = options?.dimensions || Number(process.env.EMBEDDING_DIMENSIONS || DEFAULT_DIMENSIONS);
    return this.embedOne(text, dimensions);
  }

  async embedTexts(texts: string[], options?: EmbedOptions): Promise<number[]> {
    if (!texts.length) return [];
    const dimensions = options?.dimensions || Number(process.env.EMBEDDING_DIMENSIONS || DEFAULT_DIMENSIONS);
    return this.embedOne(texts[0], dimensions);
  }

  async embedImage(_imageUrl: string, options?: EmbedOptions): Promise<number[]> {
    throw new Error("图片 Embedding 未配置（本地兼容层暂不支持多模态 Embedding）");
  }

  async embedImages(_imageUrls: string[], _options?: EmbedOptions): Promise<number[]> {
    throw new Error("图片 Embedding 未配置（本地兼容层暂不支持多模态 Embedding）");
  }

  async embedVideo(_videoUrl: string, _options?: EmbedOptions): Promise<number[]> {
    throw new Error("视频 Embedding 未配置（本地兼容层暂不支持多模态 Embedding）");
  }

  async embedVideos(_videoUrls: string[], _options?: EmbedOptions): Promise<number[]> {
    throw new Error("视频 Embedding 未配置（本地兼容层暂不支持多模态 Embedding）");
  }

  async embed(
    texts?: string[],
    imageUrls?: string[],
    videoUrls?: string[],
    options?: EmbedOptions,
  ): Promise<{ data: Array<{ embedding: number[] }>; usage?: unknown }> {
    if (texts?.length) {
      return { data: [{ embedding: await this.embedTexts(texts, options) }] };
    }
    throw new Error("Embedding 输入为空");
  }

  async embedMultimodal(
    texts?: string[],
    imageUrls?: string[],
    videoUrls?: string[],
    options?: EmbedOptions,
  ): Promise<{ data: Array<{ embedding: number[] }>; usage?: unknown }> {
    return this.embed(texts, imageUrls, videoUrls, options);
  }

  async batchEmbed(
    textBatches: string[][],
    _options?: EmbedOptions,
    _maxConcurrent?: number,
  ): Promise<Array<{ data: Array<{ embedding: number[] }>; usage?: unknown }>> {
    const results: Array<{ data: Array<{ embedding: number[] }>; usage?: unknown }> = [];
    for (const batch of textBatches) {
      if (batch.length) {
        results.push({ data: [{ embedding: await this.embedTexts(batch) }] });
      }
    }
    return results;
  }
}
