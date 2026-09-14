"use client";

import { CheckCircle2, Loader2, Clock, XCircle } from "lucide-react";

export interface ThinkingStep {
  name: string;
  description?: string;
  status: "pending" | "running" | "completed" | "waiting" | "error";
  summary?: string;
  output?: string;
  error?: string;
}

interface ThinkingChainProps {
  /** 工作流名称（可选） */
  workflowName?: string;
  /** 步骤列表 */
  steps: ThinkingStep[];
  /** 是否可见/正在执行 */
  visible: boolean;
  /** 是否有错误（覆盖自动检测） */
  hasError?: boolean;
  /** 错误消息 */
  errorMessage?: string;
}

/**
 * 思考链组件 — 轻量展示工作流执行进度。
 * 用于替代 WorkflowProgress 面板，以紧凑形式展示在对话中。
 */
export function ThinkingChain({ workflowName = "", steps, visible, hasError: externalHasError, errorMessage }: ThinkingChainProps) {
  if (!visible || steps.length === 0) return null;

  const hasError = externalHasError !== undefined ? externalHasError : steps.some(s => s.status === "error");
  const runningStep = steps.find(s => s.status === "running");
  const waitingStep = steps.find(s => s.status === "waiting");

  return (
    <div className="rounded-lg border bg-muted/30 p-2.5 mb-2 text-xs">
      <div className="flex items-center gap-1.5 mb-1.5 text-muted-foreground">
        {hasError ? (
          <XCircle className="h-3 w-3 text-destructive" />
        ) : waitingStep ? (
          <Clock className="h-3 w-3 text-amber-500" />
        ) : (
          <Loader2 className="h-3 w-3 animate-spin" />
        )}
        <span className="font-medium">
          {hasError ? "工作流执行出错" : `工作流${workflowName ? `：${workflowName}` : "执行中"}`}
        </span>
        {errorMessage && hasError && (
          <span className="text-destructive ml-1">— {errorMessage}</span>
        )}
      </div>
      <div className="space-y-0.5 pl-1">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center gap-1.5 py-0.5">
            {step.status === "running" && <Loader2 className="h-2.5 w-2.5 animate-spin text-blue-500 shrink-0" />}
            {step.status === "completed" && <CheckCircle2 className="h-2.5 w-2.5 text-green-500 shrink-0" />}
            {step.status === "waiting" && <Clock className="h-2.5 w-2.5 text-amber-500 shrink-0" />}
            {step.status === "error" && <XCircle className="h-2.5 w-2.5 text-red-500 shrink-0" />}
            {step.status === "pending" && <div className="h-2.5 w-2.5 rounded-full border border-muted-foreground/30 shrink-0" />}
            <span className={`${step.status === "running" ? "text-blue-600 font-medium" : step.status === "waiting" ? "text-amber-600" : step.status === "error" ? "text-red-600" : "text-muted-foreground"}`}>
              {step.name || `步骤 ${i + 1}`}
            </span>
            {step.status === "completed" && step.summary && (
              <span className="text-muted-foreground ml-0.5 truncate max-w-[120px]">— {step.summary}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}