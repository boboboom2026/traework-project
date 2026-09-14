import { getSupabaseClient } from "@/storage/database/supabase-client";

/**
 * 从对话中提取用户偏好，写入 agent_user_preferences 表
 * 在对话完成后异步调用，不阻塞主流程
 */
export async function learnUserPreferences(params: {
  agentId: string;
  userId: string;
  teamId: string;
  userMessage: string;
  agentResponse: string;
}) {
  const { agentId, userId, teamId, userMessage, agentResponse } = params;

  // 异步执行，不阻塞主流程
  try {
    const client = await getSupabaseClient();

    // 提取偏好特征
    const preferences = extractPreferences(userMessage, agentResponse);

    // 查询已有记录
    const { data: existing } = await client
      .from("agent_user_preferences")
      .select("*")
      .eq("agent_id", agentId)
      .eq("user_id", userId)
      .single();

    if (existing) {
      // 合并偏好
      const mergedPrefs = mergePreferences(existing.preferences || {}, preferences);
      await client
        .from("agent_user_preferences")
        .update({
          preferences: mergedPrefs,
          interaction_count: (existing.interaction_count || 0) + 1,
          last_interaction_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      // 创建新记录
      await client.from("agent_user_preferences").insert({
        agent_id: agentId,
        user_id: userId,
        team_id: teamId,
        preferences,
        interaction_count: 1,
        last_interaction_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  } catch (e) {
    // 静默失败，不影响主流程
    console.warn("[UserPreferenceLearner] 学习用户偏好失败:", e);
  }
}

/**
 * 从对话中提取用户偏好特征
 * 基于简单的规则分析，不依赖 LLM
 */
function extractPreferences(userMessage: string, agentResponse: string): Record<string, any> {
  const prefs: Record<string, any> = {};
  const combined = (userMessage + " " + agentResponse).toLowerCase();

  // 语言偏好
  const hasChinese = /[\u4e00-\u9fff]/.test(combined);
  prefs.language = hasChinese ? "zh" : "en";

  // 格式偏好
  if (combined.includes("markdown") || combined.includes("md") || combined.includes("```")) {
    prefs.format = "markdown";
  } else if (combined.includes("表格") || combined.includes("table") || combined.includes("|")) {
    prefs.format = "table";
  } else {
    prefs.format = "text";
  }

  // 详细程度
  if (combined.includes("详细") || combined.includes("detail") || combined.includes("深入")) {
    prefs.detail_level = "detailed";
  } else if (combined.includes("简洁") || combined.includes("简短") || combined.includes("brief") || combined.includes("summary")) {
    prefs.detail_level = "brief";
  } else {
    prefs.detail_level = "normal";
  }

  // 代码偏好
  if (combined.includes("代码") || combined.includes("code") || combined.includes("sql") || combined.includes("python")) {
    prefs.code_examples = true;
  }

  // 数据来源偏好
  if (combined.includes("来源") || combined.includes("source") || combined.includes("出处") || combined.includes("引用")) {
    prefs.data_sources = true;
  }

  return prefs;
}

/**
 * 合并新旧偏好，新值覆盖旧值
 */
function mergePreferences(old: Record<string, any>, fresh: Record<string, any>): Record<string, any> {
  return { ...old, ...fresh };
}

/**
 * 获取用户偏好描述文本（用于注入 system prompt）
 */
export function getUserPreferenceText(preferences: Record<string, any>): string {
  const parts: string[] = [];

  if (preferences.language === "zh") {
    parts.push("该用户偏好中文交流");
  } else {
    parts.push("该用户偏好英文交流");
  }

  if (preferences.format === "markdown") {
    parts.push("喜欢 Markdown 格式的输出");
  } else if (preferences.format === "table") {
    parts.push("喜欢表格形式的输出");
  }

  if (preferences.detail_level === "detailed") {
    parts.push("偏好详细深入的分析");
  } else if (preferences.detail_level === "brief") {
    parts.push("偏好简洁扼要的回复");
  }

  if (preferences.code_examples) {
    parts.push("期望附带代码示例");
  }

  if (preferences.data_sources) {
    parts.push("需要标注数据来源和引用");
  }

  return parts.length > 0 ? "用户偏好：" + parts.join("，") + "。" : "";
}