import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { LLMClient, Config, HeaderUtils } from "@/lib/sdk";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agentId, positionId, teamId } = body;

    if (!agentId || !positionId || !teamId) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 1. 获取岗位信息（含 job_works）
    const { data: position, error: posError } = await client
      .from("positions")
      .select("name, description, job_works")
      .eq("id", positionId)
      .single();

    if (posError || !position) {
      return NextResponse.json({ error: "岗位不存在" }, { status: 404 });
    }

    // 解析 job_works（Supabase 返回 JSONB 时可能为字符串）
    const rawJobWorks = position.job_works || [];
    const jobWorks = (Array.isArray(rawJobWorks) ? rawJobWorks : (typeof rawJobWorks === 'string' ? JSON.parse(rawJobWorks) : [])) as { name: string; description: string }[];

    if (jobWorks.length === 0) {
      return NextResponse.json({ error: "该岗位暂无职能工作，请先在岗位中心添加" }, { status: 400 });
    }

    // 2. 获取团队可用的工具列表
    const { data: tools } = await client
      .from("tools")
      .select("id, name, description, action, parameters, config")
      .eq("team_id", teamId)
      .eq("enabled", true);

    const availableTools = (tools || []).map(t => ({
      name: t.name,
      description: t.description,
      action: t.action,
      parameters: t.parameters,
    }));

    // 3. 获取 LLM 配置
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const llmClient = new LLMClient(config, customHeaders);
    const model = "doubao-seed-2-0-pro-260215";

    // 4. 删除该岗位下旧的技能（之前自动生成的），保留手动创建的
    const { data: existingSkills } = await client
      .from("skills")
      .select("id, source_type")
      .eq("position_id", positionId)
      .eq("team_id", teamId);

    if (existingSkills && existingSkills.length > 0) {
      const generatedSkillIds = existingSkills
        .filter(s => s.source_type === "generated")
        .map(s => s.id);
      if (generatedSkillIds.length > 0) {
        // 先删除技能（后面的重新生成会覆盖）
        await client.from("skills").delete().in("id", generatedSkillIds);
      }
    }

    // 5. 为每个职能工作调用 LLM 生成 Skill
    const toolsContext = availableTools.length > 0
      ? `\n\n## 可用工具/函数列表\n你的执行流程中应引用以下工具来完成具体操作：\n${availableTools.map(t => `- **${t.name}**（动作: ${t.action}）：${t.description || "无描述"}`).join("\n")}`
      : "\n\n## 可用工具\n当前暂无可用工具，你只能基于知识库和自身能力完成工作。";

    const generatedSkills: Array<{ id: string; name: string; description: string; content: string }> = [];

    for (const jw of jobWorks) {
      const skillName = `${jw.name} SOP`;
      const prompt = `你是一个专业的SOP（标准操作流程）文档生成专家。请根据以下职能工作信息，生成一份详细的Markdown格式的SOP文档。

## 岗位信息
- 岗位名称：${position.name}
- 岗位描述：${position.description || "无"}

## 职能工作信息
- 工作名称：${jw.name}
- 工作描述：${jw.description || "无"}

## 要求
1. 生成一份完整的SOP文档，包含：概述、前置条件、执行步骤、输出标准、异常处理
2. 执行步骤必须具体、可操作，每个步骤应有明确的输入输出
3. 如果可用工具中有适合的工具，在执行步骤中引用该工具（格式：使用【工具名称】工具）
4. 文档语言为中文
5. 使用Markdown格式${toolsContext}

请直接输出SOP文档内容，不要包含其他说明。`;

      const response = await llmClient.invoke(
        [{ role: "system", content: "你是一个专业的SOP文档生成专家。请根据职能工作信息生成详细的Markdown格式标准操作流程文档。" },
        { role: "user", content: prompt }],
        { model, temperature: 0.3 }
      );

      const content = response?.content || "";

      // 保存到 skills
      const skillId = crypto.randomUUID();
      const { error: skillError } = await client
        .from("skills")
        .insert({
          id: skillId,
          team_id: teamId,
          position_id: positionId,
          name: skillName,
          description: `岗位「${position.name}」的 ${jw.name} 标准操作流程`,
          content: content,
          source_type: "generated",
          version: "1.0.0",
          // status removed - not in schema
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (!skillError) {
        generatedSkills.push({ id: skillId, name: skillName, description: jw.description, content });
      }
    }

    // 6. 绑定生成的技能到智能体
    if (generatedSkills.length > 0) {
      // 更新 agent 的 skill_ids 字段
      const skillIds = generatedSkills.map(s => s.id);
      await client.from("agents").update({ skill_ids: skillIds }).eq("id", agentId);
    }

    return NextResponse.json({
      success: true,
      data: {
        generated: generatedSkills.length,
        skills: generatedSkills,
      },
    });
  } catch (err) {
    console.error("重新生成技能失败:", err);
    return NextResponse.json({ error: "重新生成技能失败" }, { status: 500 });
  }
}