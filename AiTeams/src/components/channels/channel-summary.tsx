"use client";

import { useState, useEffect, useCallback } from "react";
import { Sparkles, ChevronDown, ChevronRight, X, Loader2, RefreshCw, Bot, MessageSquare, CheckCircle2, Users } from "lucide-react";

interface Topic {
  title: string;
  desc: string;
}

interface Action {
  content: string;
  type: "decision" | "todo";
}

interface KeyPerson {
  name: string;
  context: string;
}

interface SummaryData {
  topics: Topic[];
  actions: Action[];
  keyPeople: KeyPerson[];
  overall: string;
  isEmpty: boolean;
  channelName?: string;
  messageCount?: number;
}

interface ChannelSummaryProps {
  channelId: string;
  channelName: string;
  onClose?: () => void;
}

export default function ChannelSummary({ channelId, channelName, onClose }: ChannelSummaryProps) {
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const loadSummary = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/channels/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId }),
      });
      const data = await res.json();
      if (data.success && data.summary) {
        setSummary(data.summary);
      } else {
        setError(data.error || "生成摘要失败");
      }
    } catch {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [channelId, loading]);

  // 加载摘要
  useEffect(() => {
    loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!loaded && loading) {
    return (
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>AI 正在分析频道消息...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="w-4 h-4 text-muted-foreground/50" />
          <span>摘要生成失败</span>
          <button
            type="button"
            onClick={loadSummary}
            className="text-xs text-primary hover:underline ml-1"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  if (!summary || summary.isEmpty) {
    return null;
  }

  return (
    <div className="px-4 pt-2 pb-1">
      <div className="relative rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-background overflow-hidden">
        {/* 背景装饰 */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2" />

        {/* 头部 */}
        <div className="relative px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
            </div>
            <span className="text-sm font-medium text-foreground/80">AI 频道摘要</span>
            <span className="text-xs text-muted-foreground">
              {summary.messageCount} 条消息分析
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={loadSummary}
              disabled={loading}
              className="p-1 rounded-md hover:bg-muted transition-colors"
              title="刷新摘要"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              type="button"
              onClick={() => setCollapsed(!collapsed)}
              className="p-1 rounded-md hover:bg-muted transition-colors"
            >
              {collapsed ? (
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
              )}
            </button>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded-md hover:bg-muted transition-colors"
              >
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>

        {/* 内容体 */}
        {!collapsed && (
          <div className="relative px-4 pb-3 space-y-3">
            {/* 一句话总结 */}
            <p className="text-sm text-foreground/70 leading-relaxed">
              {summary.overall}
            </p>

            {/* 核心话题 */}
            {summary.topics.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-medium text-foreground/60">
                  <MessageSquare className="w-3 h-3" />
                  <span>核心话题</span>
                </div>
                <div className="space-y-1">
                  {summary.topics.map((topic, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary/40 mt-1.5 shrink-0" />
                      <div>
                        <span className="text-sm font-medium text-foreground/80">{topic.title}</span>
                        <span className="text-sm text-muted-foreground"> — {topic.desc}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 待办/决策 */}
            {summary.actions.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-medium text-foreground/60">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>待办与决策</span>
                </div>
                <div className="space-y-1">
                  {summary.actions.map((action, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                        action.type === "decision" ? "bg-amber-400" : "bg-emerald-400"
                      }`} />
                      <span className="text-sm text-foreground/70">
                        <span className={`text-xs font-medium mr-1 ${
                          action.type === "decision" ? "text-amber-500" : "text-emerald-500"
                        }`}>
                          [{action.type === "decision" ? "决策" : "待办"}]
                        </span>
                        {action.content}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 关键人 */}
            {summary.keyPeople.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-medium text-foreground/60">
                  <Users className="w-3 h-3" />
                  <span>涉及人员</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {summary.keyPeople.map((person, i) => (
                    <div
                      key={i}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/50 text-xs text-foreground/70"
                    >
                      <Bot className="w-3 h-3 text-muted-foreground/50" />
                      <span className="font-medium">{person.name}</span>
                      <span className="text-muted-foreground/60">— {person.context}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}