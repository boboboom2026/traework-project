"use client";

import { useEffect, useState } from "react";
import { Check, ChevronRight, Loader2, CircleAlert, Circle } from "lucide-react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export type TimelineStepStatus = "pending" | "running" | "done" | "error";

export interface TimelineStep {
  nodeId: string;
  nodeName: string;
  nodeType?: string;
  status: TimelineStepStatus;
  /** 已耗时（运行中实时跳动，完成后为总耗时） */
  durationMs?: number;
  /** 输出摘要，如「生成 1.2k 字」 */
  summary?: string;
  /** 模型思考过程（流式累积） */
  reasoning?: string;
  /** 模型生成内容（流式累积） */
  content?: string;
  /** 错误信息 */
  message?: string;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  return `${Math.floor(seconds / 60)}m${Math.round(seconds % 60)}s`;
}

function StepIcon({ status }: { status: TimelineStepStatus }) {
  if (status === "done") {
    return (
      <span className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Check className="size-3.5" />
      </span>
    );
  }
  if (status === "running") {
    return (
      <span className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Loader2 className="size-3.5 animate-spin" />
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="flex size-5 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <CircleAlert className="size-3.5" />
      </span>
    );
  }
  return (
    <span className="flex size-5 items-center justify-center rounded-full border border-border text-muted-foreground">
      <Circle className="size-2.5" />
    </span>
  );
}

/** 运行中节点：实时计时，让「过程」可见 */
function useElapsed(startedAt?: number, active?: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active || !startedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, [active, startedAt]);

  if (!startedAt) return 0;
  if (!active) return 0;
  return Math.max(0, now - startedAt);
}

function TimelineRow({ step, startedAt }: { step: TimelineStep; startedAt?: number }) {
  const liveElapsed = useElapsed(startedAt, step.status === "running");
  const [open, setOpen] = useState(step.status === "running");

  // 运行中自动展开思考过程，结束后收起，避免喧宾夺主
  useEffect(() => {
    setOpen(step.status === "running");
  }, [step.status]);

  const hasReasoning = Boolean(step.reasoning && step.reasoning.trim());
  const duration = step.status === "running" ? liveElapsed : step.durationMs ?? 0;

  return (
    <li className="group relative flex gap-3 pb-4 last:pb-0">
      <span
        aria-hidden
        className={cn(
          "absolute left-[9px] top-6 h-[calc(100%-1.5rem)] w-px bg-border group-last:hidden",
          step.status === "pending" && "opacity-50",
        )}
      />
      <StepIcon status={step.status} />

      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className={cn(
              "text-sm font-medium",
              step.status === "pending" && "text-muted-foreground",
              step.status === "error" && "text-destructive",
            )}
          >
            {step.nodeName}
          </span>
          {step.nodeType ? (
            <span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
              {step.nodeType}
            </span>
          ) : null}
          {duration > 0 ? (
            <span className="text-xs tabular-nums text-muted-foreground">{formatDuration(duration)}</span>
          ) : null}
          {step.status === "running" ? (
            <span className="animate-pulse text-xs text-primary">进行中…</span>
          ) : null}
        </div>

        {step.summary ? (
          <p className="text-xs leading-relaxed text-muted-foreground">{step.summary}</p>
        ) : null}

        {step.message ? <p className="text-xs text-destructive">{step.message}</p> : null}

        {hasReasoning ? (
          <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger className="group flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
              <ChevronRight className="size-3 transition-transform group-data-[state=open]:rotate-90" />
              思考过程
              {step.status === "running" ? <span className="text-primary">（实时）</span> : null}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-1.5 max-h-40 overflow-y-auto rounded-md border border-border bg-muted/40 px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
                {step.reasoning}
              </div>
            </CollapsibleContent>
          </Collapsible>
        ) : null}
      </div>
    </li>
  );
}

interface RunTimelineProps {
  steps: TimelineStep[];
  /** 运行中节点的开始时间戳（用于实时计时） */
  startedAtMap?: Record<string, number>;
  className?: string;
}

/**
 * 任务执行时间线：展示每个节点的状态、耗时、输出摘要与模型思考过程。
 */
export function RunTimeline({ steps, startedAtMap, className }: RunTimelineProps) {
  if (steps.length === 0) {
    return (
      <p className={cn("text-xs text-muted-foreground", className)}>点击「运行」开始执行，过程会实时显示在这里。</p>
    );
  }

  return (
    <ul className={cn("space-y-0", className)}>
      {steps.map((step) => (
        <TimelineRow key={step.nodeId} step={step} startedAt={startedAtMap?.[step.nodeId]} />
      ))}
    </ul>
  );
}
