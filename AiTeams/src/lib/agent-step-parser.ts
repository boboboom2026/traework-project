/**
 * 智能体职责执行步骤解析器
 * 
 * 解析 LLM 流式输出中的 [STEP]...[/STEP] 标签，
 * 用于实现职责执行可视化（step 事件）
 */

const STEP_TAG_START = "[STEP]";
const STEP_TAG_END = "[/STEP]";

/**
 * 流式步骤解析器
 * 维护一个内部缓冲区，逐步接收文本块并检测完整的 [STEP] 标签
 */
export class StepParser {
  private buffer = "";

  /**
   * 处理新的文本块，返回检测到的完整步骤列表
   * 同时更新内部缓冲区（移除已解析的 [STEP] 标签）
   */
  feed(chunk: string): string[] {
    this.buffer += chunk;
    const steps: string[] = [];
    let startIdx: number;

    while ((startIdx = this.buffer.indexOf(STEP_TAG_START)) !== -1) {
      const endIdx = this.buffer.indexOf(STEP_TAG_END, startIdx);
      if (endIdx === -1) {
        // [STEP] 已开始但尚未闭合，等待更多内容
        break;
      }

      // 提取步骤内容（不含标签标记）
      const stepContent = this.buffer.slice(startIdx + STEP_TAG_START.length, endIdx).trim();
      if (stepContent) {
        steps.push(stepContent);
      }

      // 从缓冲区中移除整个 [STEP]...[/STEP] 标签
      this.buffer =
        this.buffer.slice(0, startIdx) +
        this.buffer.slice(endIdx + STEP_TAG_END.length);
    }

    return steps;
  }

  /**
   * 获取当前缓冲区中剩余的文本（不含未闭合的 [STEP] 标签）
   * 用于在流结束时获取最终文本
   */
  getCleanText(): string {
    // 移除未闭合的 [STEP] 标签
    const startIdx = this.buffer.indexOf(STEP_TAG_START);
    if (startIdx !== -1) {
      return this.buffer.slice(0, startIdx);
    }
    return this.buffer;
  }

  /**
   * 重置解析器状态
   */
  reset(): void {
    this.buffer = "";
  }
}

/**
 * 非流式文本的步骤解析（用于已完成的完整文本）
 * 从文本中提取所有 [STEP]...[/STEP] 标签内容，并移除标签
 */
export function parseStepsFromText(text: string): {
  steps: string[];
  cleanText: string;
} {
  const steps: string[] = [];
  const regex = /\[STEP\]([\s\S]*?)\[\/STEP\]/g;
  let match;

  let cleanText = text;
  while ((match = regex.exec(text)) !== null) {
    const content = match[1].trim();
    if (content) {
      steps.push(content);
    }
    // 从文本中移除标签
    cleanText = cleanText.replace(match[0], "");
  }

  return { steps, cleanText: cleanText.trim() };
}