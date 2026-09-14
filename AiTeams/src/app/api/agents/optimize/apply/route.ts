import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

export async function POST(request: NextRequest) {
  try {
    const { proposalIds, agentId, teamId, userId, action, reviewComment } = await request.json();

    if (!proposalIds || !Array.isArray(proposalIds) || proposalIds.length === 0) {
      return NextResponse.json({ error: "请选择要应用的优化建议" }, { status: 400 });
    }
    if (!agentId || !teamId) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    const supabase = getSupabaseClient();

    // 1. Get all proposals
    const { data: proposals } = await supabase
      .from("agent_optimization_proposals")
      .select("*")
      .in("id", proposalIds)
      .eq("agent_id", agentId)
      .eq("team_id", teamId)
      .eq("status", "pending");

    if (!proposals || proposals.length === 0) {
      return NextResponse.json({ error: "未找到待审核的优化建议" }, { status: 404 });
    }

    // If action is reject, just mark as rejected
    if (action === "reject") {
      const updateData: any = {
        status: "rejected",
        reviewed_at: new Date().toISOString(),
        reviewed_by: userId || null,
      };
      if (reviewComment) {
        updateData.review_comment = reviewComment;
      }

      const { error: rejectError } = await supabase
        .from("agent_optimization_proposals")
        .update(updateData)
        .in("id", proposalIds);

      if (rejectError) {
        return NextResponse.json({ error: "驳回失败", detail: rejectError.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, action: "rejected" });
    }

    // 2. Get current agent config
    const { data: agent } = await supabase
      .from("agents")
      .select("*")
      .eq("id", agentId)
      .single();

    if (!agent) {
      return NextResponse.json({ error: "智能体不存在" }, { status: 404 });
    }

    // 3. Apply each proposal to build update payload
    const updatePayload: Record<string, any> = {};
    const appliedFields: string[] = [];

    for (const proposal of proposals) {
      const fieldName = proposal.field_name;
      let newValue = proposal.new_value;

      // Parse JSON values for complex fields
      if (fieldName === "model_config" || fieldName === "rag_dataset_ids" || fieldName === "skill_ids" || fieldName === "mcp_service_ids") {
        try {
          newValue = JSON.parse(newValue);
        } catch {}
      }

      // Handle boolean fields
      if (fieldName === "context_compress_enabled" || fieldName === "memory_enabled") {
        newValue = newValue === "true" || newValue === true;
      }

      // Handle number fields
      if (fieldName === "max_iterations") {
        newValue = parseInt(String(newValue), 10) || 10;
      }

      updatePayload[fieldName] = newValue;
      appliedFields.push(fieldName);
    }

    // 4. Update agent
    const { error: updateError } = await supabase
      .from("agents")
      .update(updatePayload)
      .eq("id", agentId);

    if (updateError) {
      console.error("Failed to update agent:", updateError);
      return NextResponse.json({ error: "更新智能体失败", detail: updateError.message }, { status: 500 });
    }

    // 5. Mark proposals as approved
    const { error: markError } = await supabase
      .from("agent_optimization_proposals")
      .update({
        status: "approved",
        reviewed_at: new Date().toISOString(),
        reviewed_by: userId || null,
      })
      .in("id", proposalIds);

    if (markError) {
      console.error("Failed to mark proposals:", markError);
    }

    // 6. Record optimization in training records
    const trainingRecord = {
      agent_id: agentId,
      team_id: teamId,
      train_type: "prompt_tune",
      source_type: "auto_optimize",
      source_ref: `session:${proposals[0].session_id || "bulk"}`,
      content: `自动优化应用了 ${appliedFields.length} 项变更: ${appliedFields.join(", ")}`,
      created_by: userId || "system",
    };

    const { error: trainingError } = await supabase
      .from("agent_training_records")
      .insert(trainingRecord);

    if (trainingError) {
      console.error("Failed to record training:", trainingError);
    }

    return NextResponse.json({
      success: true,
      applied_fields: appliedFields,
      proposal_count: proposals.length,
    });

  } catch (error) {
    console.error("Optimize apply error:", error);
    return NextResponse.json({ error: "应用失败", detail: String(error) }, { status: 500 });
  }
}