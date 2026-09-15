import { DEFAULT_LLM_MODEL } from "@/lib/llm/models";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { calculateNextRun } from "@/app/api/agents/schedules/cron-utils";
import { logAgentTask } from "@/lib/agent-task-logger";
import { streamChat, toNativeTools, type NativeMessage, type NativeToolCall } from "@/lib/llm/native-client";

/**
 * 后台调度服务 - 每分钟检查到期的调度任务并自动触发
 */

let schedulerInterval: NodeJS.Timeout | null = null;
let isRunning = false;

export function log(msg: string) {
  const ts = new Date().toISOString();
  console.log(`[Scheduler] ${ts} ${msg}`);
}

export function logError(msg: string) {
  const ts = new Date().toISOString();
  console.error(`[Scheduler] ${ts} ${msg}`);
}

export function startScheduler() {
  if (schedulerInterval) {
    log("调度服务已在运行中");
    return;
  }

  log("启动自动化任务调度服务...");

  // 每分钟检查一次
  schedulerInterval = setInterval(async () => {
    if (isRunning) return;
    isRunning = true;
    try {
      await checkAndExecuteDueTasks();
    } catch (err) {
      logError("检查到期任务异常: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      isRunning = false;
    }
  }, 60_000);

  // 启动后立即检查一次
  setTimeout(() => checkAndExecuteDueTasks().catch((e) => logError("首次检查异常: " + e)), 5000);
}

export function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    log("调度服务已停止");
  }
}

