/**
 * 原生 LLM 客户端（OpenAI 兼容协议）
 *
 * 背景：
 *   coze-coding-dev-sdk 的 LLMClient 是一层受限封装——它不支持原生 function calling
 *   （无 tools 参数、无 role:"tool" 消息、convertMessages 遇到 tool role 直接抛错）。
 *   因此我们把"工具调用"从 prompt 文本标签协议（<tool_call>...</tool_call>）
 *   迁移到 OpenAI 原生协议。
 *
 * 关键事实（实测验证）：
 *   1. 底层网关即为 OpenAI 兼容协议：baseURL = COZE_INTEGRATION_MODEL_BASE_URL
 *      apiKey = COZE_WORKLOAD_IDENTITY_API_KEY
 *   2. 网关会强制返回 SSE 流（即使不传 stream:true），所以本客户端始终使用 stream 模式
 *   3. tool_calls 以分片（delta）到达，需要按 index 累积拼接 arguments
 *   4. 思维链在非标准字段 reasoning_content 中返回
 */

import OpenAI from "openai";

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/** OpenAI 原生 function tool 定义 */
export interface NativeTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

/** OpenAI 原生消息（支持多模态 / tool 回传） */
export interface NativeMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | NativeContentPart[] | null;
  /** assistant 消息携带的工具调用 */
  tool_calls?: NativeToolCall[];
  /** role:"tool" 时对应哪个 tool_call */
  tool_call_id?: string;
  /** role:"tool" 时的工具名（可选，部分模型需要） */
  name?: string;
}

export type NativeContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: string } };

export interface NativeToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

/** 流式事件 */
export type NativeStreamEvent =
  | { type: "text"; content: string }
  | { type: "reasoning"; content: string }
  | { type: "tool_calls"; toolCalls: NativeToolCall[] }
  | {
      type: "done";
      content: string;
      reasoning: string;
      toolCalls: NativeToolCall[];
      finishReason: string | null;
    };

export interface NativeStreamParams {
  messages: NativeMessage[];
  model: string;
  temperature?: number;
  /** 工具定义；为空则不启用 function calling */
  tools?: NativeTool[];
  toolChoice?: "auto" | "none" | "required";
  /** 透传额外参数（如 request_id） */
  signal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// 客户端单例
// ---------------------------------------------------------------------------

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    const apiKey = process.env.COZE_WORKLOAD_IDENTITY_API_KEY;
    const baseURL = process.env.COZE_INTEGRATION_MODEL_BASE_URL;
    if (!apiKey || !baseURL) {
      throw new Error(
        "缺少 LLM 环境变量：COZE_WORKLOAD_IDENTITY_API_KEY / COZE_INTEGRATION_MODEL_BASE_URL"
      );
    }
    _client = new OpenAI({ apiKey, baseURL, maxRetries: 2 });
  }
  return _client;
}

// ---------------------------------------------------------------------------
// 工具格式转换
// ---------------------------------------------------------------------------

/**
 * 将"扁平"的工具定义（{type,name,description,parameters}）转换为 OpenAI 原生格式。
 * 兼容已是原生格式的输入（幂等）。
 */
export function toNativeTool(t: unknown): NativeTool | null {
  if (!t || typeof t !== "object") return null;
  const anyT = t as Record<string, any>;
  // 已是原生格式
  if (anyT.function && anyT.function.name) {
    return {
      type: "function",
      function: {
        name: anyT.function.name,
        description: anyT.function.description || "",
        parameters: anyT.function.parameters || {
          type: "object",
          properties: {},
          required: [],
        },
      },
    };
  }
  // 扁平格式
  if (anyT.name) {
    return {
      type: "function",
      function: {
        name: anyT.name,
        description: anyT.description || "",
        parameters: anyT.parameters || { type: "object", properties: {}, required: [] },
      },
    };
  }
  return null;
}

