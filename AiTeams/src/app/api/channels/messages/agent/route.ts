import { DEFAULT_LLM_MODEL } from "@/lib/llm/models";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { buildChannelContext, generateMessageEmbedding } from "@/lib/agent-context";
import { buildRagContext } from "@/lib/rag-context";
import { StepParser, parseStepsFromText } from "@/lib/agent-step-parser";
import {
  DeadLoopDetector,
  TokenBudget,
  TraceLogger,
} from "@/lib/agent-safety";
import { getBuiltinToolDefinitions } from "@/lib/agents/skill-actions";
import { parseAgentMdToPrompt } from "@/lib/agents/agent-md-parser";
import {
  streamChat,
  toNativeTools,
  type NativeMessage,
  type NativeToolCall,
} from "@/lib/llm/native-client";
import { runAgentTool, type ToolRunContext } from "@/lib/agents/agent-tool-runner";

export const dynamic = "force-dynamic";

/**
 * POST /api/channels/messages/agent
 * 智能体在频道中回复消息（原生 function calling，工具结果以 role:"tool" 回传）
 */
export async function POST(request: NextRequest) {
  try {
    const { agentId, channelId, userMessage, userMessageId, attachments } = await request.json();

    if (!agentId || !channelId) {
      return NextResponse.json({ error: "智能体ID和频道ID不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();
    const { HeaderUtils } = await import("@/lib/sdk");
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);

    // 从请求头中获取 userId（由前端在调用时传入）
    const userId = request.headers.get("x-user-id") || "";

    // 1. 获取智能体信息
    const { data: agent, error: agentError } = await client
      .from("agents")
      .select("*")
      .eq("id", agentId)
      .eq("status", "active")
      .single();

    if (agentError || !agent) {
      return NextResponse.json({ error: "智能体不存在" }, { status: 404 });
    }

    // 1.5 获取频道所属团队ID
    const { data: channelData } = await client
      .from("channels")
      .select("team_id")
      .eq("id", channelId)
      .single();

    const teamId = channelData?.team_id;

    // 3. 获取关联的工具（从 agent_tool_bindings）
    const { data: toolBindings } = await client
      .from("agent_tool_bindings")
      .select("skill_id")
      .eq("agent_id", agentId);

    const toolIds = (toolBindings || []).map((b: { skill_id: string }) => b.skill_id);

    const { data: tools } = toolIds.length > 0 ? await client
      .from("tools")
      .select("name, action, description, parameters")
      .in("id", toolIds)
      .eq("is_active", true) : { data: [] };

    // 注入预置工具（所有智能体自动拥有，无需用户绑定）
    const builtinDefs = getBuiltinToolDefinitions();
    const builtinTools = builtinDefs.map((t) => ({
      name: t.function.name,
      action: t.function.name,
      description: t.function.description,
      parameters: [] as Array<{ name: string; type: string; label: string }>,
    }));
    const mergedTools = [...(tools || []), ...builtinTools];

    // 5. 构建系统提示词
    const systemParts: string[] = [];

    // 角色身份（SO.md 层）
    if (agent.role_identity) {
      systemParts.push(agent.role_identity);
    } else {
      systemParts.push(`你是「${agent.name}」，一个企业智能助手。你正在团队的频道中回复成员的消息。`);
      if (agent.description) {
        systemParts.push(`\n## 简介\n${agent.description}`);
      }
    }

    // 指令层（agent_md 优先，无则回退 system_prompt）
    if (agent.agent_md) {
      systemParts.push(`\n${parseAgentMdToPrompt(agent.agent_md)}`);
    } else if (agent.system_prompt) {
      systemParts.push(`\n${agent.system_prompt}`);
    }

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
    systemParts.push(`\n【当前日期和时间】\n当前系统日期和时间（北京时间）：${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })}`);

    // 技能信息（SOP文档）
    const skillIds = (agent.skill_ids as string[]) || [];
    let skillData: Array<{ id: string; name: string; description: string; expected_output: string | null }> = [];
    if (skillIds.length > 0) {
      const { data: skillDefs } = await client
        .from("skills")
        .select("id, name, description, expected_output")
        .in("id", skillIds)
        .eq("is_executable", true);
      if (skillDefs) skillData = skillDefs as Array<{ id: string; name: string; description: string; expected_output: string | null }>;
    }

    const ragIds = (agent.rag_dataset_ids as string[]) || [];
    if (ragIds.length > 0) {
      const { data: ragData } = await client
        .from("rag_datasets")
        .select("name, description")
        .in("id", ragIds)
        .eq("status", "active");
      if (ragData && (ragData as unknown[]).length > 0) {
        systemParts.push(`\n## 知识库\n你可以检索以下知识库获取信息：`);
        for (const r of (ragData as Array<{ name: string; description: string }>)) {
          systemParts.push(`- ${r.name}${r.description ? `: ${r.description}` : ""}`);
        }
      }
    }

    // 获取工作流绑定
    const wfId = agent.workflow_id as string | null;
    if (wfId) {
      try {
        const { data: wf } = await client
          .from("agent_workflows")
          .select("name, description, steps, trigger_condition")
          .eq("id", wfId)
          .eq("is_active", true)
          .single();
        if (wf) {
          const stepList = ((wf as any).steps as any[] || []).map((s: any, i: number) => `  ${i + 1}. ${s.name}${s.description ? " - " + s.description : ""}`).join("\n");
          systemParts.push(`\n## 绑定的工作流\n你绑定了以下工作流，当用户请求与工作流用途匹配时，请使用 \`execute_workflow\` 工具执行。\n\n工作流名称：${(wf as any).name}\n描述：${(wf as any).description || ""}\n触发条件：${(wf as any).trigger_condition || ""}\n步骤：\n${stepList}`);
        }
      } catch (e) {
        console.error("加载工作流失败（非关键错误）:", e);
      }
    }

    // 可用技能
    if (skillData.length > 0) {
      const skillList = skillData.map(s => {
        let desc = `  - ${s.name}: ${s.description || "无描述"}（skill_id: ${s.id}）`;
        if (s.expected_output) {
          desc += `\n    预期输出格式：${s.expected_output}`;
        }
        return desc;
      }).join("\n");
      systemParts.push(`\n## 可用技能\n你可以通过 execute_skill 工具执行以下技能来获取专业能力：\n${skillList}`);
    }

    // 多智能体协作
    if (teamId) {
      try {
        const { data: teamAgents } = await client
          .from("agents")
          .select("id, name, description")
          .neq("id", agent.id)
          .eq("team_id", teamId)
          .limit(20);
        if (teamAgents && teamAgents.length > 0) {
          const agentList = teamAgents.map((a: any) => {
            const desc = a.description || "无描述";
            return `  - ${a.name}（agent_id: ${a.id}）：${desc}`;
          }).join("\n");
          systemParts.push(`\n## 多智能体协作\n当遇到需要其他智能体专业能力的任务时，使用 delegate_agent 工具委托执行。\n\n可用智能体：\n${agentList}`);
        }
      } catch (e: any) {
        // 忽略错误，不影响主流程
      }
    }

    systemParts.push(`\n## 注意事项\n- 用中文回复，保持专业友好\n- 直接输出完整结果，不要说"已生成草稿"或"已保存"等话术\n- 如果任务超出能力范围，如实说明，不要虚构操作结果\n- **禁止编造不存在的功能或流程**，只能使用本平台已提供的工具和技能`);

    // 6. 构建频道历史上下文
    let contextMessages: NativeMessage[] = [];
    if (agent.channel_context_enabled && channelData) {
      try {
        const contextLimit = (agent.channel_context_limit as number) || 20;
        const result = await buildChannelContext({
          channelId,
          teamId: channelData.team_id,
          userMessage,
          contextLimit,
          customHeaders,
        });
        if (result.llmMessages.length > 0) {
          systemParts.push(`\n## 频道历史上下文\n以下是该频道中的历史对话记录，请结合上下文理解用户的问题：\n${result.contextText}`);
          contextMessages = result.llmMessages as NativeMessage[];
        }
      } catch (ctxErr) {
        console.error("构建频道上下文失败（降级为无上下文模式）:", ctxErr);
      }
    }

    // 7. 构建知识库语义检索上下文
    let ragContextMessages: NativeMessage[] = [];
    if (ragIds.length > 0) {
      try {
        const ragResult = await buildRagContext({
          datasetIds: ragIds,
          userMessage: userMessage,
          customHeaders,
          channelId,
        });
        if (ragResult.contextText) {
          systemParts.push(`\n## 知识库检索结果\n以下是从关联知识库中检索到的相关信息，请优先参考：\n${ragResult.contextText}`);
          ragContextMessages = ragResult.llmMessages as NativeMessage[];
        }
      } catch (ragErr) {
        console.error("知识库检索失败（降级为无检索模式）:", ragErr);
      }
    }

    // 7.5 持久化记忆上下文
    if (agent.memory_enabled === true) {
      try {
        const { searchMemories } = await import("@/lib/agent-memory");
        const recallCount = (agent.memory_config as { recall_count?: number })?.recall_count ?? 5;
        const memoryResult = await searchMemories({
          agentId: agent.id,
          userId,
          teamId: channelData?.team_id || "",
          query: userMessage,
          limit: recallCount,
          customHeaders,
        });
        if (memoryResult.success && memoryResult.data.length > 0) {
          const memoryText = memoryResult.data.map(m => m.summary).join("\n\n---\n\n");
          systemParts.push(`\n## 与用户的历史对话记忆\n以下是该用户与此智能体之前的相关对话记录：\n${memoryText}`);
        }
      } catch (memErr) {
        console.error("记忆检索失败（降级为无记忆模式）:", memErr);
      }
    }

    const systemPrompt = systemParts.join("\n");

    // 上下文压缩
    let finalSystemPrompt = systemPrompt;
    if (agent.context_compress_enabled) {
      const { compressLongText } = await import("@/lib/context-compressor");
      const originalLength = systemPrompt.length;
      finalSystemPrompt = compressLongText(systemPrompt, 3000);
      if (finalSystemPrompt.length < originalLength) {
        console.log(`[ContextCompress] 系统提示词压缩: ${originalLength} chars → ${finalSystemPrompt.length} chars`);
      }
    }

    if (contextMessages.length > 10 && agent.context_compress_enabled) {
      const { compressMessages, shouldCompress } = await import("@/lib/context-compressor");
      if (shouldCompress(contextMessages as any, 3000)) {
        const before = contextMessages.length;
        contextMessages = compressMessages(contextMessages as any, { keepRecent: 6 }, agent.name) as any;
        console.log(`[ContextCompress] 频道历史上下文消息压缩: ${before} → ${contextMessages.length}`);
      }
    }

    // ========== 原生 function calling 配置 ==========
    // 统一转换为 OpenAI 原生工具格式
    const nativeTools = toNativeTools(mergedTools);
    const nativeToolNames = new Set(nativeTools.map((t) => t.function.name));
    // 附加 execute_workflow / execute_skill / delegate_agent / web_search / generate_image
    const extraToolDefs: any[] = [];
    if (wfId && !nativeToolNames.has("execute_workflow")) {
      extraToolDefs.push({ name: "execute_workflow", description: "执行绑定的工作流。参数: workflow_id（可选）, user_input（用户的原始请求, 必填）", parameters: { type: "object", properties: { workflow_id: { type: "string" }, user_input: { type: "string" } }, required: ["user_input"] } });
    }
    if (skillData.length > 0 && !nativeToolNames.has("execute_skill")) {
      extraToolDefs.push({ name: "execute_skill", description: "执行指定技能获取专业能力。参数: skill_id（技能ID, 必填）, task_description（任务描述, 必填）", parameters: { type: "object", properties: { skill_id: { type: "string" }, task_description: { type: "string" } }, required: ["skill_id", "task_description"] } });
    }
    if (teamId && !nativeToolNames.has("delegate_agent")) {
      extraToolDefs.push({ name: "delegate_agent", description: "委托任务给其他智能体。参数: agent_name 或 agent_id（必填）, task（任务描述, 必填）, context（上下文, 可选）", parameters: { type: "object", properties: { agent_name: { type: "string" }, agent_id: { type: "string" }, task: { type: "string" }, context: { type: "string" } }, required: ["task"] } });
    }
    if (!nativeToolNames.has("web_search")) {
      extraToolDefs.push({ name: "web_search", description: "搜索互联网获取最新信息。参数: query（搜索关键词, 必填）, count（返回条数, 可选）", parameters: { type: "object", properties: { query: { type: "string" }, count: { type: "integer" } }, required: ["query"] } });
    }
    if (!nativeToolNames.has("generate_image")) {
      extraToolDefs.push({ name: "generate_image", description: "根据文本描述生成图片。参数: prompt（图片描述, 必填）", parameters: { type: "object", properties: { prompt: { type: "string" } }, required: ["prompt"] } });
    }
    const allNativeTools = [...nativeTools, ...extraToolDefs];

    // 构建消息列表（原生类型）
    const llmMessages: NativeMessage[] = [
      { role: "system", content: finalSystemPrompt },
    ];

    if (contextMessages.length > 0) {
      llmMessages.push(...contextMessages);
    }
    if (ragContextMessages.length > 0) {
      llmMessages.push(...ragContextMessages);
    }

    // 构建用户消息，支持附件（图片→image_url，文件→文本标记）
    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
      const content: any[] = [{ type: "text", text: userMessage }];
      for (const att of attachments) {
        if (att.type === "image") {
          content.push({ type: "image_url", image_url: { url: att.url } });
        } else {
          content.push({ type: "text", text: `[附件: ${att.name || "文件"}](${att.url})` });
        }
      }
      llmMessages.push({ role: "user", content });
    } else {
      llmMessages.push({ role: "user", content: userMessage });
    }

    // Prompt 注入检测
    let injectionDetected = false;
    let injectionPattern = "";
    if (agent.prompt_guard_enabled) {
      const { checkInjection } = await import("@/lib/prompt-guard");
      const result = checkInjection(userMessage);
      injectionDetected = result.detected;
      injectionPattern = result.matchedPattern || "";
    }

    // 模型配置
    const modelConfig = (agent.model_config as { model?: string; temperature?: number; max_tokens?: number }) || {};
    const selectedModel = modelConfig.model || DEFAULT_LLM_MODEL;
    const selectedTemperature = modelConfig.temperature ?? 0.7;
    const maxIterations = (agent.max_iterations as number) || 3;

    // 流式调用 LLM
    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(controller) {
        let controllerClosed = false;
        const safeEnqueue = (data: string) => {
          if (!controllerClosed) {
            try {
              controller.enqueue(encoder.encode(data));
            } catch {
              controllerClosed = true;
            }
          }
        };
        const safeClose = () => {
          if (!controllerClosed) {
            controllerClosed = true;
            try { controller.close(); } catch { /* ignore */ }
          }
        };
        try {
          if (injectionDetected) {
            safeEnqueue(`data: ${JSON.stringify({
              type: "safety_intercepted",
              reason: "prompt_injection",
              detail: `检测到 Prompt 注入，请求已被拦截（匹配模式: ${injectionPattern}）`,
            })}\n\n`);
            safeEnqueue(`data: ${JSON.stringify({ error: "检测到 Prompt 注入，请求已被拦截" })}\n\n`);
            safeClose();
            return;
          }

          const startTime = Date.now();
          const toolCtx: ToolRunContext = {
            client, teamId: teamId || "", userId, agentId,
            sessionId: `channel-${channelId}`,
            customHeaders,
            sendSSE: (data) => safeEnqueue(`data: ${JSON.stringify(data)}\n\n`),
          };
          const deadLoopDetector = new DeadLoopDetector();
          const tokenBudget = new TokenBudget(16000, 8000);
          const traceLogger = new TraceLogger(`agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
          const allToolEntries: { name: string; args: any; result: string; durationMs: number }[] = [];
          const maxIters = maxIterations;
          let iterationCount = 0;
          let finalContent = "";

          // ---- 原生迭代循环：LLM <-> 工具 ----
          while (iterationCount < maxIters) {
            iterationCount++;
            let fullContent = "";
            let assistantToolCalls: NativeToolCall[] = [];
            const stepParser = new StepParser();
            let lastSentCleanLength = 0;

            for await (const ev of streamChat({
              messages: llmMessages,
              model: selectedModel,
              temperature: selectedTemperature,
              tools: allNativeTools.length > 0 ? allNativeTools : undefined,
              toolChoice: "auto",
            })) {
              if (ev.type === "text") {
                fullContent += ev.content;
                const steps = stepParser.feed(ev.content);
                for (const step of steps) {
                  safeEnqueue(`data: ${JSON.stringify({ type: "step", content: step })}\n\n`);
                }
                const cleanText = stepParser.getCleanText();
                const newCleanText = cleanText.slice(lastSentCleanLength);
                if (newCleanText) {
                  safeEnqueue(`data: ${JSON.stringify({ content: newCleanText })}\n\n`);
                }
                lastSentCleanLength = cleanText.length;
              } else if (ev.type === "tool_calls") {
                assistantToolCalls = ev.toolCalls;
              } else if (ev.type === "done") {
                if (ev.toolCalls.length > 0) assistantToolCalls = ev.toolCalls;
              }
            }

            finalContent = fullContent || finalContent;

            // 无工具调用 → 结束循环
            if (assistantToolCalls.length === 0) break;

            // 记录 assistant 消息（携带原生 tool_calls）
            llmMessages.push({
              role: "assistant",
              content: fullContent || null,
              tool_calls: assistantToolCalls,
            });

            const parsedCalls = assistantToolCalls.map((tc) => {
              let args: Record<string, unknown> = {};
              try { args = JSON.parse(tc.function.arguments || "{}"); } catch { /* ignore */ }
              return { id: tc.id, name: tc.function.name, args };
            });

            // ---- 死循环检测 ----
            for (const call of parsedCalls) {
              deadLoopDetector.record({ name: call.name, args: call.args, timestamp: Date.now() });
            }
            const repeatedCheck = deadLoopDetector.checkRepeatedCalls();
            if (repeatedCheck.isLoop) {
              console.log(`[AgentChannel] ${repeatedCheck.reason}`);
              safeEnqueue(`data: ${JSON.stringify({ type: "safety_intercepted", reason: "死循环检测", detail: "检测到重复执行相同操作，已引导 AI 切换方案" })}\n\n`);
              llmMessages.push({ role: "user", content: `[系统提示] 检测到执行模式重复（${repeatedCheck.reason}），请尝试不同的方法。` });
              deadLoopDetector.reset();
              continue;
            }

            safeEnqueue(`data: ${JSON.stringify({ type: "function_call", content: `第 ${iterationCount} 轮调用 ${parsedCalls.length} 个工具` })}\n\n`);

            const toolCallEntries: { name: string; args: any; result: string; durationMs: number }[] = [];
            for (const call of parsedCalls) {
              safeEnqueue(`data: ${JSON.stringify({ type: "function_call_detail", content: "调用: " + call.name + "(" + JSON.stringify(call.args) + ")" })}\n\n`);
              const callStartTime = Date.now();
              const { resultJson, success } = await runAgentTool(call.name, call.args, toolCtx);
              const callDuration = Date.now() - callStartTime;
              tokenBudget.add(resultJson);
              toolCallEntries.push({ name: call.name, args: call.args, result: resultJson, durationMs: callDuration });
              allToolEntries.push(toolCallEntries[toolCallEntries.length - 1]);
              // 原生 tool 结果回传
              llmMessages.push({ role: "tool", tool_call_id: call.id, name: call.name, content: resultJson });
              safeEnqueue(`data: ${JSON.stringify({ type: "tool_result", tool: call.name, success, result: resultJson })}\n\n`);
            }

            traceLogger.addEntry({
              iteration: iterationCount,
              timestamp: new Date().toISOString(),
              toolCalls: toolCallEntries,
              totalTokens: tokenBudget.total,
            });

            safeEnqueue(`data: ${JSON.stringify({
              type: "progress",
              iteration: iterationCount,
              maxIterations: maxIters,
              toolsCalled: toolCallEntries.length,
              elapsedMs: Date.now() - startTime,
              tokenUsage: tokenBudget.total,
              summary: traceLogger.buildProgressSummary(),
              budget: tokenBudget.getSummary(),
            })}\n\n`);

            // Token 预算检查
            const budgetCheck = tokenBudget.checkBudget();
            if (budgetCheck.exceeded) {
              console.log(`[AgentChannel] ${budgetCheck.reason}`);
              safeEnqueue(`data: ${JSON.stringify({ type: "safety_intercepted", reason: "Token 预算超限", detail: budgetCheck.reason })}\n\n`);
              llmMessages.push({ role: "user", content: `[系统提示] 本次任务已超出预算限制（${budgetCheck.reason}），请基于已有结果生成最终回复，不要再调用新的工具。` });
            }

            // 上下文压缩
            if (llmMessages.length > 15) {
              try {
                const { compressMessages, shouldCompress } = await import("@/lib/context-compressor");
                const systemMsgs = llmMessages.filter(m => m.role === "system");
                const nonSystemMsgs = llmMessages.filter(m => m.role !== "system") as any[];
                if (nonSystemMsgs.length > 10 && shouldCompress(nonSystemMsgs, 4000)) {
                  const compressed = compressMessages(nonSystemMsgs, { keepRecent: 8 }, agent.name);
                  llmMessages.length = 0;
                  llmMessages.push(...(systemMsgs as NativeMessage[]), ...(compressed as NativeMessage[]));
                }
              } catch (e) { console.error("上下文压缩失败:", e); }
            }
          }

          traceLogger.flush();
          safeEnqueue(`data: ${JSON.stringify({ type: "cost", totalTokens: tokenBudget.total, estimatedCost: "≈ " + (tokenBudget.total * 0.000002).toFixed(4) + " 元" })}\n\n`);

          // 清理 [STEP] 标签，确保存入数据库的是纯净文本
          const { cleanText: cleanedFullContent } = parseStepsFromText(finalContent);
          const fullContent = cleanedFullContent || finalContent;
          let messageId: string | null = null;

          // 写入数据库（智能体作为顶级帖子回复，像同事一样直接发帖）
          if (fullContent) {
            // 构建引用块：自动在回复内容前拼接原始消息引用，让用户知道智能体在回谁
            let replyPrefix = "";
            let mentionUserIds: string[] = [];
            if (userMessageId) {
              try {
                const { data: originalMsg } = await client
                  .from("channel_messages")
                  .select("sender_id, content, sender_type")
                  .eq("id", userMessageId)
                  .eq("is_active", true)
                  .single();

                if (originalMsg) {
                  // 获取发送者名称
                  let senderName = "用户";
                  if (originalMsg.sender_type === "agent") {
                    const { data: agentData } = await client
                      .from("agents")
                      .select("name")
                      .eq("id", originalMsg.sender_id)
                      .single();
                    senderName = agentData?.name || "智能体";
                  } else {
                    const { data: userData } = await client
                      .from("users")
                      .select("name")
                      .eq("id", originalMsg.sender_id)
                      .single();
                    senderName = userData?.name || "用户";
                  }
                  const snippet = (originalMsg.content || "").slice(0, 100);
                  replyPrefix = `> @${senderName}：${snippet}${snippet.length >= 100 ? "..." : ""}\n\n`;
                  // 将原始消息发送者加入 mentions，确保对方收到通知
                  mentionUserIds = [originalMsg.sender_id];
                }
              } catch (refErr) {
                console.error("获取原始消息引用失败:", refErr);
              }
            }

            const insertData = {
              channel_id: channelId,
              sender_id: agent.id,
              sender_type: "agent",
              content: replyPrefix + fullContent,
              message_type: "text",
              attachments: [],
              topic_tags: [],
              mentions: mentionUserIds,
              is_active: true,
              reply_to_id: null,
              thread_root_id: null,
            };

            const { data: newMsg, error: insertError } = await client
              .from("channel_messages")
              .insert(insertData)
              .select("id")
              .single();

            if (insertError) {
              console.error("写入智能体回复失败:", JSON.stringify(insertError));
            } else {
              messageId = newMsg?.id ?? null;
              generateMessageEmbedding(newMsg.id, replyPrefix + fullContent, customHeaders).catch(() => {});
              // 持久化记忆存储
              if (agent.memory_enabled === true) {
                import("@/lib/agent-memory").then(({ storeMemory }) => {
                  storeMemory({ agentId: agent.id, userId, teamId: channelData?.team_id || "", content: userMessage, summary: replyPrefix + fullContent, customHeaders }).catch(() => {});
                });
              }
              safeEnqueue(`data: ${JSON.stringify({ done: true, messageId: newMsg?.id })}\n\n`);
            }
          }

          safeEnqueue("data: [DONE]\n\n");
          safeClose();
        } catch (streamError) {
          console.error("智能体频道回复流式输出错误:", streamError);
          safeEnqueue(`data: ${JSON.stringify({ error: "生成回复时出错" })}\n\n`);
          safeEnqueue("data: [DONE]\n\n");
          safeClose();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("智能体频道回复错误:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}