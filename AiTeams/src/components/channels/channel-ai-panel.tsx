"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, Send, Loader2, Sparkles, Search, PanelRightClose, User, ListTodo } from "lucide-react";
import { cn } from "@/lib/utils";

// ==================== 类型 ====================
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// sessionStorage 持久化 key
const getStorageKey = (channelId: string) => `channel-ai-panel-${channelId}`;

const saveMessagesToStorage = (channelId: string, messages: ChatMessage[]) => {
  try {
    sessionStorage.setItem(getStorageKey(channelId), JSON.stringify(messages));
  } catch { /* storage full - ignore */ }
};

const loadMessagesFromStorage = (channelId: string): ChatMessage[] | null => {
  try {
    const data = sessionStorage.getItem(getStorageKey(channelId));
    return data ? JSON.parse(data) : null;
  } catch { return null; }
};

const clearMessagesFromStorage = (channelId: string) => {
  try {
    sessionStorage.removeItem(getStorageKey(channelId));
  } catch { /* ignore */ }
};

interface ChannelAiPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channelId: string;
  teamId: string;
}

// ==================== 常量 ====================
const ASSISTANT_NAME = "频道AI助手";

// ==================== 颜色 ====================
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
function MessageBubble({ message, agentName }: { message: ChatMessage; agentName: string }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex gap-2.5 py-2.5 px-4", isUser ? "flex-row-reverse" : "")}>
      <div className={cn(
        "w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0 mt-0.5",
        isUser ? "bg-primary" : getAvatarColor(agentName)
      )}>
        {isUser ? <User className="w-3 h-3" /> : agentName.charAt(0)}
      </div>
      <div className={cn(
        "max-w-[80%] rounded-lg px-3 py-2 text-sm leading-relaxed",
        isUser
          ? "bg-primary text-primary-foreground"
          : "bg-muted"
      )}>
        <div className="whitespace-pre-wrap break-words">{message.content}</div>
      </div>
    </div>
  );
}

// ==================== 快捷按钮 ====================
const QUICK_ACTIONS = [
  { label: "频道摘要", icon: Sparkles, prompt: "请分析当前频道的最近讨论内容，生成一份包含以下结构的频道摘要：\n1. 一句话总结\n2. 核心话题列表（每个话题简要说明）\n3. 待办事项与决策\n4. 涉及的关键人员" },
  { label: "搜索消息", icon: Search, prompt: "请帮我搜索频道中关于" },
  { label: "待办事项", icon: ListTodo, prompt: "请从频道最近的讨论中提取待办事项和行动项，按紧急程度排序" },
];

// ==================== 主组件 ====================
export function ChannelAiPanel({ open, onOpenChange, channelId, teamId }: ChannelAiPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // 打开面板时恢复之前的对话（从 sessionStorage）
  useEffect(() => {
    if (open) {
      const saved = loadMessagesFromStorage(channelId);
      if (saved && saved.length > 0) {
        setMessages(saved);
      } else {
        setMessages([]);
      }
      setInput("");
      setIsStreaming(false);
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [open, channelId]);

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
  const handleSend = useCallback(async (customPrompt?: string) => {
    const prompt = customPrompt || input.trim();
    if (!prompt || isStreaming) return;

    const userMessage: ChatMessage = { role: "user", content: prompt };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsStreaming(true);

    // 添加 AI 占位消息
    const assistantMessage: ChatMessage = { role: "assistant", content: "" };
    setMessages([...newMessages, assistantMessage]);

    try {
      abortRef.current = new AbortController();

      const res = await fetch("/api/channels/ai-assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId,
          teamId,
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
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
              if (parsed.content) {
                accumulated += parsed.content;
                setMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: "assistant", content: accumulated };
                  return updated;
                });
              }
              if (parsed.error) {
                setMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: "assistant", content: `错误：${parsed.error}` };
                  return updated;
                });
                break;
              }
            } catch {
              // 忽略解析错误
            }
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error)?.name === "AbortError") {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: updated[updated.length - 1]?.content || "已取消" };
          return updated;
        });
      } else {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: "抱歉，网络连接异常，请重试" };
          return updated;
        });
      }
    } finally {
      setIsStreaming(false);
      // 保存对话到 sessionStorage（切换页面后恢复）
      setMessages(prev => {
        saveMessagesToStorage(channelId, prev);
        return prev;
      });
    }
  }, [input, isStreaming, messages, channelId, teamId]);

  // 快捷键发送
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  // 停止生成
  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
    // 保存当前对话
    setMessages(prev => {
      saveMessagesToStorage(channelId, prev);
      return prev;
    });
  }, [channelId]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[420px] sm:max-w-[420px] p-0 flex flex-col">
        {/* 头部 */}
        <SheetHeader className="px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5 pr-6">
            <div className={cn("w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold", getAvatarColor(ASSISTANT_NAME))}>
              <Bot className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-sm text-left">{ASSISTANT_NAME}</SheetTitle>
              <p className="text-[11px] text-muted-foreground">基于频道上下文回答</p>
            </div>
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  clearMessagesFromStorage(channelId);
                  setMessages([]);
                }}
              >
                新对话
              </Button>
            )}
          </div>
        </SheetHeader>

        {/* 快捷按钮 */}
        {messages.length === 0 && !isStreaming && (
          <div className="flex gap-2 px-4 py-3 border-b border-border shrink-0">
            {QUICK_ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <Button
                  key={action.label}
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => handleSend(action.prompt)}
                >
                  <Icon className="w-3 h-3" />
                  {action.label}
                </Button>
              );
            })}
          </div>
        )}

        {/* 消息列表 */}
        <div className="flex-1 overflow-hidden min-h-0">
          <ScrollArea ref={scrollRef} className="h-full">
            {messages.length === 0 && !isStreaming ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-6">
                <div className={cn("w-12 h-12 rounded-full flex items-center justify-center text-white mb-3", getAvatarColor(ASSISTANT_NAME))}>
                  <Bot className="w-6 h-6" />
                </div>
                <p className="text-sm font-medium text-foreground">{ASSISTANT_NAME}</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-[280px]">
                  我可以基于频道上下文帮你总结讨论、搜索消息、提取待办事项
                </p>
              </div>
            ) : (
              <div className="py-1">
                {messages.map((msg, i) => (
                  <MessageBubble key={i} message={msg} agentName={ASSISTANT_NAME} />
                ))}
                {isStreaming && messages[messages.length - 1]?.content === "" && (
                  <div className="flex gap-2.5 px-4 py-2.5">
                    <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold", getAvatarColor(ASSISTANT_NAME))}>
                      {ASSISTANT_NAME.charAt(0)}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* 底部输入区 */}
        <div className="border-t border-border p-3 shrink-0">
          <div className="flex items-end gap-2">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入问题，按 Enter 发送..."
                rows={1}
                className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring min-h-[36px] max-h-[120px]"
                disabled={isStreaming}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = "auto";
                  target.style.height = Math.min(target.scrollHeight, 120) + "px";
                }}
              />
            </div>
            {isStreaming ? (
              <Button
                variant="secondary"
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={handleStop}
                title="停止生成"
              >
                <PanelRightClose className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={() => handleSend()}
                disabled={!input.trim()}
                title="发送"
              >
                <Send className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
      </Sheet>
  );
}