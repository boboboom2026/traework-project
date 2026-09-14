/**
 * 智能体 Skill 加载工具
 * 
 * 从 skills 表加载智能体绑定的技能 SOP 文档
 * 用于注入到 LLM 对话上下文中
 */

import { getSupabaseClient } from "@/storage/database/supabase-client";

export interface AgentSkill {
  id: string;
  name: string;
  description: string | null;
  content: string;  // 技能内容（role_definition）
  source_type?: string;
  version?: number;
}

/**
 * 获取智能体绑定的所有技能
 */
export async function getAgentSkills(agentId: string): Promise<AgentSkill[]> {
  const client = getSupabaseClient();

  // 查询 agents 表获取 skill_ids 字段
  const { data: agent, error: agentError } = await client
    .from("agents")
    .select("skill_ids")
    .eq("id", agentId)
    .single();

  if (agentError || !agent) {
    console.error("获取智能体失败:", agentError);
    return [];
  }

  const skillIds = (agent.skill_ids as string[]) || [];
  if (skillIds.length === 0) {
    return [];
  }

  // 查询 skills 表获取技能详情（SOP 文档）
  const { data: skills, error: skillError } = await client
    .from("skills")
    .select("id, name, description, content, source_type, version")
    .in("id", skillIds);

  if (skillError) {
    console.error("获取技能详情失败:", skillError);
    return [];
  }

  return (skills || []).map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    content: s.content || s.name,
    source_type: s.source_type,
    version: s.version,
  }));
}

/**
 * 将技能列表转换为 LLM 上下文格式
 */
export function formatSkillsForContext(skills: AgentSkill[]): string {
  if (!skills || skills.length === 0) {
    return "";
  }

  const formattedSkills = skills.map((skill, index) => {
    return `## 技能 ${index + 1}: ${skill.name}
${skill.description ? `**描述**: ${skill.description}\n` : ""}
**内容**:
\`\`\`markdown
${skill.content}
\`\`\`
`;
  });

  return `

=== 可用技能库 ===
当需要时，你可以使用以下技能来更好地完成任务。

${formattedSkills.join("\n")}

=== 技能使用指南 ===
- 在回答用户问题前，先判断是否需要使用某个技能
- 如果需要使用技能，按照技能 SOP 文档的规范执行
- 如果技能包含特定格式要求，确保输出符合规范
- 如果用户的需求超出技能范围，基于你的知识回答

=== 开始 ===
`;
}

/**
 * 加载智能体技能并格式化为上下文
 */
export async function loadAgentSkillsContext(agentId: string): Promise<string> {
  const skills = await getAgentSkills(agentId);
  return formatSkillsForContext(skills);
}
