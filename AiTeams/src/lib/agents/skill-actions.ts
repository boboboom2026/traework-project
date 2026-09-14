/**
 * Agent Tools 加载器
 *
 * 从 tools 表加载智能体绑定的可执行工具
 * 工具直接执行，无需外部 MCP 服务
 */

import { getSupabaseClient } from "@/storage/database/supabase-client";
import { createApprovalTask, listApprovalTasks, approveTask, rejectTask, forwardApproval } from "@/lib/agents/approval-service";
import type { ApprovalStatus } from "@/lib/agents/approval-service";

function safeParseAny(str: unknown): unknown {
  if (typeof str !== "string") return str;
  try { return JSON.parse(str); } catch { return str; }
}

/**
 * Tool 参数定义
 */
export interface ToolParameter {
  name: string;
  type: string;
  label?: string;
  required?: boolean;
  description?: string;
  options?: string[];
}

/**
 * Agent Tool 格式（对应 tools 表）
 */
export interface AgentTool {
  id: string;
  name: string;
  description: string | null;
  action: string;
  tool_type?: "builtin" | "http" | "mcp";
  parameters: ToolParameter[];
  category: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

/**
 * Function Calling 格式的 Tool
 */
export interface FunctionTool {
  type: "function";
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required: string[];
  };
}

/**
 * 工具执行结果
 */
export interface ToolExecutionResult {
  success: boolean;
  result?: unknown;
  error?: string;
}

/**
 * 内置工具函数类型
 */
type BuiltinToolHandler = (
  params: Record<string, unknown>,
  context: { agentId: string; teamId: string; userId?: string }
) => Promise<ToolExecutionResult>;

/**
 * 内置工具函数
 */
