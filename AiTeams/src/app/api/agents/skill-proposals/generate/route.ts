import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { LLMClient, Config, HeaderUtils } from "@/lib/sdk";

export async function POST(request: NextRequest) {
  try {
    const { agentId, teamId, includeTraining, includeFeedbacks, includeKnowledge } = await request.json();
    if (!agentId || !teamId) {
      return NextResponse.json({ success: false, error: "参数不完整" }, { status: 400 });
    }

    const supabase = getSupabaseClient();

    // 1. 获取智能体信息
    const { data: agent } = await supabase
      .from("agents")
      .select("id, name, system_prompt, position_id, skill_ids, tool_ids, rag_dataset_ids, mcp_service_ids")
      .eq("id", agentId)
      .eq("team_id", teamId)
      .single();

    if (!agent) {
      return NextResponse.json({ success: false, error: "智能体不存在" }, { status: 404 });
    }

    let positionName = "";
    if (agent.position_id) {
      const { data: pos } = await supabase
        .from("positions")
        .select("name")
        .eq("id", agent.position_id)
        .single();
      positionName = pos?.name || "";
    }

    // 2. 获取已有技能
    const { data: dbSkills } = await supabase
      .from("skills")
      .select("id, name, description, content")
      .in("id", (agent.skill_ids as string[]) || []);
    const existingSkills = dbSkills || [];

    // 3. 收集数据源
    const dataSources: Record<string, number> = {};
    const evidence: { type: string; id: string; summary: string }[] = [];

    // 3a. 培训记录
    let trainingRecords: any[] = [];
    if (includeTraining !== false) {
      const { data: records } = await supabase
        .from("agent_training_records")
        .select("id, train_type, content, source_type, before_state, after_state, created_at")
        .eq("agent_id", agentId)
        .eq("team_id", teamId)
        .order("created_at", { ascending: false })
        .limit(20);
      trainingRecords = records || [];
      dataSources.trainingRecords = trainingRecords.length;
      for (const r of trainingRecords) {
        evidence.push({
          type: "training",
          id: r.id,
          summary: r.content?.slice(0, 200) || r.train_type,
        });
      }
    }

    // 3b. 用户反馈
    let feedbacks: any[] = [];
    if (includeFeedbacks !== false) {
      const { data: fbs } = await supabase
        .from("agent_feedbacks")
        .select("id, rating, content, correction, created_at")
        .eq("agent_id", agentId)
        .eq("team_id", teamId)
        .order("created_at", { ascending: false })
        .limit(20);
      feedbacks = fbs || [];
      dataSources.feedbacks = feedbacks.length;
      for (const fb of feedbacks) {
        evidence.push({
          type: "feedback",
          id: fb.id,
          summary: `评分:${fb.rating} ${fb.content?.slice(0, 150) || ""} ${fb.correction ? `修正:${fb.correction.slice(0, 100)}` : ""}`,
        });
      }
    }

    // 3c. 知识库
    if (includeKnowledge && agent.rag_dataset_ids && (agent.rag_dataset_ids as string[]).length > 0) {
      const { data: datasets } = await supabase
        .from("rag_datasets")
        .select("id, name, description")
        .in("id", agent.rag_dataset_ids as string[]);
      dataSources.knowledgeBase = datasets?.length || 0;
      for (const ds of datasets || []) {
        evidence.push({ type: "knowledge", id: ds.id, summary: `知识库: ${ds.name} - ${ds.description?.slice(0, 100) || ""}` });
      }
    }

    if (evidence.length === 0) {
      return NextResponse.json({ success: false, error: "没有足够的数据来生成技能建议，请先投喂工作记录或等待用户反馈" }, { status: 400 });
    }

    // 4. 调用LLM分析
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const client = new LLMClient(config, customHeaders);

    const existingSkillsText = existingSkills.length > 0
      ? existingSkills.map((s: any) => `- ${s.name}: ${s.description?.slice(0, 100) || ""}`).join("\n")
      : "暂无已绑定技能";

    const prompt = `你是一位资深的企业技能分析师。请根据以下智能体的数据，分析并生成技能创建/更新建议。

## 智能体信息
- 名称: ${agent.name}
- 岗位: ${positionName || "未设置"}
- 系统提示词: ${(agent.system_prompt || "").slice(0, 500)}

## 已有技能
${existingSkillsText}

## 数据源
${evidence.map(e => `[${e.type}] ${e.summary}`).join("\n")}

请分析以上数据，找出需要创建的新技能或需要更新的已有技能。

## 分析要求
1. 如果数据不足以形成明确建议，请返回 action="no_change"
2. 对于每一条建议，请给出：
   - action: "create_skill" | "update_skill" | "no_change"
   - title: 技能名称（简洁明了，如"客户投诉快速处理流程"）
   - reason: 为什么要创建/更新该技能（引用具体数据）
   - new_content: 技能 SOP 的 Markdown 内容（完整可执行）
   - new_description: 技能描述
   - confidence: "high" | "medium" | "low"
   - target_skill_name: 如果是更新技能，填写目标技能名称（必须与已有技能列表中的名称完全一致）

## 输出格式
请严格以 JSON 格式输出，不要包含其他内容：
{
  "proposals": [
    {
      "action": "create_skill",
      "title": "技能名称",
      "reason": "分析原因",
      "new_content": "Markdown格式的完整SOP内容",
      "new_description": "技能描述",
      "confidence": "high",
      "target_skill_name": null
    }
  ]
}`;

    const response = await client.invoke(
      [{ role: "user", content: prompt }],
      { model: "doubao-seed-2-0-pro-260215", temperature: 0.3 }
    );

    // 5. 解析LLM输出
    let proposals: any[] = [];
    try {
      const parsed = JSON.parse(response.content);
      proposals = parsed.proposals || [];
    } catch {
      // 尝试从markdown代码块中提取JSON
      const jsonMatch = response.content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1]);
          proposals = parsed.proposals || [];
        } catch {
          return NextResponse.json({ success: false, error: "AI分析结果解析失败" }, { status: 500 });
        }
      } else {
        return NextResponse.json({ success: false, error: "AI分析结果格式异常" }, { status: 500 });
      }
    }

    if (proposals.length === 0) {
      return NextResponse.json({
        success: true,
        message: "AI分析完成，当前数据不足以生成技能更新建议",
        proposals: [],
        dataSources,
      });
    }

    // 6. 写入数据库
    const insertedProposals = [];
    for (const p of proposals) {
      // 查找匹配的已有技能
      let targetSkillId = null;
      if (p.action === "update_skill" && p.target_skill_name) {
        const matched = existingSkills.find((s: any) => s.name === p.target_skill_name);
        if (matched) targetSkillId = matched.id;
      }

      const oldContent = targetSkillId
        ? existingSkills.find((s: any) => s.id === targetSkillId)?.content || null
        : null;

      const { data: inserted, error } = await supabase
        .from("skill_update_proposals")
        .insert({
          agent_id: agentId,
          team_id: teamId,
          position_id: agent.position_id || null,
          skill_id: targetSkillId,
          action: p.action,
          title: p.title,
          reason: p.reason || "",
          old_content: oldContent,
          new_content: p.new_content || "",
          new_description: p.new_description || "",
          confidence: p.confidence || "medium",
          evidence: evidence,
          data_sources: dataSources,
          status: "pending",
        })
        .select()
        .single();

      if (inserted) insertedProposals.push(inserted);
    }

    return NextResponse.json({
      success: true,
      message: `成功生成 ${insertedProposals.length} 条技能建议`,
      proposals: insertedProposals,
      dataSources,
    });
  } catch (error: any) {
    console.error("生成技能建议失败:", error);
    return NextResponse.json({ success: false, error: error.message || "生成失败" }, { status: 500 });
  }
}