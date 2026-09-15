/**
 * 图片生成客户端
 *
 * 基于 openai images API 实现。
 *
 * 环境变量：
 *   IMAGE_MODEL  可选，默认 gpt-image-1
 *   LLM_API_KEY / LLM_BASE_URL 复用（OpenAI 兼容）
 */

import OpenAI from "openai";
import { Config } from "./config";

const DEFAULT_MODEL = "gpt-image-1";
const DEFAULT_SIZE = "1024x1024";

export interface ImageGenerationRequest {
  prompt: string;
  model?: string;
  size?: string;
  watermark?: boolean;
  image?: string | string[];
  responseFormat?: "url" | "b64_json";
  optimizePromptMode?: string;
  sequentialImageGeneration?: "auto" | "disabled";
  sequentialImageGenerationMaxImages?: number;
}

export interface ImageData {
  url?: string;
  b64_json?: string;
  size?: string;
  error?: { code?: string; message?: string; [key: string]: unknown };
}

export interface UsageInfo {
  generated_images: number;
  output_tokens?: number;
  total_tokens?: number;
}

export interface ImageGenerationResponse {
  model: string;
  created: number;
  data: ImageData[];
  usage?: UsageInfo;
  error?: { code?: string; message?: string; [key: string]: unknown };
}

export class ImageGenerationResponseHelper {
  private response: ImageGenerationResponse;

  constructor(response: ImageGenerationResponse) {
    this.response = response;
  }

  get success(): boolean {
    return !this.response.error && (this.response.data || []).some((d) => d.url || d.b64_json);
  }

  get imageUrls(): string[] {
    return (this.response.data || [])
      .map((d) => d.url || "")
      .filter(Boolean);
  }

  get imageB64List(): string[] {
    return (this.response.data || [])
      .map((d) => d.b64_json || "")
      .filter(Boolean);
  }

  get errorMessages(): string[] {
    if (this.response.error?.message) return [this.response.error.message];
    return (this.response.data || [])
      .map((d) => d.error?.message || "")
      .filter(Boolean);
  }
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

export class ImageGenerationClient {
  constructor(_config?: Config, _customHeaders?: Record<string, string>, _verbose?: boolean) {}

  async generate(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    const client = getClient();
    const model = request.model || process.env.IMAGE_MODEL || DEFAULT_MODEL;

    const res = await client.images.generate({
      model,
      prompt: request.prompt,
      n: 1,
      size: (request.size || DEFAULT_SIZE) as OpenAI.Images.ImageGenerateParams["size"],
      response_format: request.responseFormat || "url",
    });

    return {
      model,
      created: Math.floor(Date.now() / 1000),
      data: (res.data || []).map((d) => ({
        url: d.url || undefined,
        b64_json: d.b64_json || undefined,
      })),
    };
  }

  async batchGenerate(requests: ImageGenerationRequest[]): Promise<ImageGenerationResponse[]> {
    return Promise.all(requests.map((r) => this.generate(r)));
  }

  getResponseHelper(response: ImageGenerationResponse): ImageGenerationResponseHelper {
    return new ImageGenerationResponseHelper(response);
  }
}
