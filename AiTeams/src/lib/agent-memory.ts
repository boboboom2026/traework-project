import { EmbeddingClient } from "@/lib/sdk";
import { getSupabaseClient } from "@/storage/database/supabase-client";

export interface MemoryEntry {
  id: string;
  agent_id: string;
  user_id: string;
  team_id: string;
  content: string;
  summary: string;
  similarity?: number;
  created_at: string;
}

/**
 * 检索智能体记忆
 * 根据用户查询语义搜索相关历史对话摘要
 */
export async function searchMemories(
  params: {
    agentId: string;
    userId: string;
    teamId: string;
    query: string;
    limit?: number;
    customHeaders?: Record<string, string>;
  }
): Promise<{ success: boolean; data: MemoryEntry[]; error?: string }> {
  try {
    const { agentId, userId, teamId, query, limit = 5, customHeaders } = params;

    // 生成查询文本的嵌入向量
    const embeddingClient = new EmbeddingClient(undefined, customHeaders);
    const embedding = await embeddingClient.embedText(query, { dimensions: 1024 });

    // 使用 Supabase RPC 进行向量相似度搜索
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc("search_agent_memories", {
      p_agent_id: agentId,
      p_user_id: userId,
      p_team_id: teamId,
      p_query_embedding: embedding,
      p_limit: limit,
    });

    if (error) {
      return { success: false, data: [], error: error.message };
    }

    const memories: MemoryEntry[] = (data || []).map((item: any) => ({
      id: item.id,
      agent_id: item.agent_id,
      user_id: item.user_id,
      team_id: item.team_id,
      content: item.content,
      summary: item.summary,
      similarity: item.similarity,
      created_at: item.created_at,
    }));

    return { success: true, data: memories };
  } catch (err: any) {
    return { success: false, data: [], error: err.message || "检索记忆失败" };
  }
}

/**
 * 存储智能体记忆
 * 将对话摘要保存为记忆，供后续检索
 */
export async function storeMemory(
  params: {
    agentId: string;
    userId: string;
    teamId: string;
    content: string;
    summary: string;
    customHeaders?: Record<string, string>;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const { agentId, userId, teamId, content, summary, customHeaders } = params;

    // 生成记忆内容的嵌入向量
    const embeddingClient = new EmbeddingClient(undefined, customHeaders);
    const embedding = await embeddingClient.embedText(summary, { dimensions: 1024 });

    const supabase = getSupabaseClient();
    const { error } = await supabase.from("agent_memories").insert({
      agent_id: agentId,
      user_id: userId,
      team_id: teamId,
      content,
      summary,
      embedding,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "存储记忆失败" };
  }
}

// 向后兼容包装函数
export async function retrieveAgentMemory(
  agentId: string,
  userId: string,
  teamId: string,
  query: string,
  limit: number = 5,
  customHeaders?: Record<string, string>
): Promise<MemoryEntry[]> {
  const result = await searchMemories({ agentId, userId, teamId, query, limit, customHeaders });
  return result.success ? result.data : [];
}

export async function storeAgentMemory(
  agentId: string,
  userId: string,
  teamId: string,
  content: string,
  summary: string,
  customHeaders?: Record<string, string>
): Promise<boolean> {
  const result = await storeMemory({ agentId, userId, teamId, content, summary, customHeaders });
  return result.success;
}