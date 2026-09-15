/**
 * SkillExecutor - Skill 能力执行引擎
 * 
 * Skill 作为"可执行能力模块"，执行流程：
 * 1. 接收用户输入
 * 2. 解析 SOP 内容为可执行步骤
 * 3. 逐步执行，每步调用 LLM 完成
 * 4. 返回结构化输出
 */

// LLMClient used via dynamic import
import { DEFAULT_LLM_MODEL } from "@/lib/llm/models";
import { getSupabaseClient } from "@/storage/database/supabase-client";

/** Skill 定义 */
export interface Skill {
  id: string;
  name: string;
  description?: string;
  content?: string; // SOP Markdown 内容
  trigger_condition?: string;
  
  is_executable?: boolean;
  team_id: string;
}

/** 执行步骤 */
export interface SkillStep {
  step_id: string;
  name: string;
  description: string;
  input_template?: string;
  output_key: string;
}

/** 执行事件 */
export interface SkillEvent {
  type: "step_start" | "step_complete" | "step_error" | "skill_complete";
  step?: SkillStep;
  stepIndex?: number;
  totalSteps?: number;
  summary?: string;
  error?: string;
  result?: Record<string, unknown>;
}

/** 事件回调 */
export type SkillEventCallback = (event: SkillEvent) => void | Promise<void>;

/**
 * SkillExecutor 类
 */
export class SkillExecutor {
  private skill: Skill;
  private sessionId: string;
  private onEvent: SkillEventCallback;
  private context: Record<string, unknown> = {};
  private llmClient: any;

  constructor(
    skill: Skill,
    sessionId: string,
    onEvent: SkillEventCallback
  ) {
    this.skill = skill;
    this.sessionId = sessionId;
    this.onEvent = onEvent;
  }

  private async getLLM(): Promise<any> {
    if (!this.llmClient) {
      const { LLMClient } = await import("@/lib/sdk");
      const Config = require("@/lib/sdk").Config;
      this.llmClient = new LLMClient(new Config());
    }
    return this.llmClient;
  }

