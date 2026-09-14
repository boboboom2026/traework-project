"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { CheckCircle2, Circle, Loader2, AlertCircle, AlertTriangle, UserCheck, XCircle, RefreshCw, SkipForward, ChevronDown, ChevronRight, FileText, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface WorkflowStepOutput {
  key: string;
  content: unknown;
  content_type?: string;
}

export interface WorkflowStepState {
  name: string;
  description?: string;
  status: "pending" | "running" | "completed" | "error" | "waiting";
  summary?: string;
  error?: string;
  /** 该步骤的完整产物（中间产物可见性） */
  output?: WorkflowStepOutput;
}

interface WorkflowProgressProps {
  /** 工作流步骤列表 */
  steps: WorkflowStepState[];
  /** 当前执行到的步骤索引 */
  currentStepIndex: number;
  /** 是否正在等待人工审批 */
  waitingForHuman: boolean;
  /** 等待人工审批时显示的消息 */
  humanMessage?: string;
  /** 审批工单正文（如文章初稿全文），带内容的审批工单 */
  humanDetail?: string;
  /** 审批工单正文渲染类型 */
  humanDetailType?: "markdown" | "text" | "json";
  /** 审批被派发给的审批人 id 列表 */
  assignees?: string[];
  /** 是否有错误发生 */
  hasError: boolean;
  /** 错误消息 */
  errorMessage?: string;
  /** 人工确认回调 */
  onHumanConfirm: () => void;
  /** 人工修改回调（传入修改后的文本） */
  onHumanModify: (text: string) => void;
  /** 重试当前步骤 */
  onRetry: () => void;
  /** 跳过当前步骤 */
  onSkip: () => void;
  /** 是否可见 */
  visible: boolean;
}

