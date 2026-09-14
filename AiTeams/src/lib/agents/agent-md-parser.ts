/**
 * agent.md 解析器
 * 用于从 agent.md 中提取 System Prompt（供 LLM 对话上下文注入）
 */

export interface AgentMdParseResult {
  systemPrompt: string;
  greeting: string;
  userGuidance: string;
  toolRefs: string[];
  skillRefs: string[];
  ragRefs: string[];
}

/**
 * 从 agent.md Markdown 中提取 System Prompt
 */
export function parseAgentMdToPrompt(md: string): string {
  const sections: string[] = [];

  // 提取 ## 简介
  const intro = extractSection(md, "简介");
  if (intro) sections.push(intro);

  // 提取 ## 目标
  const goal = extractSection(md, "目标");
  if (goal) sections.push(goal);

  // 提取 ## 行为规则
  const rules = extractSection(md, "行为规则");
  if (rules) sections.push(rules);

  // 提取 ## 工作流程
  const workflow = extractSection(md, "工作流程");
  if (workflow) sections.push(workflow);

  // 提取 ## 输出格式
  const output = extractSection(md, "输出格式");
  if (output) sections.push(output);

  // 合并所有段落
  if (sections.length === 0) return md;

  return sections.join("\n\n");
}

/**
 * 从智能体所有字段自动生成 agent.md 文档
 */
export function generateAgentMd(params: {
  name: string;
  description?: string;
  roleIdentity?: string;
  systemPrompt?: string;
  greeting?: string;
  userGuidance?: string;
  skillNames?: string[];
  toolNames?: string[];
  ragNames?: string[];
  fewShotExamples?: string;
  outputFormat?: string;
  jsonSchema?: string;
  maxTokens?: number;
  modelConfig?: { model?: string; temperature?: number; maxTokens?: number };
  promptGuardEnabled?: boolean;
  toolApprovalMode?: string;
  memoryEnabled?: boolean;
  contextCompressEnabled?: boolean;
  channelContextEnabled?: boolean;
}): string {
  const {
    name, description, roleIdentity, systemPrompt,
    greeting, userGuidance,
    skillNames = [], toolNames = [], ragNames = [],
    fewShotExamples, outputFormat, jsonSchema, maxTokens,
    modelConfig,
    promptGuardEnabled, toolApprovalMode,
    memoryEnabled, contextCompressEnabled, channelContextEnabled,
  } = params;

  const sections: string[] = [];

  // 标题
  sections.push(`# ${name}`);

  // 简介
  sections.push(`## 简介\n${description || "暂无描述"}`);

  // 角色身份
  if (roleIdentity) {
    sections.push(`## 角色身份\n${roleIdentity}`);
  }

  // 核心指令
  if (systemPrompt) {
    sections.push(`## 核心指令\n${systemPrompt}`);
  }

  // 技能
  if (skillNames.length > 0) {
    sections.push(`## 技能\n${skillNames.map(n => `- ${n}`).join("\n")}`);
  } else {
    sections.push(`## 技能\n- 暂无关联技能`);
  }

  // 工具
  if (toolNames.length > 0) {
    sections.push(`## 工具\n${toolNames.map(n => `- ${n}`).join("\n")}`);
  } else {
    sections.push(`## 工具\n- 暂无关联工具`);
  }

  // 知识库
  if (ragNames.length > 0) {
    sections.push(`## 知识库\n${ragNames.map(n => `- ${n}`).join("\n")}`);
  } else {
    sections.push(`## 知识库\n- 暂无关联知识库`);
  }

  // 开场白
  sections.push(`## 开场白\n${greeting || "你好！有什么我可以帮你的吗？"}`);

  // 使用方式
  sections.push(`## 使用方式\n${userGuidance || "直接向我提问即可"}`);

  // 高级配置摘要
  const configLines: string[] = [];
  if (modelConfig) {
    configLines.push(`- 模型：${modelConfig.model || "默认"}`);
    if (modelConfig.temperature !== undefined) configLines.push(`- 温度：${modelConfig.temperature}`);
    if (modelConfig.maxTokens) configLines.push(`- 最大Token数：${modelConfig.maxTokens}`);
  }
  if (maxTokens) configLines.push(`- 输出最大Token数：${maxTokens}`);
  if (outputFormat && outputFormat !== "auto") configLines.push(`- 输出格式：${outputFormat}`);
  if (jsonSchema) configLines.push(`- JSON Schema：已配置`);
  if (fewShotExamples) configLines.push(`- Few-Shot 示例：已配置`);
  if (promptGuardEnabled) configLines.push(`- Prompt 注入检测：已开启`);
  if (toolApprovalMode && toolApprovalMode !== "auto") configLines.push(`- 工具审批模式：${toolApprovalMode}`);
  if (memoryEnabled) configLines.push(`- 持久化记忆：已开启`);
  if (contextCompressEnabled) configLines.push(`- 长上下文压缩：已开启`);
  if (channelContextEnabled) configLines.push(`- 频道上下文注入：已开启`);

  if (configLines.length > 0) {
    sections.push(`## 配置摘要\n${configLines.join("\n")}`);
  }

  return sections.join("\n\n");
}

/**
 * 提取 Markdown 中某个 ## 二级标题下的内容
 */
function extractSection(md: string, title: string): string | null {
  const regex = new RegExp(`##\\s*${title}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, "i");
  const match = md.match(regex);
  if (!match) return null;
  return match[1].trim();
}