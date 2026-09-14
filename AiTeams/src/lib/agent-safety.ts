/**
 * Agent 安全与可观测性工具集
 * 
 * 提供迭代循环所需的安全控制、死循环检测、失败重试、Token 预算追踪和结构化日志。
 * 不改变 LLM 自主决策的机制，只增加代码层的安全兜底。
 */

// ============================================================
// 1. 死循环检测
// ============================================================

export interface ToolCallRecord {
  name: string;
  args: Record<string, unknown>;
  timestamp: number;
}

export class DeadLoopDetector {
  private history: ToolCallRecord[] = [];
  private noProgressCount = 0;
  private lastToolCount = 0;

  /** 记录一次工具调用 */
  record(call: ToolCallRecord): void {
    this.history.push(call);
  }

  /** 检测是否重复调用同一工具同参数 >= 3 次 */
  checkRepeatedCalls(): { isLoop: boolean; reason: string } {
    if (this.history.length < 3) return { isLoop: false, reason: "" };

    const lastThree = this.history.slice(-3);
    const first = lastThree[0];
    const allSame = lastThree.every(
      (c) => c.name === first.name && JSON.stringify(c.args) === JSON.stringify(first.args)
    );

    if (allSame) {
      return {
        isLoop: true,
        reason: `检测到死循环：同一工具 "${first.name}" 相同参数已连续调用 3 次`,
      };
    }
    return { isLoop: false, reason: "" };
  }

  /** 检测是否连续 N 轮无进展（无新工具调用） */
  checkNoProgress(currentToolCount: number, threshold = 3): { isStuck: boolean; reason: string } {
    if (currentToolCount === this.lastToolCount) {
      this.noProgressCount++;
    } else {
      this.noProgressCount = 0;
    }
    this.lastToolCount = currentToolCount;

    if (this.noProgressCount >= threshold) {
      return {
        isStuck: true,
        reason: `检测到执行停滞：连续 ${threshold} 轮无新增工具调用`,
      };
    }
    return { isStuck: false, reason: "" };
  }

  /** 重置 */
  reset(): void {
    this.history = [];
    this.noProgressCount = 0;
    this.lastToolCount = 0;
  }
}

// ============================================================
// 2. Token 预算控制
// ============================================================

export class TokenBudget {
  private totalTokens = 0;
  private readonly maxTokens: number;
  private readonly maxCost: number;
  private totalCost = 0;

  constructor(maxTokens = 100000, maxCost = 100) {
    this.maxTokens = maxTokens;
    this.maxCost = maxCost;
  }

  /** 估算文本 Token 数（中英文混合，简易估算） */
  static estimate(text: string): number {
    if (!text) return 0;
    let tokens = 0;
    for (const char of text) {
      // 中文字符约占 1.5 token，英文字符约占 0.25 token
      if (/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/.test(char)) {
        tokens += 1.5;
      } else {
        tokens += 0.25;
      }
    }
    return Math.ceil(tokens);
  }

  /** 记录消耗 */
  add(text: string): void {
    const tokens = TokenBudget.estimate(text);
    this.totalTokens += tokens;
    this.totalCost += tokens * 0.000002; // 假设每 token 0.000002 元（豆包约 0.8 元/百万 token）
  }

  /** 检查是否超出预算 */
  checkBudget(): { exceeded: boolean; reason: string } {
    if (this.totalTokens >= this.maxTokens) {
      return {
        exceeded: true,
        reason: `Token 预算超限：已使用约 ${this.totalTokens} tokens（上限 ${this.maxTokens}）`,
      };
    }
    if (this.totalCost >= this.maxCost) {
      return {
        exceeded: true,
        reason: `成本预算超限：已消耗约 ¥${this.totalCost.toFixed(2)}（上限 ¥${this.maxCost}）`,
      };
    }
    return { exceeded: false, reason: "" };
  }

  /** 获取当前状态摘要 */
  getSummary(): string {
    return `Token 使用：约 ${this.totalTokens}（上限 ${this.maxTokens}）| 预估成本：¥${this.totalCost.toFixed(4)}（上限 ¥${this.maxCost}）`;
  }

  get total(): number {
    return this.totalTokens;
  }
}

// ============================================================
// 3. 自动失败重试
// ============================================================

export interface RetryConfig {
  maxRetries: number;
  retryDelayMs: number;
}