const BUILTIN_TOOLS: Record<string, BuiltinToolHandler> = {
  // 获取成员信息
  get_member: async (params, context) => {
    const client = getSupabaseClient();
    const { member_id } = params;
    const team_id = (params.team_id as string) || context?.teamId || "";

    if (member_id) {
      // 按 ID 查询单个成员
      const { data, error } = await client
        .from("users")
        .select("id, name, phone, email, avatar_url, title, department")
        .eq("id", member_id)
        .single();

      if (error || !data) {
        return { success: false, error: "未找到该成员" };
      }
      return { success: true, result: data };
    }

    if (team_id) {
      // 按团队查询成员列表
      const { data, error } = await client
        .from("team_members")
        .select(`
          id,
          role,
          joined_at,
          users!inner (
            id, name, phone, email, avatar_url, title, department
          )
        `)
        .eq("team_id", team_id);

      if (error) {
        return { success: false, error: `查询成员失败: ${error.message}` };
      }
      const members = (data || []).map((m: Record<string, unknown>) => ({
        ...(m.users as Record<string, unknown>),
        role: m.role,
        joined_at: m.joined_at,
      }));
      return { success: true, result: members };
    }

    return { success: false, error: "请提供 member_id 或 team_id" };
  },

  // 搜索频道消息
  search_channel_messages: async (params, context) => {
    const client = getSupabaseClient();
    const { channel_name, time_range, user_id } = params;
    const team_id = (params.team_id as string) || context?.teamId || "";
    const { data: channels } = await client
      .from("channels")
      .select("id, name")
      .eq("team_id", team_id)
      .ilike("name", `%${channel_name || ""}%`);
    if (!channels || channels.length === 0) return { success: false, error: "未找到匹配的频道" };
    const channel = channels[0];
    let query = client
      .from("channel_messages")
      .select("id, content, created_at, sender_type, sender_id")
      .eq("channel_id", channel.id)
      .order("created_at", { ascending: false })
      .limit(100);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    if (time_range === "本周") {
      query = query.gte("created_at", sevenDaysAgo.toISOString());
    }
    const { data: messages } = await query;
    if (!messages || messages.length === 0) return { success: false, error: `频道「${channel.name}」暂无消息` };
    const formatted = messages.map((m: any) => `[${m.created_at}] ${m.sender_type === "agent" ? "🤖" : "👤"} ${m.content}`).join("\n");
    return { success: true, result: `频道「${channel.name}」共 ${messages.length} 条消息：\n${formatted}` };
  },

  // 发送消息到频道
  send_to_channel: async (params, context) => {
    const client = getSupabaseClient();
    const { channel_name, content, message } = params;
    const team_id = (params.team_id as string) || context?.teamId || "";
    const msgContent = content || message || "";
    if (!msgContent) return { success: false, error: "消息内容不能为空" };
    const { data: channels } = await client
      .from("channels")
      .select("id, name")
      .eq("team_id", team_id)
      .ilike("name", `%${channel_name || ""}%`);
    if (!channels || channels.length === 0) return { success: false, error: `未找到频道「${channel_name}」` };
    const channel = channels[0];
    const { data: msg, error } = await client
      .from("channel_messages")
      .insert({
        channel_id: channel.id,
        content: msgContent,
        sender_id: context?.agentId || "channel-ai-assistant",
        sender_type: "agent",
      })
      .select("id")
      .single();
    if (error) return { success: false, error: `发送失败: ${error.message}` };
    return { success: true, result: `消息已成功发送到频道「${channel.name}」✅` };
  },

  // 邀请用户加入频道
  invite_to_channel: async (params, context) => {
    const client = getSupabaseClient();
    let { user_id, member_name, channel_name } = params;
    const team_id = (params.team_id as string) || context?.teamId || "";
    if (!user_id && member_name) {
      const { data: users } = await client.from("users").select("id").ilike("name", `%${member_name}%`).limit(1);
      if (users && users.length > 0) user_id = users[0].id;
    }
    if (!user_id || !channel_name) return { success: false, error: "缺少用户ID或频道名称" };
    const { data: channels } = await client
      .from("channels")
      .select("id, name")
      .eq("team_id", team_id)
      .ilike("name", `%${channel_name || ""}%`);
    if (!channels || channels.length === 0) return { success: false, error: `未找到频道「${channel_name}」` };
    const channel = channels[0];
    const { error } = await client
      .from("channel_members")
      .insert({ channel_id: channel.id, user_id });
    if (error) {
      if (error.message?.includes("duplicate") || error.code === "23505") return { success: false, error: `用户已在频道「${channel.name}」中` };
      return { success: false, error: `邀请失败: ${error.message}` };
    }
    return { success: true, result: `用户已成功加入频道「${channel.name}」✅` };
  },

  // 搜索成员
  search_member: async (params, context) => {
    const client = getSupabaseClient();
    const { keyword } = params;
    const team_id = (params.team_id as string) || context?.teamId || "";

    if (!keyword) {
      return { success: false, error: "请提供搜索关键词" };
    }

    let query = client
      .from("users")
      .select("id, name, phone, email, avatar_url, title, department")
      .or(`name.ilike.%${keyword}%,phone.ilike.%${keyword}%`);

    if (team_id) {
      // 只搜索团队成员
      const { data: members } = await client
        .from("team_members")
        .select("user_id")
        .eq("team_id", team_id as string);

      const userIds = (members || []).map((m: { user_id: string }) => m.user_id);
      if (userIds.length > 0) {
        query = query.in("id", userIds);
      } else {
        return { success: true, result: [] };
      }
    }

    const { data, error } = await query.limit(20);

    if (error) {
      return { success: false, error: `搜索失败: ${error.message}` };
    }
    return { success: true, result: data || [] };
  },

  // 列出团队成员
  list_members: async (params, context) => {
    const client = getSupabaseClient();
    const { limit = 20, offset = 0 } = params;
    const team_id = (params.team_id as string) || context?.teamId || "";

    if (!team_id) {
      return { success: false, error: "请提供 team_id" };
    }

    const { data, error } = await client
      .from("team_members")
      .select(`
        id,
        role,
        joined_at,
        users!inner (
          id, name, phone, email, avatar_url, title, department
        )
      `)
      .eq("team_id", team_id as string)
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (error) {
      return { success: false, error: `查询成员失败: ${error.message}` };
    }

    const members = (data || []).map((m: Record<string, unknown>) => ({
      ...(m.users as Record<string, unknown>),
      role: m.role,
      joined_at: m.joined_at,
    }));

    return { success: true, result: members };
  },

  // 搜索频道
  search_channel: async (params, context) => {
    const client = getSupabaseClient();
    const { keyword } = params;
    const team_id = (params.team_id as string) || context?.teamId || "";

    if (!keyword) {
      return { success: false, error: "请提供搜索关键词" };
    }

    let query = client
      .from("channels")
      .select("id, name, description, is_private, created_at")
      .ilike("name", `%${keyword}%`)
      .limit(20);

    if (team_id) {
      query = query.eq("team_id", team_id as string);
    }

    const { data, error } = await query;

    if (error) {
      return { success: false, error: `搜索失败: ${error.message}` };
    }
    return { success: true, result: data || [] };
  },

  // 获取频道信息
  get_channel: async (params) => {
    const client = getSupabaseClient();
    const { channel_id } = params;

    if (!channel_id) {
      return { success: false, error: "请提供 channel_id" };
    }

    const { data, error } = await client
      .from("channels")
      .select("id, name, description, is_private, created_at, team_id")
      .eq("id", channel_id)
      .single();

    if (error || !data) {
      return { success: false, error: "未找到该频道" };
    }
    return { success: true, result: data };
  },

  // 查询知识库
  query_knowledge: async (params) => {
    const client = getSupabaseClient();
    const { query: searchQuery, rag_id, team_id, limit = 5 } = params;

    if (!searchQuery) {
      return { success: false, error: "请提供查询内容" };
    }

    // 先从 rag_datasets 获取数据集信息
    let datasetIds: string[] = [];
    if (rag_id) {
      datasetIds = [rag_id as string];
    } else if (team_id) {
      const { data: datasets } = await client
        .from("rag_datasets")
        .select("id")
        .eq("team_id", team_id as string)
        .eq("enabled", true);

      datasetIds = (datasets || []).map((d: { id: string }) => d.id);
    }

    if (datasetIds.length === 0) {
      return { success: true, result: [], message: "没有可用的知识库" };
    }

    // 简化处理：直接返回提示信息
    // 实际向量检索需要在数据库层面实现
    return {
      success: true,
      result: [],
      message: `知识库检索需要配置向量数据库。请在知识库中上传文档后，系统将自动进行语义检索。`,
    };
  },

  // 获取团队信息
  get_team: async (params, context) => {
    const client = getSupabaseClient();
    const team_id = (params.team_id as string) || context?.teamId || "";

    if (!team_id) {
      return { success: false, error: "请提供 team_id" };
    }

    const { data, error } = await client
      .from("teams")
      .select("id, name, website, avatar_url, created_at")
      .eq("id", team_id)
      .single();

    if (error || !data) {
      return { success: false, error: "未找到该团队" };
    }
    return { success: true, result: data };
  },

  // 发送私信
  send_message: async (params) => {
    const client = getSupabaseClient();
    const { recipient_id, content, sender_id, team_id } = params;

    if (!recipient_id || !content) {
      return { success: false, error: "请提供 recipient_id 和 content" };
    }

    // 如果没有提供 sender_id，尝试从 team_id 获取当前用户
    let actualSenderId = sender_id;
    if (!actualSenderId && team_id) {
      // 这里应该从上下文中获取当前用户，暂时返回错误
      return { success: false, error: "请提供 sender_id（发送者用户ID）" };
    }

    // 先创建或获取会话
    let conversationId: string | null = null;
    
    // 查找已有的私聊会话
    const { data: existingConv } = await client
      .from("dm_conversations")
      .select("id")
      .or(`user1_id.eq.${actualSenderId},user2_id.eq.${actualSenderId}`)
      .or(`user1_id.eq.${recipient_id},user2_id.eq.${recipient_id}`)
      .single();

    if (existingConv) {
      conversationId = existingConv.id;
    } else {
      // 创建新会话
      const { data: newConv, error: convError } = await client
        .from("dm_conversations")
        .insert({
          user1_id: actualSenderId,
          user2_id: recipient_id,
        })
        .select("id")
        .single();

      if (convError || !newConv) {
        return { success: false, error: "创建会话失败" };
      }
      conversationId = newConv.id;
    }

    // 发送消息
    const { data: message, error: msgError } = await client
      .from("dm_messages")
      .insert({
        conversation_id: conversationId,
        sender_id: actualSenderId,
        content,
      })
      .select("id, content, created_at, sender_id")
      .single();

    if (msgError) {
      return { success: false, error: `发送消息失败: ${msgError.message}` };
    }

    return { 
      success: true, 
      result: {
        message_id: message.id,
        content: message.content,
        created_at: message.created_at,
        sender_id: message.sender_id,
      }
    };
  },

  // 创建频道
  create_channel: async (params) => {
    const client = getSupabaseClient();
    const { name, description, team_id, is_private = false, created_by } = params;

    if (!name || !team_id) {
      return { success: false, error: "请提供 name 和 team_id" };
    }

    // 检查是否已有同名频道
    const { data: existing } = await client
      .from("channels")
      .select("id, name")
      .eq("team_id", team_id as string)
      .eq("name", name)
      .single();

    if (existing) {
      return { success: false, error: `频道 "${name}" 已存在` };
    }

    // 创建频道
    const channelId = `ch-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const { data: channel, error } = await client
      .from("channels")
      .insert({
        id: channelId,
        team_id,
        name,
        description,
        is_private,
        created_by,
      })
      .select("id, name, description, is_private, created_at")
      .single();

    if (error) {
      return { success: false, error: `创建频道失败: ${error.message}` };
    }

    // 自动将创建者加入频道
    if (created_by) {
      await client.from("channel_members").insert({
        channel_id: channelId,
        user_id: created_by as string,
        role: "admin",
      });
    }

    return { success: true, result: channel };
  },

  // 创建群组
  create_group: async (params: Record<string, unknown>) => {
    const client = getSupabaseClient();
    const { name, description, team_id, member_ids = [], created_by } = params;

    if (!name || !team_id) {
      return { success: false, error: "请提供 name 和 team_id" };
    }

    // 创建群组
    const { data: group, error } = await client
      .from("groups")
      .insert({
        team_id,
        name,
        description,
        created_by,
      })
      .select("id, name, description, member_count, created_at")
      .single();

    if (error) {
      return { success: false, error: `创建群组失败: ${error.message}` };
    }

    // 添加成员
    if (member_ids && Array.isArray(member_ids) && member_ids.length > 0) {
      const memberRecords = (member_ids as string[]).map((userId: string) => ({
        group_id: group.id,
        user_id: userId,
        role: "member",
      }));
      
      // 如果有创建者，也添加创建者
      if (created_by && typeof created_by === "string" && !(member_ids as string[]).includes(created_by)) {
        memberRecords.push({
          group_id: group.id,
          user_id: created_by as string,
          role: "admin",
        });
      }

      await client.from("group_members").insert(memberRecords);

      // 更新成员数量
      await client
        .from("groups")
        .update({ member_count: (member_ids as string[]).length })
        .eq("id", group.id);
    }

    return { success: true, result: group };
  },

  // 生成文档（PRD/方案）
  generate_document: async (params: {
    type?: string;
    title?: string;
    sections?: string[];
  }) => {
    const { type = "prd", title = "未命名文档", sections = [] } = params;

    // 生成文档模板
    const templates: Record<string, { name: string; template: string }> = {
      prd: {
        name: "产品需求文档 (PRD)",
        template: `# {title}

## 1. 概述
[简要描述产品/功能的核心价值和目标]

## 2. 用户故事
[描述目标用户及其需求]

## 3. 功能需求
### 3.1 核心功能
[列出主要功能点]

### 3.2 边界情况
[处理异常和边界情况]

## 4. 非功能需求
- 性能要求
- 安全要求
- 兼容性

## 5. 里程碑
| 阶段 | 目标 | 时间 |
|------|------|------|
|      |      |      |

## 6. 风险评估
[识别潜在风险及应对策略]
`,
      },
      spec: {
        name: "技术方案文档",
        template: `# {title}

## 1. 背景
[介绍项目背景和目标]

## 2. 技术方案
### 2.1 架构设计
[描述系统架构]

### 2.2 核心模块
[详细说明核心模块设计]

## 3. 接口设计
[API 接口设计]

## 4. 数据模型
[数据库设计]

## 5. 部署方案
[部署和运维方案]
`,
      },
      report: {
        name: "市场分析报告",
        template: `# {title}

## 1. 市场概况
[市场规模、增长趋势]

## 2. 竞品分析
### 2.1 主要竞品
[列出主要竞争对手]

### 2.2 差异化分析
[对比分析]

## 3. 用户研究
[用户画像和需求分析]

## 4. 机会与挑战
### 4.1 市场机会
[分析机会点]

### 4.2 潜在风险
[识别风险]
`,
      },
    };

    const selectedTemplate = templates[type] || templates.prd;
    const document = selectedTemplate.template.replace(/{title}/g, title || "未命名文档");
    
    // 如果有指定 sections，替换占位符
    let finalDoc = document;
    if (sections && Array.isArray(sections)) {
      for (const [key, value] of Object.entries(sections)) {
        finalDoc = finalDoc.replace(new RegExp(`\\[${key.toUpperCase()}\\]`, "g"), value as string);
      }
    }

    return {
      success: true,
      result: {
        type: selectedTemplate.name,
        title: title || "未命名文档",
        content: finalDoc,
        word_count: finalDoc.length,
        generated_at: new Date().toISOString(),
      },
    };
  },

  // 获取当前时间
  get_current_time: async () => {
    return {
      success: true,
      result: {
        timestamp: Date.now(),
        datetime: new Date().toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    };
  },

  // ============ 对话审批流转（Human-in-the-Loop） ============

  // 提交审批（可指定审批人）
  submit_for_approval: async (params, context) => {
    const client = getSupabaseClient();
    const { title, task_type, description, draft, assignee_id, assignee_name, source_id, team_id } = params;
    if (!title) return { success: false, error: "请提供任务标题 title" };
    const teamId = (team_id as string) || context.teamId;
    if (!teamId) return { success: false, error: "缺少团队ID" };

    let targetAssignee: string | null = (assignee_id as string) || null;
    if (!targetAssignee && assignee_name) {
      const { data: users } = await client.from("users").select("id").ilike("name", `%${assignee_name}%`).limit(1);
      if (users && users.length > 0) targetAssignee = users[0].id;
    }
    if ((params as any).assignee_id === "" && !assignee_name) targetAssignee = null;

    const { task, error } = await createApprovalTask({
      team_id: teamId,
      agent_id: context.agentId || undefined,
      creator_id: context.userId || "",
      assignee_id: targetAssignee,
      title: title as string,
      task_type: task_type as string,
      description: description as string,
      draft: draft !== undefined ? (typeof draft === "string" ? safeParseAny(draft) : draft) : undefined,
      source_id: source_id as string,
    });

    if (error || !task) {
      return { success: false, error: error || "创建审批任务失败" };
    }

    return {
      success: true,
      result: {
        task_id: task.id,
        title: task.title,
        status: task.status,
        assignee_id: task.assignee_id,
        assignee_name: "",
        source_id: task.source_id,
        message: targetAssignee
          ? `审批任务「${task.title}」已提交并转交指定审批人，等待其审批中`
          : `审批任务「${task.title}」已创建，等待确认`,
        hint: "请将审批任务摘要展示给用户，并告知下一步操作（如：@我审批 / 转发给指定人审批）",
      },
    };
  },

  // 查询审批任务
  get_approval_tasks: async (params, context) => {
    const { role = "all", status, session_id, team_id } = params;
    const { tasks, error } = await listApprovalTasks({
      team_id: (team_id as string) || context.teamId || undefined,
      user_id: context.userId || undefined,
      role: (role as any) || "all",
      status: status as any,
      session_id: session_id as string,
      limit: 50,
    });
    if (error) return { success: false, error };
    const summary = tasks.map((t: any) =>
      `- #${t.id.slice(0, 8)}「${t.title}」状态:${t.status} 发起:${t.creator_id} 审批人:${t.assignee_id || "待创建者"} 时间:${t.created_at}`
    ).join("\n");
    return {
      success: true,
      result: {
        count: tasks.length,
        tasks,
        message: tasks.length === 0 ? "暂无审批任务" : `共找到 ${tasks.length} 条审批任务：\n${summary}`,
      },
    };
  },

  // 审批通过
  approve_approval_task: async (params, context) => {
    const { task_id, comment } = params;
    if (!task_id) return { success: false, error: "缺少 task_id" };
    if (!context.userId) return { success: false, error: "缺少当前用户" };
    const res = await approveTask(task_id as string, context.userId, comment as string);
    if (!res.success) return { success: false, error: res.error };
    return {
      success: true,
      result: {
        task_id,
        status: "approved",
        message: `审批任务「${res.task?.title}」已通过 ✅`,
        hint: "审批已通过。如该任务需要落地执行业务操作（如更新数据库），请展示最终确认信息并询问用户是否执行。",
      },
    };
  },

  // 驳回（附修改意见）
  reject_approval_task: async (params, context) => {
    const { task_id, comment } = params;
    if (!task_id) return { success: false, error: "缺少 task_id" };
    if (!context.userId) return { success: false, error: "缺少当前用户" };
    const res = await rejectTask(task_id as string, context.userId, (comment as string) || undefined);
    if (!res.success) return { success: false, error: res.error };
    return {
      success: true,
      result: {
        task_id,
        status: "rejected",
        message: res.task?.status === "rejected" ? `审批任务「${res.task?.title}」已驳回 ⛔${comment ? `（原因：${comment}）` : ""}` : res.task?.status === "approved" ? "该任务已被通过，无需驳回" : "操作完成",
      },
    };
  },

  // 提交/转交指定人审批
  forward_approval_task: async (params, context) => {
    const client = getSupabaseClient();
    const { task_id, assignee_id, assignee_name, comment } = params;
    if (!task_id) return { success: false, error: "缺少 task_id" };
    if (!context.userId) return { success: false, error: "缺少当前用户" };

    let target = (assignee_id as string) || null;
    if (!target && assignee_name) {
      const { data: users } = await client.from("users").select("id").ilike("name", `%${assignee_name}%`).limit(1);
      if (users && users.length > 0) target = users[0].id;
    }
    if (!target) return { success: false, error: "请指定审批人（assignee_id 或 assignee_name）" };

    const res = await forwardApproval(task_id as string, context.userId, target, comment as string);
    if (!res.success) return { success: false, error: res.error };

    const { data: assignee } = await client.from("users").select("name").eq("id", target).maybeSingle();
    return {
      success: true,
      result: {
        task_id,
        status: "pending",
        assignee_id: target,
        assignee_name: assignee?.name || "",
        message: `审批任务已转交 ${assignee?.name || "指定人"} 审批 ✅`,
      },
    };
  },
};

