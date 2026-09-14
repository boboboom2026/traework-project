/**
 * 公众号文章写作工作流 — 种子脚本
 * 
 * 运行方式: npx tsx scripts/seed-wechat-workflow.ts
 * 
 * 工作流流程:
 *   1. AI 生成初稿（根据用户指令）
 *   2. 发起者审核卡片（通过 → 送彭Sir / 修改意见 → 重生成）
 *   3. 彭Sir 审批（通过 → 成稿 / 修改意见 → 优化后重审）
 *   4. 最终成稿（格式优化排版）
 */

import { getSupabaseClient } from "../src/storage/database/supabase-client";

const TEAM_ID = "62fe46ac-aa21-4a07-b6a8-e08b31282f01"; // AiTeams
const PENGSI_USER_ID = "22755b54-8468-4603-b96a-5dc19a57bd2a"; // 彭宝权

async function main() {
  const client = getSupabaseClient();

  // 检查是否已存在同名工作流
  const { data: existing } = await client
    .from("agent_workflows")
    .select("id")
    .eq("name", "公众号文章写作流程")
    .eq("team_id", TEAM_ID)
    .single();

  if (existing) {
    console.log("⚠️ 工作流已存在，ID:", existing.id);
    console.log("如需重新创建，请先删除旧记录");
    return;
  }

  const workflow = {
    team_id: TEAM_ID,
    name: "公众号文章写作流程",
    description: "AI生成初稿 → 发起者审核 → 彭Sir审批 → 最终成稿。支持多轮修改迭代。",
    steps: [
      {
        step_id: "generate_draft",
        name: "生成初稿",
        type: "llm_generate",
        prompt:
          "根据用户指令和需求，生成一篇公众号文章初稿。要求：标题吸引人，内容结构清晰，语气符合公众号调性。\n\n用户指令：{{user_input}}\n\n请输出完整的文章初稿，包含标题和正文。",
        output_key: "draft",
        model_config: { temperature: 0.7, max_tokens: 4096 },
      },
      {
        step_id: "initiator_review",
        name: "审核卡片",
        type: "human_review",
        input_template:
          "## 📝 公众号文章初稿\n\n{{draft}}\n\n---\n### 请审核\n\n✅ **通过** → 将发送给彭Sir审批\n✏️ **输入修改意见** → 根据意见重新生成后再次提交审核",
        output_key: "initiator_review_result",
        human_review_config: {
          approver_type: "user",
          approver_ids: ["{{initiator_id}}"],
          detail_ref: "draft",
          detail_type: "markdown",
          approve_action: "send_to_supervisor",
          on_reject: "restart",
        },
      },
      {
        step_id: "check_initiator_decision",
        name: "判断审核结果",
        type: "condition",
        condition: {
          expression:
            "initiator_review_result 为 'approved' 或包含 '通过' 或包含 '确认'",
          true_branch: "pengsi_review",
          false_branch: "generate_draft",
        },
      },
      {
        step_id: "pengsi_review",
        name: "彭Sir审批",
        type: "human_review",
        input_template:
          "## 📝 公众号文章（待终审）\n\n{{draft}}\n\n---\n### 请彭Sir审批\n\n✅ **通过** → 最终成稿发布\n✏️ **输入修改意见** → 根据意见优化后重新提交",
        output_key: "pengsi_review_result",
        human_review_config: {
          approver_type: "user",
          approver_ids: [PENGSI_USER_ID],
          detail_ref: "draft",
          detail_type: "markdown",
          approve_action: "finalize",
          on_reject: "restart",
        },
      },
      {
        step_id: "check_pengsi_decision",
        name: "判断彭Sir审批结果",
        type: "condition",
        condition: {
          expression:
            "pengsi_review_result 为 'approved' 或包含 '通过' 或包含 '确认'",
          true_branch: "finalize",
          false_branch: "generate_draft",
        },
      },
      {
        step_id: "finalize",
        name: "最终成稿",
        type: "llm_generate",
        prompt:
          "这是审核通过的公众号文章，请进行最终格式优化和排版整理，确保输出为整洁、可直接发布的完整文章：\n\n{{draft}}\n\n请输出最终版文章，保持原有内容不变，仅优化格式和排版。",
        output_key: "final_draft",
        model_config: { temperature: 0.3, max_tokens: 4096 },
      },
    ],
    trigger_condition: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await client
    .from("agent_workflows")
    .insert(workflow)
    .select()
    .single();

  if (error) {
    console.error("❌ 创建工作流失败:", error.message);
    process.exit(1);
  }

  console.log("✅ 公众号文章写作工作流创建成功！");
  console.log("   ID:", data.id);
  console.log("   名称:", data.name);
  console.log("   步骤数:", data.steps?.length ?? 0);
  console.log("   团队:", TEAM_ID);
  console.log("   彭Sir审批人:", PENGSI_USER_ID);
  console.log("");
  console.log("📋 工作流步骤：");
  for (const step of data.steps) {
    console.log(`   ${step.step_id}: ${step.name} (${step.type})`);
  }
}

main().catch((err) => {
  console.error("❌ 脚本执行失败:", err);
  process.exit(1);
});