"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { FileText, ChevronDown, ChevronUp, Copy, Check } from "lucide-react";
import {
  extractDocumentContent,
  getDocumentTitle,
  getDocumentSummary,
} from "@/lib/doc-utils";

interface DocCardProps {
  content: string;
  className?: string;
}

export function DocCard({ content, className }: DocCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const docContent = extractDocumentContent(content);
  const title = getDocumentTitle(content);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(docContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={cn(
        "mt-2 rounded-lg border border-border/60 bg-card/50 overflow-hidden transition-all",
        expanded && "shadow-sm",
        className
      )}
    >
      {/* 卡片头部 */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none hover:bg-accent/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <FileText className="h-4 w-4 text-primary shrink-0" />
        <span className="text-sm font-medium truncate flex-1">
          {title || "文档"}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleCopy();
          }}
          className="shrink-0 p-1 rounded hover:bg-accent/50 transition-colors"
          title="复制文档"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-green-500" />
          ) : (
            <Copy className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          className="shrink-0 p-1 rounded hover:bg-accent/50 transition-colors"
        >
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>
      </div>

      {/* 卡片内容 - 展开/折叠 */}
      <div
        className={cn(
          "px-3 overflow-hidden transition-all duration-200",
          expanded ? "pb-3 max-h-[2000px]" : "pb-0 max-h-0"
        )}
      >
        {/* 折叠时预览摘要 */}
        {!expanded && (
          <div className="text-xs text-muted-foreground leading-relaxed pb-2 whitespace-pre-wrap line-clamp-2">
            {getDocumentSummary(content)}
          </div>
        )}
        {/* 展开时显示完整内容 */}
        {expanded && (
          <div className="text-sm leading-relaxed whitespace-pre-wrap break-words prose prose-sm max-w-none dark:prose-invert">
            {docContent.split("\n").map((line, idx) => {
              // 渲染 Markdown 标题
              const headingMatch = line.match(/^(#{1,4})\s+(.+)/);
              if (headingMatch) {
                const level = headingMatch[1].length;
                const Tag = `h${level + 2}` as keyof React.JSX.IntrinsicElements;
                return (
                  <Tag
                    key={idx}
                    className={cn(
                      "font-semibold text-foreground mt-3 mb-1",
                      level === 1 && "text-base",
                      level === 2 && "text-sm",
                      level === 3 && "text-sm",
                    )}
                  >
                    {headingMatch[2]}
                  </Tag>
                );
              }
              // 渲染分隔线
              if (/^---$/.test(line.trim())) {
                return <hr key={idx} className="my-2 border-border/50" />;
              }
              // 渲染列表项
              if (/^[-*]\s/.test(line)) {
                return (
                  <li key={idx} className="text-sm ml-4 list-disc text-muted-foreground">
                    {line.replace(/^[-*]\s/, "")}
                  </li>
                );
              }
              if (/^\d+\.\s/.test(line)) {
                return (
                  <li key={idx} className="text-sm ml-4 list-decimal text-muted-foreground">
                    {line.replace(/^\d+\.\s/, "")}
                  </li>
                );
              }
              // 渲染空行
              if (line.trim() === "") {
                return <div key={idx} className="h-2" />;
              }
              // 渲染普通文本
              return (
                <p key={idx} className="text-sm text-muted-foreground leading-relaxed">
                  {line}
                </p>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}