/**
 * 获取智能体绑定的所有可执行工具
 */
export async function getAgentTools(agentId: string): Promise<AgentTool[]> {
  const client = getSupabaseClient();

  // 通过 agent_tool_bindings 表获取绑定的 tools
  const { data: bindings, error: bindingError } = await client
    .from("agent_tool_bindings")
    .select("tool_id")
    .eq("agent_id", agentId);

  if (bindingError) {
    console.error("获取工具绑定失败:", bindingError);
    return [];
  }

  if (!bindings || bindings.length === 0) {
    return [];
  }

  const toolIds = bindings.map((b: { tool_id: string }) => b.tool_id);

  // 查询 tools 表获取工具详情
  const { data: tools, error: toolError } = await client
    .from("tools")
    .select("id, name, description, action, tool_type, parameters, category, enabled, config")
    .in("id", toolIds)
    .eq("enabled", true);

  if (toolError) {
    console.error("获取工具详情失败:", toolError);
    return [];
  }

  return (tools || []).map((t: Record<string, unknown>) => ({
    id: t.id as string,
    name: t.name as string,
    description: t.description as string | null,
    action: t.action as string,
    tool_type: (t.tool_type as "builtin" | "http" | "mcp") || "builtin",
    parameters: (t.parameters as ToolParameter[]) || [],
    category: t.category as string,
    enabled: t.enabled as boolean,
    config: (t.config as Record<string, unknown>) || {},
  }));
}