export function toNativeTools(input: unknown[] | undefined | null): NativeTool[] {
  if (!input || !Array.isArray(input)) return [];
  return input.map(toNativeTool).filter((t): t is NativeTool => !!t);
}

// ---------------------------------------------------------------------------
// 流式对话
// ---------------------------------------------------------------------------

/**
 * 流式对话（原生 function calling）。
 *
 * 用法：
 *   for await (const ev of streamChat({ messages, model, tools })) {
 *     if (ev.type === "text") { ...增量文本... }
 *     else if (ev.type === "reasoning") { ...思维链... }
 *     else if (ev.type === "done") { ev.content / ev.toolCalls 为完整结果 }
 *   }
 */
export async function* streamChat(params: NativeStreamParams): AsyncGenerator<NativeStreamEvent> {
  const { messages, model, temperature = 0.7, tools, toolChoice = "auto", signal } = params;
  const client = getClient();

  const hasTools = tools && tools.length > 0;

  const body: Record<string, unknown> = {
    model,
    messages: messages as unknown as OpenAI.Chat.ChatCompletionMessageParam[],
    temperature,
    stream: true,
  };
  if (hasTools) {
    body.tools = tools;
    body.tool_choice = toolChoice;
  }

  const stream = (await client.chat.completions.create(
    body as unknown as OpenAI.Chat.ChatCompletionCreateParams,
    signal ? { signal } : undefined
  )) as unknown as AsyncIterable<OpenAI.Chat.ChatCompletionChunk>;

  let content = "";
  let reasoning = "";
  let finishReason: string | null = null;
  // 按 index 累积 tool_calls 分片
  const acc = new Map<number, { id: string; name: string; args: string }>();

  for await (const chunk of stream) {
    const choice = chunk?.choices?.[0];
    if (!choice) continue;
    if (choice.finish_reason) finishReason = choice.finish_reason;

    // 非标准字段 reasoning_content（豆包思考模式）
    const delta = choice.delta as Record<string, any> | undefined;
    if (!delta) continue;

    if (typeof delta.reasoning_content === "string" && delta.reasoning_content) {
      reasoning += delta.reasoning_content;
      yield { type: "reasoning", content: delta.reasoning_content };
    }

    if (typeof delta.content === "string" && delta.content) {
      content += delta.content;
      yield { type: "text", content: delta.content };
    }

    if (Array.isArray(delta.tool_calls)) {
      for (const tc of delta.tool_calls) {
        const idx = typeof tc.index === "number" ? tc.index : 0;
        const cur = acc.get(idx) || { id: "", name: "", args: "" };
        if (tc.id) cur.id = tc.id;
        if (tc.function?.name) cur.name = tc.function.name;
        if (tc.function?.arguments) cur.args += tc.function.arguments;
        acc.set(idx, cur);
      }
    }
  }

  const toolCalls: NativeToolCall[] = Array.from(acc.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, v]) => ({
      id: v.id || `call_${Math.random().toString(36).slice(2, 10)}`,
      type: "function" as const,
      function: { name: v.name, arguments: v.args || "{}" },
    }))
    .filter((tc) => tc.function.name);

  yield { type: "done", content, reasoning, toolCalls, finishReason };
}

/**
 * 非流式便捷调用（内部仍走流式，聚合结果返回）。
 * 适用于只关心最终文本的场景（如 Skill 生成、配置生成）。
 */
export async function chatOnce(params: Omit<NativeStreamParams, "signal">): Promise<{
  content: string;
  reasoning: string;
  toolCalls: NativeToolCall[];
}> {
  let content = "";
  let reasoning = "";
  let toolCalls: NativeToolCall[] = [];
  for await (const ev of streamChat(params)) {
    if (ev.type === "done") {
      content = ev.content;
      reasoning = ev.reasoning;
      toolCalls = ev.toolCalls;
    }
  }
  return { content, reasoning, toolCalls };
}
