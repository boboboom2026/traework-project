/**
 * LLM 客户端（本地兼容层）
 *
 * 替代 coze-coding-dev-sdk 的 LLMClient，基于 openai SDK 实现 OpenAI 兼容协议：
 *   - invoke(messages, llmConfig)  -> { content }
 *   - stream(messages, llmConfig)  -> AsyncGenerator（content 增量）
 * 支持多模态消息（text / image_url / video_url）。
 */

import OpenAI from "openai";
import { Config } from "./config";

// ---------------------------------------------------------------------------
// 类型定义（与 coze-coding-dev-sdk 保持一致）
// ---------------------------------------------------------------------------

export interface ContentPart {
  type: "text" | "image_url" | "video_url";
  text?: string;
  image_url?: {
    url: string;
    detail?: "high" | "low";
  };
  video_url?: {
    url: string;
    fps?: number | null;
  };
}

export interface Message {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
}

export interface LLMResponse {
  content: string;
}

export interface LLMConfig {
  model?: string;
  thinking?: "enabled" | "disabled";
  caching?: "enabled" | "disabled";
  temperature?: number;
  streaming?: boolean;
}

export const LLMDefaults = {
  MODEL: "gpt-4o-mini",
  THINKING: "disabled" as const,
  CACHING: "disabled" as const,
  TEMPERATURE: 0.7,
  STREAMING: false,
};

// ---------------------------------------------------------------------------
// 客户端单例
// ---------------------------------------------------------------------------

let _client: OpenAI | null = null;

function getClient(config: Config): OpenAI {
  if (!config.apiKey) config.validate();
  if (_client) return _client;
  _client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl || undefined,
    timeout: config.timeout,
    maxRetries: config.retryTimes,
  });
  return _client;
}

/** 兼容层允许在环境变量变化时重置单例（测试用） */
export function _resetLLMClient(): void {
  _client = null;
}

// ---------------------------------------------------------------------------
// 消息转换
// ---------------------------------------------------------------------------

function convertContent(
  content: string | ContentPart[],
): OpenAI.Chat.ChatCompletionContentPart[] {
  if (typeof content === "string") {
    return [{ type: "text", text: content }];
  }
  return content.map((part): OpenAI.Chat.ChatCompletionContentPart => {
    if (part.type === "text") {
      return { type: "text", text: part.text ?? "" };
    }
    if (part.type === "image_url") {
      return {
        type: "image_url",
        image_url: {
          url: part.image_url?.url ?? "",
          detail: part.image_url?.detail === "high" ? "high" : "auto",
        },
      };
    }
    // video_url 无法直接发给 OpenAI 兼容协议，降级为文本占位
    return {
      type: "text",
      text: `[视频: ${part.video_url?.url ?? "未知"}]`,
    };
  });
}

function convertMessages(
  messages: Message[],
): OpenAI.Chat.ChatCompletionMessageParam[] {
  return messages.map((m) => ({
    role: m.role,
    content: convertContent(m.content),
  }));
}

// ---------------------------------------------------------------------------
// LLMClient
// ---------------------------------------------------------------------------

export class LLMClient {
  private config: Config;
  private customHeaders?: Record<string, string>;

  constructor(config?: Config, customHeaders?: Record<string, string>) {
    this.config = config ?? new Config();
    this.customHeaders = customHeaders;
  }

  async invoke(
    messages: Message[],
    llmConfig?: LLMConfig,
    _previousResponseId?: string,
    _extraHeaders?: Record<string, string>,
  ): Promise<LLMResponse> {
    const client = getClient(this.config);
    const model = llmConfig?.model || process.env.LLM_MODEL || LLMDefaults.MODEL;
    const temperature = llmConfig?.temperature ?? LLMDefaults.TEMPERATURE;

    const completion = await client.chat.completions.create({
      model,
      messages: convertMessages(messages) as OpenAI.Chat.ChatCompletionMessageParam[],
      temperature,
      stream: false,
      ...(this.customHeaders ? {} : {}),
    });

    return {
      content: completion.choices?.[0]?.message?.content ?? "",
    };
  }

  async *stream(
    messages: Message[],
    llmConfig?: LLMConfig,
    _previousResponseId?: string,
    _extraHeaders?: Record<string, string>,
  ): AsyncGenerator<{ content: string }, void, unknown> {
    const client = getClient(this.config);
    const model = llmConfig?.model || process.env.LLM_MODEL || LLMDefaults.MODEL;
    const temperature = llmConfig?.temperature ?? LLMDefaults.TEMPERATURE;

    const stream = await client.chat.completions.create({
      model,
      messages: convertMessages(messages) as OpenAI.Chat.ChatCompletionMessageParam[],
      temperature,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) yield { content: delta };
    }
  }
}