/**
 * 执行一个可能失败的操作，支持自动重试
 * @param fn 要执行的函数
 * @param config 重试配置
 * @param fallback 所有重试失败后的降级结果
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = { maxRetries: 1, retryDelayMs: 0 },
  fallback?: T
): Promise<{ success: boolean; data?: T; error?: string; retried: boolean }> {
  let lastError: string = "";
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      const result = await fn();
      return { success: true, data: result, retried: attempt > 0 };
    } catch (e: any) {
      lastError = e.message || String(e);
      if (attempt < config.maxRetries) {
        if (config.retryDelayMs > 0) {
          await new Promise((r) => setTimeout(r, config.retryDelayMs));
        }
      }
    }
  }
  if (fallback !== undefined) {
    return { success: false, data: fallback, error: lastError, retried: true };
  }
  return { success: false, error: lastError, retried: true };
}

// ============================================================
// 4. 结构化 Trace 日志
// ============================================================

export interface TraceEntry {
  iteration: number;
  timestamp: string;
  toolCalls: { name: string; args: any; result: string; durationMs: number }[];
  totalTokens: number;
  llmInputTokens?: number;
  llmOutputTokens?: number;
}

export class TraceLogger {
  private entries: TraceEntry[] = [];
  private startTime = Date.now();
  private readonly sessionId: string;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  addEntry(entry: TraceEntry): void {
    this.entries.push(entry);
  }

  getEntries(): TraceEntry[] {
    return this.entries;
  }

  /** 获取当前已执行的总耗时（毫秒） */
  getTotalDuration(): number {
    return Date.now() - this.startTime;
  }

  /** 输出完整 Trace 到日志 */
  flush(): void {
    const totalDuration = Date.now() - this.startTime;
    const totalToolCalls = this.entries.reduce((s, e) => s + e.toolCalls.length, 0);
    const totalTokens = this.entries.reduce((s, e) => s + e.totalTokens, 0);

    console.log(`[Trace:${this.sessionId}] 执行完成: ${this.entries.length} 轮迭代, ${totalToolCalls} 次工具调用, 耗时 ${totalDuration}ms, Token 约 ${totalTokens}`);
    
    for (const entry of this.entries) {
      for (const tc of entry.toolCalls) {
        console.log(
          `[Trace:${this.sessionId}] 第 ${entry.iteration} 轮 | ${tc.name} | ${tc.durationMs}ms | 结果长度: ${tc.result.length}`
        );
      }
    }
  }

  /** 构建进度摘要，注入到 LLM 上下文 */
  buildProgressSummary(): string {
    const totalToolCalls = this.entries.reduce((s, e) => s + e.toolCalls.length, 0);
    const totalTokens = this.entries.reduce((s, e) => s + e.totalTokens, 0);

    const lines: string[] = [
      `[系统执行状态]`,
      `- 已迭代 ${this.entries.length} 轮`,
      `- 已调用 ${totalToolCalls} 次工具`,
      `- Token 消耗：约 ${totalTokens}`,
    ];

    // 列出最近 3 轮的工具调用
    const recentEntries = this.entries.slice(-3);
    if (recentEntries.length > 0) {
      lines.push(`- 最近工具调用：`);
      for (const entry of recentEntries) {
        for (const tc of entry.toolCalls) {
          lines.push(`  · 第 ${entry.iteration} 轮：${tc.name} → ${tc.result.length > 0 ? "成功" : "无结果"}`);
        }
      }
    }

    return lines.join("\n");
  }
}

// ============================================================
// 5. 注入进度摘要到 LLM 消息
// ============================================================

/**
 * 构建进度提示，注入到 LLM 下一轮对话中
 */
export function buildIterationPrompt(
  iterationCount: number,
  maxIterations: number,
  currentResults: string[],
  budgetSummary: string,
  traceSummary: string
): string {
  const remaining = maxIterations - iterationCount;
  const parts: string[] = [];

  parts.push(`## 工具执行结果（第 ${iterationCount}/${maxIterations} 轮）`);
  parts.push(...currentResults);
  parts.push("");
  parts.push(`## 执行状态`);
  parts.push(`- 剩余执行轮次：${remaining}/${maxIterations}`);
  parts.push(`- ${budgetSummary}`);
  parts.push(`- ${traceSummary}`);
  parts.push("");
  parts.push("请根据以上工具执行结果，继续完成用户的请求。如果所有任务已完成，请直接回复用户。");

  return parts.join("\n");
}