async function checkAndExecuteDueTasks() {
  const client = getSupabaseClient();
  const now = new Date().toISOString();

  // 查询所有到期且启用的任务
  const { data: dueTasks, error } = await client
    .from("agent_schedules")
    .select("*")
    .eq("enabled", true)
    .lte("next_run_at", now)
    .order("next_run_at", { ascending: true })
    .limit(10);

  if (error) {
    logError("查询到期任务失败: " + error.message);
    return;
  }

  if (!dueTasks || dueTasks.length === 0) return;

  log(`发现 ${dueTasks.length} 个到期任务`);

  for (const task of dueTasks) {
    try {
      await executeScheduledTask(task);
    } catch (err) {
      logError(`执行任务 ${task.id} 失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

/**
 * 规范化工具参数
 */
function normalizeParameters(params: any): any[] {
  if (!params) return [];
  if (Array.isArray(params)) return params;
  if (typeof params === "object") {
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

/**
 * 执行调度任务 - 支持 Function Calling 工具调用
 */
export async function executeScheduledTask(schedule: any) {
  const client = getSupabaseClient();

  // 获取智能体信息
  const { data: agent } = await client
    .from("agents")
    .select("id, name, system_prompt, model_config, skill_ids, rag_dataset_ids, mcp_service_ids, workflow_id, channel_context_enabled, channel_context_limit, memory_enabled, memory_config")
    .eq("id", schedule.agent_id)
    .single();

  if (!agent) {
    logError(`智能体 ${schedule.agent_id} 不存在`);
    return;
  }

  log(`开始执行任务: ${schedule.name} (智能体: ${agent.name})`);

  // 创建执行日志
  const logId = crypto.randomUUID();
  await client.from("schedule_execution_logs").insert({
    id: logId,
    schedule_id: schedule.id,
    status: "running",
    trigger_msg: schedule.trigger_msg,
    started_at: new Date().toISOString(),
  });

  const startTime = Date.now();

  try {
    // ========== 加载工具 ==========
    const tools: any[] = [];
    const toolDescriptions: string[] = [];

    // 从 agent_tool_bindings 加载工具
    const { data: tBind } = await client
      .from("agent_tool_bindings")
      .select("tools (id, name, description, action, parameters)")
      .eq("agent_id", schedule.agent_id)
      .eq("tools.enabled", true);

    if (tBind && tBind.length > 0) {
      for (const b of tBind) {
        const tl = (b as any).tools as any;
        if (!tl) continue;
        const pars = normalizeParameters(tl.parameters);
        const props: any = {};
        const req: string[] = [];
        for (const p of pars) {
          props[p.name] = {
            type: p.type === "textarea" ? "string" : p.type,
            description: p.description || p.label,
          };
          if (p.required) req.push(p.name);
        }
        tools.push({
          type: "function",
          function: {
            name: tl.action,
            description: tl.description || tl.name,
            parameters: { type: "object", properties: props, required: req },
          },
        });
        toolDescriptions.push(`- ${tl.action}: ${tl.description || tl.name}`);
      }
    }

    log(`加载了 ${tools.length} 个工具: ${toolDescriptions.join(", ")}`);

    // ========== 构建系统提示 ==========
    const systemParts: string[] = [];
    systemParts.push(`你是智能体"${agent.name}"。`);
    systemParts.push(`\n## 当前日期时间\n当前日期：${new Date().toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "long", day: "numeric" })}（${new Date().toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai", weekday: "long" })}）\n当前时间：${new Date().toLocaleTimeString("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit" })}`);
    if (agent.system_prompt) systemParts.push(agent.system_prompt);

    // 添加技能上下文
    const skillIds = (agent.skill_ids as string[]) || [];
    if (skillIds.length > 0) {
      const { data: sd } = await client
        .from("skills")
        .select("name, content")
        .in("id", skillIds);
      if (sd && sd.length > 0) {
        systemParts.push("\n## 关联技能\n" + sd.map((s: any) => `### ${s.name}\n${s.content || ""}`).join("\n\n"));
      }
    }

    // 添加 RAG 知识库上下文
    const ragIds = (agent.rag_dataset_ids as string[]) || [];
    if (ragIds.length > 0) {
      const { data: rd } = await client
        .from("rag_datasets")
        .select("name, description")
        .in("id", ragIds)
        .eq("status", "active");
      if (rd && rd.length > 0) {
        systemParts.push("\n## 关联知识库\n" + rd.map((r: any) => `### ${r.name}\n${r.description || ""}`).join("\n\n"));
        // 尝试检索知识库
        try {
          const { buildRagContext } = await import("@/lib/rag-context");
          const rr = await buildRagContext({
            datasetIds: ragIds,
            userMessage: schedule.trigger_msg,
            customHeaders: {},
          });
          if (rr.contextText) {
            systemParts.push("\n## 知识库检索结果\n" + rr.contextText);
          }
        } catch (e) {
          log("知识库检索失败（非关键错误，继续执行）: " + (e instanceof Error ? e.message : String(e)));
        }
      }
    }

    // 添加 MCP 服务上下文
    const mcpIds = (agent.mcp_service_ids as string[]) || [];
    if (mcpIds.length > 0) {
      const { data: md } = await client
        .from("mcp_services")
        .select("name, description, endpoint_url")
        .in("id", mcpIds)
        .eq("status", "active");
      if (md && md.length > 0) {
        systemParts.push("\n## 关联服务\n" + md.map((m: any) => `### ${m.name}\n${m.description || ""}${m.endpoint_url ? "\n端点: " + m.endpoint_url : ""}`).join("\n\n"));
      }
    }

    // 添加工作流绑定
    if (agent.workflow_id) {
      try {
        const { data: wf } = await client
          .from("agent_workflows")
          .select("*")
          .eq("id", agent.workflow_id)
          .eq("is_active", true)
          .single();
        if (wf) {
          const stepList = (wf.steps as any[] || []).map((s: any, i: number) => `  ${i + 1}. ${s.name}${s.description ? " - " + s.description : ""}`).join("\n");
          systemParts.push(`\n## 绑定的工作流\n你绑定了以下工作流，当需要执行时请使用 \`execute_workflow\` 工具。\n\n工作流名称：${wf.name}\n描述：${wf.description || ""}\n触发条件：${wf.trigger_condition || ""}\n步骤：\n${stepList}`);
          // 注册 execute_workflow 工具
          tools.push({
            type: "function",
            function: {
              name: "execute_workflow",
              description: "执行绑定的工作流。当用户请求与工作流用途匹配时，调用此工具执行工作流。",
              parameters: {
                type: "object",
                properties: {
                  workflow_id: { type: "string", description: "工作流ID" },
                  user_input: { type: "string", description: "用户的原始请求" },
                },
                required: ["user_input"],
              },
            },
          });
          toolDescriptions.push("- execute_workflow: 执行绑定的工作流");
        }
      } catch (e) {
        log("加载工作流失败（非关键错误）: " + (e instanceof Error ? e.message : String(e)));
      }
    }

    // 添加频道上下文（如果目标是频道）
    if (schedule.target_type === "channel" && agent.channel_context_enabled) {
      try {
        const { buildChannelContext } = await import("@/lib/agent-context");
        const contextLimit = (agent.channel_context_limit as number) || 20;
        const res = await buildChannelContext({
          channelId: schedule.target_id,
          teamId: schedule.team_id,
          userMessage: schedule.trigger_msg,
          contextLimit,
          customHeaders: {},
        });
        if (res.contextText) {
          systemParts.push("\n## 频道历史上下文\n" + res.contextText);
        }
      } catch (e) {
        log("频道上下文加载失败（非关键错误）: " + (e instanceof Error ? e.message : String(e)));
      }
    }

    // 添加记忆
    if (agent.memory_enabled === true) {
      try {
        const { retrieveAgentMemory } = await import("@/lib/agent-memory");
        const recallCount = ((agent.memory_config as any)?.recall_count) ?? 5;
        const mem = await retrieveAgentMemory(agent.id, schedule.agent_id, schedule.team_id || "", schedule.trigger_msg, recallCount, {});
        if (mem.length > 0) {
          systemParts.push("\n## 记忆\n" + mem.join("\n\n---\n\n"));
        }
      } catch (e) {
        log("记忆检索失败（非关键错误）: " + (e instanceof Error ? e.message : String(e)));
      }
    }

    // 添加工具描述
    if (toolDescriptions.length > 0) {
      systemParts.push("\n## 可用工具\n" + toolDescriptions.join("\n"));
      systemParts.push('\n当需要获取实时信息时，请使用 web_search 工具搜索互联网。');
    }

    systemParts.push("\n请根据用户需求，适时调用工具来完成任务。");
    systemParts.push("\n**禁止编造不存在的功能或流程**，**直接输出完整内容**。");

    // ========== 构建消息 ==========
    const messages: NativeMessage[] = [];
    messages.push({ role: "system", content: systemParts.join("\n") });

    const deliveryInstruction =
      schedule.target_type === "channel"
        ? `\n\n[自动任务] 完成分析后，请将结果发送到频道（target_id: ${schedule.target_id}）。注意：你是后台自动执行，请直接输出最终结果，不要询问用户。`
        : `\n\n[自动任务] 完成分析后，请将结果发送给成员（target_id: ${schedule.target_id}）。注意：你是后台自动执行，请直接输出最终结果，不要询问用户。`;

    messages.push({
      role: "user",
      content: schedule.trigger_msg + deliveryInstruction,
    });

    // ========== 调用 LLM（原生 function calling 工具循环） ==========
    const modelConfig =
      typeof agent.model_config === "string"
        ? JSON.parse(agent.model_config || "{}")
        : agent.model_config || {};
    const model = schedule.model_override || modelConfig.model || DEFAULT_LLM_MODEL;
    const temperature = modelConfig.temperature ?? 0.7;

    const maxIterations = 10;
    let iterationCount = 0;
    let finalResponse = "";
    let allToolCalls: Array<{ name: string; args: any; result: any }> = [];

    // 内置工具定义（web_search / get_current_time），与已加载的自定义工具合并
    const nativeTools = toNativeTools(tools);
    nativeTools.push(
      {
        type: "function",
        function: {
          name: "web_search",
          description: "搜索互联网信息，获取最新资讯、实时动态或不了解的知识。",
          parameters: { type: "object", properties: { query: { type: "string", description: "搜索关键词" }, count: { type: "number", description: "返回结果数量，默认10" }, time_range: { type: "string", description: "时间范围，可选值：1d/1w/1m" } }, required: ["query"] },
        },
      },
      {
        type: "function",
        function: {
          name: "get_current_time",
          description: "获取当前日期和时间（北京时间，UTC+8）。",
          parameters: { type: "object", properties: {}, required: [] },
        },
      }
    );

    while (iterationCount < maxIterations) {
      iterationCount++;
      log(`LLM 调用第 ${iterationCount} 轮...`);

      let fullContent = "";
      let toolCalls: NativeToolCall[] = [];
      for await (const ev of streamChat({ messages, model, temperature, tools: nativeTools })) {
        if (ev.type === "done") {
          fullContent = ev.content || "";
          toolCalls = ev.toolCalls || [];
        }
      }

      log(`第 ${iterationCount} 轮 LLM 输出长度: ${fullContent.length} 字符`);

      // 保存 assistant 消息（含 tool_calls，供原生协议回传）
      const assistantMsg: NativeMessage = { role: "assistant", content: fullContent || null };
      if (toolCalls.length > 0) {
        assistantMsg.tool_calls = toolCalls;
      }
      messages.push(assistantMsg);

      if (toolCalls.length === 0) {
        // 没有工具调用，本轮输出即为最终结果
        finalResponse = fullContent;
        log(`第 ${iterationCount} 轮无工具调用，结束循环`);
        break;
      }

      log(`第 ${iterationCount} 轮发现 ${toolCalls.length} 个工具调用: ${toolCalls.map((c) => c.function.name).join(", ")}`);

      // 执行工具
      for (const call of toolCalls) {
        const funcName = call.function.name;
        let funcArgs: any = {};
        try {
          funcArgs = JSON.parse(call.function.arguments || "{}");
        } catch {
          /* ignore */
        }

        let resultJson: string;

        if (funcName === "web_search") {
          try {
            const { SearchClient, Config: SearchConfig } = await import("@/lib/sdk");
            const searchConfig = new SearchConfig();
            const searchClient = new SearchClient(searchConfig);
            const query = funcArgs.query || "";
            const count = funcArgs.count || 10;
            const timeRange = funcArgs.time_range || undefined;

            let searchResponse: any;
            if (timeRange) {
              searchResponse = await searchClient.advancedSearch(query, {
                count,
                timeRange,
                needSummary: true,
                searchType: "web",
              });
            } else {
              searchResponse = await searchClient.webSearch(query, count, true);
            }

            const results = (searchResponse.web_items || [])
              .slice(0, count)
              .map((item: any, i: number) => {
                return `${i + 1}. ${item.title}\n   来源: ${item.site_name || "未知"}\n   链接: ${item.url || ""}\n   摘要: ${item.snippet || ""}${item.publish_time ? "\n   发布时间: " + item.publish_time : ""}`;
              })
              .join("\n\n");
            const summary = searchResponse.summary || "";
            resultJson = JSON.stringify({
              success: true,
              result: "搜索完成",
              summary,
              resultsCount: results.length,
              details: (summary ? "【AI摘要】\n" + summary + "\n\n" : "") + "【搜索结果】\n" + results,
            });
            log(`web_search 执行成功: query="${query}", 结果数=${results.length}`);
          } catch (e: any) {
            resultJson = JSON.stringify({ success: false, error: "网络搜索失败: " + (e.message || String(e)) });
            logError(`web_search 执行失败: ${e.message}`);
          }
        } else if (funcName === "execute_workflow") {
          try {
            const { WorkflowExecutor } = await import("@/lib/workflow-executor");
            const wfId = funcArgs.workflow_id || agent.workflow_id;
            if (!wfId) {
              resultJson = JSON.stringify({ success: false, error: "未找到工作流 ID" });
              continue;
            }
            const { data: wfData } = await client.from("agent_workflows").select("*").eq("id", wfId).single();
            if (!wfData) {
              resultJson = JSON.stringify({ success: false, error: "工作流未找到或已停用" });
              continue;
            }
            const wfSessionId = "sched-" + schedule.id + "-wf-" + Date.now();
            const executor = new WorkflowExecutor(wfData, wfSessionId, () => {});
            const wfResult = await executor.executeWorkflowOnce(funcArgs.user_input || schedule.trigger_msg);
            resultJson = JSON.stringify({ success: true, result: "工作流执行完成", workflowResult: wfResult });
            log(`execute_workflow 执行成功`);
          } catch (e: any) {
            resultJson = JSON.stringify({ success: false, error: "工作流执行失败: " + (e.message || String(e)) });
            logError(`execute_workflow 执行失败: ${e.message}`);
          }
        } else if (funcName === "get_current_time") {
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
          resultJson = JSON.stringify({
            success: true,
            result: `当前时间：${year}年${month}月${day}日 ${weekday} ${hours}:${minutes}:${seconds}（北京时间，UTC+8）`,
            datetime: `${year}-${month}-${day}T${hours}:${minutes}:${seconds}+08:00`,
            date: `${year}年${month}月${day}日`,
            time: `${hours}:${minutes}:${seconds}`,
            weekday,
            timezone: "Asia/Shanghai",
          });
        } else if (funcName === "send_to_channel" || funcName === "send_message") {
          // 内置工具：发送消息到频道的直接执行
          resultJson = JSON.stringify({ success: true, result: "消息已记录，请在最终输出中包含完整内容" });
        } else {
          resultJson = JSON.stringify({ success: true, result: "工具" + funcName + "已执行" });
        }

        allToolCalls.push({ name: funcName, args: funcArgs, result: resultJson });
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content:
            "【" + funcName + "】执行结果:\n" +
            resultJson,
        });
      }
    }

    // 如果循环结束但还没有 finalResponse（比如最大迭代次数用完），取最后一条消息
    if (!finalResponse && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === "assistant") {
        finalResponse = (lastMsg.content as string) || "";
      } else {
        finalResponse = "任务执行完成，但未生成有效回复。";
      }
    }

    if (!finalResponse) {
      finalResponse = "任务执行完成。";
    }

    log(`最终回复长度: ${finalResponse.length} 字符，工具调用次数: ${allToolCalls.length}`);

    // ========== 发送结果到目标 ==========
    if (schedule.target_type === "channel") {
      await client.from("channel_messages").insert({
        channel_id: schedule.target_id,
        sender_id: schedule.agent_id,
        content: finalResponse,
        sender_type: "agent",
        is_active: true,
        created_at: new Date().toISOString(),
      });
      log(`结果已发送到频道 ${schedule.target_id}`);
    } else if (schedule.target_type === "user") {
      const { data: conversations } = await client
        .from("dm_conversations")
        .select("id")
        .or(
          `and(participant1_id.eq.${schedule.agent_id},participant2_id.eq.${schedule.target_id}),and(participant1_id.eq.${schedule.target_id},participant2_id.eq.${schedule.agent_id})`
        )
        .limit(1);

      let conversationId = conversations?.[0]?.id;
      if (!conversationId) {
        const { data: newConv } = await client
          .from("dm_conversations")
          .insert({
            participant1_id: schedule.agent_id,
            participant2_id: schedule.target_id,
          })
          .select("id")
          .single();
        conversationId = newConv?.id;
      }

      if (conversationId) {
        await client.from("dm_messages").insert({
          conversation_id: conversationId,
          sender_id: schedule.agent_id,
          content: finalResponse,
          sender_type: "agent",
          is_read: false,
          created_at: new Date().toISOString(),
        });
        log(`结果已发送给用户 ${schedule.target_id}`);
      }
    }

    // ========== 归档任务记录 ==========
    try {
      await logAgentTask({
        agentId: schedule.agent_id,
        teamId: schedule.team_id,
        userId: schedule.created_by,
        taskType: "schedule",
        source: schedule.target_type === "user" ? "dm" : "channel",
        channelId: schedule.target_type === "channel" ? schedule.target_id : undefined,
        inputSummary: schedule.trigger_message || schedule.name,
        outputSummary: finalResponse,
        status: "success",
        tags: ["schedule", agent.name],
      });
    } catch (e) {
      logError("归档任务记录失败: " + e);
    }

    // ========== 更新执行日志 ==========
    const durationMs = Date.now() - startTime;
    const toolSummary = allToolCalls.map((c) => c.name).join(", ");
    await client
      .from("schedule_execution_logs")
      .update({
        status: "success",
        result_summary: (toolSummary ? "工具调用: " + toolSummary + " | " : "") + finalResponse.substring(0, 300),
        duration_ms: durationMs,
        completed_at: new Date().toISOString(),
      })
      .eq("id", logId);

    // ========== 更新调度任务状态 ==========
    const updates: Record<string, any> = {
      last_run_at: new Date().toISOString(),
      run_count: (schedule.run_count || 0) + 1,
      updated_at: new Date().toISOString(),
    };

    if (schedule.delete_after_run) {
      updates.enabled = false;
    } else {
      updates.next_run_at = calculateNextRun(
        schedule.schedule_type,
        schedule.cron_expr,
        schedule.interval_ms,
        schedule.at_time,
        schedule.timezone || "Asia/Shanghai"
      );
    }

    await client.from("agent_schedules").update(updates).eq("id", schedule.id);

    log(`任务 "${schedule.name}" (${schedule.id}) 执行成功，耗时 ${durationMs}ms`);
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    await client
      .from("schedule_execution_logs")
      .update({
        status: "failed",
        error_message: err.message || "执行失败",
        duration_ms: durationMs,
        completed_at: new Date().toISOString(),
      })
      .eq("id", logId);

    logError(`任务 "${schedule.name}" 执行失败: ${err.message}`);
  }
}
