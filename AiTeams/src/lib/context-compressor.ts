/**
 * 上下文压缩器（Context Compressor）
 *
 * 当历史消息过长时，压缩早期消息为摘要，保留最近消息完整。
 * 提供两种压缩策略：
 * 1. 简单压缩（无 LLM）：截断早期消息，统计数量
 * 2. LLM 压缩：调用 LLM 对早期消息进行语义摘要
 */

export interface CompressConfig {
  /** 保留最近多少条完整消息（默认 10） */
  keepRecent: number;
  /** 触发压缩的最小消息总字符数（默认 3000） */
  minTotalLength: number;
  /** 是否使用 LLM 摘要（默认 false，仅截断计数） */
  useLLMSummary: boolean;
  /** 触发 LLM 压缩的最小消息数（默认 20） */
  llmCompressThreshold: number;
}

const DEFAULT_CONFIG: CompressConfig = {
  keepRecent: 10,
  minTotalLength: 3000,
  useLLMSummary: false,
  llmCompressThreshold: 20,
};

export interface CompressedMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * 简单估算文本的 Token 数（中文约 1.7 字符/token，英文约 4 字符/token）
 */
function estimateTokens(text: string): number {
  if (!text) return 0;
  let cnCount = 0;
  let enCount = 0;
  for (const ch of text) {
    if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch)) {
      cnCount++;
    } else if (ch.match(/[a-zA-Z0-9]/)) {
      enCount++;
    }
  }
  return Math.ceil(cnCount / 1.7 + enCount / 4);
}

/**
 * 压缩历史消息列表（简单模式）
 * - 当总消息数超过 keepRecent + 1 且总字符数超过 minTotalLength 时触发压缩
 * - 将较早的消息合并为一条摘要消息
 * - 保留最近 keepRecent 条消息完整
 */
export function compressMessages(
  messages: CompressedMessage[],
  config: Partial<CompressConfig> = {},
  agentName?: string,
): CompressedMessage[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  if (messages.length <= cfg.keepRecent + 1) return messages;

  const totalLength = messages.reduce(
    (sum, m) => sum + (typeof m.content === "string" ? m.content.length : 0),
    0,
  );
  if (totalLength < cfg.minTotalLength) return messages;

  const splitIndex = messages.length - cfg.keepRecent;
  const earlyMessages = messages.slice(0, splitIndex);
  const recentMessages = messages.slice(splitIndex);

  const userCount = earlyMessages.filter((m) => m.role === "user").length;
  const assistantCount = earlyMessages.filter(
    (m) => m.role === "assistant",
  ).length;
  const totalEarly = earlyMessages.length;

  // 提取早期消息中的关键话题
  const keyTopics: string[] = [];
  for (const msg of earlyMessages) {
    if (msg.role === "user" && typeof msg.content === "string") {
      const text = msg.content.slice(0, 100);
      if (text.length > 10) {
        keyTopics.push(text);
      }
    }
  }

  const summaryContent = `[历史对话摘要（前 ${totalEarly} 条，其中用户 ${userCount} 条，${agentName || "AI"} ${assistantCount} 条）]\n${keyTopics.slice(0, 5).join("\n")}`;

  const summaryMessage: CompressedMessage = {
    role: "user",
    content: summaryContent,
  };

  return [summaryMessage, ...recentMessages];
}

/**
 * 压缩系统提示词中的长文本块（如频道历史上下文）
 * 将过长的文本截断为摘要，保留开头和结尾的关键信息
 * @param text 原始文本
 * @param maxTokens 最大 Token 数（默认 2000）
 * @returns 压缩后的文本
 */
export function compressLongText(
  text: string,
  maxTokens: number = 2000,
): string {
  if (!text) return text;
  const estimated = estimateTokens(text);
  if (estimated <= maxTokens) return text;

  // 按比例截断，保留开头和结尾
  const ratio = maxTokens / estimated;
  const keepLength = Math.floor(text.length * ratio * 0.6);
  const head = text.slice(0, keepLength);
  const tail = text.slice(-Math.floor(keepLength * 0.3));

  return `${head}\n\n...(中间 ${estimated - Math.floor(maxTokens * 0.9)} tokens 已压缩)...\n\n${tail}`;
}

/**
 * 估算消息列表的总 Token 数
 */
export function estimateMessagesTokens(
  messages: CompressedMessage[],
): number {
  return messages.reduce(
    (sum, m) => sum + estimateTokens(typeof m.content === "string" ? m.content : ""),
    0,
  );
}

/**
 * 检查是否需要压缩
 * @param messages 消息列表
 * @param maxTokens 最大 Token 数阈值（默认 4000）
 * @returns 是否需要压缩
 */
export function shouldCompress(
  messages: CompressedMessage[],
  maxTokens: number = 4000,
): boolean {
  return estimateMessagesTokens(messages) > maxTokens;
}