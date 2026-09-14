import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: proposalId } = await params;
    const { teamId, action, comment, editedContent, editedDescription } = await request.json();

    if (!teamId || !action) {
      return NextResponse.json({ success: false, error: "参数不完整" }, { status: 400 });
    }

    if (action !== "approve" && action !== "reject") {
      return NextResponse.json({ success: false, error: "无效的操作类型" }, { status: 400 });
    }

    const supabase = getSupabaseClient();

    // 获取提案
    const { data: proposal } = await supabase
      .from("skill_update_proposals")
      .select("*")
      .eq("id", proposalId)
      .eq("team_id", teamId)
      .single();

    if (!proposal) {
      return NextResponse.json({ success: false, error: "提案不存在" }, { status: 404 });
    }

    if (proposal.status !== "pending") {
      return NextResponse.json({ success: false, error: "提案已被处理" }, { status: 400 });
    }

    if (action === "reject") {
      const { data: updated, error } = await supabase
        .from("skill_update_proposals")
        .update({
          status: "rejected",
          review_comment: comment || "已驳回",
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", proposalId)
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ success: true, proposal: updated });
    }

    // action === "approve"
    const finalContent = editedContent || proposal.new_content;
    const finalDescription = editedDescription || proposal.new_description;

    if (proposal.action === "create_skill") {
      // 创建新技能
      const { data: newSkill, error: createError } = await supabase
        .from("skills")
        .insert({
          team_id: teamId,
          position_id: proposal.position_id || null,
          name: proposal.title,
          description: finalDescription || "",
          content: finalContent,
          tags: [],
        })
        .select()
        .single();

      if (createError) throw createError;

      // 更新智能体的 skill_ids
      if (newSkill) {
        const { data: agent } = await supabase
          .from("agents")
          .select("skill_ids")
          .eq("id", proposal.agent_id)
          .single();

        const currentSkills = (agent?.skill_ids as string[]) || [];
        if (!currentSkills.includes(newSkill.id)) {
          await supabase
            .from("agents")
            .update({ skill_ids: [...currentSkills, newSkill.id] })
            .eq("id", proposal.agent_id);
        }
      }
    } else if (proposal.action === "update_skill" && proposal.skill_id) {
      // 更新已有技能
      const { error: updateError } = await supabase
        .from("skills")
        .update({
          name: proposal.title,
          description: finalDescription || "",
          content: finalContent,
        })
        .eq("id", proposal.skill_id);

      if (updateError) throw updateError;
    }

    // 更新提案状态
    const { data: updated, error: updateError } = await supabase
      .from("skill_update_proposals")
      .update({
        status: "approved",
        review_comment: "已批准",
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", proposalId)
      .select()
      .single();

    if (updateError) throw updateError;

    // 记录培训记录
    await supabase.from("agent_training_records").insert({
      agent_id: proposal.agent_id,
      team_id: teamId,
      train_type: "skill_update",
      source_type: "ai_analysis",
      source_ref: proposalId,
      content: `${proposal.action === "create_skill" ? "新建" : "更新"}技能: ${proposal.title}`,
    });

    return NextResponse.json({ success: true, proposal: updated });
  } catch (error: any) {
    console.error("处理技能建议失败:", error);
    return NextResponse.json({ success: false, error: error.message || "操作失败" }, { status: 500 });
  }
}