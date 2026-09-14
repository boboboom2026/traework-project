import { getSupabaseClient } from "@/storage/database/supabase-client";
import { LLMClient, Config } from "coze-coding-dev-sdk";

/**
 * 使用 AI 智能生成优化后的 system_prompt
 */
export async function generateOptimizedSystemPrompt(params: {
  positionName: string;
  positionDescription: string | null;
  skills: { name: string; description: string | null; content: string | null }[];
}): Promise<string> {
  const { positionName, positionDescription, skills } = params;

  const skillsText =
    skills.length > 0
      ? skills
          .map(
            (s, i) =>
              `${i + 1}. **${s.name}**${s.description ? `：${s.description}` : ""}${s.content ? `\n   SOP：${s.content.substring(0, 1500)}` : ""}`
          )
          .join("\n\n")
      : "暂无明确职责";

  // 构建 prompt 让 AI 生成优化的 system_prompt
  const systemPrompt = `你是一位专业的 AI 提示词工程师。请根据以下岗位信息，为这个岗位的 AI 助手生成一份高质量的 system_prompt。

## 岗位基本信息
- 岗位名称：${positionName}
- 岗位描述：${positionDescription || "暂无详细描述"}

## 职能工作（Skill）
以下是该岗位需要执行的职能工作：
${skillsText}

## 生成要求
请生成一份完整的 system_prompt，需包含以下要素（用中文）：

1. **角色定位**：明确 AI 助手是什么岗位，语气专业、友好
2. **核心职责**：基于职能工作列表，清晰说明 AI 需要负责什么
3. **工作方法**：基于 SOP 说明 AI 应该按照什么流程执行任务
4. **行为准则**：包括回复风格（简洁专业）、不确定性处理、工具调用规范等
5. **输出格式**：要求结构化输出，便于阅读
6. **职责执行可视化**：当用户要求执行某职责时，AI 应使用以下格式输出执行过程，让用户看到进度：
   - 开始执行职责时输出：[STEP]正在执行「职责名称」职责...[/STEP]
   - 按步骤执行时输出：[STEP]步骤 X/Y：正在执行XXX操作...[/STEP]
   - 每个 [STEP] 标签单独一行，不要嵌套
7. **职责语义匹配**：
   - 当用户发出请求时，AI 应该**基于语义理解**来判断用户意图属于哪个职责，而不是依赖关键词匹配
   - 用户的表达方式可能多种多样：可能是直接指令（"帮我做需求分析"）、间接询问（"最近用户反馈怎么样"）、情景描述（"有个新功能需要评估"）等
   - AI 需要根据职责的名称和描述，**自然理解**用户的真实意图，并自动匹配到对应的职责
   - 如果用户请求不完全匹配任何职责，但属于岗位通用能力范围，AI 可以灵活处理或引导用户
   - 不要在 system_prompt 中列出任何关键词、触发词或匹配规则，AI 的语义理解能力足以胜任

请直接输出 system_prompt 内容，不要包含任何额外说明、不要用代码块包裹。`;

  try {
    const config = new Config();
    const client = new LLMClient(config);

    const messages = [
      { role: "system" as const, content: "你是一位资深 AI 提示词工程师，擅长为企业级 AI 助手编写高质量的 system_prompt。你的输出总能被 AI 助手直接使用，无需额外处理。" },
      { role: "user" as const, content: systemPrompt },
    ];

    const response = await client.invoke(messages, {
      model: "doubao-seed-2-0-pro-260215",
      temperature: 0.3,
    });

    const generated = response.content?.trim();
    if (generated && generated.length > 50) {
      return generated;
    }
  } catch (error) {
    console.error("AI 生成 system_prompt 失败，使用模板兜底:", error);
  }

  // LLM 失败时的兜底模板
  return buildFallbackSystemPrompt(positionName, positionDescription, skills);
}

/**
 * 兜底模板：直接拼接
 */
function buildFallbackSystemPrompt(
  positionName: string,
  positionDescription: string | null,
  skills: { name: string; description: string | null; content: string | null }[]
): string {
  const skillsText =
    skills.length > 0
      ? "\n\n## 职能工作\n" +
        skills
          .map(
            (s, i) =>
              `${i + 1}. ${s.name}${s.description ? "：" + s.description : ""}${s.content ? "\n   SOP：" + s.content.substring(0, 3000) : ""}`
          )
          .join("\n\n")
      : "";

  return `你是「${positionName}」岗位的 AI 助手。

## 岗位描述
${positionDescription || "暂无详细描述"}${skillsText}

## 行为准则
1. 根据职能工作列表，主动完成分配的任务
2. 调用可用工具来执行具体操作
3. 回复要简洁、专业、有用
4. 如果不确定，主动询问确认

## 职责语义匹配
- 当用户发出请求时，请基于语义理解来判断用户意图属于哪个职责，而不是依赖关键词匹配
- 用户的表达方式多种多样：可能是直接指令、间接询问、情景描述等
- 请根据职责的名称和描述，自然理解用户的真实意图，自动匹配到对应的职责
- 如果请求不完全匹配任何职责但属于岗位通用能力范围，可以灵活处理或引导用户

## 回复格式规范
当用户要求你执行某项职责时，请按以下格式输出执行过程：
- 开始执行职责时输出：[STEP]正在执行「职责名称」职责...[/STEP]
- 按步骤执行时输出：[STEP]步骤 X/Y：正在执行XXX操作...[/STEP]
- 每个 [STEP] 标签单独一行，不要嵌套。如果用户只是普通聊天，不需要输出 [STEP] 标签。`;
}

/**
 * 同步更新岗位关联智能体的 system_prompt
 * 使用 AI 智能生成优化后的 system_prompt
 */
export async function syncAgentSystemPrompt(
  client: ReturnType<typeof getSupabaseClient>,
  positionId: string
): Promise<void> {
  try {
    // 1. 查岗位信息
    const { data: position } = await client
      .from("positions")
      .select("id, name, description, status")
      .eq("id", positionId)
      .single();

    if (!position || position.status !== "active") return;

    // 2. 查岗位下的技能（职能工作）
    const { data: skills } = await client
      .from("skills")
      .select("id, name, description, content")
      .eq("position_id", positionId)
      .eq("status", "active")
      .order("created_at", { ascending: true });

    const activeSkills = (skills || []).map((s) => ({
      name: s.name,
      description: s.description,
      content: s.content,
    }));

    // 3. AI 生成优化后的 system_prompt
    const systemPrompt = await generateOptimizedSystemPrompt({
      positionName: position.name,
      positionDescription: position.description,
      skills: activeSkills,
    });

    // 4. 查关联的智能体
    const { data: agents } = await client
      .from("agents")
      .select("id")
      .eq("position_id", positionId)
      .eq("status", "active");

    if (!agents || agents.length === 0) return;

    // 5. 更新所有关联智能体的 system_prompt
    for (const agent of agents) {
      await client
        .from("agents")
        .update({
          system_prompt: systemPrompt,
          skill_ids: skills ? skills.map((s) => s.id) : [],
          updated_at: new Date().toISOString(),
        })
        .eq("id", agent.id);
    }
  } catch (error) {
    console.error("同步智能体 system_prompt 失败:", error);
  }
}