/**
 * 将 AgentTool 转换为 Function Calling 格式
 */
export function convertToFunctionTools(tools: AgentTool[]): FunctionTool[] {
  return tools.map((tool) => {
    const properties: Record<string, { type: string; description: string; enum?: string[] }> = {};
    const required: string[] = [];

    for (const param of tool.parameters || []) {
      properties[param.name] = {
        type: mapTypeToJsonSchema(param.type),
        description: param.description || `${param.label || param.name}`,
      };
      if (param.options && param.options.length > 0) {
        properties[param.name].enum = param.options;
      }
      if (param.required) {
        required.push(param.name);
      }
    }

    return {
      type: "function",
      name: tool.action,
      description: tool.description || `${tool.name} (${tool.category})`,
      parameters: {
        type: "object",
        properties,
        required,
      },
    };
  });
}

/**
 * 获取智能体绑定的 Function Calling 工具
 */
export async function getAgentFunctionTools(agentId: string): Promise<FunctionTool[]> {
  const tools = await getAgentTools(agentId);
  return convertToFunctionTools(tools);
}

/**
 * 执行 HTTP 工具请求
 * 通过 fetch 调用外部 HTTP API，支持 URL 参数替换和 Body 模板替换
 */
export async function executeHttpTool(
  config: {
    url: string;
    method: string;
    headers?: Record<string, string>;
    bodyTemplate?: string;
  },
  params: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  try {
    // 替换 URL 中的变量 {key}
    let url = config.url;
    Object.entries(params).forEach(([key, value]) => {
      url = url.replace(new RegExp(`\\{${key}\\}`, "g"), encodeURIComponent(String(value)));
    });

    const headers: Record<string, string> = { "Content-Type": "application/json", ...config.headers };

    // 替换 headers 中的变量 {key}
    for (const [headerKey, headerValue] of Object.entries(headers)) {
      let replaced = headerValue;
      Object.entries(params).forEach(([pKey, pValue]) => {
        replaced = replaced.replace(new RegExp(`\\{${pKey}\\}`, "g"), String(pValue));
      });
      headers[headerKey] = replaced;
    }

    // 准备请求体
    let body: string | undefined;
    const method = config.method?.toUpperCase() || "GET";
    if (["POST", "PUT", "PATCH"].includes(method) && config.bodyTemplate) {
      let bodyContent = config.bodyTemplate;
      Object.entries(params).forEach(([key, value]) => {
        bodyContent = bodyContent.replace(new RegExp(`\\{${key}\\}`, "g"), JSON.stringify(value).slice(1, -1));
      });
      body = bodyContent;
    }

    const response = await fetch(url, { method, headers, body });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return { success: false, error: `HTTP ${response.status}: ${errorText || response.statusText}` };
    }

    const contentType = response.headers.get("content-type") || "";
    const result = contentType.includes("application/json")
      ? await response.json().catch(() => null)
      : await response.text().catch(() => null);

    return { success: true, result: result || { message: "请求成功" } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `HTTP 请求异常: ${message}` };
  }
}


