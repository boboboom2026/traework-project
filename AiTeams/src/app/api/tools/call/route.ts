import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// 技能执行处理器
const TOOL_HANDLERS: Record<string, (args: Record<string, unknown>, context: { userId: string; teamId: string }) => Promise<unknown>> = {
  // 发送消息
  send_message: async (args, context) => {
    const { recipient, content } = args;
    if (!recipient || !content) {
      throw new Error("缺少必要参数：recipient, content");
    }

    const client = getSupabaseClient();

    // 查找接收人
    const { data: recipientUser } = await client
      .from("users")
      .select("id, name")
      .or(`name.ilike.%${recipient}%,phone.eq.${recipient}`)
      .single();

    if (!recipientUser) {
      throw new Error(`未找到成员：${recipient}`);
    }

    // 创建或获取会话（查找双向关系）
    const { data: conversation } = await client
      .from("dm_conversations")
      .select("id")
      .or(
        `and(participant1_id.eq.${context.userId},participant2_id.eq.${recipientUser.id}),and(participant1_id.eq.${recipientUser.id},participant2_id.eq.${context.userId})`
      )
      .maybeSingle();

    let conversationId = conversation?.id;

    if (!conversationId) {
      // 获取 team_id
      const { data: member } = await client
        .from("team_members")
        .select("team_id")
        .eq("user_id", context.userId)
        .single();
      
      const { data: newConv, error: insertErr } = await client
        .from("dm_conversations")
        .insert({
          team_id: member?.team_id,
          participant1_id: context.userId,
          participant2_id: recipientUser.id,
        })
        .select("id")
        .single();
      
      if (insertErr) {
        console.error("创建会话失败:", insertErr);
      }
      conversationId = newConv?.id;
    }

    if (!conversationId) {
      throw new Error("创建会话失败");
    }

    // 发送消息
    const { error } = await client
      .from("dm_messages")
      .insert({
        conversation_id: conversationId,
        sender_id: context.userId,
        content: content as string,
      });

    if (error) {
      throw new Error("发送消息失败");
    }

    return {
      success: true,
      message: `消息已发送给 ${recipientUser.name}`,
      recipientId: recipientUser.id,
    };
  },

  // 搜索成员
  search_member: async (args) => {
    const { keyword } = args;
    if (!keyword) {
      throw new Error("缺少搜索关键词");
    }

    const client = getSupabaseClient();

    // 获取团队成员
    const { data: members } = await client
      .from("team_members")
      .select(`
        user_id,
        role,
        users (
          id,
          name,
          nickname,
          avatar,
          position,
          department
        )
      `)
      .eq("team_id", (await getCurrentTeamId(client)) || "");

    const keywordLower = (keyword as string).toLowerCase();
    const results = (members || [])
      .filter(m => {
        const user = m.users as unknown as Record<string, unknown> | null;
        const name = ((user?.name as string) || "").toLowerCase();
        const nickname = ((user?.nickname as string) || "").toLowerCase();
        return name.includes(keywordLower) || nickname.includes(keywordLower);
      })
      .slice(0, 10)
      .map(m => {
        const user = m.users as unknown as Record<string, unknown> | null;
        return {
          id: user?.id,
          name: user?.name,
          avatar: user?.avatar,
          position: user?.position,
        };
      });

    return {
      success: true,
      count: results.length,
      members: results,
    };
  },

  // 创建频道
  create_channel: async (args, context) => {
    const { name, description, type } = args;
    if (!name) {
      throw new Error("缺少频道名称");
    }

    const client = getSupabaseClient();
    const teamId = await getCurrentTeamId(client);

    if (!teamId) {
      throw new Error("未找到当前团队");
    }

    const { data: channel, error } = await client
      .from("channels")
      .insert({
        team_id: teamId,
        name,
        description: description as string || "",
        type: (type as string) || "public",
        created_by: context.userId,
      })
      .select()
      .single();

    if (error) {
      throw new Error("创建频道失败");
    }

    return {
      success: true,
      message: `频道「${name}」已创建`,
      channelId: channel.id,
      channelName: channel.name,
    };
  },

  // 搜索频道
  search_channel: async (args) => {
    const { keyword } = args;
    if (!keyword) {
      throw new Error("缺少搜索关键词");
    }

    const client = getSupabaseClient();
    const teamId = await getCurrentTeamId(client);

    const { data: channels } = await client
      .from("channels")
      .select("id, name, description, type")
      .eq("team_id", teamId || "")
      .ilike("name", `%${keyword}%`)
      .limit(20);

    return {
      success: true,
      count: channels?.length || 0,
      channels: channels || [],
    };
  },

  // 创建群组
  create_group: async (args, context) => {
    const { name, description, memberIds } = args;
    if (!name) {
      throw new Error("缺少群组名称");
    }

    const client = getSupabaseClient();
    const teamId = await getCurrentTeamId(client);

    if (!teamId) {
      throw new Error("未找到当前团队");
    }

    // 创建群组
    const { data: group, error } = await client
      .from("groups")
      .insert({
        team_id: teamId,
        name,
        description: description as string || "",
        created_by: context.userId,
      })
      .select()
      .single();

    if (error || !group) {
      throw new Error("创建群组失败");
    }

    // 添加成员
    if (memberIds && Array.isArray(memberIds) && memberIds.length > 0) {
      const memberRecords = memberIds.map((mid: string) => ({
        group_id: group.id,
        user_id: mid,
        role: "member",
      }));
      // 添加创建者
      memberRecords.push({
        group_id: group.id,
        user_id: context.userId,
        role: "owner",
      });

      await client.from("group_members").insert(memberRecords);
    }

    return {
      success: true,
      message: `群组「${name}」已创建`,
      groupId: group.id,
      groupName: group.name,
    };
  },

  // 查询知识库
  query_knowledge: async (args) => {
    const { datasetId, query: searchQuery } = args;
    if (!datasetId || !searchQuery) {
      throw new Error("缺少知识库ID或查询内容");
    }

    // 这里简化处理，实际应该调用向量搜索
    return {
      success: true,
      message: "知识库查询功能开发中",
      query: searchQuery,
      datasetId,
    };
  },

  // 获取当前时间
  get_current_time: async (_args) => {
    const now = new Date();
    const beijing = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const year = beijing.getUTCFullYear();
    const month = String(beijing.getUTCMonth() + 1).padStart(2, "0");
    const day = String(beijing.getUTCDate()).padStart(2, "0");
    const weekdays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
    const weekday = weekdays[beijing.getUTCDay()];
    const hours = String(beijing.getUTCHours()).padStart(2, "0");
    const minutes = String(beijing.getUTCMinutes()).padStart(2, "0");
    const seconds = String(beijing.getUTCSeconds()).padStart(2, "0");
    return {
      success: true,
      result: `当前时间：${year}年${month}月${day}日 ${weekday} ${hours}:${minutes}:${seconds}（北京时间，UTC+8）`,
      datetime: `${year}-${month}-${day}T${hours}:${minutes}:${seconds}+08:00`,
      date: `${year}年${month}月${day}日`,
      time: `${hours}:${minutes}:${seconds}`,
      weekday,
      timezone: "Asia/Shanghai",
    };
  },

  // 生成图片
  generate_image: async (args) => {
    const { prompt } = args;
    if (!prompt) {
      throw new Error("缺少图片描述（prompt）");
    }

    const { ImageGenerationClient, Config } = await import("@/lib/sdk");
    const config = new Config();
    const imgClient = new ImageGenerationClient(config);
    const response = await imgClient.generate({ prompt: prompt as string });
    const helper = imgClient.getResponseHelper(response);

    if (!helper.success || helper.imageUrls.length === 0) {
      return { success: false, error: "图片生成失败：" + (helper.errorMessages?.join("; ") || "未知错误") };
    }

    const imageUrl = helper.imageUrls[0];

    return {
      success: true,
      result: "图片已生成",
      imageUrl,
      markdown: `![生成图片](${imageUrl})`,
    };
  },

  // 网络搜索
  web_search: async (args) => {
    const { query, count, time_range } = args;
    if (!query) {
      throw new Error("缺少搜索关键词（query）");
    }

    const { SearchClient, Config } = await import("@/lib/sdk");
    const config = new Config();
    const searchClient = new SearchClient(config);

    const searchQuery = query as string;
    let response;
    if (time_range) {
      response = await searchClient.advancedSearch(searchQuery, {
        count: (count as number) || 10,
        timeRange: time_range as string,
        needSummary: true,
      });
    } else {
      response = await searchClient.webSearch(searchQuery, (count as number) || 10, true);
    }

    const summary = response.summary || "";
    const items = response.web_items || [];
    const results = items.map((r: any) => ({
      title: r.title,
      url: r.url,
      snippet: r.snippet,
      content: r.content,
    }));

    return {
      success: true,
      result: `搜索到 ${results.length} 条结果`,
      summary,
      count: results.length,
      results,
    };
  },
};

