import { DEFAULT_LLM_MODEL } from "@/lib/llm/models";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { HeaderUtils, type ContentPart } from "@/lib/sdk";
import { buildChannelContext } from "@/lib/agent-context";
import { buildRagContext } from "@/lib/rag-context";
import { formatSkillsForContext, getAgentSkills } from "@/lib/agents/skill-loader";
import { batchGenerateSignedUrls } from "@/storage/database/shared/signed-url-cache";
import { createAgentChatStream } from "@/lib/stream-agent-chat";
import { getBuiltinToolDefinitions } from "@/lib/agents/skill-actions";
import { compressMessages } from "@/lib/context-compressor";
import { WorkflowExecutor } from "@/lib/workflow-executor";
import { createWorkflowSSEStream } from "@/lib/workflow-sse";
import { parseAgentMdToPrompt } from "@/lib/agents/agent-md-parser";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("sessionId");
    const limit = parseInt(searchParams.get("limit") || "50");
    const before = searchParams.get("before");
    if (!sessionId) return NextResponse.json({ error: "会话ID不能为空" }, { status: 400 });
    const client = getSupabaseClient();
    let query = client.from("agent_chat_messages").select("*").eq("session_id", sessionId).order("created_at", { ascending: true }).limit(limit);
    if (before) query = query.lt("created_at", before);
    const { data: messages, error: msgError } = await query;
    if (msgError) return NextResponse.json({ error: "查询消息失败" }, { status: 500 });
    const { error: rErr } = await client.from("agent_chat_messages").update({ is_read: true }).eq("session_id", sessionId).eq("sender_type", "agent").eq("is_read", false);
    if (rErr) console.error("标记已读失败:", rErr);
    const result = (messages || []).map((m: any) => { let meta = null; try { meta = m.meta ? (typeof m.meta === "string" ? JSON.parse(m.meta) : m.meta) : null; } catch { meta = null; } return { id: m.id, senderType: m.sender_type, senderId: m.sender_id, content: m.content, attachments: m.attachments || [], isRead: m.is_read, createdAt: m.created_at, meta }; });
    return NextResponse.json({ success: true, messages: result });
  } catch (e) { console.error("GET错误:", e); return NextResponse.json({ error: "服务器错误" }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  try {
    const { sessionId, userId, content, attachments } = await request.json();
    if (!sessionId || !userId || !content) return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    const normalizedAttachments: any[] = Array.isArray(attachments) ? attachments : [];
    const client = getSupabaseClient();
    const { data: userMsg, error: msgError } = await client.from("agent_chat_messages").insert({ session_id: sessionId, sender_type: "user", sender_id: userId, content, attachments: normalizedAttachments.length > 0 ? JSON.stringify(normalizedAttachments) : undefined }).select().single();
    if (msgError) return NextResponse.json({ error: "发送消息失败" }, { status: 500 });
    await client.from("agent_chat_sessions").update({ last_message: content, last_message_at: userMsg.created_at, updated_at: new Date().toISOString() }).eq("id", sessionId);
    const { data: sessionData } = await client.from("agent_chat_sessions").select("agent_id, team_id").eq("id", sessionId).single();
    if (!sessionData) return NextResponse.json({ error: "会话不存在" }, { status: 404 });
    const { data: agent } = await client.from("agents").select("id, name, description, system_prompt, agent_md, role_identity, boundaries, greeting, skill_ids, rag_dataset_ids, channel_context_enabled, channel_context_limit, channel_context_scope, prompt_guard_enabled, model_config, max_iterations, context_compress_enabled, memory_enabled, memory_config, workflow_id, tool_approval_mode").eq("id", sessionData.agent_id).eq("status", "active").single();
    if (!agent) return NextResponse.json({ error: "智能体不存在" }, { status: 404 });

    // ========== Skill 加载（Hermes 执行模型：LLM 自主调用） ==========
    const agentSkillIds = (agent.skill_ids as string[]) || [];
    let skillDescriptions: string[] = [];
    let skillList: any[] = [];
    if (agentSkillIds.length > 0) {
      const { data: executableSkills } = await client
        .from("skills")
        .select("id, name, description, content, is_executable, expected_output")
        .in("id", agentSkillIds)
        .eq("is_executable", true);
      skillList = executableSkills || [];
      // 生成 Skill 描述列表，注入 system prompt
      skillDescriptions = skillList.map((s: any) => {
        let desc = `- **${s.name}**: ${s.description || "无描述"}（调用方式：execute_skill(skill_id="${s.id}")）`;
        if (s.expected_output) {
          desc += `\n  预期输出格式：${s.expected_output}`;
        }
        return desc;
      });
    }
    // ========== Skill 加载结束 ==========

    const teamId = sessionData.team_id;
    const { data: historyMessages } = await client.from("agent_chat_messages").select("sender_type, content, attachments").eq("session_id", sessionId).order("created_at", { ascending: true }).limit(50);

    const imageKeys: string[] = [];
    for (const m of (historyMessages || [])) { const a = m.attachments as any; if (a && Array.isArray(a)) { for (const att of a) { if (att.type === "image" && att.key) imageKeys.push(att.key as string); } } }
    const signedUrlMap = imageKeys.length > 0 ? await batchGenerateSignedUrls(imageKeys) : {};

    const chatMessages = (historyMessages || []).map((m: any) => {
      const role = m.sender_type === "user" ? "user" as const : "assistant" as const;
      const ma = m.attachments as any;
      if (ma && Array.isArray(ma) && ma.length > 0) {
        const cp: ContentPart[] = [];
        if (m.content) cp.push({ type: "text", text: m.content });
        for (const att of ma) {
          if (att.type === "image" && att.key) { const su = signedUrlMap[att.key as string] || att.url; if (su) cp.push({ type: "image_url", image_url: { url: su, detail: "high" } }); }
          else if (att.type === "file" && att.name) cp.push({ type: "text", text: `[附件: ${att.name}${att.size ? " (" + Math.round(att.size / 1024) + "KB)" : ""}]` });
          else if (att.type === "video" && att.name) cp.push({ type: "text", text: `[视频: ${att.name}]` });
        }
        return { role, content: cp };
      }
      return { role, content: m.content };
    });

    // 上下文压缩：如果启用了压缩且历史消息过长，压缩早期消息为摘要
    if (agent.context_compress_enabled && chatMessages.length > 10) {
      const compressed = compressMessages(chatMessages, { keepRecent: 10 }, agent.name);
      if (compressed.length < chatMessages.length) {
        console.log(`[ContextCompress] 压缩前 ${chatMessages.length} 条 → 压缩后 ${compressed.length} 条`);
      }
      // 直接用压缩后的消息替换（注意：之后 agentMessages 会从 chatMessages 中取出用户消息单独处理）
      // 这里需要同步影响后续的 agentMessages 构建
      // 把压缩后的消息存回，后面的构建逻辑从 chatMessages 取
      chatMessages.length = 0;
      chatMessages.push(...compressed);
    }

    function normalizeParameters(params: any): any[] {
      if (!params) return [];
      if (Array.isArray(params)) return params;
      if (typeof params === "object") {
        // 处理 map[channel_name:xxx] 格式遗留数据，转换为 [{name: key, type: "string", label: key, description: value}]
        const entries = Object.entries(params);
        if (entries.length > 0) {
          return entries.map(([key, val]) => ({
            name: key,
            type: "string",
            label: typeof val === "string" ? val : key,
            description: typeof val === "string" ? val : "",
          }));
        }
      }
      return [];
    }

    let tools: any[] = [];
    // 从 agent_tool_bindings 加载工具（统一使用 tools 表）
    const { data: tBind } = await client.from("agent_tool_bindings").select("tools (id, name, description, action, parameters)").eq("agent_id", sessionData.agent_id).eq("tools.enabled", true);
    if (tBind && tBind.length > 0) {
      for (const b of tBind) {
        const tl = (b as any).tools as any;
        if (!tl) continue;
        const pars = normalizeParameters(tl.parameters);
        const props: any = {}; const req: string[] = [];
        for (const p of pars) { props[p.name] = { type: p.type === "textarea" ? "string" : p.type, description: p.description || p.label }; if (p.required) req.push(p.name); }
        tools.push({ type: "function", function: { name: tl.action, description: tl.description || tl.name, parameters: { type: "object", properties: props, required: req } } });
      }
    }

    // 注入预置工具（所有智能体自动拥有，无需用户绑定）
    tools.push(...getBuiltinToolDefinitions());

    // 添加 execute_skill 工具（Hermes 执行模型：LLM 自主调用 Skill）
    if (skillList.length > 0) {
      tools.push({
        type: "function",
        function: {
          name: "execute_skill",
          description: "执行指定的技能/SOP。当用户的任务需要按照特定流程执行时（如需求分析、竞品调研、周报生成等），调用此工具来执行对应的技能。",
          parameters: {
            type: "object",
            properties: {
              skill_id: { type: "string", description: "要执行的技能ID" },
            },
            required: ["skill_id"],
          },
        },
      });
    }


    // 添加 delegate_agent 工具（多智能体协作：委托子智能体执行任务）
    tools.push({
      type: "function",
      function: {
        name: "delegate_agent",
        description: "委托任务给指定的智能体执行。当任务复杂需要多个专业智能体协作时，可以多次调用此工具依次委托不同的子智能体，最后汇总所有结果回复用户。",
        parameters: {
          type: "object",
          properties: {
            agent_id: { type: "string", description: "目标智能体的ID（或智能体名称）" },
            agent_name: { type: "string", description: "（可选，推荐）目标智能体的名称，如「技术顾问」「客服专员」" },
            task: { type: "string", description: "要委托执行的任务描述，尽可能详细" },
            context: { type: "string", description: "（可选）传递给子智能体的上下文信息，如之前的对话历史或其他智能体的执行结果" },
          },
          required: ["agent_id", "task"],
        },
      },
    });

    // Skill 描述注入 system prompt（Hermes 方式：LLM 看到描述后自主决定调用）
    let skillPromptSection = "";
    if (skillDescriptions.length > 0) {
      skillPromptSection = "\n## 可用技能\n你拥有以下技能，可以根据用户需求调用相应的技能来完成任务：\n" + skillDescriptions.join("\n");
      skillPromptSection += "\n\n【技能调用说明】\n- 当用户的任务需要按照特定流程执行时，使用 execute_skill 工具调用对应的技能\n- 调用后你会收到该技能的 SOP 文档，然后按照 SOP 步骤逐步执行\n- 如果任务不需要特定技能，可以直接回答用户问题";
    }

    const ragIds = (agent.rag_dataset_ids as string[]) || [];
    let ragInfo: string[] = [];
    if (ragIds.length > 0) { const { data: rd } = await client.from("rag_datasets").select("name, description").in("id", ragIds).eq("status", "active"); if (rd) ragInfo = rd.map((r: any) => "## 知识库：" + r.name + "\n" + (r.description || "")); }

    const systemParts: string[] = [];
    // 角色身份（SO.md 层）
    if (agent.role_identity) {
      systemParts.push(agent.role_identity);
    } else {
      systemParts.push("你是智能体\"" + agent.name + "\"。");
      if (agent.description) systemParts.push("描述：" + agent.description);
    }
    // 指令层（优先使用 agent_md，回退到 system_prompt）
    const agentPrompt = agent.agent_md ? parseAgentMdToPrompt(agent.agent_md) : agent.system_prompt;
    systemParts.push("\n" + agentPrompt);
    // 权限边界（Config.yml 层）
    const boundaries = agent.boundaries as Array<{action: string; permission: string}> | undefined;
    if (boundaries && boundaries.length > 0) {
      const allowItems = boundaries.filter((b: any) => b.permission === "allow").map((b: any) => "✅ " + b.action);
      const denyItems = boundaries.filter((b: any) => b.permission === "deny").map((b: any) => "❌ " + b.action);
      const approvalItems = boundaries.filter((b: any) => b.permission === "approval").map((b: any) => "⚠️ " + b.action + "（需审批）");
      const boundaryParts: string[] = [];
      if (allowItems.length > 0) boundaryParts.push("你可以：\n" + allowItems.join("\n"));
      if (denyItems.length > 0) boundaryParts.push("你不可以：\n" + denyItems.join("\n"));
      if (approvalItems.length > 0) boundaryParts.push("需审批：\n" + approvalItems.join("\n"));
      if (boundaryParts.length > 0) {
        systemParts.push("\n## 权限边界\n" + boundaryParts.join("\n\n"));
      }
    }
    // 首次对话时注入开场白
    if (agent.greeting && historyMessages && historyMessages.length <= 1) {
      systemParts.push("\n【开场白】\n与用户初次对话时，请先主动发送以下问候语：\n" + agent.greeting + "\n（发送开场白后，再根据用户的需求继续对话）");
    }
    systemParts.push("\n【当前日期和时间】\n当前系统日期和时间（北京时间）：" + new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }));

    // 注入当前团队信息与成员简表，让智能体知道自己的团队ID和成员，避免执行时缺参
    try {
      const { data: teamInfo } = await client
        .from("teams")
        .select("id, name")
        .eq("id", teamId)
        .single();
      const { data: teamMembers } = teamId
        ? await client
            .from("team_members")
            .select("users!inner (id, name, title, department)")
            .eq("team_id", teamId)
            .limit(50)
        : { data: [] };
      const memberBrief = (teamMembers || [])
        .map((m: any) => {
          const u = m.users as any;
          if (!u) return null;
          const title = u.title || u.department || "";
          return `- ${u.name}（ID: ${u.id}${title ? "，角色/部门: " + title : ""}）`;
        })
        .filter(Boolean)
        .join("\n");
      const teamName = teamInfo?.name || "";
      systemParts.push(`\n## 当前团队上下文\n你当前所在的团队 ID（team_id）是：${teamId || "未知"}${teamName ? "，团队名称：" + teamName : ""}。\n后续调用需要 team_id 参数的工具（如 search_member、list_members、get_team 等）时，请直接使用上述团队 ID，无需再向用户索要。\n\n当前团队成员简表：\n${memberBrief || "（暂无成员信息）"}\n\n当用户要求你推进涉及团队协作、对接具体成员（如设计/技术/客服岗位负责人）的任务时，优先从上方团队成员简表中识别目标成员并对接，仅在成员信息确实缺失时才向用户询问补充信息。`);
    } catch (teamCtxErr) {
      console.error("注入团队上下文失败:", teamCtxErr);
    }
    // Skill 描述注入（Hermes 方式：LLM 看到描述后自主决定调用）
    if (skillPromptSection) {
      systemParts.push(skillPromptSection);
    }

    // 注入多智能体协作信息（delegate_agent 工具）
    try {
      const { data: teamAgents } = await client
        .from("agents")
        .select("id, name, description")
        .neq("id", sessionData.agent_id)
        .eq("team_id", teamId)
        .limit(20);
      if (teamAgents && teamAgents.length > 0) {
        const agentList = teamAgents.map((a: any) => {
          const desc = a.description || "无描述";
          return `- ${a.name}（ID: ${a.id}）：${desc}`;
        }).join("\n");
        systemParts.push(`\n## 多智能体协作\n当遇到需要其他智能体专业能力的任务时，你可以使用 delegate_agent 工具将任务委托给它们执行。\n\n可用智能体（请根据任务需求选择合适的智能体，agent_id 可以是 ID 或智能体名称）：\n${agentList}\n\n调用格式：\n- delegate_agent(agent_id="目标智能体名称或ID", task="任务描述", context="上下文信息")\n- 推荐使用 agent_name 参数：delegate_agent(agent_name="技术顾问", task="任务描述")\n\n你可以多次调用 delegate_agent 来完成复杂任务：\n1. 第一次委托：调用 delegate_agent 获取结果\n2. 基于前一次结果，再次委托其他智能体\n3. 最后汇总所有子智能体的结果回复用户\n\n委托后你会收到子智能体的执行结果，然后继续处理。\n\n⚠️ 重要：务必使用上方列表中真实的智能体名称或 ID，不要编造不存在的智能体。`);
      }
    } catch (e: any) {
      // 忽略错误，不影响主流程
    }
    const skCtx = await getAgentSkills(sessionData.agent_id);
    const skTxt = formatSkillsForContext(skCtx);
    if (skTxt) systemParts.push(skTxt);
    if (ragInfo.length > 0) systemParts.push("\n关联知识库：\n" + ragInfo.join("\n"));
    

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    let channelContextMessages: any[] = [];
    if (agent.channel_context_enabled && sessionData.team_id && normalizedAttachments.length === 0) {
      try {
        const { data: dc } = await client.from("channels").select("id").eq("team_id", sessionData.team_id).eq("is_default", true).limit(1).single();
        let tcid = dc?.id || null;
        if (!tcid) { const { data: ac } = await client.from("channels").select("id").eq("team_id", sessionData.team_id).eq("is_active", true).limit(1).single(); tcid = ac?.id || null; }
        if (tcid) { const cl = (agent.channel_context_limit as number) || 20; const res = await buildChannelContext({ channelId: tcid, teamId: sessionData.team_id, userMessage: content, contextLimit: cl, customHeaders }); if (res.llmMessages.length > 0) { systemParts.push("\n## 频道历史上下文\n" + res.contextText); channelContextMessages = res.llmMessages; } }
      } catch (e) { console.error("频道上下文失败:", e); }
    }

    let ragContextMessages: any[] = [];
    if (ragIds.length > 0) {
      try { const rr = await buildRagContext({ datasetIds: ragIds, userMessage: content, customHeaders }); if (rr.contextText) { systemParts.push("\n## 知识库检索结果\n" + rr.contextText); ragContextMessages = rr.llmMessages; } } catch (e) { console.error("知识库检索失败:", e); }
    }

    // 工作流检查：如果智能体绑定了工作流，注入工作流信息
    let workflowInstance: any = null;
    if (agent.workflow_id) {
      try {
        const { data: wf } = await client.from("agent_workflows").select("*").eq("id", agent.workflow_id).single();
        if (wf) {
          workflowInstance = wf;
          const stepList = (wf.steps as any[] || []).map((s: any, i: number) => `  ${i + 1}. ${s.name}${s.description ? " - " + s.description : ""}`).join("\n");
          systemParts.push(`\n## 绑定的工作流\n你绑定了以下工作流，当用户请求与工作流用途匹配时，请使用 \`execute_workflow\` 工具来执行工作流。\n\n工作流ID：${agent.workflow_id}\n工作流名称：${wf.name}\n描述：${wf.description || ""}\n触发条件：${wf.trigger_condition || ""}\n步骤：\n${stepList}\n\n### 工作流执行方式（重要）\n调用 \`execute_workflow\` 后，工作流会自动执行。\n- 如果工作流暂停在审批节点，工具会返回 \`status: "pending"\` 和 \`draft\`（当前产出内容）\n- 你需要将 \`draft\` 内容格式化输出为一条消息展示给用户，并询问用户是否通过或需要修改\n- 用户回复后，再次调用 \`execute_workflow\`，传入 \`action: "resume"\`、\`session_id\`、\`decision\`（"approved"/"rejected"）和 \`feedback\`（修改意见）\n- 工作流完成时返回 \`status: "completed"\`，将最终结果展示给用户\n\n当用户请求不匹配工作流时，正常自由对话即可。`);
          // 添加 execute_workflow 工具
          tools.push({
            type: "function",
            function: {
              name: "execute_workflow",
              description: "执行或恢复工作流。首次调用用 action=execute，审批后用 action=resume。",
              parameters: {
                type: "object",
                properties: {
                  action: { type: "string", description: "操作类型：execute（首次执行）/ resume（审批后恢复）", enum: ["execute", "resume"] },
                  workflow_id: { type: "string", description: "工作流ID，首次执行时必填" },
                  user_input: { type: "string", description: "用户的原始请求，首次执行时必填" },
                  session_id: { type: "string", description: "工作流会话ID，resume 时必填（从上次返回获取）" },
                  decision: { type: "string", description: "审批结果：approved 通过 / rejected 驳回", enum: ["approved", "rejected"] },
                  feedback: { type: "string", description: "驳回时的修改意见或审批备注" },
                },
                required: ["action"]
              }
            }
          });
        }
      } catch (e) { console.error("加载工作流失败:", e); }
    }

    if (tools.length > 0) {
      const tl = tools.map((t: any) => "- " + t.function.name + ": " + t.function.description).join("\n");
      systemParts.push("\n## 可用工具\n" + tl + "\n\n你可以通过调用工具来完成任务，工具会在需要时自动触发，无需在回复中输出任何格式标记。");
    }

    systemParts.push("\n请根据用户需求，适时调用工具来完成任务。");
    systemParts.push("\n**禁止编造不存在的功能或流程**，**优先使用工具来完成任务**。");
    let systemPrompt = systemParts.join("\n");

    const fmt = (agent as any).outputFormat || "auto";
    if (fmt === "markdown") systemPrompt += "\n\n## 输出\n请使用 Markdown。";
    else if (fmt === "json") { systemPrompt += "\n\n## 输出\n请以 JSON 格式输出。"; const sc = (agent as any).jsonSchema; if (sc && sc.trim()) systemPrompt += "\n结构：\n" + sc; }
    else if (fmt === "text") systemPrompt += "\n\n## 输出\n请以纯文本输出。";
    systemPrompt += "\n\n## 文档输出规则\n当你输出结构化的知识文档（报告、方案、评估、教程、分析等）时，请使用 Markdown 格式，第一行用 # 或 ## 标题开头，正文使用 Markdown 语法组织。普通对话回复不需要此结构。";

    if (agent.memory_enabled === true) {
      try { const { retrieveAgentMemory } = await import("@/lib/agent-memory"); const rc = ((agent as any).memory_config as any)?.recall_count ?? 5; const mem = await retrieveAgentMemory(sessionData.agent_id, userId, sessionData.team_id || "", content, rc, customHeaders); if (mem.length > 0) systemPrompt += "\n\n## 记忆\n" + mem.join("\n\n---\n\n"); } catch (e) { console.error("记忆检索失败:", e); }
    }

    // 工具审批模式提示
    const tam = (agent as any).tool_approval_mode || "auto";
    if (tam === "always") {
      systemPrompt += "\n\n## 工具使用规则\n在调用任何工具之前，你必须先向用户说明你要做什么，并等待用户明确确认后才能执行。不要在没有用户许可的情况下执行任何工具。";
    } else if (tam === "conditional") {
      systemPrompt += "\n\n## 工具使用规则\n对于以下高风险操作，你必须先向用户说明并等待确认：发送消息、创建频道、删除内容、修改配置、发送通知、邀请成员。对于其他低风险操作（如搜索、查询），你可以直接执行。";
    }

    // 审批意图检测（仅本条指令生效）：命中则注入"审批模式"指令，引导智能体产出后提交审批
    try {
      const { detectApprovalIntent, APPROVAL_MODE_PROMPT } = await import("@/lib/agents/approval-trigger");
      if (detectApprovalIntent(content)) {
        systemPrompt += APPROVAL_MODE_PROMPT;
      }
    } catch (e) { console.error("审批意图检测失败:", e); }

    const llmMessages: any[] = [{ role: "system", content: systemPrompt }];
    if (channelContextMessages.length > 0) llmMessages.push(...channelContextMessages);
    if (ragContextMessages.length > 0) llmMessages.push(...ragContextMessages);

    // 对 llmMessages 中的非 system 消息进行上下文压缩
    if (agent.context_compress_enabled) {
      const { compressMessages, shouldCompress, estimateMessagesTokens } = await import("@/lib/context-compressor");
      const nonSystem = llmMessages.filter(m => m.role !== "system") as any[];
      if (nonSystem.length > 5 && shouldCompress(nonSystem, 3000)) {
        const before = estimateMessagesTokens(nonSystem);
        const compressed = compressMessages(nonSystem, { keepRecent: 6 }, agent.name);
        // 替换非 system 消息
        const systemMsg = llmMessages.filter(m => m.role === "system");
        llmMessages.length = 0;
        llmMessages.push(...systemMsg, ...compressed);
        const after = estimateMessagesTokens(compressed);
        console.log(`[ContextCompress] llmMessages 非系统消息压缩: 约 ${before} tokens → ${after} tokens`);
      }
    }

    let injectionDetected = false;
    let injectionPattern = "";
    if (agent.prompt_guard_enabled) {
      const { checkInjection } = await import("@/lib/prompt-guard");
      const result = checkInjection(content);
      injectionDetected = result.detected;
      injectionPattern = result.matchedPattern || "";
    }

    const mc = (agent.model_config as any) || {};
    const selectedModel = mc.model || DEFAULT_LLM_MODEL;
    const selectedTemperature = mc.temperature ?? 0.7;
    llmMessages.push(...chatMessages);

    const rs = createAgentChatStream({
      injectionBlocked: injectionDetected, injectionPattern, tools, llmMessages, selectedModel, selectedTemperature,
      customHeaders, client, teamId: sessionData.team_id || "", userId,
      agentName: agent.name, agentId: sessionData.agent_id, sessionId,
      chatMessages, userContent: content, memoryEnabled: agent.memory_enabled === true,
      maxIterations: (agent.max_iterations as number) || 10,
      toolApprovalMode: (agent as any).tool_approval_mode || "auto",
    });

    return new Response(rs, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "Transfer-Encoding": "chunked" } });
  } catch (e) { console.error("POST错误:", e); return NextResponse.json({ error: "服务器错误" }, { status: 500 }); }
}
