import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkflowEvent } from "@/lib/workflow-executor";

/** 工具执行上下文 */
export interface ToolRunContext {
  client: SupabaseClient;
  teamId: string;
  userId: string;
  agentId: string;
  sessionId: string;
  customHeaders: Record<string, string>;
  sendSSE: (data: Record<string, unknown>) => void;
}

/** 带重试的异步执行（轻量内联，避免额外依赖） */
async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { maxRetries: number; retryDelayMs: number }
): Promise<{ data?: T; error?: string }> {
  let lastErr: unknown;
  for (let i = 0; i <= opts.maxRetries; i++) {
    try {
      return { data: await fn() };
    } catch (e) {
      lastErr = e;
      if (i < opts.maxRetries && opts.retryDelayMs > 0) {
        await new Promise((r) => setTimeout(r, opts.retryDelayMs));
      }
    }
  }
  return { error: lastErr instanceof Error ? lastErr.message : String(lastErr) };
}

interface ToolRunResult {
  resultJson: string;
  success: boolean;
}

/**
 * 统一的智能体工具执行入口（原生 function calling 版）
 *
 * 所有工具（内置/HTTP/技能/工作流/委托/搜索/生图）均在此分发执行，
 * 返回 JSON 字符串作为 role:"tool" 消息内容。
 */
