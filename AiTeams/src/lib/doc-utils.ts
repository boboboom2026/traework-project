/**
 * 文档卡片检测工具
 *
 * 智能体在输出结构化文档（报告、方案、评估、教程等）时，
 * 系统通过内容特征自动检测，不再依赖 <doc> 标签标记。
 * 向前兼容：仍有 <doc> 标签的历史消息也能正常渲染。
 */

const DOC_START = "<doc>";
const DOC_END = "</doc>";

/**
 * 剥离敏感的 <doc>/</doc> 标签（兼容历史消息）
 */
function stripDocTags(content: string): string {
  return content.replace(/<\/?doc>/gi, "").trim();
}

/**
 * 判断消息内容是否为结构化文档（纯启发式，不依赖 <doc> 标签）
 *
 * 判据（同时满足）：
 * 1. 内容超过 100 个字符
 * 2. 前 3 行中有 Markdown 标题（# 开头）
 * 3. 至少有 3 个非空行
 */
export function isDocumentContent(content?: string | null): boolean {
  if (!content) return false;

  // 向前兼容：检测 <doc> 标签
  const hasDocTag =
    content.includes(DOC_START) && content.includes(DOC_END);

  // 剥去标签后的纯内容
  const clean = stripDocTags(content);

  // 启发式检测
  const lines = clean.split("\n").map((l) => l.trim()).filter(Boolean);
  const hasHeading = lines.slice(0, 3).some((l) => /^#{1,4}\s+\S/.test(l));
  const isLongEnough = clean.length > 100;
  const hasEnoughLines = lines.length >= 3;

  return hasDocTag || (hasHeading && isLongEnough && hasEnoughLines);
}

/**
 * 提取文档内容（去除 <doc> 和 </doc> 标记，兼容历史消息）
 */
export function extractDocumentContent(content: string): string {
  const startIdx = content.indexOf(DOC_START);
  const endIdx = content.lastIndexOf(DOC_END);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    return content.slice(startIdx + DOC_START.length, endIdx).trim();
  }
  // 无标签时直接返回原始内容
  return stripDocTags(content);
}

/**
 * 从内容中剥离 <doc>/</doc> 标签（用于消息正文显示）
 */
export function sanitizeContent(content: string): string {
  return content.replace(/<\/?doc>/gi, "").trim();
}

/**
 * 获取文档标题（从文档内容中提取第一行 # 标题，或截取前 50 字）
 */
export function getDocumentTitle(content: string): string {
  const docContent = extractDocumentContent(content);
  if (!docContent.trim()) return "文档";

  const lines = docContent.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const match = line.match(/^#{1,4}\s+(.+)/);
    if (match) return match[1].trim();
  }
  // 无标题时取前 50 字符
  return docContent.slice(0, 50).trim() + (docContent.length > 50 ? "..." : "");
}

/**
 * 获取文档摘要（从文档内容中提取前 2 段非空行）
 */
export function getDocumentSummary(content: string): string {
  const docContent = extractDocumentContent(content);
  if (!docContent.trim()) return "";

  const lines = docContent.split("\n").map((l) => l.trim()).filter(Boolean);
  const paragraphs: string[] = [];
  for (const line of lines) {
    // 跳过标题行
    if (/^#{1,4}\s/.test(line)) continue;
    if (line.length > 10) {
      paragraphs.push(line);
      if (paragraphs.length >= 2) break;
    }
  }
  return paragraphs.join("\n").slice(0, 150) + (paragraphs.join("\n").length > 150 ? "..." : "");
}

/**
 * 在系统提示词中注入文档输出规则（不再要求 <doc> 标签）
 */
export function getDocSystemInstruction(): string {
  return `\n\n## 文档格式
当你输出结构化的知识文档（报告、方案、评估、教程、分析等）时，请使用 Markdown 格式，并用 # 标题开头。
- 第一行用 # 或 ## 写文档标题
- 正文用 Markdown 语法组织
- 普通对话回复不需要此结构`;
}