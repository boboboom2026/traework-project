"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Send, Loader2, Bot, User, Trash2, ImagePlus, Paperclip, FileText, X, CheckCircle2, Clock, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { AgentThinkingPanel } from "@/components/apps/agent-thinking-panel";
import { ThinkingChain, type ThinkingStep } from "@/components/apps/thinking-chain";
import type { ToolCallItem } from "@/components/apps/agent-thinking-panel";

// ==================== 类型 ====================
interface Agent {
  id: string;
  teamId?: string;
  name: string;
  description: string;
  avatar: string;
  goal: string;
  rules: string[];
  skillIds: string[];
  skillNames: string[];
  ragDatasetIds: string[];
  ragDatasetNames: string[];
  mcpServiceIds: string[];
  mcpServiceNames: string[];
}

interface ChatMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  attachments?: Array<{ type: string; url?: string; name: string; size?: number; key?: string }>;
}

interface AgentChatDialogProps {
  agent: Agent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ==================== Agent 头像颜色 ====================
const AVATAR_COLORS = [
  "bg-blue-500", "bg-emerald-500", "bg-violet-500", "bg-amber-500",
  "bg-rose-500", "bg-cyan-500", "bg-indigo-500", "bg-teal-500",
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ==================== 消息气泡 ====================
function MessageBubble({ message, agentName, agentId, teamId }: { message: ChatMessage; agentName: string; agentId?: string; teamId?: string }) {
  const isUser = message.role === "user";
  const hasAttachments = message.attachments && message.attachments.length > 0;
  const feedbackStorageKey = `agent-feedback-${message.id || message.content.slice(0, 20)}`;
  const [feedback, setFeedback] = useState<"up" | "down" | null>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(feedbackStorageKey);
      if (saved === "up" || saved === "down") return saved;
    }
    return null;
  });
  const [showCorrection, setShowCorrection] = useState(false);
  const [correction, setCorrection] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleFeedback = async (type: "up" | "down") => {
    if (submitting || !agentId) return;
    if (type === "up") {
      setFeedback("up");
      localStorage.setItem(feedbackStorageKey, "up");
      try {
        await fetch("/api/agents/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId, teamId, userId: "system",
            rating: 5, tags: ["好评"],
          }),
        });
      } catch {}
    } else {
      setShowCorrection(true);
    }
  };

  const submitCorrection = async () => {
    if (!agentId) return;
    setSubmitting(true);
    setFeedback("down");
    localStorage.setItem(feedbackStorageKey, "down");
    setShowCorrection(false);
    try {
      await fetch("/api/agents/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId, teamId, userId: "system",
          rating: 1, tags: ["需改进"],
          correction: correction || undefined,
        }),
      });
    } catch {}
    setSubmitting(false);
  };

  return (
    <div className={cn("flex gap-3 py-3", isUser ? "flex-row-reverse" : "")}>
      {/* 头像 */}
      <div className={cn(
        "w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0",
        isUser ? "bg-primary" : getAvatarColor(agentName)
      )}>
        {isUser ? <User className="w-3.5 h-3.5" /> : agentName.charAt(0)}
      </div>
      {/* 内容 */}
      <div className="flex flex-col gap-1 max-w-[75%]">
        <div className={cn(
          "rounded-lg px-3.5 py-2.5 text-sm leading-relaxed",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted"
        )}>
          {/* 附件展示 */}
          {hasAttachments && (
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              {message.attachments!.map((att, i) => {
                if (att.type === "image" && att.url) {
                  return (
                    <img key={i} src={att.url} alt={att.name} className="max-w-[180px] max-h-[120px] rounded-md object-cover border border-border" />
                  );
                }
                return (
                  <div key={i} className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-background/10 text-xs">
                    <FileText className="w-3 h-3" />
                    <span className="truncate max-w-[100px]">{att.name}</span>
                  </div>
                );
              })}
            </div>
          )}
          {message.content && <div className="whitespace-pre-wrap break-words">{message.content}</div>}
        </div>
        {/* 反馈按钮（仅 AI 消息） */}
        {!isUser && message.content && (
          <div className="flex items-center gap-1 px-1">
            <button
              onClick={() => handleFeedback("up")}
              className={cn(
                "p-1 rounded hover:bg-muted transition-colors",
                feedback === "up" ? "text-green-500" : "text-muted-foreground"
              )}
              title="有用"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3" />
              </svg>
            </button>
            <button
              onClick={() => handleFeedback("down")}
              className={cn(
                "p-1 rounded hover:bg-muted transition-colors",
                feedback === "down" ? "text-red-500" : "text-muted-foreground"
              )}
              title="需要改进"
            >
              <svg className="w-3.5 h-3.5 scale-y-[-1]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3" />
              </svg>
            </button>
            {/* 修正输入框 */}
            {showCorrection && (
              <div className="flex items-center gap-1 ml-2 flex-1">
                <input
                  type="text"
                  value={correction}
                  onChange={(e) => setCorrection(e.target.value)}
                  placeholder="输入正确回答..."
                  className="flex-1 h-7 px-2 text-xs rounded border border-border bg-background"
                  autoFocus
                />
                <button
                  onClick={submitCorrection}
                  className="px-2 h-7 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90"
                  disabled={submitting}
                >
                  提交
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== 主组件 ====================
export function AgentChatDialog({ agent, open, onOpenChange }: AgentChatDialogProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [toolCalls, setToolCalls] = useState<ToolCallItem[]>([]);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [safetyIntercepted, setSafetyIntercepted] = useState(false);
  const [agentProgress, setAgentProgress] = useState<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // 工作流状态
  const [workflowSteps, setWorkflowSteps] = useState<ThinkingStep[]>([]);
  const [workflowCurrentIndex, setWorkflowCurrentIndex] = useState(0);
  const [workflowWaitingForHuman, setWorkflowWaitingForHuman] = useState(false);
  const [workflowHumanMessage, setWorkflowHumanMessage] = useState("");
  const [workflowHasError, setWorkflowHasError] = useState(false);
  const [workflowErrorMessage, setWorkflowErrorMessage] = useState("");
  const [workflowVisible, setWorkflowVisible] = useState(false);
  const [workflowHumanDetail, setWorkflowHumanDetail] = useState<string>("");
  const [workflowHumanDetailType, setWorkflowHumanDetailType] = useState<string>("markdown");
  const [workflowAssignees, setWorkflowAssignees] = useState<string[]>([]);
  const [workflowSessionId, setWorkflowSessionId] = useState<string>("");
  const [workflowTaskId, setWorkflowTaskId] = useState<string>("");
  const [approvalInput, setApprovalInput] = useState("");
  const [showApprovalInput, setShowApprovalInput] = useState(false);

  // 附件状态
  const [pendingAttachments, setPendingAttachments] = useState<Array<{
    id: string; file: File; type: "image" | "video" | "file"; previewUrl: string; name: string; size: number; status: "uploading" | "done" | "error"; key?: string; url?: string; contentType?: string;
  }>>([]);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 切换智能体时重置对话
  useEffect(() => {
    if (open && agent) {
      setMessages([]);
      setInput("");
      setIsStreaming(false);
      // 聚焦输入框
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, agent?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 自动滚动到底部
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      const viewport = scrollRef.current.querySelector("[data-radix-scroll-area-viewport]");
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // 发送消息
  const handleSend = useCallback(async () => {
    if ((!input.trim() && pendingAttachments.length === 0) || isStreaming || !agent) return;
    if (pendingAttachments.some(a => a.status === "uploading")) return;

    // 提取附件数据
    const attachmentsToSend = pendingAttachments
      .filter(a => a.status === "done")
      .map(a => ({ type: a.type, url: a.url || "", name: a.name, size: a.size, key: a.key, contentType: a.contentType }));

    const userMessage: ChatMessage = { role: "user", content: input.trim() || (attachmentsToSend.length > 0 ? "[附件]" : ""), attachments: attachmentsToSend };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsStreaming(true);
    setToolCalls([]);
    setAgentError(null);
    setSafetyIntercepted(false);
    setAgentProgress(null);

    // 清空附件
    setPendingAttachments(prev => {
      prev.forEach(a => { if (a.previewUrl) URL.revokeObjectURL(a.previewUrl); });
      return [];
    });

    // 添加 AI 占位消息
    const assistantMessage: ChatMessage = { role: "assistant", content: "" };
    setMessages([...newMessages, assistantMessage]);

    try {
      abortRef.current = new AbortController();

      const res = await fetch("/api/agents/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: agent.id,
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          attachments: attachmentsToSend,
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "请求失败" }));
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: `抱歉，出现了错误：${errorData.error || "未知错误"}` };
          return updated;
        });
        setIsStreaming(false);
        return;
      }

      // 读取 SSE 流
      const reader = res.body?.getReader();
      if (!reader) {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: "抱歉，无法读取回复流" };
          return updated;
        });
        setIsStreaming(false);
        return;
      }

      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.type === "step") {
                // 步骤事件：更新步骤指示器
                setCurrentStep(parsed.content);
              } else if (parsed.type === "function_call_detail") {
                const match = parsed.content?.match(/调用:\s*(\w+)/);
                if (match) {
                  const toolName = match[1];
                  setToolCalls(prev => [...prev, {
                    name: toolName,
                    args: parsed.content.replace(/^调用:\s*\w+\s*/, "").slice(0, 60),
                    status: "executing",
                  }]);
                }
              } else if (parsed.type === "delegate_agent_start") {
                const agentName = parsed.agent_name || "";
                setToolCalls(prev => prev.map(tc =>
                  tc.name === "delegate_agent" && tc.status === "executing"
                    ? { ...tc, delegateTo: agentName }
                    : tc
                ));
              } else if (parsed.type === "tool_result") {
                setToolCalls(prev => prev.map((tc, idx) =>
                  idx === prev.length - 1 && tc.status === "executing"
                    ? { ...tc, status: parsed.success ? "success" : "error", result: typeof parsed.result === "string" ? parsed.result.slice(0, 200) : JSON.stringify(parsed.result).slice(0, 200) }
                    : tc
                ));
              } else if (parsed.type === "error") {
                setAgentError(parsed.content || "执行出错");
              } else if (parsed.type === "safety_intercepted") {
                setSafetyIntercepted(true);
              } else if (parsed.type === "progress") {
                setAgentProgress({
                  iteration: parsed.iteration || 0,
                  maxIterations: parsed.maxIterations || 10,
                  toolsCalled: parsed.toolsCalled || 0,
                  elapsedMs: parsed.elapsedMs || 0,
                  tokenUsage: parsed.tokenUsage || 0,
                  summary: parsed.summary || "",
                  budget: parsed.budget || "",
                });
              } else if (parsed.type === "workflow_step_start" && parsed.step) {
                // 工作流步骤开始
                setWorkflowVisible(true);
                setWorkflowCurrentIndex(parsed.stepIndex);
                setWorkflowHasError(false);
                setWorkflowErrorMessage("");
                setWorkflowWaitingForHuman(false);
                if (parsed.session_id) setWorkflowSessionId(parsed.session_id);
                if (parsed.task_id) setWorkflowTaskId(parsed.task_id);
                setWorkflowSteps(prev => {
                  const newSteps = [...prev];
                  while (newSteps.length <= parsed.stepIndex) {
                    newSteps.push({ name: "", status: "pending" });
                  }
                  newSteps[parsed.stepIndex] = {
                    name: parsed.step.name || `步骤 ${parsed.stepIndex + 1}`,
                    description: parsed.step.description,
                    status: "running",
                  };
                  return newSteps;
                });
              } else if (parsed.type === "workflow_step_complete" && parsed.step) {
                setWorkflowSteps(prev => {
                  const newSteps = [...prev];
                  if (newSteps[parsed.stepIndex]) {
                    newSteps[parsed.stepIndex] = { ...newSteps[parsed.stepIndex], status: "completed", summary: parsed.summary, output: parsed.output };
                  }
                  return newSteps;
                });
              } else if (parsed.type === "workflow_step_error" && parsed.step) {
                setWorkflowHasError(true);
                setWorkflowErrorMessage(parsed.error || "步骤执行失败");
                setWorkflowSteps(prev => {
                  const newSteps = [...prev];
                  if (newSteps[parsed.stepIndex]) {
                    newSteps[parsed.stepIndex] = { ...newSteps[parsed.stepIndex], status: "error", error: parsed.error };
                  }
                  return newSteps;
                });
              } else if (parsed.type === "workflow_waiting_human") {
                setWorkflowWaitingForHuman(true);
                setWorkflowHumanMessage(parsed.message || "请确认");
                setWorkflowHumanDetail(parsed.detail || "");
                setWorkflowHumanDetailType(parsed.detail_type || "markdown");
                setWorkflowAssignees(parsed.assignee || []);
                if (parsed.session_id) setWorkflowSessionId(parsed.session_id);
                if (parsed.task_id) setWorkflowTaskId(parsed.task_id);
                setWorkflowSteps(prev => {
                  const newSteps = [...prev];
                  if (newSteps[parsed.stepIndex]) {
                    newSteps[parsed.stepIndex] = { ...newSteps[parsed.stepIndex], status: "waiting" };
                  }
                  return newSteps;
                });
              } else if (parsed.type === "workflow_complete") {
                // 工作流完成，保持面板可见展示最终结果
                setWorkflowSteps(prev => prev.map(s => ({ ...s, status: "completed" as const })));
                setWorkflowWaitingForHuman(false);
                setWorkflowSessionId("");
              } else if (parsed.content) {
                accumulated += parsed.content;
                // 剥离 [STEP] 标签后显示给用户
                const displayContent = accumulated.replace(/\[STEP\].*?\[\/STEP\]\s*/g, "").trim();
                setMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: "assistant", content: displayContent };
                  return updated;
                });
              }
              if (parsed.error) {
                setMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: "assistant", content: `错误：${parsed.error}` };
                  return updated;
                });
              }
            } catch {
              // 忽略非 JSON 行
            }
          }
        }
      }

      // 如果没有内容，显示默认回复
      if (!accumulated) {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: "抱歉，我暂时无法生成回复，请稍后重试。" };
          return updated;
        });
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // 用户取消，不做处理
      } else {
        console.error("对话请求失败:", err);
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: "抱歉，网络请求失败，请检查网络后重试。" };
          return updated;
        });
      }
    } finally {
      setIsStreaming(false);
      setCurrentStep(null);
      abortRef.current = null;
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [input, isStreaming, agent, messages, pendingAttachments]);

  // 用指定文本发送消息（用于审批操作）
  const handleSendWithText = useCallback((text: string) => {
    if (isStreaming || !agent) return;
    // 先重置审批状态
    setWorkflowWaitingForHuman(false);
    setShowApprovalInput(false);
    setApprovalInput("");
    // 设置输入并发送
    setInput(text);
    // 需要延迟一下，等 input 状态更新
    setTimeout(() => {
      const userMessage: ChatMessage = { role: "user", content: text };
      const newMessages = [...messages, userMessage];
      setMessages(newMessages);
      setInput("");
      setIsStreaming(true);
      setToolCalls([]);
      setAgentError(null);
      setSafetyIntercepted(false);
      setAgentProgress(null);

      const assistantMessage: ChatMessage = { role: "assistant", content: "" };
      setMessages([...newMessages, assistantMessage]);

      // 发起请求
      const controller = new AbortController();
      abortRef.current = controller;

      fetch("/api/agents/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: agent.id,
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
        }),
        signal: controller.signal,
      }).then(async (res) => {
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({ error: "请求失败" }));
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: "assistant", content: `抱歉，出现了错误：${errorData.error || "未知错误"}` };
            return updated;
          });
          setIsStreaming(false);
          return;
        }
        const reader = res.body?.getReader();
        if (!reader) {
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: "assistant", content: "抱歉，无法读取回复流" };
            return updated;
          });
          setIsStreaming(false);
          return;
        }
        const decoder = new TextDecoder();
        let accumulated = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6).trim();
              if (data === "[DONE]") continue;
              try {
                const parsed = JSON.parse(data);
                if (parsed.type === "step") {
                  setCurrentStep(parsed.content);
                } else if (parsed.type === "function_call_detail") {
                  const match = parsed.content?.match(/调用:\s*(\w+)/);
                  if (match) {
                    const toolName = match[1];
                    setToolCalls(prev => [...prev, {
                      name: toolName,
                      args: parsed.content.replace(/^调用:\s*\w+\s*/, "").slice(0, 60),
                      status: "executing",
                    }]);
                  }
                } else if (parsed.type === "tool_result") {
                  setToolCalls(prev => prev.map((tc, idx) =>
                    idx === prev.length - 1 && tc.status === "executing"
                      ? { ...tc, status: parsed.success ? "success" : "error", result: typeof parsed.result === "string" ? parsed.result.slice(0, 200) : JSON.stringify(parsed.result).slice(0, 200) }
                      : tc
                  ));
                } else if (parsed.type === "error") {
                  setAgentError(parsed.content || "执行出错");
                } else if (parsed.type === "workflow_step_start" && parsed.step) {
                  setWorkflowVisible(true);
                  setWorkflowCurrentIndex(parsed.stepIndex);
                  if (parsed.session_id) setWorkflowSessionId(parsed.session_id);
                  if (parsed.task_id) setWorkflowTaskId(parsed.task_id);
                  setWorkflowSteps(prev => {
                    const newSteps = [...prev];
                    while (newSteps.length <= parsed.stepIndex) {
                      newSteps.push({ name: "", status: "pending" });
                    }
                    newSteps[parsed.stepIndex] = {
                      name: parsed.step.name || `步骤 ${parsed.stepIndex + 1}`,
                      description: parsed.step.description,
                      status: "running",
                    };
                    return newSteps;
                  });
                } else if (parsed.type === "workflow_step_complete" && parsed.step) {
                  setWorkflowSteps(prev => {
                    const newSteps = [...prev];
                    if (newSteps[parsed.stepIndex]) {
                      newSteps[parsed.stepIndex] = { ...newSteps[parsed.stepIndex], status: "completed", summary: parsed.summary, output: parsed.output };
                    }
                    return newSteps;
                  });
                } else if (parsed.type === "workflow_waiting_human") {
                  setWorkflowWaitingForHuman(true);
                  setWorkflowHumanMessage(parsed.message || "请确认");
                  setWorkflowHumanDetail(parsed.detail || "");
                  setWorkflowHumanDetailType(parsed.detail_type || "markdown");
                  setWorkflowAssignees(parsed.assignee || []);
                  if (parsed.session_id) setWorkflowSessionId(parsed.session_id);
                  if (parsed.task_id) setWorkflowTaskId(parsed.task_id);
                } else if (parsed.type === "workflow_complete") {
                  setWorkflowSteps(prev => prev.map(s => ({ ...s, status: "completed" as const })));
                  setWorkflowWaitingForHuman(false);
                  setWorkflowSessionId("");
                } else if (parsed.content) {
                  accumulated += parsed.content;
                  const displayContent = accumulated.replace(/\[STEP\].*?\[\/STEP\]\s*/g, "").trim();
                  setMessages(prev => {
                    const updated = [...prev];
                    updated[updated.length - 1] = { role: "assistant", content: displayContent };
                    return updated;
                  });
                }
              } catch {}
            }
          }
        }
        if (!accumulated) {
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: "assistant", content: "抱歉，我暂时无法生成回复，请稍后重试。" };
            return updated;
          });
        }
      }).catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("对话请求失败:", err);
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: "抱歉，网络请求失败，请检查网络后重试。" };
          return updated;
        });
      }).finally(() => {
        setIsStreaming(false);
        setCurrentStep(null);
        abortRef.current = null;
        setTimeout(() => inputRef.current?.focus(), 50);
      });
    }, 50);
  }, [isStreaming, agent, messages]);

  // 清空对话
  const handleClear = useCallback(() => {
    if (isStreaming) {
      abortRef.current?.abort();
    }
    setMessages([]);
    setInput("");
    setIsStreaming(false);
    setCurrentStep(null);
    setPendingAttachments(prev => {
      prev.forEach(a => { if (a.previewUrl) URL.revokeObjectURL(a.previewUrl); });
      return [];
    });
    setWorkflowSteps([]);
    setWorkflowVisible(false);
    setWorkflowWaitingForHuman(false);
    setWorkflowSessionId("");
    setWorkflowTaskId("");
    setShowApprovalInput(false);
    setApprovalInput("");
  }, [isStreaming]);

  // 附件处理
  const handleFileSelect = async (files: FileList | File[], forcedType?: "image" | "video" | "file") => {
    const currentCount = pendingAttachments.length;
    for (let i = 0; i < files.length; i++) {
      if (currentCount + i >= 9) break;
      const file = files[i];
      let type: "image" | "video" | "file" = "file";
      if (forcedType) {
        type = forcedType;
      } else if (file.type.startsWith("image/")) {
        type = "image";
      } else if (file.type.startsWith("video/")) {
        type = "video";
      }
      const id = `att-${Date.now()}-${i}`;
      const previewUrl = type === "image" ? URL.createObjectURL(file) : (type === "video" ? URL.createObjectURL(file) : "");
      const newAtt = { id, file, type, previewUrl, name: file.name, size: file.size, status: "uploading" as const };
      setPendingAttachments(prev => [...prev, newAtt]);
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("userId", "");
        const res = await fetch("/api/upload/attachment", { method: "POST", body: formData });
        const data = await res.json();
        if (data.success) {
          setPendingAttachments(prev => prev.map(a => a.id === id ? { ...a, status: "done" as const, key: data.key, url: data.url, contentType: data.contentType } : a));
        } else {
          setPendingAttachments(prev => prev.map(a => a.id === id ? { ...a, status: "error" as const } : a));
        }
      } catch {
        setPendingAttachments(prev => prev.map(a => a.id === id ? { ...a, status: "error" as const } : a));
      }
    }
  };

  const removeAttachment = (id: string) => {
    setPendingAttachments(prev => {
      const att = prev.find(a => a.id === id);
      if (att?.previewUrl) URL.revokeObjectURL(att.previewUrl);
      return prev.filter(a => a.id !== id);
    });
  };

  // 按键发送
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  if (!agent) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => {
      if (isStreaming) {
        abortRef.current?.abort();
        setIsStreaming(false);
      }
      onOpenChange(v);
    }}>
      <DialogContent className="sm:max-w-[640px] h-[80vh] flex flex-col p-0 gap-0">
        {/* 头部 */}
        <DialogHeader className="px-5 py-3.5 border-b border-border shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold", getAvatarColor(agent.name))}>
                {agent.name.charAt(0)}
              </div>
              <div>
                <DialogTitle className="text-sm font-semibold">{agent.name}</DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{agent.description || "智能体助手"}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {agent.skillNames.length > 0 && (
                <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                  <Bot className="w-2.5 h-2.5 mr-0.5" />
                  {agent.skillNames.length} 职能
                </Badge>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={handleClear}
                title="清空对话"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* 消息区 */}
        <ScrollArea ref={scrollRef} className="flex-1 min-h-0">
          <div className="px-5 py-3">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <div className={cn("w-14 h-14 rounded-xl flex items-center justify-center text-white font-bold text-xl mb-3", getAvatarColor(agent.name))}>
                  {agent.name.charAt(0)}
                </div>
                <p className="text-sm font-medium text-foreground">{agent.name}</p>
                <p className="text-xs mt-1">{agent.goal || agent.description || "有什么可以帮你的？"}</p>
                {agent.skillNames.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3 justify-center">
                    {agent.skillNames.map((name, i) => (
                      <Badge key={i} variant="outline" className="text-[10px] h-5 px-1.5">{name}</Badge>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {messages.map((msg, i) => (
                  <MessageBubble key={i} message={msg} agentName={agent.name} agentId={agent.id} teamId={agent.teamId} />
                ))}
                {/* 流式输出时的光标 */}
                {isStreaming && messages[messages.length - 1]?.role === "assistant" && !messages[messages.length - 1]?.content && (
                  <div className="flex gap-3 py-3">
                    <div className={cn("w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0", getAvatarColor(agent.name))}>
                      {agent.name.charAt(0)}
                    </div>
                    <div className="bg-muted rounded-lg px-3.5 py-2.5">
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    </div>
                  </div>
                )}
              </div>
            )}
            {/* 工作流思考链 */}
            {workflowVisible && (
              <div className="px-2 py-2">
                <ThinkingChain
                  steps={workflowSteps}
                  workflowName=""
                  visible={workflowVisible}
                  hasError={workflowHasError}
                  errorMessage={workflowErrorMessage}
                />
                {/* 审批操作按钮（仅当前用户需要审批时） */}
                {workflowWaitingForHuman && workflowAssignees.length > 0 && workflowAssignees[0] === "initiator" && (
                  <div className="mt-2 flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="default"
                      className="h-7 text-xs gap-1"
                      onClick={() => {
                        // 发送"确认通过"消息触发 LLM 调用 resume
                        handleSendWithText("确认通过");
                      }}
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      通过
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1"
                      onClick={() => {
                        setShowApprovalInput(true);
                        setApprovalInput("");
                      }}
                    >
                      <Clock className="w-3 h-3" />
                      修改意见
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-muted-foreground"
                      onClick={() => {
                        setWorkflowHasError(false);
                        setWorkflowErrorMessage("");
                        setWorkflowSteps([]);
                        setWorkflowVisible(false);
                        setWorkflowWaitingForHuman(false);
                        setWorkflowSessionId("");
                      }}
                    >
                      <XCircle className="w-3 h-3" />
                      关闭
                    </Button>
                  </div>
                )}
                {/* 修改意见输入框 */}
                {showApprovalInput && (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="text"
                      value={approvalInput}
                      onChange={(e) => setApprovalInput(e.target.value)}
                      placeholder="输入修改意见..."
                      className="flex-1 h-8 px-2 text-xs rounded border border-border bg-background"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && approvalInput.trim()) {
                          handleSendWithText(`修改意见：${approvalInput.trim()}`);
                          setShowApprovalInput(false);
                          setApprovalInput("");
                        }
                      }}
                    />
                    <Button
                      size="sm"
                      variant="default"
                      className="h-7 text-xs"
                      onClick={() => {
                        if (approvalInput.trim()) {
                          handleSendWithText(`修改意见：${approvalInput.trim()}`);
                          setShowApprovalInput(false);
                          setApprovalInput("");
                        }
                      }}
                      disabled={!approvalInput.trim()}
                    >
                      提交
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>

        {/* 步骤指示器 */}
        {(currentStep || toolCalls.length > 0 || agentError || safetyIntercepted || agentProgress) && (
          <div className="px-5 py-2 border-t border-border/40 shrink-0 bg-muted/30">
            <AgentThinkingPanel
              currentStep={currentStep}
              toolCalls={toolCalls}
              isResponding={isStreaming}
              error={agentError}
              safetyIntercepted={safetyIntercepted}
              progress={agentProgress}
            />
          </div>
        )}

        {/* 输入区 */}
        <div className="px-5 py-3 border-t border-border shrink-0">
          {/* 附件预览 */}
          {pendingAttachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {pendingAttachments.map((att) => (
                <div key={att.id} className="relative group rounded-lg border border-border/50 bg-muted overflow-hidden">
                  {att.type === "image" ? (
                    <div className="w-14 h-14">
                      {att.previewUrl && <img src={att.previewUrl} alt={att.name} className="w-full h-full object-cover" />}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 px-2 py-1.5 max-w-[120px]">
                      <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="text-xs truncate">{att.name}</span>
                    </div>
                  )}
                  <button
                    onClick={() => removeAttachment(att.id)}
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                  {att.status === "uploading" && (
                    <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                    </div>
                  )}
                  {att.status === "error" && (
                    <div className="absolute inset-0 bg-destructive/20 flex items-center justify-center">
                      <X className="w-3.5 h-3.5 text-destructive" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {/* 工具栏 + 输入 */}
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`给 ${agent.name} 发送消息...`}
                className="min-h-[40px] max-h-[120px] resize-none text-sm"
                rows={1}
                disabled={isStreaming}
              />
            </div>
            <div className="flex flex-col gap-1 shrink-0">
              <div className="flex items-center gap-0.5">
                <input
                  type="file"
                  ref={imageInputRef}
                  className="hidden"
                  accept="image/*"
                  multiple
                  onChange={(e) => { if (e.target.files) handleFileSelect(e.target.files, "image"); e.target.value = ""; }}
                />
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
                  multiple
                  onChange={(e) => { if (e.target.files) handleFileSelect(e.target.files, "file"); e.target.value = ""; }}
                />
                <Button variant="ghost" size="icon" className="h-7 w-7" disabled={isStreaming} onClick={() => imageInputRef.current?.click()} title="上传图片">
                  <ImagePlus className="w-3.5 h-3.5 text-muted-foreground" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" disabled={isStreaming} onClick={() => fileInputRef.current?.click()} title="上传文件">
                  <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
                </Button>
              </div>
              <Button
                size="icon"
                onClick={handleSend}
                disabled={(!input.trim() && pendingAttachments.length === 0) || isStreaming || pendingAttachments.some(a => a.status === "uploading")}
                className="h-8 w-8 self-end"
              >
                {isStreaming ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
              </Button>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5">Enter 发送，Shift+Enter 换行</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
