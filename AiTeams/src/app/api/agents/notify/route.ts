import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { LLMClient, Config, HeaderUtils } from "@/lib/sdk";

export const dynamic = "force-dynamic";

/**
 * 智能体主动推送通知 API
 * 
 * 外部系统/事件触发调用，让智能体向频道或用户发送通知消息。
 * 
 * POST /api/agents/notify
 * Body: {
 *   agentId: string;
 *   event: string;           // alert | report | reminder | custom
 *   payload: { title: string; message: string; metadata?: Record<string, any> };
 *   target?: {               // 可选，覆盖智能体默认通知目标
 *     channelIds?: string[];
 *     userIds?: string[];
 *   };
 *   priority?: "low" | "normal" | "urgent";
 *   webhookSecret?: string;  // 可选，用于验证调用方身份
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agentId, event, payload, target, priority, webhookSecret } = body;

    if (!agentId || !event || !payload) {
      return NextResponse.json({ error: "参数不完整：agentId、event、payload 必填" }, { status: 400 });
    }

    if (!payload.title || !payload.message) {
      return NextResponse.json({ error: "payload 中 title 和 message 必填" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 1. 获取智能体配置
    const { data: agent, error: agentError } = await client
      .from("agents")
      .select("id, name, description, system_prompt, notify_enabled, notify_config, team_id, status")
      .eq("id", agentId)
      .eq("status", "active")
      .single();

    if (agentError || !agent) {
      return NextResponse.json({ error: "智能体不存在或已停用" }, { status: 404 });
    }

    if (!agent.notify_enabled) {
      return NextResponse.json({ error: "该智能体未启用通知推送功能" }, { status: 403 });
    }

    // 2. 验证 Webhook Secret（如果智能体配置了）
    const notifyConfig = (agent.notify_config as Record<string, unknown>) || {};
    const configuredSecret = notifyConfig.webhook_secret as string | undefined;
    if (configuredSecret && configuredSecret !== webhookSecret) {
      return NextResponse.json({ error: "Webhook 验证失败" }, { status: 401 });
    }

    // 3. 免打扰时段检查
    const quietHours = notifyConfig.quiet_hours as { start: string; end: string } | undefined;
    if (quietHours && quietHours.start && quietHours.end) {
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const currentTime = currentHour * 60 + currentMinute;
      const [startH, startM] = quietHours.start.split(":").map(Number);
      const [endH, endM] = quietHours.end.split(":").map(Number);
      const startTime = startH * 60 + startM;
      const endTime = endH * 60 + endM;

      let inQuietHours = false;
      if (startTime <= endTime) {
        inQuietHours = currentTime >= startTime && currentTime <= endTime;
      } else {
        // 跨午夜
        inQuietHours = currentTime >= startTime || currentTime <= endTime;
      }

      if (inQuietHours && priority !== "urgent") {
        return NextResponse.json({ 
          success: false, 
          message: "当前处于免打扰时段，非紧急通知已跳过",
          quietHours: true,
        }, { status: 202 });
      }
    }

    // 4. LLM 生成通知内容
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const notifyContent = await generateNotificationContent({
      agentName: agent.name,
      agentGoal: agent.system_prompt,
      agentDescription: agent.description,
      event,
      payload,
      template: notifyConfig.template as string | undefined,
      priority: priority || "normal",
    }, customHeaders);

    // 5. 确定推送目标
    const targetChannels = target?.channelIds || (notifyConfig.channels as string[]) || [];
    const targetUsers = target?.userIds || (notifyConfig.users as string[]) || [];

    if (targetChannels.length === 0 && targetUsers.length === 0) {
      return NextResponse.json({ error: "未配置通知目标（频道或用户），请在智能体通知设置中配置" }, { status: 400 });
    }

    // 6. 向频道推送
    const channelResults: Array<{ channelId: string; success: boolean }> = [];
    for (const channelId of targetChannels) {
      // 校验频道属于同一团队
      const { data: channelData } = await client
        .from("channels")
        .select("id, name")
        .eq("id", channelId)
        .eq("team_id", agent.team_id)
        .eq("is_active", true)
        .single();

      if (!channelData) {
        channelResults.push({ channelId, success: false });
        continue;
      }

      const { error: insertError } = await client
        .from("channel_messages")
        .insert({
          channel_id: channelId,
          sender_id: agentId,
          sender_type: "agent",
          content: notifyContent,
          message_type: "text",
          is_active: true,
        });

      if (insertError) {
        console.error("推送频道消息失败:", insertError);
        channelResults.push({ channelId, success: false });
      } else {
        channelResults.push({ channelId, success: true });
      }
    }

    // 7. 向用户私聊推送
    const userResults: Array<{ userId: string; success: boolean }> = [];
    for (const userId of targetUsers) {
      // 校验用户属于同一团队
      const { data: membership } = await client
        .from("team_members")
        .select("id")
        .eq("team_id", agent.team_id)
        .eq("user_id", userId)
        .single();

      if (!membership) {
        userResults.push({ userId, success: false });
        continue;
      }

      // 获取或创建智能体私聊会话
      const { data: existingSession } = await client
        .from("agent_chat_sessions")
        .select("id")
        .eq("user_id", userId)
        .eq("agent_id", agentId)
        .eq("is_active", true)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

      let sessionId = existingSession?.id;

      if (!sessionId) {
        const { data: newSession, error: sessionError } = await client
          .from("agent_chat_sessions")
          .insert({
            team_id: agent.team_id,
            user_id: userId,
            agent_id: agentId,
            last_message: notifyContent.slice(0, 100),
          })
          .select("id")
          .single();

        if (sessionError || !newSession) {
          console.error("创建智能体会话失败:", sessionError);
          userResults.push({ userId, success: false });
          continue;
        }
        sessionId = newSession.id;
      }

      const { error: msgError } = await client
        .from("agent_chat_messages")
        .insert({
          session_id: sessionId,
          sender_type: "agent",
          sender_id: agentId,
          content: notifyContent,
        });

      if (msgError) {
        console.error("推送私聊消息失败:", msgError);
        userResults.push({ userId, success: false });
      } else {
        // 更新会话最后消息
        await client
          .from("agent_chat_sessions")
          .update({
            last_message: notifyContent.length > 100 ? notifyContent.slice(0, 100) + "..." : notifyContent,
            last_message_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", sessionId);

        userResults.push({ userId, success: true });
      }
    }

    const successChannels = channelResults.filter(r => r.success).length;
    const successUsers = userResults.filter(r => r.success).length;

    return NextResponse.json({
      success: true,
      channels: { total: targetChannels.length, success: successChannels, results: channelResults },
      users: { total: targetUsers.length, success: successUsers, results: userResults },
      content: notifyContent,
    });
  } catch (error) {
    console.error("智能体通知推送错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

/**
 * LLM 生成通知内容
 */