  /**
   * 执行 Skill
   * @param userInput 用户输入
   * @returns 结构化输出
   */
  async execute(userInput: string): Promise<Record<string, unknown>> {
    // 1. 解析 SOP 内容为步骤
    const steps = await this.parseSOPToSteps();
    
    if (steps.length === 0) {
      // 没有可解析的步骤，直接用 LLM 处理
      return await this.executeDirectly(userInput);
    }

    // 2. 设置初始上下文
    this.context.user_input = userInput;

    // 3. 逐步执行
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      
      await this.emitEvent({
        type: "step_start",
        step,
        stepIndex: i,
        totalSteps: steps.length,
      });

      try {
        const result = await this.executeStep(step);
        this.context[step.output_key] = result;
        
        await this.emitEvent({
          type: "step_complete",
          step,
          stepIndex: i,
          totalSteps: steps.length,
          summary: typeof result === "string" ? result.slice(0, 200) : JSON.stringify(result).slice(0, 200),
        });
      } catch (error) {
        await this.emitEvent({
          type: "step_error",
          step,
          stepIndex: i,
          totalSteps: steps.length,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }

    // 4. 汇总所有步骤结果，生成结构化输出
    await this.emitEvent({
      type: "step_start",
      step: { step_id: "summary", name: "汇总输出", description: "整合所有步骤结果，生成最终报告", output_key: "result" },
      stepIndex: steps.length,
      totalSteps: steps.length + 1,
    });

    const summary = await this.buildSummary();
    const output: Record<string, unknown> = { result: summary };

    await this.emitEvent({
      type: "step_complete",
      step: { step_id: "summary", name: "汇总输出", description: "整合所有步骤结果，生成最终报告", output_key: "result" },
      stepIndex: steps.length,
      totalSteps: steps.length + 1,
      summary: summary.slice(0, 200),
    });

    await this.emitEvent({
      type: "skill_complete",
      result: output,
    });

    return output;
  }

  /**
   * 解析 SOP 内容为可执行步骤
   */
  private async parseSOPToSteps(): Promise<SkillStep[]> {
    const content = this.skill.content || "";
    if (!content.trim()) return [];

    // 使用 LLM 解析 SOP 内容
    const parsePrompt = `你是一个 SOP 解析专家。请将以下技能文档解析为可执行的步骤列表。

## 技能名称
${this.skill.name}

## 技能文档
${content}

## 输出要求
请以 JSON 格式输出步骤列表，每个步骤包含：
- step_id: 步骤编号（如 s1, s2, s3）
- name: 步骤名称（简短）
- description: 步骤描述（详细说明这一步要做什么）
- output_key: 输出键名（用于后续步骤引用，如 data_collected, analysis_result）

只输出 JSON，不要其他内容。格式示例：
[
  {"step_id": "s1", "name": "数据收集", "description": "收集用户指定的数据源信息", "output_key": "collected_data"},
  {"step_id": "s2", "name": "数据分析", "description": "对收集的数据进行分析", "output_key": "analysis_result"}
]`;

    try {
      const llm = await this.getLLM();
      const response = await llm.invoke(
        [{ role: "user", content: parsePrompt }],
        { model: DEFAULT_LLM_MODEL, temperature: 0.3 }
      );
      const responseText = response.content || "";

      // 解析 JSON 响应
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const steps = JSON.parse(jsonMatch[0]);
        return steps.map((s: Record<string, string>, i: number) => ({
          step_id: s.step_id || `s${i + 1}`,
          name: s.name || `步骤 ${i + 1}`,
          description: s.description || "",
          output_key: s.output_key || `result_${i + 1}`,
        }));
      }
      return [];
    } catch (error) {
      console.error("[SkillExecutor] Failed to parse SOP:", error);
      return [];
    }
  }

  /**
   * 执行单个步骤
   */
  private async executeStep(step: SkillStep): Promise<string> {
    const contextStr = Object.entries(this.context)
      .map(([k, v]) => `- ${k}: ${typeof v === "string" ? v.slice(0, 500) : JSON.stringify(v).slice(0, 500)}`)
      .join("\n");

    const stepPrompt = `你是一个专业的 AI 助手，正在执行技能「${this.skill.name}」的第 ${step.step_id} 步。

## 当前步骤
- 名称：${step.name}
- 描述：${step.description}

## 已有上下文
${contextStr || "（无）"}

## 用户原始需求
${this.context.user_input}

## 要求
请根据步骤描述和已有上下文，完成当前步骤的任务。输出结果要清晰、结构化。`;

    const llm = await this.getLLM();
    const response = await llm.invoke(
      [
        { role: "system", content: `你是「${this.skill.name}」技能的执行引擎。请严格按照 SOP 步骤执行任务。` },
        { role: "user", content: stepPrompt },
      ],
      { model: DEFAULT_LLM_MODEL, temperature: 0.5 }
    );
    return response.content || "";
  }

  /**
   * 直接执行（无步骤时，用 SOP 作为 system prompt 直接回答）
   */
  private async executeDirectly(userInput: string): Promise<Record<string, unknown>> {
    const sopContent = this.skill.content || "";
    const llm = await this.getLLM();
    const response = await llm.invoke(
      [
        { role: "system", content: `你是「${this.skill.name}」技能。请严格按照以下 SOP 执行任务。\n\n${sopContent}` },
        { role: "user", content: userInput },
      ],
      { model: DEFAULT_LLM_MODEL, temperature: 0.4 }
    );

    return { result: response.content || "" };
  }

  /**
   * 汇总所有步骤结果，生成面向用户的结构化输出
   */
  private async buildSummary(): Promise<string> {
    // 收集所有步骤结果（排除 user_input）
    const stepResults = Object.entries(this.context)
      .filter(([k]) => k !== "user_input")
      .map(([k, v]) => {
        const val = typeof v === "string" ? v : JSON.stringify(v);
        return `### ${k}\n${val.slice(0, 1500)}`;
      })
      .join("\n\n---\n\n");

    const sopContent = this.skill.content || "";

    const summaryPrompt = `你是「${this.skill.name}」技能的输出引擎。请根据各步骤的执行结果，生成一份完整、结构化的最终输出。

## 技能说明
${sopContent.slice(0, 1000)}

## 用户原始需求
${this.context.user_input}

## 各步骤执行结果
${stepResults}

## 输出要求
1. 直接面向用户输出最终结果，不要出现"步骤1""步骤2"等过程性描述
2. 使用清晰的 Markdown 格式（标题、列表、表格等）
3. 结论明确、可操作
4. 如果某个步骤结果为空或失败，在输出中简要说明
5. 保持专业、简洁`;

    try {
      const llm = await this.getLLM();
      const response = await llm.invoke(
        [
          { role: "system", content: `你是「${this.skill.name}」技能。输出要专业、结构化、面向用户。` },
          { role: "user", content: summaryPrompt },
        ],
        { model: DEFAULT_LLM_MODEL, temperature: 0.3 }
      );
      return response.content || "技能执行完成，但未生成有效输出。";
    } catch (error) {
      console.error("[SkillExecutor] Failed to build summary:", error);
      // 降级：直接拼接各步骤结果
      return Object.entries(this.context)
        .filter(([k]) => k !== "user_input")
        .map(([, v]) => typeof v === "string" ? v : JSON.stringify(v))
        .join("\n\n");
    }
  }

  /**
   * 发送事件
   */
  private async emitEvent(event: SkillEvent): Promise<void> {
    await this.onEvent(event);
  }
}

/**
 * 批量意图匹配：从候选 Skill 列表中找到最匹配用户输入的一个
 * 策略：强信号短路 + LLM 意图判断兜底
 */
export async function matchSkillByIntent(
  skills: Skill[],
  userInput: string
): Promise<Skill | null> {
  if (!skills.length || !userInput?.trim()) return null;

  const filtered = skills.filter(s => s.trigger_condition && s.is_executable);
  if (!filtered.length) return null;

  // 第一层：强信号短路 — 明确的指令性动词 + 触发关键词
  const commandPrefixes = /^(帮我|请|执行|运行|做一?个?|进行|帮我做|帮忙)/;
  const hasCommand = commandPrefixes.test(userInput.trim());

  if (hasCommand) {
    for (const skill of filtered) {
      const keywords = skill.trigger_condition!.split(/[，,、\s]+/).filter(Boolean);
      const matched = keywords.some(kw => userInput.toLowerCase().includes(kw.toLowerCase()));
      if (matched) return skill;
    }
  }

  // 第二层：LLM 意图判断（所有候选 skill 打包为一次调用）
  const skillList = filtered.map((s, i) =>
    `${i + 1}. 【${s.name}】触发条件: ${s.trigger_condition}`
  ).join("\n");

  const judgePrompt = `判断用户消息的意图，从以下技能列表中选择最匹配的一个。
只有当用户明确想要执行某个技能的任务时才匹配，闲聊或仅提及关键词不算匹配。

技能列表：
${skillList}
0. 不匹配任何技能（用户只是闲聊或提问，不需要执行特定技能）

用户消息：${userInput}

只输出匹配的技能编号（0 表示不匹配）。`;

  try {
    const { LLMClient: LLMClient2 } = await import("@/lib/sdk");
    const Config2 = require("@/lib/sdk").Config;
    const llmClient2 = new LLMClient2(new Config2());
    const resp = await llmClient2.invoke(
      [{ role: "user", content: judgePrompt }],
      { model: DEFAULT_LLM_MODEL, temperature: 0 }
    );
    const response = resp.content?.trim() || "";
    const matchNum = response.match(/^(\d+)/);
    if (!matchNum) return null;

    const idx = parseInt(matchNum[1], 10);
    if (idx <= 0 || idx > filtered.length) return null;

    return filtered[idx - 1];
  } catch {
    // LLM 调用失败，降级为关键词匹配
    for (const skill of filtered) {
      const keywords = skill.trigger_condition!.split(/[，,、\s]+/).filter(Boolean);
      const matched = keywords.some(kw => userInput.toLowerCase().includes(kw.toLowerCase()));
      if (matched) return skill;
    }
    return null;
  }
}

/**
 * @deprecated 使用 matchSkillByIntent 替代
 */
export async function checkSkillTrigger(
  skill: Skill,
  userInput: string
): Promise<boolean> {
  if (!skill.trigger_condition) return false;
  if (!skill.is_executable) return false;

  const keywords = skill.trigger_condition.split(/[，,、\s]+/).filter(Boolean);
  return keywords.some(kw => userInput.toLowerCase().includes(kw.toLowerCase()));
}

/**
 * 获取团队的可执行技能列表
 */
export async function getExecutableSkills(teamId: string): Promise<Skill[]> {
  const supabase = getSupabaseClient();
  const { data } = await supabase
    .from("skills")
    .select("*")
    .eq("team_id", teamId)
    .eq("is_executable", true)
    .eq("is_published", true);

  return data || [];
}

/**
 * execute_skill 工具定义
 * 用于将 Skill 暴露为 LLM 可调用的 Tool（Hermes 执行模型）
 */
export const EXECUTE_SKILL_TOOL = {
  name: "execute_skill",
  description: "执行一个技能（Skill）。根据技能ID加载对应的SOP文档并按步骤执行。当用户的需求匹配某个可用技能时调用此工具。",
  parameters: {
    type: "object",
    properties: {
      skill_id: {
        type: "string",
        description: "要执行的技能ID"
      },
      task_description: {
        type: "string",
        description: "用户的具体任务描述，将作为SOP执行的输入"
      }
    },
    required: ["skill_id", "task_description"]
  }
};

/**
 * 生成 Skill 描述列表（用于注入 system prompt）
 * Hermes 执行模型：LLM 看到 Skill 列表，自主决定调用哪个
 */
export function buildSkillDescriptions(skills: Skill[]): string {
  if (!skills.length) return "";

  const lines = skills.map(s => {
    const desc = s.description || "无描述";
    const trigger = s.trigger_condition ? `（触发关键词：${s.trigger_condition}）` : "";
    return `- **${s.name}**（ID: ${s.id}）: ${desc}${trigger}`;
  });

  return `## 可用技能

你可以通过调用 execute_skill 工具来执行以下技能：

${lines.join("\n")}

**使用方式**：当用户的需求匹配某个技能时，调用 execute_skill(skill_id, task_description) 来执行该技能。
如果需求不匹配任何技能，直接回答用户即可。`;
}

/**
 * 执行 Skill（供 Function Calling 循环调用）
 * 返回 Skill 的 SOP 内容作为执行指令
 */
export async function executeSkillById(
  skillId: string,
  taskDescription: string,
  teamId: string
): Promise<{ success: boolean; content?: string; error?: string }> {
  const supabase = getSupabaseClient();
  const { data: skill, error } = await supabase
    .from("skills")
    .select("id, name, content, description, team_id")
    .eq("id", skillId)
    .eq("team_id", teamId)
    .eq("is_executable", true)
    .single();

  if (error || !skill) {
    return { success: false, error: `技能 ${skillId} 不存在或不可执行` };
  }

  if (!skill.content) {
    return { success: false, error: `技能「${skill.name}」没有 SOP 内容` };
  }

  return {
    success: true,
    content: `# 执行技能：${skill.name}\n\n## 任务\n${taskDescription}\n\n## SOP 文档\n${skill.content}`
  };
}

/**
 * 委托任务给指定的智能体执行
 * 子 Agent 使用自己的 system_prompt + 关联资源独立运行，返回结构化结果
 */
export async function delegateTaskToAgent(
  agentId: string,
  task: string,
  teamId: string,
  context?: string
): Promise<{ success: boolean; content: string; error?: string }> {
  try {
    const client = getSupabaseClient();
    // 先按 ID 查找，如果找不到则按名称模糊查找
    let { data: agent, error: agentError } = await client
      .from("agents")
      .select("id, name, system_prompt, tool_ids, skill_ids, rag_dataset_ids, model_config, greeting")
      .eq("id", agentId)
      .single();

    if (agentError || !agent) {
      // 按名称模糊查找（支持输入智能体名称而非 ID）
      const { data: nameAgents } = await client
        .from("agents")
        .select("id, name, system_prompt, tool_ids, skill_ids, rag_dataset_ids, model_config, greeting")
        .eq("team_id", teamId)
        .ilike("name", `%${agentId}%`)
        .limit(1);
      if (nameAgents && nameAgents.length > 0) {
        agent = nameAgents[0];
      } else {
        return { success: false, content: "", error: `未找到智能体: ${agentId}` };
      }
    }

    const systemParts: string[] = [];
    systemParts.push(`你是一个专业的智能体「${agent.name}」，请根据用户的任务需求，使用你的专业能力完成任务。`);
    systemParts.push(agent.system_prompt || "");

    if (agent.skill_ids && agent.skill_ids.length > 0) {
      const { data: skills } = await client
        .from("skills")
        .select("id, name, description, expected_output")
        .in("id", agent.skill_ids);
      if (skills && skills.length > 0) {
        const skillDescs = skills.map((s: any) => {
          let desc = `- ${s.name}: ${s.description || "无描述"}`;
          if (s.expected_output) {
            desc += `\n  预期输出格式：${s.expected_output}`;
          }
          return desc;
        }).join("\n");
        systemParts.push(`\n你拥有以下技能，可根据需要执行：\n${skillDescs}`);
      }
    }

    if (agent.rag_dataset_ids && agent.rag_dataset_ids.length > 0) {
      systemParts.push(`\n你拥有知识库访问权限，可查询相关知识。`);
    }

    if (context) {
      systemParts.push(`\n## 来自主智能体的上下文\n${context}`);
    }

    const systemPrompt = systemParts.filter(Boolean).join("\n\n");

    const messages: any[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `请完成以下任务：\n\n${task}` }
    ];

    const { LLMClient } = await import("@/lib/sdk");
    const Config = require("@/lib/sdk").Config;
    const llmClient = new LLMClient(new Config());

    const modelConfig = agent.model_config as any || {};
    const model = modelConfig.model || DEFAULT_LLM_MODEL;
    const temperature = modelConfig.temperature ?? 0.7;

    const response = await llmClient.invoke(messages, { model, temperature });

    return {
      success: true,
      content: response.content || ""
    };
  } catch (err: any) {
    return { success: false, content: "", error: err.message || "委托执行失败" };
  }
}
