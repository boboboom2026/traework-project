/**
 * LLM 配置
 *
 * 读取通用环境变量：
 *   LLM_API_KEY    必填，OpenAI 兼容 API Key
 *   LLM_BASE_URL   可选，OpenAI 兼容 Base URL（默认 OpenAI 官方）
 *   LLM_MODEL      可选，默认模型名（各调用点可自行指定 model）
 */

export interface SDKConfig {
  apiKey?: string;
  baseUrl?: string;
  modelBaseUrl?: string;
  retryTimes?: number;
  retryDelay?: number;
  timeout?: number;
}

export class Config {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly modelBaseUrl: string;
  readonly retryTimes: number;
  readonly retryDelay: number;
  readonly timeout: number;

  constructor(config?: SDKConfig) {
    this.apiKey = config?.apiKey || process.env.LLM_API_KEY || "";
    this.baseUrl = config?.baseUrl || process.env.LLM_BASE_URL || "";
    this.modelBaseUrl = config?.modelBaseUrl || this.baseUrl;
    this.retryTimes = config?.retryTimes ?? Number(process.env.LLM_RETRY_TIMES || 3);
    this.retryDelay = config?.retryDelay ?? Number(process.env.LLM_RETRY_DELAY || 500);
    this.timeout = config?.timeout ?? Number(process.env.LLM_TIMEOUT || 120000);
  }

  validate(): void {
    if (!this.apiKey) {
      throw new Error(
        "缺少 LLM 环境变量：LLM_API_KEY（OpenAI 兼容服务 API Key）"
      );
    }
  }

  getHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }
}