/**
 * 执行工具动作（支持内置函数和 HTTP 工具）
 */
export async function executeToolAction(
  tool: AgentTool,
  params: Record<string, unknown>,
  context: { agentId: string; teamId: string; userId?: string } = { agentId: "", teamId: "" }
): Promise<ToolExecutionResult> {
  const { action, tool_type, config } = tool;

  // HTTP 工具
  if (tool_type === "http" && config?.url) {
    return executeHttpTool(
      {
        url: config.url as string,
        method: (config.method as string) || "GET",
        headers: config.headers as Record<string, string>,
        bodyTemplate: config.bodyTemplate as string,
      },
      params
    );
  }

  // 内置工具函数
  const handler = BUILTIN_TOOLS[action];

  if (handler) {
    try {
      return await handler(params, context);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `执行工具 "${action}" 时出错: ${errorMessage}`,
      };
    }
  }

  // 如果没有内置函数，返回提示
  return {
    success: false,
    error: `工具 "${action}" 不存在或未实现。可用的内置工具: ${Object.keys(BUILTIN_TOOLS).join(", ")}`,
  };
}

/**
 * 获取所有可用的内置工具列表
 */
export function getBuiltinToolsList(): { action: string; description: string }[] {
  return [
    { action: "get_member", description: "获取成员信息（按ID或团队）" },
    { action: "search_member", description: "搜索成员（按姓名或手机号）" },
    { action: "list_members", description: "列出团队成员（分页）" },
    { action: "search_channel", description: "搜索频道" },
    { action: "get_channel", description: "获取频道信息" },
    { action: "query_knowledge", description: "查询知识库" },
    { action: "get_team", description: "获取团队信息" },
    { action: "get_current_time", description: "获取当前时间" },
    { action: "search_channel_messages", description: "搜索频道消息（按频道名和时间范围）" },
    { action: "send_to_channel", description: "发送消息到指定频道" },
    { action: "invite_to_channel", description: "邀请用户加入指定频道" },
    { action: "submit_for_approval", description: "提交审批任务（可指定审批人，转交指定人审批）" },
    { action: "get_approval_tasks", description: "查询审批任务（我发起的/待我审批/全部）" },
    { action: "approve_approval_task", description: "审批通过" },
    { action: "reject_approval_task", description: "驳回审批并附修改意见" },
    { action: "forward_approval_task", description: "转交指定人审批" },
  ];
}

