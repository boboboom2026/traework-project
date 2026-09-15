import { DEFAULT_LLM_MODEL } from "@/lib/llm/models";
import { NextRequest } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { HeaderUtils, type ContentPart } from "@/lib/sdk";
import { buildChannelContext } from "@/lib/agent-context";
import { buildRagContext } from "@/lib/rag-context";
import { formatSkillsForContext, getAgentSkills } from "@/lib/agents/skill-loader";
import { getAgentTools, convertToFunctionTools, executeToolAction, AgentTool } from "@/lib/agents/skill-actions";
import { streamChat, toNativeTools, type NativeMessage, type NativeToolCall } from "@/lib/llm/native-client";
import { parseStepsFromText } from "@/lib/agent-step-parser";
import { logAgentTask } from "@/lib/agent-task-logger";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { agentId, messages: chatMessages, teamId, channelId, attachments, userId: reqUserId } = await request.json();

    if (!agentId) {
      return new Response(JSON.stringify({ error: "智能体ID不能为空" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!chatMessages || !Array.isArray(chatMessages) || chatMessages.length === 0) {
      return new Response(JSON.stringify({ error: "消息不能为空" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 规范化附件数据
    const normalizedAttachments: Array<{ type: string; url: string; name: string; size: number; key?: string; contentType?: string }> = Array.isArray(attachments) ? attachments : [];

    // 1. 从数据库获取智能体配置（含频道上下文配置）
    const client = getSupabaseClient();
    const { data: agent, error: agentError } = await client
      .from("agents")
      .select("id, name, description, system_prompt, skill_ids, rag_dataset_ids, mcp_service_ids, workflow_id, channel_context_enabled, channel_context_limit, channel_context_scope")
      .eq("id", agentId)
      .eq("status", "active")
      .single();

    if (agentError || !agent) {
      return new Response(JSON.stringify({ error: "智能体不存在" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 1.5. 加载工作流配置（如果有）
    let workflowData: any = null;
    if ((agent as any).workflow_id) {
      const { data: wf } = await client
        .from("agent_workflows")
        .select("*")
        .eq("id", (agent as any).workflow_id)
        .eq("is_active", true)
        .single();
      workflowData = wf;
    }

    // 2. 获取关联的 Skill SOP 文档
    const skillsContext = await getAgentSkills(agentId);
    const skillsText = formatSkillsForContext(skillsContext);

    // 4. 获取关联的 RAG 知识库信息
    const ragIds = (agent.rag_dataset_ids as string[]) || [];
    let ragInfo: string[] = [];
    if (ragIds.length > 0) {
      const { data: ragData } = await client
        .from("rag_datasets")
        .select("name, description")
        .in("id", ragIds)
        .eq("status", "active");
      if (ragData) {
        ragInfo = ragData.map((r: { name: string; description: string }) =>
          `- ${r.name}${r.description ? `: ${r.description}` : ""}`
        );
      }
    }

    // 4. 获取关联的 MCP 服务信息
    const mcpIds = (agent.mcp_service_ids as string[]) || [];
    let mcpInfo: string[] = [];
    if (mcpIds.length > 0) {
      const { data: mcpData } = await client
        .from("mcp_services")
        .select("name, description, allowed_operations")
        .in("id", mcpIds)
        .eq("status", "active");
      if (mcpData) {
        mcpInfo = mcpData.map((m: { name: string; description: string; allowed_operations: string[] }) =>
          `- ${m.name}${m.description ? `: ${m.description}` : ""}${(m.allowed_operations || []).length > 0 ? ` (支持操作: ${(m.allowed_operations as string[]).join(", ")})` : ""}`
        );
      }
    }

    // 5. 构建系统提示词
    const systemParts: string[] = [];
    systemParts.push(`你是「${agent.name}」，一个企业智能助手。`);

    if (agent.description) {
      systemParts.push(`\n## 简介\n${agent.description}`);
    }

    if (agent.system_prompt) {
      systemParts.push(agent.system_prompt);
    }

    // 注入当前团队上下文，避免调用需 team_id 的工具时向用户索要
    try {
      const { data: teamInfo } = await client
        .from("teams")
        .select("id, name")
        .eq("id", teamId)
        .single();
      const { data: tm } = teamId
        ? await client
            .from("team_members")
            .select("users!inner (id, name, title, department)")
            .eq("team_id", teamId)
            .limit(50)
        : { data: [] };
      const memberBrief = (tm || [])
        .map((m: any) => {
          const u = m.users as any;
          if (!u) return null;
          const title = u.title || u.department || "";
          return `- ${u.name}（ID: ${u.id}${title ? "，角色/部门: " + title : ""}）`;
        })
        .filter(Boolean)
        .join("\n");
      systemParts.push(`\n## 当前团队上下文\n你当前所在的团队 ID（team_id）是：${teamId || "未知"}${teamInfo?.name ? "，团队名称：" + teamInfo.name : ""}。\n调用需要 team_id 的工具（search_member、list_members、get_team 等）直接用上述 ID，无需向用户索要。\n\n当前团队成员简表：\n${memberBrief || "（暂无成员信息）"}\n\n当要求推进团队协作、对接具体成员（如设计/技术/客服岗位负责人）时，优先从上方成员简表中识别并对接；仅当信息确实缺失时才询问用户。`);
    } catch (e) {
      console.error("注入团队上下文失败:", e);
    }

    // 注入 Skill SOP 文档（可自动调用的技能库）
    if (skillsText) {
      systemParts.push(`\n## 可用技能\n你可以使用以下技能来辅助完成任务：\n\n${skillsText}`);
    }

    if (ragInfo.length > 0) {
      systemParts.push(`\n## 知识库\n你可以参考以下知识库中的信息：\n${ragInfo.join("\n")}`);
    }

    if (mcpInfo.length > 0) {
      systemParts.push(`\n## 外部服务\n你可以通过以下服务与外部系统交互：\n${mcpInfo.join("\n")}`);
    }

    // 6. 构建频道历史上下文（仅当用户未上传附件时启用，作为降级辅助策略）
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    let channelContextMessages: Array<{ role: "system" | "user" | "assistant"; content: string | ContentPart[] }> = [];

    if (agent.channel_context_enabled && normalizedAttachments.length === 0) {
      try {
        let targetChannelId = channelId || null;

        // 如果没有指定 channelId，尝试获取团队默认频道
        if (!targetChannelId && teamId) {
          const { data: defaultChannel } = await client
            .from("channels")
            .select("id")
            .eq("team_id", teamId)
            .eq("is_default", true)
            .limit(1)
            .single();

          targetChannelId = defaultChannel?.id || null;

          // 如果没有默认频道，查找该团队任意一个频道
          if (!targetChannelId) {
            const { data: anyChannel } = await client
              .from("channels")
              .select("id")
              .eq("team_id", teamId)
              .eq("is_active", true)
              .limit(1)
              .single();
            targetChannelId = anyChannel?.id || null;
          }
        }

        if (targetChannelId && teamId) {
          const contextLimit = (agent.channel_context_limit as number) || 20;
          const lastUserMsg = chatMessages[chatMessages.length - 1]?.content || "";
          const result = await buildChannelContext({
            channelId: targetChannelId,
            teamId,
            userMessage: lastUserMsg,
            contextLimit,
            customHeaders,
          });

          if (result.llmMessages.length > 0) {
            systemParts.push(`\n## 频道历史上下文\n以下是频道中的历史对话记录，请结合上下文理解用户的问题：\n${result.contextText}`);
            channelContextMessages = result.llmMessages;
          }
        }
      } catch (ctxErr) {
        console.error("构建频道上下文失败（降级为无上下文模式）:", ctxErr);
      }
    }

    // 7. 构建知识库语义检索上下文
    let ragContextMessages: Array<{ role: "system" | "user" | "assistant"; content: string | ContentPart[] }> = [];
    if (ragIds.length > 0) {
      try {
        // 获取用户最后一条消息作为查询
        const lastUserMsg = chatMessages.filter((m: { role: string }) => m.role === "user").pop();
        if (lastUserMsg) {
          const ragResult = await buildRagContext({
            datasetIds: ragIds,
            userMessage: typeof lastUserMsg.content === "string" ? lastUserMsg.content : "",
            customHeaders,
          });
          if (ragResult.contextText) {
            systemParts.push(`\n## 知识库检索结果\n以下是从关联知识库中检索到的相关信息，请优先参考这些内容回答用户的问题：\n${ragResult.contextText}`);
            ragContextMessages = ragResult.llmMessages;
          }
        }
      } catch (ragErr) {
        console.error("知识库检索失败（降级为无检索模式）:", ragErr);
      }
    }

    systemParts.push("\n## 注意事项\n- 请用中文回复\n- 保持专业、友好的语气\n- 如果不确定，请坦诚说明");

    // 注入工作流信息
    if (workflowData) {
      const stepsDesc = (workflowData.steps as any[] || []).map((s: any, i: number) =>
        `  ${i + 1}. ${s.name}${s.description ? ` - ${s.description}` : ""}`
      ).join("\n");
      systemParts.push(`
## 工作流执行能力
你已绑定以下工作流，可在需要时调用：

名称: ${workflowData.name}
描述: ${workflowData.description || "无"}
步骤:
${stepsDesc || "  无详细步骤"}

当你需要按步骤执行复杂任务时，请使用 \`execute_workflow\` 工具来触发工作流执行。
工作流工具的参数:
- workflow_id: "${workflowData.id}"（固定值）
- user_input: 用户的问题或指令（根据对话内容自动填充）

注意：工作流适用于需要按固定步骤执行的场景。对于简单问题，直接回答即可。
`);
    }

    const systemPrompt = systemParts.join("\n") + "\n\n## 文档输出规则\n当你输出结构化的知识文档（报告、方案、评估、教程、分析等）时，请使用 Markdown 格式，第一行用 # 或 ## 标题开头，正文使用 Markdown 语法组织。普通对话回复不需要此结构。";

    // 7. 构建消息列表
    const llmMessages: Array<{ role: "system" | "user" | "assistant"; content: string | ContentPart[]; tool_calls?: any[]; tool_call_id?: string }> = [
      { role: "system" as const, content: systemPrompt },
    ];

    // 注入频道历史上下文（如有）
    if (channelContextMessages.length > 0) {
      llmMessages.push(...channelContextMessages);
    }

    // 注入知识库检索上下文（如有）
    if (ragContextMessages.length > 0) {
      llmMessages.push(...ragContextMessages);
    }

    // 用户对话消息
    const processedMessages = chatMessages.map((m: { role: string; content: string }, idx: number) => {
      // 为最后一条用户消息注入附件
      if (idx === chatMessages.length - 1 && m.role === "user" && normalizedAttachments.length > 0) {
        const contentParts: ContentPart[] = [];
        if (m.content) {
          contentParts.push({ type: "text", text: m.content });
        }
        for (const att of normalizedAttachments) {
          if (att.type === "image" && att.url) {
            contentParts.push({
              type: "image_url",
              image_url: { url: att.url, detail: "high" },
            });
          } else if (att.type === "file" && att.name) {
            contentParts.push({
              type: "text",
              text: `[附件: ${att.name}${att.size ? ` (${Math.round(att.size / 1024)}KB)` : ""}]`,
            });
          } else if (att.type === "video" && att.name) {
            contentParts.push({
              type: "text",
              text: `[视频: ${att.name}]`,
            });
          }
        }
        return { role: m.role as "user" | "assistant", content: contentParts };
      }
      return { role: m.role as "user" | "assistant", content: m.content };
    });
    llmMessages.push(...processedMessages);

    // 8. 获取智能体绑定的可执行工具（Function Calling）
    const agentTools = await getAgentTools(agentId);
    const functionTools = convertToFunctionTools(agentTools);
    
    // 创建工具名称到工具的映射，用于执行时查找
    const toolMap = new Map<string, AgentTool>();
    agentTools.forEach(tool => {
      toolMap.set(tool.action, tool);
    });
    
    // 原生 function calling：工具定义通过 tools 参数传给模型（不再注入 <tool_call> 文本格式）
    const nativeTools = toNativeTools(functionTools);

    // 重新构建系统提示词
    const finalSystemPrompt = systemParts.join("\n");
    llmMessages[0] = { role: "system" as const, content: finalSystemPrompt };

    // 9. 原生 function calling 循环
    let finalResponse = "";
    let functionCallCount = 0;
    const maxFunctionCalls = 5;

    while (functionCallCount < maxFunctionCalls) {
      let aggregatedContent = "";
      let pendingToolCalls: NativeToolCall[] = [];

      try {
        for await (const ev of streamChat({
          messages: llmMessages as unknown as NativeMessage[],
          model: DEFAULT_LLM_MODEL,
          temperature: 0.7,
          tools: nativeTools.length > 0 ? nativeTools : undefined,
        })) {
          if (ev.type === "done") {
            aggregatedContent = ev.content;
            pendingToolCalls = ev.toolCalls;
          }
        }
      } catch (invokeError) {
        console.error("LLM 调用错误:", invokeError);
        finalResponse = "抱歉，处理您的请求时出现了错误。";
        break;
      }

      // 无工具调用 → 收到最终回复
      if (pendingToolCalls.length === 0) {
        finalResponse = aggregatedContent;
        break;
      }

      // 追加 assistant 消息（含 tool_calls）
      llmMessages.push({
        role: "assistant",
        content: aggregatedContent || null,
        tool_calls: pendingToolCalls,
      } as any);

      // 逐个执行工具，结果以 role:"tool" 回传
      for (const tc of pendingToolCalls) {
        const toolName = tc.function.name;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments || "{}");
        } catch {
          args = {};
        }

        let resultContent: string;

        // 特殊处理 execute_workflow（工作流执行）
        if (toolName === "execute_workflow" && workflowData) {
          try {
            const { WorkflowExecutor } = await import("@/lib/workflow-executor");
            const executor = new WorkflowExecutor(
              workflowData,
              `agent-chat-${Date.now()}`,
              () => {} // agent-chat 路由不流式输出工作流事件
            );
            const wfResult = await executor.executeWorkflowOnce((args.user_input as string) || "");
            resultContent = JSON.stringify({ success: true, result: "工作流执行完成", workflowResult: wfResult });
          } catch (e: any) {
            resultContent = JSON.stringify({ success: false, error: `工作流执行失败: ${e.message || String(e)}` });
          }
        } else {
          const tool = toolMap.get(toolName);
          if (!tool) {
            resultContent = JSON.stringify({ success: false, error: "工具不存在" });
          } else {
            const execResult = await executeToolAction(tool, args, { agentId, teamId });
            resultContent = JSON.stringify(execResult);
          }
        }

        llmMessages.push({
          role: "tool",
          tool_call_id: tc.id,
          name: toolName,
          content: resultContent,
        } as any);
      }

      functionCallCount++;
    }

    // 10. 解析 [STEP] 标签，分离步骤事件和纯净文本
    const { steps, cleanText } = parseStepsFromText(finalResponse);
    
    // 12. 返回 SSE 流（打字机效果 + 步骤事件）
    const encoder = new TextEncoder();
    const startTime = Date.now();
    const currentUserId = reqUserId || "";
    const readable = new ReadableStream({
      async start(controller) {
        try {
          // 先发送所有步骤事件
          for (const step of steps) {
            const stepMessage = `data: ${JSON.stringify({ type: "step", content: step })}\n\n`;
            controller.enqueue(encoder.encode(stepMessage));
          }

          // 发送纯净文本（打字机效果）
          for (const char of cleanText) {
            const sseMessage = `data: ${JSON.stringify({ content: char })}\n\n`;
            controller.enqueue(encoder.encode(sseMessage));
            await new Promise(resolve => setTimeout(resolve, 10));
          }

          // 记录任务日志
          try {
            const lastMsg = chatMessages?.[chatMessages.length - 1]?.content || "";
            const userInput = typeof lastMsg === "string" ? lastMsg : JSON.stringify(lastMsg);
            await logAgentTask({
              agentId: agentId || "",
              teamId: teamId || "",
              userId: currentUserId || undefined,
              taskType: "chat",
              taskInput: userInput,
              taskOutput: cleanText,
              durationMs: Date.now() - startTime,
              status: "completed",
            });
          } catch (e) { console.error("记录任务日志失败:", e); }

          // 发送结束标记
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (streamError) {
          console.error("SSE 流输出错误:", streamError);
          // 记录失败任务日志
          try {
            await logAgentTask({
              agentId: agentId || "",
              teamId: teamId || "",
              userId: currentUserId || undefined,
              taskType: "chat",
              taskInput: chatMessages?.[chatMessages.length - 1]?.content || "",
              durationMs: Date.now() - startTime,
              status: "failed",
              errorMessage: streamError instanceof Error ? streamError.message : "SSE流输出错误",
            });
          } catch (e) { console.error("记录失败日志失败:", e); }
          const errorMsg = `data: ${JSON.stringify({ error: "生成回复时出错" })}\n\n`;
          controller.enqueue(encoder.encode(errorMsg));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        }
      }
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("智能体对话错误:", error);
    return new Response(JSON.stringify({ error: "服务器错误" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