// 获取当前团队ID
async function getCurrentTeamId(client: ReturnType<typeof getSupabaseClient>): Promise<string | null> {
  // 简化处理，实际应该从用户上下文获取
  const { data } = await client.from("team_members").select("team_id").limit(1).single();
  return data?.team_id || null;
}

// POST /api/agent-skills/call - 执行技能
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { skillAction, args, userId, teamId } = body;

    if (!skillAction) {
      return NextResponse.json({ error: "技能动作不能为空" }, { status: 400 });
    }

    const handler = TOOL_HANDLERS[skillAction];
    if (!handler) {
      return NextResponse.json({ error: `不支持的动作：${skillAction}` }, { status: 400 });
    }

    const result = await handler(args || {}, { userId: userId || "", teamId: teamId || "" });

    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error("执行技能失败:", error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "执行技能失败" 
    }, { status: 500 });
  }
}

// GET /api/agent-skills/call - 获取支持的技能列表
export async function GET() {
  return NextResponse.json({
    success: true,
    actions: Object.keys(TOOL_HANDLERS).map(action => ({
      action,
      name: getActionName(action),
      description: getActionDescription(action),
    })),
  });
}

function getActionName(action: string): string {
  const names: Record<string, string> = {
    send_message: "发送消息",
    search_member: "搜索成员",
    create_channel: "创建频道",
    create_group: "创建群组",
    search_channel: "搜索频道",
    query_knowledge: "查询知识库",
    generate_document: "生成文档",
    generate_image: "AI生成配图",
    web_search: "网络搜索",
  };
  return names[action] || action;
}

function getActionDescription(action: string): string {
  const descriptions: Record<string, string> = {
    send_message: "给团队成员发送私信",
    search_member: "搜索团队成员信息",
    create_channel: "创建一个新的频道",
    create_group: "创建一个新的群组",
    search_channel: "搜索频道",
    query_knowledge: "从知识库中检索相关信息",
    generate_document: "生成 PRD 或方案文档",
    generate_image: "根据文本描述生成配图，仅当用户明确要求配图时才调用",
    web_search: "搜索互联网信息，获取最新资讯、新闻、技术文档等内容",
  };
  return descriptions[action] || "";
}
