import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { LLMClient, Config, HeaderUtils } from "@/lib/sdk";

export const dynamic = "force-dynamic";

/**
 * POST /api/agents/training/submit
 * 投喂工作记录给智能体，AI 分析后自动生成培训记录
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agentId, teamId, workTitle, workContent, files } = body;

    if (!agentId || !teamId || !workContent) {
      return NextResponse.json(
        { error: "参数不完整：agentId、teamId、workContent 为必填" },
        { status: 400 },
      );
    }

    const client = getSupabaseClient();

    // 1. 获取智能体信息
    const { data: agent } = await client
      .from("agents")
      .select("id, name, system_prompt, position_id, skill_ids")
      .eq("id", agentId)
      .eq("team_id", teamId)
      .single();

    if (!agent) {
      return NextResponse.json({ error: "智能体不存在" }, { status: 404 });
    }

    // 2. 获取关联的技能和岗位信息
    const { data: skillDefs } = await client
      .from("skills")
      .select("id, name, content")
      .contains("id", agent.skill_ids || [])
      .limit(10);

    const { data: position } = agent.position_id
      ? await client
          .from("positions")
          .select("id, name, description")
          .eq("id", agent.position_id)
          .single()
      : { data: null };

    // 3. 构建已有的技能内容摘要
    const existingSkillsSummary =
      skillDefs
        ?.map(
          (s: { name: string; content: string }) =>
            `### ${s.name}\n${(s.content || "").slice(0, 500)}`,
        )
        .join("\n\n") || "暂无已有技能";

    // 4. 构建文件内容摘要
    let fileSummary = "";
    if (files && files.length > 0) {
      fileSummary = files
        .map(
          (f: { name: string; content?: string }) =>
            `- 文件: ${f.name}${f.content ? `\n  内容摘要: ${f.content.slice(0, 300)}` : ""}`,
        )
        .join("\n");
    }

    // 5. 使用 LLM 分析工作内容
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const llmConfig = new Config();
    const llmClient = new LLMClient(llmConfig, customHeaders);

    const analysisPrompt = `你是一位企业流程分析专家。请分析以下员工提交的工作记录，提炼出：
1. 工作流程的核心步骤（3-5步）
2. 关键决策点
3. 可复用的方法论
4. 对已有技能的改进建议（如果有）

## 智能体信息
- 名称：${agent.name}
- 岗位：${position?.name || "未指定"}
- 岗位描述：${position?.description || "未指定"}

## 已有技能
${existingSkillsSummary}

## 投喂的工作内容
标题：${workTitle || "未标题"}
${workContent}
${fileSummary ? `\n## 附件\n${fileSummary}` : ""}

请以 JSON 格式输出分析结果：
{
  "summary": "工作内容摘要（100字以内）",
  "workflow": ["步骤1", "步骤2", "步骤3"],
  "keyDecisions": ["决策点1", "决策点2"],
  "methodology": "可复用的方法论（50字以内）",
  "skillSuggestions": "对已有技能的改进建议（50字以内，如无则为空）",
  "qualityAssessment": "excellent|good|average",
  "tags": ["标签1", "标签2"]
}`;

    const response = await llmClient.invoke(
      [{ role: "user", content: analysisPrompt }],
      { model: "doubao-seed-1-8-251228", temperature: 0.3 },
    );

    // 6. 解析 LLM 响应
    let analysis: {
      summary: string;
      workflow: string[];
      keyDecisions: string[];
      methodology: string;
      skillSuggestions: string;
      qualityAssessment: string;
      tags: string[];
    };
    try {
      const cleaned = response.content
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();
      analysis = JSON.parse(cleaned);
    } catch {
      analysis = {
        summary: workContent.slice(0, 100),
        workflow: [],
        keyDecisions: [],
        methodology: "",
        skillSuggestions: "",
        qualityAssessment: "average",
        tags: [],
      };
    }

    // 7. 存储培训记录
    const trainingRecord = {
      agent_id: agentId,
      team_id: teamId,
      train_type: "work_submission",
      source_type: position?.name || "手动投喂",
      source_ref: workTitle || null,
      content: JSON.stringify({
        originalTitle: workTitle || "未标题",
        originalContent: workContent.slice(0, 2000),
        analysis: {
          summary: analysis.summary,
          workflow: analysis.workflow,
          keyDecisions: analysis.keyDecisions,
          methodology: analysis.methodology,
          qualityAssessment: analysis.qualityAssessment,
          tags: analysis.tags,
        },
        skillSuggestions: analysis.skillSuggestions,
        fileCount: files?.length || 0,
      }),
      before_state: JSON.stringify({
        skillCount: skillDefs?.length || 0,
        existingSkills: skillDefs?.map((s: { name: string }) => s.name) || [],
      }),
      after_state: analysis.skillSuggestions
        ? JSON.stringify({ skillSuggestions: analysis.skillSuggestions })
        : null,
      created_by: null,
    };

    const { data: record, error: insertError } = await client
      .from("agent_training_records")
      .insert(trainingRecord)
      .select("id, train_type, source_type, content, created_at")
      .single();

    if (insertError) {
      console.error("插入培训记录失败:", insertError);
      return NextResponse.json(
        { error: "存储培训记录失败" },
        { status: 500 },
      );
    }

    // 8. 返回结果
    return NextResponse.json({
      success: true,
      record: {
        id: record.id,
        trainType: record.train_type,
        sourceType: record.source_type,
        content: record.content,
        createdAt: record.created_at,
      },
      analysis: {
        summary: analysis.summary,
        workflow: analysis.workflow,
        keyDecisions: analysis.keyDecisions,
        methodology: analysis.methodology,
        skillSuggestions: analysis.skillSuggestions,
        qualityAssessment: analysis.qualityAssessment,
        tags: analysis.tags,
      },
    });
  } catch (error) {
    console.error("投喂工作记录失败:", error);
    return NextResponse.json(
      { error: "服务器内部错误" },
      { status: 500 },
    );
  }
}