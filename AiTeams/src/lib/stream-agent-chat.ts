import type { SupabaseClient } from "@supabase/supabase-js";
import { StepParser } from "@/lib/agent-step-parser";
import type { WorkflowEvent } from "@/lib/workflow-executor";
import { DeadLoopDetector, TokenBudget, TraceLogger } from "@/lib/agent-safety";
import {
  streamChat,
  toNativeTools,
  type NativeMessage,
  type NativeToolCall,
} from "@/lib/llm/native-client";
import { runAgentTool, type ToolRunContext } from "@/lib/agents/agent-tool-runner";

interface StreamParams {
  injectionBlocked: boolean;
  injectionPattern: string;
  tools: any[];
  llmMessages: any[];
  selectedModel: string;
  selectedTemperature: number;
  customHeaders: Record<string, string>;
  client: SupabaseClient;
  teamId: string;
  userId: string;
  agentName: string;
  agentId: string;
  sessionId: string;
  chatMessages: any[];
  userContent: string;
  memoryEnabled: boolean;
  maxIterations: number;
  toolApprovalMode: string;
}

/**
 * 智能体对话核心引擎（原生 function calling 版）
 *
 * 相对旧实现的根本变化：
 *  - 废弃 <tool_call> 文本标签协议（parseToolCalls / 文本过滤块已删除）
 *  - 工具定义以原生 tools 参数传给模型，工具调用由模型以结构化 tool_calls 返回
 *  - 工具结果以 role:"tool" + tool_call_id 回传，形成标准的多轮工具循环
 *  - 保留原有 SSE 事件协议，前端消费逻辑不受影响
 */
