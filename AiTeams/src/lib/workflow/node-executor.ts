import { getSupabaseClient } from "@/storage/database/supabase-client";
import { chatOnce, streamChat } from "@/lib/llm/native-client";
import { runAgentTool, type ToolRunContext } from "@/lib/agents/agent-tool-runner";
import { delegateTaskToAgent, executeSkillById } from "@/lib/skill-executor";
import type { NodeExecutor } from "@/lib/workflow/engine";
import type { NodeContext, NodeResult } from "@/lib/workflow/types";

export interface NodeExecutorDeps {
  teamId: string;
  userId?: string;
  /**
   * 模型流式片段回调：把「思考过程(reasoning)」与「生成内容(content)」实时外推，
   * 供前端渲染思考链与打字机效果。未传入时自动降级为非流式调用。
   */
  onStream?: (event: { nodeId: string; kind: "reasoning" | "content"; text: string }) => void;
}

/** 从 state 中按点路径取值：{{a.b[0].c}} */
function resolvePath(state: Record<string, unknown>, path: string): unknown {
  const cleaned = path.trim();
  if (!cleaned) return undefined;
  const parts = cleaned.split(/\.|\[|\]\.?/).filter(Boolean);
  let cur: unknown = state;
  for (const p of parts) {
    if (cur == null) return undefined;
    if (typeof cur === "object") {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return cur;
}

/** 渲染 {{path}} 模板变量，对象值 JSON 序列化 */
function renderTemplate(
  template: string | undefined,
  state: Record<string, unknown>,
): string {
  if (!template) return "";
  return template.replace(/\{\{\s*([\w.\-\[\]]+)\s*\}\}/g, (_m, p: string) => {
    const val = resolvePath(state, p);
    if (val === undefined || val === null) return "";
    if (typeof val === "object") return JSON.stringify(val);
    return String(val);
  });
}

export function createNodeExecutor(deps: NodeExecutorDeps): NodeExecutor {
  const { teamId, userId, onStream } = deps;

  return async (ctx: NodeContext): Promise<NodeResult> => {
    const { node, state, env } = ctx;
    const client = getSupabaseClient();

    switch (node.type) {
      case "llm_generate": {
        const prompt = renderTemplate(node.input_template, state);
        if (!prompt) {
          return { kind: "error", message: `节点「${node.name}」缺少提示词` };
        }
        const streamParams = {
          messages: [{ role: "user" as const, content: prompt }],
          model: node.model_config?.model ?? "doubao-seed-2-0-pro-260215",
          temperature: node.model_config?.temperature,
        };

        // 有订阅方（SSE）时走流式：思考链与正文边生成边外推
        if (onStream) {
          let content = "";
          let reasoning = "";
          let pushedReasoning = false;
          for await (const chunk of streamChat(streamParams)) {
            if (chunk.type === "text") {
              content += chunk.content;
              if (chunk.content) onStream({ nodeId: node.id, kind: "content", text: chunk.content });
            } else if (chunk.type === "reasoning") {
              reasoning += chunk.content;
              if (chunk.content) {
                pushedReasoning = true;
                onStream({ nodeId: node.id, kind: "reasoning", text: chunk.content });
              }
            } else if (chunk.type === "done") {
              if (chunk.content) content = chunk.content;
              if (chunk.reasoning) reasoning = chunk.reasoning;
            }
          }
          // 部分模型只在整个响应结束后给出思维链：无增量分片时兜底整段推送
          if (reasoning && !pushedReasoning) {
            onStream({ nodeId: node.id, kind: "reasoning", text: reasoning });
          }
          return { kind: "ok", output: { text: content } };
        }

        const res = await chatOnce(streamParams);
        return { kind: "ok", output: { text: res.content ?? "" } };
      }

      case "tool_call": {
        const funcName = node.target;
        if (!funcName) {
          return { kind: "error", message: `节点「${node.name}」缺少工具名(target)` };
        }
        let args: Record<string, unknown> = {};
        if (node.input_template) {
          const rendered = renderTemplate(node.input_template, state);
          try {
            args = JSON.parse(rendered);
          } catch {
            args = { input: rendered };
          }
        }
        const toolCtx: ToolRunContext = {
          client,
          teamId,
          userId: userId ?? "",
          agentId: env.agentId ?? "",
          sessionId: env.instanceId ?? "",
          customHeaders: {},
          sendSSE: () => {},
        };
        const result = await runAgentTool(funcName, args, toolCtx);
        if (!result.success) {
          return { kind: "error", message: result.resultJson };
        }
        return { kind: "ok", output: { result: result.resultJson } };
      }

      case "skill_call": {
        const skillId = node.target;
        if (!skillId) {
          return { kind: "error", message: `节点「${node.name}」缺少技能(skill) target` };
        }
        const task = renderTemplate(node.input_template, state);
        const res = await executeSkillById(skillId, task, teamId);
        if (!res.success) {
          return { kind: "error", message: res.error ?? "技能执行失败" };
        }
        return { kind: "ok", output: { text: res.content ?? "" } };
      }

      case "agent_call": {
        const agentId = node.target;
        if (!agentId) {
          return { kind: "error", message: `节点「${node.name}」缺少智能体(agent) target` };
        }
        const task = renderTemplate(node.input_template, state);
        const res = await delegateTaskToAgent(agentId, task, teamId);
        if (!res.success) {
          return { kind: "error", message: res.error ?? "智能体执行失败" };
        }
        return { kind: "ok", output: { text: res.content ?? "" } };
      }

      default:
        // condition / human_review / human_choice 由引擎内建处理
        return { kind: "ok", output: {} };
    }
  };
}