export async function runAgentTool(
  funcName: string,
  funcArgs: Record<string, unknown>,
  ctx: ToolRunContext
): Promise<ToolRunResult> {
  const { client, teamId, userId, agentId, sessionId, customHeaders, sendSSE } = ctx;

  try {
    // ---------- 生成图片 ----------
    if (funcName === "generate_image") {
      const ret = await withRetry(async () => {
        const { ImageGenerationClient, Config } = await import("coze-coding-dev-sdk");
        const genConfig = new Config();
        const imgClient = new ImageGenerationClient(genConfig, customHeaders);
        const prompt = (funcArgs.prompt as string) || "";
        const imgResponse = await imgClient.generate({ prompt });
        const helper = imgClient.getResponseHelper(imgResponse);
        const imageUrl = helper.success && helper.imageUrls.length > 0 ? helper.imageUrls[0] : "";
        if (helper.success && imageUrl) {
          sendSSE({ type: "image_generated", content: "图片已生成", imageUrl });
        }
        return JSON.stringify({ success: helper.success, result: "图片已生成", imageUrl });
      }, { maxRetries: 1, retryDelayMs: 0 });
      return finish(ret.data || JSON.stringify({ success: false, error: "图片生成失败" }));
    }

    // ---------- 执行工作流 ----------
    if (funcName === "execute_workflow") {
      const ret = await withRetry(async () => {
        const action = (funcArgs.action as string) || "execute";
        const wfId = (funcArgs.workflow_id as string) || "";
        const userInput = (funcArgs.user_input as string) || "";
        const resumeSessionId = (funcArgs.session_id as string) || "";
        const decision = (funcArgs.decision as string) || "approved";
        const feedback = (funcArgs.feedback as string) || "";

        if (action === "resume" && resumeSessionId) {
          const { data: checkpoint } = await client
            .from("workflow_checkpoints").select("*")
            .eq("session_id", resumeSessionId)
            .order("created_at", { ascending: false }).limit(1).maybeSingle();
          if (!checkpoint) return JSON.stringify({ success: false, error: "未找到工作流暂停点，无法恢复" });

          const { data: wfData } = await client.from("agent_workflows").select("*").eq("id", checkpoint.workflow_id).single();
          if (!wfData) return JSON.stringify({ success: false, error: "工作流已不存在" });

          const { WorkflowExecutor } = await import("@/lib/workflow-executor");
          const executor = new WorkflowExecutor(
            wfData,
            resumeSessionId,
            (event: WorkflowEvent) => {
              const { type: eventType, ...restEvent } = event;
              sendSSE({ type: "workflow_" + eventType, session_id: resumeSessionId, ...restEvent });
            },
            { teamId, applicantId: userId }
          );
          executor["stepIndex"] = checkpoint.step_index;
          executor["context"] = { ...checkpoint.context };
          const resumeResult = await executor.resumeByDecision(decision === "approved" ? "approved" : "rejected", feedback);
          if (resumeResult.completed) {
            return JSON.stringify({ success: true, status: "completed", result: resumeResult.result || "工作流执行完成", context: resumeResult.context });
          }
          const rctx = resumeResult.context || {};
          const rdraft = (rctx.draft || rctx.article || rctx.content || "") as string;
          return JSON.stringify({ success: true, status: "pending", session_id: resumeSessionId, paused_at: resumeResult.pausedAt, draft: rdraft, context: rctx });
        }

        let resolvedWfId = wfId;
        if (!resolvedWfId) {
          const { data: agent } = await client.from("agents").select("workflow_id").eq("id", agentId).single();
          if (agent?.workflow_id) resolvedWfId = agent.workflow_id;
        }
        const { data: wfData } = await client.from("agent_workflows").select("*").eq("id", resolvedWfId).single();
        if (wfData) {
          const { WorkflowExecutor } = await import("@/lib/workflow-executor");
          const wfSessionId = sessionId + "-wf-" + Date.now();
          const executor = new WorkflowExecutor(
            wfData,
            wfSessionId,
            (event: WorkflowEvent) => {
              const { type: eventType, ...restEvent } = event;
              sendSSE({ type: "workflow_" + eventType, session_id: wfSessionId, ...restEvent });
            },
            { teamId, applicantId: userId }
          );
          const wfResult = await executor.executeInteractive(userInput);
          if (wfResult.completed) {
            return JSON.stringify({ success: true, status: "completed", result: wfResult.result || "工作流执行完成", context: wfResult.context });
          }
          const wctx = wfResult.context || {};
          const wdraft = (wctx.draft || wctx.article || wctx.content || "") as string;
          return JSON.stringify({ success: true, status: "pending", session_id: wfSessionId, paused_at: wfResult.pausedAt, draft: wdraft, context: wctx });
        }
        return JSON.stringify({ success: false, error: "工作流未找到或已停用" });
      }, { maxRetries: 1, retryDelayMs: 0 });
      return finish(ret.data || JSON.stringify({ success: false, error: "工作流执行失败" }));
    }

    // ---------- 执行技能 ----------
    if (funcName === "execute_skill") {
      const ret = await withRetry(async () => {
        const skillId = (funcArgs.skill_id as string) || "";
        const taskDescription = (funcArgs.task_description as string) || "";
        const { executeSkillById } = await import("@/lib/skill-executor");
        const result = await executeSkillById(skillId, taskDescription, teamId);
        if (result.success && result.content) return JSON.stringify({ success: true, result: result.content });
        return JSON.stringify({ success: false, error: result.error || "技能执行失败" });
      }, { maxRetries: 1, retryDelayMs: 0 });
      return finish(ret.data || JSON.stringify({ success: false, error: "技能执行失败" }));
    }

    // ---------- 委托子智能体 ----------
    if (funcName === "delegate_agent") {
      const targetAgent = (funcArgs.agent_name as string) || (funcArgs.agent_id as string) || "";
      sendSSE({ type: "delegate_agent_start", agent_name: targetAgent, task: String(funcArgs.task || "").slice(0, 100) });
      const ret = await withRetry(async () => {
        const task = (funcArgs.task as string) || "";
        const context = (funcArgs.context as string) || "";
        const { delegateTaskToAgent } = await import("@/lib/skill-executor");
        const result = await delegateTaskToAgent(targetAgent, task, teamId, context);
        if (result.success && result.content) return JSON.stringify({ success: true, result: result.content });
        return JSON.stringify({ success: false, error: result.error || "委托执行失败" });
      }, { maxRetries: 1, retryDelayMs: 0 });
      return finish(ret.data || JSON.stringify({ success: false, error: "委托执行失败" }));
    }

    // ---------- 网络搜索 ----------
    if (funcName === "web_search") {
      const ret = await withRetry(async () => {
        const { SearchClient, Config: SearchConfig } = await import("coze-coding-dev-sdk");
        const searchConfig = new SearchConfig();
        const searchClient = new SearchClient(searchConfig, customHeaders);
        const query = (funcArgs.query as string) || "";
        const count = (funcArgs.count as number) || 10;
        const timeRange = (funcArgs.time_range as string) || undefined;
        let searchResponse: any;
        if (timeRange) {
          searchResponse = await searchClient.advancedSearch(query, { count, timeRange, needSummary: true, searchType: "web" });
        } else {
          searchResponse = await searchClient.webSearch(query, count, true);
        }
        const results = (searchResponse.web_items || []).slice(0, count).map((item: any, i: number) => {
          return `${i + 1}. ${item.title}\n   来源: ${item.site_name || "未知"}\n   链接: ${item.url || ""}\n   摘要: ${item.snippet || ""}${item.publish_time ? "\n   发布时间: " + item.publish_time : ""}`;
        }).join("\n\n");
        const summary = searchResponse.summary || "";
        sendSSE({ type: "search_complete", content: "网络搜索完成", query, resultsCount: (searchResponse.web_items || []).length });
        return JSON.stringify({ success: true, result: "搜索完成", summary, resultsCount: results.length, details: (summary ? "【AI摘要】\n" + summary + "\n\n" : "") + "【搜索结果】\n" + results });
      }, { maxRetries: 1, retryDelayMs: 0 });
      return finish(ret.data || JSON.stringify({ success: false, error: "网络搜索失败" }));
    }

    // ---------- 自定义 HTTP 工具 ----------
    if (funcName.startsWith("http_")) {
      sendSSE({ type: "function_call_detail", name: funcName, args: funcArgs, status: "running" });
      const ret = await withRetry(async () => {
        const { data: tool } = await client.from("tools").select("id, action, config, parameters, service_id").eq("action", funcName).eq("enabled", true).single();
        if (!tool) return JSON.stringify({ success: false, error: "工具未找到或已禁用" });

        let injectedParams = { ...funcArgs } as Record<string, unknown>;
        if ((tool as any).service_id) {
          const { data: service } = await client.from("mcp_services").select("config").eq("id", (tool as any).service_id).single();
          if (service?.config && typeof service.config === "object") {
            const svcConfig = service.config as Record<string, unknown>;
            const authType = svcConfig.auth_type as string;
            const credentials = svcConfig.credentials as Record<string, string> | undefined;
            if (credentials) {
              if (authType === "appid_secret" && credentials.app_id && credentials.app_secret) {
                injectedParams = { ...injectedParams, appId: credentials.app_id, appSecret: credentials.app_secret };
              } else if (authType === "api_key" && credentials.api_key) {
                injectedParams = { ...injectedParams, apiKey: credentials.api_key };
              } else if (authType === "bearer" && credentials.bearer_token) {
                injectedParams = { ...injectedParams, bearerToken: credentials.bearer_token };
              } else {
                injectedParams = { ...injectedParams, ...credentials };
              }
            }
          }
        }

        const { executeHttpTool } = await import("@/lib/agents/skill-actions");
        const execResult = await executeHttpTool(
          (tool.config as { url: string; method: string; headers?: Record<string, string>; bodyTemplate?: string }) || {},
          injectedParams
        );
        if (execResult.success) {
          sendSSE({ type: "tool_result", name: funcName, status: "completed" });
          return JSON.stringify({ success: true, result: execResult.result });
        }
        sendSSE({ type: "tool_result", name: funcName, status: "error", error: execResult.error });
        return JSON.stringify({ success: false, error: execResult.error });
      }, { maxRetries: 1, retryDelayMs: 0 });
      return finish(ret.data || JSON.stringify({ success: false, error: "HTTP 工具执行失败" }));
    }

    // ---------- 内置工具 ----------
    const { executeBuiltinTool } = await import("@/lib/agents/skill-actions");
    const builtinResult = await withRetry(
      async () => {
        const execResult = await executeBuiltinTool(funcName, funcArgs, { agentId, teamId, userId });
        return execResult.success
          ? (typeof execResult.result === "object" ? JSON.stringify(execResult.result) : execResult.result ?? "执行成功")
          : execResult.error || "执行失败";
      },
      { maxRetries: 1, retryDelayMs: 0 }
    );
    return finish((builtinResult.data as string) || JSON.stringify({ success: false, error: "工具执行失败" }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { resultJson: JSON.stringify({ success: false, error: msg }), success: false };
  }
}

/** 统一解析执行结果，判断 success 标记 */
function finish(resultJson: string): ToolRunResult {
  let success = true;
  try {
    const parsed = JSON.parse(resultJson);
    if (parsed && typeof parsed === "object" && parsed.success === false) success = false;
  } catch { /* 非 JSON 视为成功 */ }
  return { resultJson, success };
}