async function generateNotificationContent(
  params: {
    agentName: string;
    agentGoal: string | null;
    agentDescription: string | null;
    event: string;
    payload: { title: string; message: string; metadata?: Record<string, unknown> };
    template?: string;
    priority: string;
  },
  customHeaders: Record<string, string>,
): Promise<string> {
  try {
    const systemPrompt = `你是智能体"${params.agentName}"，现在需要向用户发送一条通知消息。
规则：
- 消息要简洁明了，突出重点
- 如果是紧急事件，开头标注 ⚠️ [紧急]
- 如果是预警事件，开头标注 🔔 [预警]
- 如果是普通通知，开头标注 📢 [通知]
- 使用专业但友好的语气
- 不要添加多余的开场白，直接给出核心信息
- 末尾可给出建议操作（如有）
${params.agentGoal ? `\n你的目标：${params.agentGoal}` : ""}`;

    const userMessage = `事件类型：${params.event}
优先级：${params.priority}
${params.template ? `消息模板：${params.template}` : ""}

事件数据：
- 标题：${params.payload.title}
- 详情：${params.payload.message}
${params.payload.metadata ? `- 附加信息：${JSON.stringify(params.payload.metadata)}` : ""}

请生成通知消息内容（纯文本，不要使用 Markdown 格式）：`;

    const config = new Config();
    const llmClient = new LLMClient(config, customHeaders);

    // 使用非流式调用
    const messages = [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: userMessage },
    ];

    const stream = llmClient.stream(messages, {
      model: "doubao-seed-2-0-pro-260215",
      temperature: 0.3,
    });

    let content = "";
    for await (const chunk of stream) {
      const text = chunk.content?.toString() || "";
      content += text;
    }

    return content.trim() || `${params.payload.title}\n${params.payload.message}`;
  } catch (err) {
    console.error("LLM 生成通知内容失败，使用原始内容:", err);
    // 降级：使用原始 payload 内容
    const prefix = params.priority === "urgent" ? "⚠️ [紧急] " : params.priority === "low" ? "📢 [通知] " : "🔔 [预警] ";
    return `${prefix}${params.payload.title}\n${params.payload.message}`;
  }
}
