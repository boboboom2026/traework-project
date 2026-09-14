"use client";

import { Bot, Loader2, CheckCircle2, XCircle, ChevronDown, ChevronRight, AlertCircle } from "lucide-react";
import { useState } from "react";

export interface ToolCallItem {
  /** 工具名称 */
  name: string;
  /** 参数（展示用） */
  args?: string;
  /** 状态: pending → executing → success / error */
  status: "pending" | "executing" | "success" | "error";
  /** 执行结果摘要 */
  result?: string;
  /** 耗时(ms) */
  durationMs?: number;
  /** 委托给哪个智能体（delegate_agent 专用） */
  delegateTo?: string;
}

interface ProgressInfo {
  iteration: number;
  maxIterations: number;
  toolsCalled: number;
  elapsedMs: number;
  tokenUsage: number;
  summary?: string;
  budget?: string;
}

interface AgentThinkingPanelProps {
  /** 当前步骤描述 */
  currentStep: string | null;
  /** 工具调用列表 */
  toolCalls: ToolCallItem[];
  /** 是否正在响应中 */
  isResponding: boolean;
  /** 错误信息 */
  error?: string | null;
  /** 是否已触发安全拦截（死循环/超预算） */
  safetyIntercepted?: boolean;
  /** 进度信息 */
  progress?: ProgressInfo | null;
}

export function AgentThinkingPanel({ currentStep, toolCalls, isResponding, error, safetyIntercepted, progress }: AgentThinkingPanelProps) {
  const [expandedTool, setExpandedTool] = useState<string | null>(null);

  if (!isResponding && toolCalls.length === 0 && !error) return null;

  const toggleTool = (key: string) => {
    setExpandedTool(expandedTool === key ? null : key);
  };

  return (
    <div className="flex items-start gap-2 px-4 py-3">
      {/* 智能体头像 */}
      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
        <Bot className="w-4 h-4 text-primary" />
      </div>

      <div className="flex-1 min-w-0">
        {/* 头部：智能体思考中 */}
        <div className="flex items-center gap-1.5 mb-1">
          {isResponding ? (
            <>
              <div className="w-4 h-4 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Loader2 className="w-3 h-3 text-primary animate-spin" />
              </div>
              <span className="text-xs font-medium text-foreground">智能体正在处理...</span>
            </>
          ) : safetyIntercepted ? (
            <>
              <div className="w-4 h-4 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
                <AlertCircle className="w-3 h-3 text-amber-500" />
              </div>
              <span className="text-xs font-medium text-amber-600">执行遇到困难</span>
            </>
          ) : error ? (
            <>
              <div className="w-4 h-4 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
                <XCircle className="w-3 h-3 text-red-500" />
              </div>
              <span className="text-xs font-medium text-red-600">执行出错</span>
            </>
          ) : (
            <>
              <div className="w-4 h-4 rounded-full bg-green-500/10 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-3 h-3 text-green-500" />
              </div>
              <span className="text-xs font-medium text-green-600">执行完成</span>
            </>
          )}
        </div>

        {/* 当前步骤 */}
        {currentStep && (
          <div className="text-xs text-muted-foreground mb-1.5 pl-1">
            <span className="inline-flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-primary/40" />
              {currentStep}
            </span>
          </div>
        )}

        {/* 工具调用列表 */}
        {toolCalls.length > 0 && (
          <div className="space-y-0.5">
            {toolCalls.map((call, idx) => {
              const key = `${call.name}-${idx}`;
              const isExpanded = expandedTool === key;
              const duration = call.durationMs ? (call.durationMs < 1000 ? `${call.durationMs}ms` : `${(call.durationMs / 1000).toFixed(1)}s`) : "";

              return (
                <div
                  key={key}
                  className="rounded-md border border-border/50 bg-muted/30"
                >
                  {/* 工具行 */}
                  <button
                    onClick={() => toggleTool(key)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-muted/50 transition-colors text-left"
                  >
                    {/* 状态图标 */}
                    {call.status === "pending" && (
                      <div className="w-3.5 h-3.5 rounded-full border border-muted-foreground/30 flex items-center justify-center shrink-0">
                        <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
                      </div>
                    )}
                    {call.status === "executing" && (
                      <Loader2 className="w-3.5 h-3.5 text-primary animate-spin shrink-0" />
                    )}
                    {call.status === "success" && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                    )}
                    {call.status === "error" && (
                      <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                    )}

                    {/* 工具名 */}
                    <span className="font-mono font-medium text-foreground/80">{call.name}</span>

                    {/* 委托给智能体 */}
                    {call.delegateTo && (
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <span className="text-muted-foreground/40">→</span>
                        <span className="text-xs text-primary/80 font-medium">{call.delegateTo}</span>
                      </span>
                    )}

                    {/* 参数摘要 */}
                    {call.args && (
                      <span className="text-muted-foreground truncate max-w-[200px]">
                        {call.args.length > 40 ? call.args.slice(0, 40) + "..." : call.args}
                      </span>
                    )}

                    {/* 耗时 */}
                    {duration && <span className="text-muted-foreground/60 ml-auto">{duration}</span>}

                    {/* 展开/收起 */}
                    {(call.result || call.status === "error") && (
                      <span className="text-muted-foreground/40 shrink-0">
                        {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      </span>
                    )}
                  </button>

                  {/* 展开的结果 */}
                  {isExpanded && (call.result || call.status === "error") && (
                    <div className="px-2 pb-2">
                      <div className="text-xs text-muted-foreground bg-background/50 rounded p-1.5 max-h-24 overflow-y-auto whitespace-pre-wrap break-all">
                        {call.status === "error" ? (call.result || "执行失败") : call.result}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 进度信息 */}
        {progress && isResponding && (
          <div className="mt-1.5 text-xs text-muted-foreground/70 bg-muted/20 rounded px-2 py-1.5 space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="font-medium">进度</span>
              <span>第 {progress.iteration}/{progress.maxIterations} 轮</span>
              <span>·</span>
              <span>{progress.toolsCalled} 次工具调用</span>
              <span>·</span>
              <span>耗时 {progress.elapsedMs < 1000 ? `${progress.elapsedMs}ms` : `${(progress.elapsedMs / 1000).toFixed(1)}s`}</span>
            </div>
            {progress.summary && (
              <div className="text-muted-foreground/50 leading-relaxed">
                {progress.summary}
              </div>
            )}
          </div>
        )}

        {/* 错误信息 */}
        {error && (
          <div className="mt-1.5 text-xs text-red-500 bg-red-50 dark:bg-red-950/30 rounded-md px-2 py-1.5">
            {error}
          </div>
        )}

        {/* 安全拦截提示 */}
        {safetyIntercepted && (
          <div className="mt-1.5 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded-md px-2 py-1.5">
            智能体在执行过程中遇到困难，已自动停止。你可以补充更多信息后重新提问，或尝试用更具体的方式描述需求。
          </div>
        )}

        {/* 执行完成提示 */}
        {!isResponding && toolCalls.length > 0 && !error && !safetyIntercepted && (
          <div className="mt-1 text-xs text-muted-foreground/60">
            共执行 {toolCalls.length} 个工具调用
            {toolCalls.some(c => c.durationMs) && (
              <span>，总耗时 {toolCalls.reduce((s, c) => s + (c.durationMs || 0), 0) < 1000
                ? `${toolCalls.reduce((s, c) => s + (c.durationMs || 0), 0)}ms`
                : `${(toolCalls.reduce((s, c) => s + (c.durationMs || 0), 0) / 1000).toFixed(1)}s`
              }</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}