export function createAgentChatStream(params: StreamParams): ReadableStream<Uint8Array> {
  const {
    injectionBlocked, injectionPattern, tools, llmMessages, selectedModel,
    selectedTemperature, customHeaders, client, teamId, userId, agentName,
    agentId, sessionId, userContent, memoryEnabled, maxIterations, toolApprovalMode,
  } = params;
  const startTime = Date.now();
  const nativeTools = toNativeTools(tools);
  return new ReadableStream({
    start: function (controller) {
      new Promise<void>(async (resolve) => {
        const encoder = new TextEncoder();
        function sendSSE(data: Record<string, unknown>) {
          controller.enqueue(encoder.encode("data: " + JSON.stringify(data) + "\n\n"));
        }

        const agentMessages = [...llmMessages] as unknown as NativeMessage[];
        const maxIters = maxIterations || 10;
        const deadLoopDetector = new DeadLoopDetector();
        const tokenBudget = new TokenBudget(16000, 8000);
        const traceLogger = new TraceLogger(`agent-chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
        const allToolEntries: { name: string; args: Record<string, unknown>; result: string; durationMs: number }[] = [];
        let finalReply = "";
        // 审批相关：记录本轮 submit_for_approval 创建出的审批任务 id 列表
        const createdApprovalTaskIds: string[] = [];

        try {
          if (injectionBlocked) {
            sendSSE({ type: "safety_intercepted", reason: "prompt_injection", detail: `检测到 Prompt 注入，请求已被拦截（匹配模式: ${injectionPattern}）` });
            sendSSE({ type: "error", content: "检测到潜在的提示注入攻击，已阻止本次请求" });
            controller.close();
            resolve();
            return;
          }

          try {
            await client.from("agent_chat_sessions").update({
              task_status: "processing",
              task_summary: userContent.length > 50 ? userContent.slice(0, 50) + "..." : userContent,
            }).eq("id", sessionId);
          } catch (e) { console.error("更新任务状态失败:", e); }

          const toolCtx: ToolRunContext = { client, teamId, userId, agentId, sessionId, customHeaders, sendSSE };

          let iterationCount = 0;
          while (iterationCount < maxIters) {
            iterationCount++;
            let fullContent = "";
            let assistantToolCalls: NativeToolCall[] = [];
            const stepParser = new StepParser();

            for await (const ev of streamChat({
              messages: agentMessages,
              model: selectedModel,
              temperature: selectedTemperature,
              tools: nativeTools.length > 0 ? nativeTools : undefined,
              toolChoice: "auto",
            })) {
              if (ev.type === "text") {
                fullContent += ev.content;
                const steps = stepParser.feed(ev.content);
                for (const step of steps) sendSSE({ type: "step", content: step });
                if (ev.content) sendSSE({ type: "text", content: ev.content });
              } else if (ev.type === "tool_calls") {
                assistantToolCalls = ev.toolCalls;
              } else if (ev.type === "done") {
                if (ev.toolCalls.length > 0) assistantToolCalls = ev.toolCalls;
              }
            }

            finalReply = fullContent || finalReply;

            // 无工具调用 → 结束循环
            if (assistantToolCalls.length === 0) break;

            // 记录 assistant 消息（携带 tool_calls）
            agentMessages.push({
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
              console.log(`[AgentChat] ${repeatedCheck.reason}`);
              sendSSE({ type: "safety_intercepted", reason: "死循环检测", detail: "检测到重复执行相同操作，已引导 AI 切换方案" });
              agentMessages.push({ role: "user", content: `[系统提示] 检测到执行模式重复（${repeatedCheck.reason}），请尝试不同的方法。` });
              deadLoopDetector.reset();
              continue;
            }

            // ---- 工具审批检查 ----
            const highRiskTools = ["send_message", "create_channel", "delete_channel", "invite_member", "remove_member", "send_notification", "update_config"];
            if (toolApprovalMode === "always" || (toolApprovalMode === "conditional" && parsedCalls.some(c => highRiskTools.includes(c.name)))) {
              sendSSE({ type: "tool_approval_needed", tools: parsedCalls.map(c => ({ name: c.name, args: c.args })) });
              break;
            }

            sendSSE({ type: "function_call", content: "正在调用工具..." });
            const toolCallEntries: { name: string; args: Record<string, unknown>; result: string; durationMs: number }[] = [];

            for (const call of parsedCalls) {
              sendSSE({ type: "function_call_detail", content: "调用: " + call.name + "(" + JSON.stringify(call.args) + ")" });
              const callStartTime = Date.now();
              const { resultJson, success } = await runAgentTool(call.name, call.args, toolCtx);
              const callDuration = Date.now() - callStartTime;
              // 检测审批提交：记录 submit_for_approval 生成的审批任务 id（用于回绑本条回复消息）
              if (call.name === "submit_for_approval") {
                try {
                  const parsed = JSON.parse(resultJson);
                  const tid = parsed?.result?.task_id || parsed?.task_id;
                  if (tid) createdApprovalTaskIds.push(String(tid));
                } catch { /* 结果非 JSON，忽略 */ }
              }
              tokenBudget.add(resultJson);
              toolCallEntries.push({ name: call.name, args: call.args, result: resultJson, durationMs: callDuration });
              allToolEntries.push(toolCallEntries[toolCallEntries.length - 1]);
              // 标准化 tool 结果回传
              agentMessages.push({ role: "tool", tool_call_id: call.id, name: call.name, content: resultJson });
              sendSSE({ type: "tool_result", name: call.name, status: success ? "completed" : "error" });
            }

            // 记录 Trace
            traceLogger.addEntry({ iteration: iterationCount, timestamp: new Date().toISOString(), toolCalls: toolCallEntries, totalTokens: tokenBudget.total });

            // 进度事件
            sendSSE({
              type: "progress",
              iteration: iterationCount,
              maxIterations: maxIters,
              toolsCalled: toolCallEntries.length,
              elapsedMs: traceLogger.getTotalDuration(),
              tokenUsage: tokenBudget.total,
              summary: traceLogger.buildProgressSummary(),
              budget: tokenBudget.getSummary(),
            });

            // Token 预算检查
            const budgetCheck = tokenBudget.checkBudget();
            if (budgetCheck.exceeded) {
              console.log(`[AgentChat] ${budgetCheck.reason}`);
              sendSSE({ type: "safety_intercepted", reason: "Token 预算超限", detail: budgetCheck.reason });
              agentMessages.push({ role: "user", content: `[系统提示] 本次任务已超出预算限制（${budgetCheck.reason}），请基于已有结果生成最终回复。` });
            }

            // 上下文压缩
            if (agentMessages.length > 15) {
              try {
                const { compressMessages, shouldCompress } = await import("@/lib/context-compressor");
                const systemMsgs = agentMessages.filter(m => m.role === "system");
                const nonSystemMsgs = agentMessages.filter(m => m.role !== "system") as any[];
                if (nonSystemMsgs.length > 10 && shouldCompress(nonSystemMsgs, 4000)) {
                  const compressed = compressMessages(nonSystemMsgs, { keepRecent: 8 }, agentName);
                  agentMessages.length = 0;
                  agentMessages.push(...(systemMsgs as any), ...compressed);
                }
              } catch (e) { console.error("上下文压缩失败:", e); }
            }
          }

          traceLogger.flush();
          sendSSE({ type: "cost", totalTokens: tokenBudget.total, estimatedCost: "≈ " + (tokenBudget.total * 0.000002).toFixed(4) + " 元" });

          finalReply = finalReply || "智能体已完成回复";

          try {
            const { storeAgentMemory } = await import("@/lib/agent-memory");
            if (memoryEnabled) { await storeAgentMemory(agentId, userId, teamId, userContent, finalReply).catch((e: Error) => console.error("记忆存储失败:", e)); }
          } catch (e) { console.error("记忆处理失败:", e); }

          // 从回复中提取产出物
          const artifacts: Array<{ type: string; name: string; url?: string; content?: string }> = [];
          const imgPattern = /!\[.*?\]\((https?:\/\/[^\s)]+)\)/g;
          let imgMatch;
          while ((imgMatch = imgPattern.exec(finalReply)) !== null) {
            artifacts.push({ type: "image", name: "生成的图片", url: imgMatch[1] });
          }
          const linkPattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
          let linkMatch;
          while ((linkMatch = linkPattern.exec(finalReply)) !== null) {
            artifacts.push({ type: "link", name: linkMatch[1], url: linkMatch[2] });
          }
          const codePattern = /```(\w+)?\n([\s\S]*?)```/g;
          let codeMatch;
          while ((codeMatch = codePattern.exec(finalReply)) !== null) {
            const lang = codeMatch[1] || "text";
            const code = codeMatch[2].trim();
            if (code.length > 20) artifacts.push({ type: "code", name: `${lang} 代码`, content: code.slice(0, 200) });
          }

          try {
            await client.from("agent_chat_sessions").update({
              task_status: "completed",
              task_summary: finalReply.length > 100 ? finalReply.slice(0, 100) + "..." : finalReply,
              last_artifacts: JSON.stringify(artifacts),
            }).eq("id", sessionId);
          } catch (e) { console.error("更新任务完成状态失败:", e); }

          try {
            const { data: insertedMsg, error: insertErr } = await client.from("agent_chat_messages").insert({
              session_id: sessionId, sender_type: "agent", sender_id: agentId, content: finalReply,
              attachments: JSON.stringify(artifacts),
            }).select().single();
            if (insertErr) console.error("插入智能体回复失败:", insertErr);
            // 回绑审批任务 source_id → 本条回复消息，前端可按 message.id 精确查询审批状态
            if (insertedMsg?.id && createdApprovalTaskIds.length > 0) {
              for (const tid of createdApprovalTaskIds) {
                try {
                  await client.from("approval_tasks").update({ source_id: insertedMsg.id }).eq("id", tid);
                } catch (e) { console.error("绑定审批任务 source_id 失败:", e); }
              }
            }
          } catch (e) { console.error("保存回复失败:", e); }

          try {
            const { logAgentTask } = await import("@/lib/agent-task-logger");
            await logAgentTask({
              agentId, teamId, userId, sessionId,
              taskType: "chat",
              taskInput: userContent,
              taskOutput: finalReply,
              toolCalls: allToolEntries.length > 0 ? allToolEntries.map(e => ({ tool: e.name, action: e.name, params: e.args, result: {} })) : undefined,
              durationMs: Date.now() - startTime,
              status: "completed",
            });
          } catch (e) { console.error("记录任务日志失败:", e); }

          sendSSE({ type: "done", content: finalReply });
          sendSSE({ done: true });
          controller.close();
          resolve();
        } catch (err: any) {
          const streamError = (err?.message || String(err)).slice(0, 500);
          try {
            const { logAgentTask } = await import("@/lib/agent-task-logger");
            await logAgentTask({
              agentId, teamId, userId, sessionId,
              taskType: "chat",
              taskInput: userContent,
              taskOutput: streamError || undefined,
              durationMs: Date.now() - startTime,
              status: "failed",
              errorMessage: streamError || undefined,
            });
          } catch (e) { console.error("记录失败任务日志失败:", e); }

          try {
            await client.from("agent_chat_sessions").update({
              task_status: "failed",
              task_summary: "智能体回复失败：" + streamError.slice(0, 100),
            }).eq("id", sessionId);
          } catch (e) { console.error("更新任务失败状态失败:", e); }

          sendSSE({ type: "error", content: "智能体回复失败：" + (err?.message || String(err)) });
          controller.close();
          resolve();
        }
      });
    },
  });
}
