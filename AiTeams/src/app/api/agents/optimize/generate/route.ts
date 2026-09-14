import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { LLMClient, Config, HeaderUtils } from "coze-coding-dev-sdk";

export async function POST(request: NextRequest) {
  try {
    const { agentId, teamId } = await request.json();
    if (!agentId || !teamId) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    const supabase = getSupabaseClient();

    // 1. Get agent current config
    const { data: agent } = await supabase
      .from("agents")
      .select("id, name, system_prompt, model_config, skill_ids, rag_dataset_ids, mcp_service_ids, greeting, user_guidance, max_iterations, context_compress_enabled, memory_enabled, tool_approval_mode")
      .eq("id", agentId)
      .single();

    if (!agent) {
      return NextResponse.json({ error: "智能体不存在" }, { status: 404 });
    }

    // 2. Get training records (last 30)
    const { data: trainingRecords } = await supabase
      .from("agent_training_records")
      .select("train_type, content, source_type, created_at")
      .eq("agent_id", agentId)
      .eq("team_id", teamId)
      .order("created_at", { ascending: false })
      .limit(30);

    // 3. Get user feedbacks (last 30)
    const { data: feedbacks } = await supabase
      .from("agent_feedbacks")
      .select("rating, comment, correction, category, created_at")
      .eq("agent_id", agentId)
      .eq("team_id", teamId)
      .order("created_at", { ascending: false })
      .limit(30);

    // 4. Get task records (last 30)
    const { data: taskRecords } = await supabase
      .from("agent_task_records")
      .select("task_type, input_summary, output_summary, status, execution_time_ms, created_at")
      .eq("agent_id", agentId)
      .eq("team_id", teamId)
      .order("created_at", { ascending: false })
      .limit(30);

    // 5. Get existing skill definitions
    const skillIds = agent.skill_ids || [];
    const { data: existingSkills } = await supabase
      .from("skills")
      .select("id, name, content, description")
      .in("id", skillIds.length > 0 ? skillIds : ["none"]);

    // 6. Get RAG datasets
    const ragIds = agent.rag_dataset_ids || [];
    const { data: ragDatasets } = await supabase
      .from("rag_datasets")
      .select("id, name, description, document_count")
      .in("id", ragIds.length > 0 ? ragIds : ["none"]);

    // 7. Build prompt for LLM
    const systemPrompt = `你是一位 AI 智能体优化专家。你的任务是根据智能体的当前配置、培训记录、用户反馈、任务执行记录等数据，分析并给出优化建议。

优化建议可以包括以下维度：

1. **system_prompt** - 系统提示词优化（精简、补充约束、调整语气）
2. **model_config** - 模型参数调整（温度、模型选择）
3. **greeting** - 开场白优化
4. **user_guidance** - 输入框引导提示优化
5. **max_iterations** - 最大 Agent 循环次数调整
6. **context_compress_enabled** - 是否开启长上下文压缩（true/false）
7. **memory_enabled** - 是否开启记忆（true/false）
8. **rag_dataset_ids** - 建议关联的知识库
9. **skill_ids** - 已有的技能可继续优化
10. **tool_approval_mode** - 工具审批模式建议

请基于数据给出具体、可执行的建议。每个建议必须包含：
- optimize_type: 优化类型（system_prompt/model_config/greeting/user_guidance/max_iterations/context_compress/memory/rag/skill/tool_approval）
- field_name: 字段名
- old_value: 当前值
- new_value: 建议的新值
- reason: 建议理由（引用具体数据）
- confidence: high/medium/low
- source: 数据来源（training/feedback/task/combined）

如果没有足够的数据支撑优化建议，请输出空数组。
请以 JSON 格式输出，格式为 { "proposals": [...] }。`;

    const userMessage = `请分析以下智能体数据并给出优化建议：

## 智能体当前配置
\`\`\`json
${JSON.stringify({
  name: agent.name,
  system_prompt: (agent.system_prompt || "").substring(0, 500),
  model_config: agent.model_config,
  greeting: agent.greeting,
  user_guidance: agent.user_guidance,
  max_iterations: agent.max_iterations,
  context_compress_enabled: agent.context_compress_enabled,
  memory_enabled: agent.memory_enabled,
  tool_approval_mode: agent.tool_approval_mode,
  skill_count: (skillIds || []).length,
  rag_count: (ragIds || []).length,
}, null, 2)}
\`\`\`

## 培训记录（${trainingRecords?.length || 0} 条）
${trainingRecords?.map(r => `- [${r.train_type}] ${(r.content || "").substring(0, 200)}`).join("\n") || "无"}

## 用户反馈（${feedbacks?.length || 0} 条）
${feedbacks?.map(f => `- 评分:${f.rating || "无"} 评论:${(f.comment || "").substring(0, 200)} 修正:${(f.correction || "").substring(0, 200)}`).join("\n") || "无"}

## 任务记录（${taskRecords?.length || 0} 条）
${taskRecords?.map(t => `- [${t.task_type}] 状态:${t.status} 耗时:${t.execution_time_ms || "?"}ms 输入:${(t.input_summary || "").substring(0, 100)}`).join("\n") || "无"}

## 现有技能
${existingSkills?.map(s => `- ${s.name}: ${(s.description || "").substring(0, 100)}`).join("\n") || "无"}

## 知识库
${ragDatasets?.map(r => `- ${r.name}: ${r.description || "无描述"} (${r.document_count || 0} 文档)`).join("\n") || "无"}

请分析并给出优化建议。`;

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const client = new LLMClient(config, customHeaders);

    const messages = [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: userMessage },
    ];

    const response = await client.invoke(messages, {
      model: "doubao-seed-2-0-pro-260215",
      temperature: 0.3,
    });

    // 8. Parse LLM response
    let proposals: any[] = [];
    try {
      const cleaned = response.content
        .replace(/```json\s*/g, "")
        .replace(/```\s*/g, "")
        .trim();
      const parsed = JSON.parse(cleaned);
      proposals = parsed.proposals || [];
    } catch {
      // Try to find JSON in the response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          proposals = parsed.proposals || [];
        } catch {}
      }
    }

    // 9. Store proposals in database
    const sessionId = crypto.randomUUID();
    const dbProposals = proposals.map((p: any) => ({
      agent_id: agentId,
      team_id: teamId,
      optimize_type: p.optimize_type || "other",
      field_name: p.field_name || "unknown",
      old_value: typeof p.old_value === "object" ? JSON.stringify(p.old_value) : String(p.old_value || ""),
      new_value: typeof p.new_value === "object" ? JSON.stringify(p.new_value) : String(p.new_value || ""),
      reason: p.reason || "",
      confidence: p.confidence || "medium",
      source: p.source || "combined",
      evidence: p.evidence || null,
      session_id: sessionId,
      status: "pending",
    }));

    if (dbProposals.length > 0) {
      const { error: insertError } = await supabase
        .from("agent_optimization_proposals")
        .insert(dbProposals);

      if (insertError) {
        console.error("Failed to save proposals:", insertError);
      }
    }

    return NextResponse.json({
      success: true,
      session_id: sessionId,
      proposals: proposals,
      summary: {
        training_count: trainingRecords?.length || 0,
        feedback_count: feedbacks?.length || 0,
        task_count: taskRecords?.length || 0,
        proposal_count: proposals.length,
      },
    });

  } catch (error) {
    console.error("Optimize generate error:", error);
    return NextResponse.json({ error: "分析失败", detail: String(error) }, { status: 500 });
  }
}