"use client";

import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

interface MarkdownContentProps {
  /** Markdown 原始文本 */
  content?: string | null;
  className?: string;
}

/**
 * 统一的 Markdown 渲染组件
 * - 默认不渲染裸 HTML（react-markdown 默认行为），避免 XSS
 * - 排版样式见 globals.css 的 `.md-body`
 */
export function MarkdownContent({ content, className }: MarkdownContentProps) {
  if (!content || !content.trim()) {
    return <p className={cn("text-sm text-muted-foreground", className)}>（暂无内容）</p>;
  }

  return (
    <div className={cn("md-body", className)}>
      <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
    </div>
  );
}