/** 极简 Markdown 渲染（不引入额外依赖），满足初稿类内容的阅读展示 */
function LightMarkdown({ content }: { content: string }) {
  const lines = content.split("\n");
  const blocks: string[][] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (line.trim().length === 0) {
      if (current.length) blocks.push(current);
      current = [];
    } else {
      current.push(line);
    }
  }
  if (current.length) blocks.push(current);

  return (
    <div className="space-y-2 text-[13px] leading-relaxed">
      {blocks.map((block, bi) => {
        const text = block.join("\n");
        if (text.startsWith("```")) {
          const code = block.slice(1, block[block.length - 1] === "```" ? -1 : block.length).join("\n");
          return (
            <pre key={bi} className="text-xs bg-muted rounded-md p-2 overflow-x-auto border border-border">
              <code>{code}</code>
            </pre>
          );
        }
        return (
          <div key={bi} className="space-y-1">
            {block.map((line, li) => {
              const clean = line.replace(/^#{1,6}\s*/, "").trim();
              const heading = /^#{1,6}\s/.test(line);
              const isBullet = /^[-*]\s/.test(line.trim());
              const isNumbered = /^\d+\.\s/.test(line.trim());
              const renderText = clean.replace(/\*\*(.+?)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1");
              if (heading) {
                const level = (line.match(/^#+/) || [""])[0].length;
                const cls = level === 1 ? "text-base font-semibold" : level === 2 ? "text-sm font-semibold" : "text-[13px] font-medium";
                return <div key={li} className={cls}>{renderText}</div>;
              }
              if (isBullet) {
                return (
                  <div key={li} className="flex gap-1.5">
                    <span className="text-muted-foreground">•</span>
                    <span>{renderText}</span>
                  </div>
                );
              }
              if (isNumbered) {
                return (
                  <div key={li} className="flex gap-1.5">
                    <span className="text-muted-foreground shrink-0">{renderText.split(" ")[0]}</span>
                    <span>{renderText.split(/\s+/).slice(1).join(" ")}</span>
                  </div>
                );
              }
              return <div key={li}>{renderText}</div>;
            })}
          </div>
        );
      })}
    </div>
  );
}

/** 渲染审批工单正文 / 产物内容 */
function renderContent(content: unknown, type?: string) {
  if (content === undefined || content === null) return null;
  if (typeof content === "string") {
    if (type === "json") {
      try {
        return <pre className="text-xs bg-muted rounded-md p-2 overflow-x-auto border border-border">{JSON.stringify(JSON.parse(content), null, 2)}</pre>;
      } catch {
        return <pre className="text-xs whitespace-pre-wrap">{content}</pre>;
      }
    }
    return type === "markdown" ? <LightMarkdown content={content} /> : <p className="whitespace-pre-wrap">{content}</p>;
  }
  // 对象/数组
  return <pre className="text-xs bg-muted rounded-md p-2 overflow-x-auto border border-border">{JSON.stringify(content, null, 2)}</pre>;
}

/** 步骤产物展开项 */
function StepArtifact({ output }: { output: WorkflowStepOutput }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1 ml-5 rounded-md border border-border bg-muted/30 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-1 px-2 py-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <FileText className="w-3 h-3" />
        查看该步骤产物
      </button>
      {open && (
        <div className="px-2 pb-2 text-[12px]">
          {renderContent(output.content, output.content_type)}
        </div>
      )}
    </div>
  );
}

/**
 * 工作流进度展示组件
 * - 进度条 + 步骤列表 + 产物展开 + 人工审批工单 + 错误重试/跳过
 */
export function WorkflowProgress({
  steps,
  currentStepIndex,
  waitingForHuman,
  humanMessage,
  humanDetail,
  humanDetailType,
  assignees,
  hasError,
  errorMessage,
  onHumanConfirm,
  onHumanModify,
  onRetry,
  onSkip,
  visible,
}: WorkflowProgressProps) {
  const progress = useMemo(() => {
    if (steps.length === 0) return 0;
    return Math.round((currentStepIndex / steps.length) * 100);
  }, [steps.length, currentStepIndex]);

  if (!visible || steps.length === 0) return null;

  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      {/* 进度条 */}
      <div className="h-1.5 bg-muted">
        <div
          className={cn(
            "h-full transition-all duration-500 ease-out",
            hasError ? "bg-destructive" : waitingForHuman ? "bg-amber-500" : "bg-primary"
          )}
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
      </div>

      <div className="p-3 space-y-2">
        {/* 标题 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            {hasError ? (
              <AlertCircle className="w-3.5 h-3.5 text-destructive" />
            ) : waitingForHuman ? (
              <UserCheck className="w-3.5 h-3.5 text-amber-500" />
            ) : (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
            )}
            <span>
              {hasError
                ? "工作流执行出错"
                : waitingForHuman
                  ? "等待人工确认"
                  : `执行中 ${currentStepIndex}/${steps.length}`}
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {progress}%
          </span>
        </div>

        {/* 步骤列表 */}
        <div className="space-y-1">
          {steps.map((step, i) => (
            <div key={i}>
              <div className="flex items-center gap-2 py-0.5">
                {/* 状态图标 */}
                {step.status === "completed" && (
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                )}
                {step.status === "running" && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-primary shrink-0" />
                )}
                {step.status === "pending" && (
                  <Circle className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
                )}
                {step.status === "error" && (
                  <XCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                )}
                {step.status === "waiting" && (
                  <UserCheck className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                )}
                {/* 步骤名称 */}
                <span
                  className={cn(
                    "text-xs truncate flex-1",
                    step.status === "completed" && "text-muted-foreground line-through"
                  )}
                >
                  {step.name}
                </span>
                {/* 步骤摘要 */}
                {step.summary && step.status === "completed" && (
                  <span className="text-[10px] text-muted-foreground truncate max-w-[120px] hidden sm:inline">
                    {step.summary}
                  </span>
                )}
              </div>
              {/* 步骤产物（中间产物可见性） */}
              {step.status === "completed" && step.output && (
                <StepArtifact output={step.output} />
              )}
            </div>
          ))}
        </div>

        {/* 人工审批区域（带内容的审批工单） */}
        {waitingForHuman && (humanMessage || humanDetail) && (
          <div className="mt-2 p-2.5 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 space-y-2">
            <div className="flex items-center gap-2 text-[11px] text-amber-800 dark:text-amber-300 font-medium">
              <UserCheck className="w-3.5 h-3.5" />
              {humanMessage || "等待人工确认"}
              {assignees && assignees.length > 0 && (
                <span className="text-amber-600 dark:text-amber-400 font-normal">
                  · 已派发给 {assignees.length} 位审批人
                </span>
              )}
            </div>

            {humanDetail && (
              <div className="rounded-md bg-card border border-amber-200 dark:border-amber-800 p-2.5 max-h-64 overflow-y-auto">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <FileText className="w-3 h-3" />
                    审批工单内容
                  </span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={() => {
                      const text = typeof humanDetail === "string" ? humanDetail : JSON.stringify(humanDetail, null, 2);
                      if (navigator.clipboard) navigator.clipboard.writeText(text);
                    }}
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
                <div className="text-[13px]">
                  {renderContent(humanDetail, humanDetailType)}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="default"
                className="h-7 text-xs"
                onClick={onHumanConfirm}
              >
                <CheckCircle2 className="w-3 h-3 mr-1" />
                确认
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => {
                  const text = prompt("请输入修改内容：");
                  if (text) onHumanModify(text);
                }}
              >
                修改
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={onSkip}
              >
                <SkipForward className="w-3 h-3 mr-1" />
                跳过
              </Button>
            </div>
          </div>
        )}

        {/* 错误区域 */}
        {hasError && errorMessage && (
          <div className="mt-2 p-2.5 rounded-md bg-destructive/10 border border-destructive/20 space-y-2">
            <p className="text-xs text-destructive whitespace-pre-wrap">
              <AlertTriangle className="w-3 h-3 inline mr-1" />
              {errorMessage}
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="default"
                className="h-7 text-xs"
                onClick={onRetry}
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                重试
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={onSkip}
              >
                <SkipForward className="w-3 h-3 mr-1" />
                跳过
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