/**
 * 获取预置工具的 Function Calling 定义（自动注入智能体，无需用户绑定）
 */
export function getBuiltinToolDefinitions(): Array<{
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, { type: string; description: string }>;
      required: string[];
    };
  };
}> {
  return [
    {
      type: "function",
      function: {
        name: "get_member",
        description: "获取成员信息（按ID或团队）",
        parameters: {
          type: "object",
          properties: {
            member_id: { type: "string", description: "成员ID（必填，与team_id二选一）" },
            team_id: { type: "string", description: "团队ID（必填，与member_id二选一）" },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "search_member",
        description: "搜索团队成员（按姓名或手机号）",
        parameters: {
          type: "object",
          properties: {
            keyword: { type: "string", description: "搜索关键词（必填）" },
            team_id: { type: "string", description: "团队ID（必填）" },
          },
          required: ["keyword", "team_id"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "list_members",
        description: "列出团队成员（分页）",
        parameters: {
          type: "object",
          properties: {
            team_id: { type: "string", description: "团队ID（必填）" },
            page: { type: "string", description: "页码（默认1）" },
            page_size: { type: "string", description: "每页数量（默认20）" },
          },
          required: ["team_id"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "search_channel",
        description: "搜索频道",
        parameters: {
          type: "object",
          properties: {
            keyword: { type: "string", description: "搜索关键词" },
            team_id: { type: "string", description: "团队ID（必填）" },
          },
          required: ["team_id"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_channel",
        description: "获取频道详情",
        parameters: {
          type: "object",
          properties: {
            channel_id: { type: "string", description: "频道ID（必填）" },
          },
          required: ["channel_id"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "query_knowledge",
        description: "从RAG知识库检索信息",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "查询内容（必填）" },
            team_id: { type: "string", description: "团队ID（必填）" },
            top_k: { type: "string", description: "返回数量（默认5）" },
          },
          required: ["query", "team_id"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_team",
        description: "获取团队信息",
        parameters: {
          type: "object",
          properties: {
            team_id: { type: "string", description: "团队ID（必填）" },
          },
          required: ["team_id"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_current_time",
        description: "获取当前日期时间",
        parameters: {
          type: "object",
          properties: {},
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "search_channel_messages",
        description: "搜索频道消息（按频道名和时间范围）",
        parameters: {
          type: "object",
          properties: {
            channel_name: { type: "string", description: "频道名称" },
            keyword: { type: "string", description: "搜索关键词" },
            team_id: { type: "string", description: "团队ID（必填）" },
          },
          required: ["team_id"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "send_to_channel",
        description: "发送消息到指定频道",
        parameters: {
          type: "object",
          properties: {
            channel_id: { type: "string", description: "目标频道ID（必填）" },
            content: { type: "string", description: "消息内容（必填）" },
          },
          required: ["channel_id", "content"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "invite_to_channel",
        description: "邀请用户加入指定频道",
        parameters: {
          type: "object",
          properties: {
            channel_id: { type: "string", description: "频道ID（必填）" },
            user_id: { type: "string", description: "用户ID（必填）" },
          },
          required: ["channel_id", "user_id"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "submit_for_approval",
        description: "提交审批任务并（可选）转交指定人审批。创建后该任务进入待审批状态。",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string", description: "审批任务标题（如：入库登记单）" },
            task_type: { type: "string", description: "任务类型（如：入库登记、报销审批）" },
            description: { type: "string", description: "任务描述（可选）" },
            draft: { type: "object", description: "智能体识别/生成的数据本体（若无法结构化也可传对象）" },
            assignee_id: { type: "string", description: "审批人用户ID（可选，留空则待发起人确认；填入则转交该审批人）" },
            assignee_name: { type: "string", description: "审批人姓名（可选，与 assignee_id 二选一）" },
            source_id: { type: "string", description: "关联业务记录编号（可选，如入库单编号）" },
            team_id: { type: "string", description: "团队ID（可选，默认取自会话）" },
          },
          required: ["title"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_approval_tasks",
        description: "查询审批任务列表。role=mine 我发起的；role=assigned 待我审批；role=all 全部。",
        parameters: {
          type: "object",
          properties: {
            role: { type: "string", description: "mine/assigned/all" },
            status: { type: "string", description: "pending/approved/rejected（可选）" },
            session_id: { type: "string", description: "会话ID（可选）" },
            team_id: { type: "string", description: "团队ID（可选）" },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "approve_approval_task",
        description: "审批通过一个待审批的审批任务",
        parameters: {
          type: "object",
          properties: {
            task_id: { type: "string", description: "审批任务ID（必填）" },
            comment: { type: "string", description: "审批意见（可选）" },
          },
          required: ["task_id"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "reject_approval_task",
        description: "驳回一个待审批的审批任务，并附修改意见",
        parameters: {
          type: "object",
          properties: {
            task_id: { type: "string", description: "审批任务ID（必填）" },
            comment: { type: "string", description: "驳回原因/修改意见（必填）" },
          },
          required: ["task_id", "comment"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "forward_approval_task",
        description: "将待审批任务转交/提交给指定人审批",
        parameters: {
          type: "object",
          properties: {
            task_id: { type: "string", description: "审批任务ID（必填）" },
            assignee_id: { type: "string", description: "指定审批人用户ID（与 assignee_name 二选一）" },
            assignee_name: { type: "string", description: "指定审批人姓名（与 assignee_id 二选一）" },
            comment: { type: "string", description: "转交说明（可选）" },
          },
          required: ["task_id"],
        },
      },
    },
  ];
}

/**
 * 直接执行预置内置工具（按 action 名称查找并执行）
 */
export async function executeBuiltinTool(
  action: string,
  params: Record<string, unknown>,
  context: { agentId: string; teamId: string; userId?: string } = { agentId: "", teamId: "" }
): Promise<ToolExecutionResult> {
  const handler = BUILTIN_TOOLS[action];
  if (handler) {
    try {
      return await handler(params, context);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return { success: false, error: `执行工具 "${action}" 时出错: ${errorMessage}` };
    }
  }
  return { success: false, error: `内置工具 "${action}" 不存在。可用的内置工具: ${Object.keys(BUILTIN_TOOLS).join(", ")}` };
}

/**
 * 类型映射（内部类型 -> JSON Schema 类型）
 */
function mapTypeToJsonSchema(type: string): string {
  const typeMap: Record<string, string> = {
    string: "string",
    str: "string",
    text: "string",
    number: "number",
    num: "number",
    int: "integer",
    integer: "integer",
    boolean: "boolean",
    bool: "boolean",
    array: "array",
    list: "array",
    object: "object",
  };

  return typeMap[type?.toLowerCase()] || "string";
}


