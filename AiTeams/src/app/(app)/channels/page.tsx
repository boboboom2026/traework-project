"use client";

import { useState, useEffect, useCallback, useRef, type JSX } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Hash,
  Pin,
  Plus,
  MoreHorizontal,
  Search,
  Send,
  Paperclip,
  Image as ImageIcon,
  Link2,
  Smile,
  AtSign,
  Bold,
  Italic,
  Strikethrough,
  Quote,
  Code,
  List,
  ListOrdered,

  ChevronDown,
  ChevronRight,
  Users,
  Megaphone,
  Folder,
  HelpCircle,
  Lock,
  X,
  Pencil,
  Trash2,
  LayoutGrid,
  Bell,
  BellOff,
  LogOut,
  UserPlus,
  Play,
  MessageSquare,
  Forward,
  Bookmark,
  BookmarkCheck,
  ChevronRight as ChevronRightIcon,
  Hash as HashIcon,
  Eye,
  EyeOff,
  FileText,
  FileType2,
  FolderOpen,
  Bot,
  ThumbsUp,
  ThumbsDown,
  FileSpreadsheet,
  File as FileIcon,
  Download,
  Copy,
  Check,
  ZoomIn,
  ImageOff,
  Loader2,
  Video,
  Link,
  GripVertical,
  ChevronLeft,
  Brain,
  Sparkles,
  BotIcon,
} from "lucide-react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/shared/user-avatar";
import { ForwardMessageDialog } from "@/components/shared/forward-message-dialog";
import { ChannelAiPanel } from "@/components/channels/channel-ai-panel";
import { ChannelFilesPanel } from "@/components/channels/channel-files-panel";
import { AgentThinkingPanel } from "@/components/apps/agent-thinking-panel";
import type { ToolCallItem } from "@/components/apps/agent-thinking-panel";
import { DocCard } from "@/components/channels/doc-card";
import { SubmitApprovalButton } from "@/components/apps/submit-approval-button";
import { isDocumentContent, sanitizeContent } from "@/lib/doc-utils";

import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/use-auth";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { MessageSkeleton, ListSkeleton } from "@/components/ui/list-skeleton";

// ============ Types ============

interface ChannelItem {
  id: string;
  name: string;
  description?: string | null;
  type: string;
  icon?: string | null;
  creatorId: string;
  sortOrder: number;
  isDefault?: boolean;
  isPinned?: boolean;
  sectionName?: string;
  isMember?: boolean;
}

interface SectionItem {
  id: string;
  name: string;
  icon?: string | null;
  isDefault: boolean;
  sortOrder: number;
  isCollapsed: boolean;
  channels: ChannelItem[];
}

interface ChannelMember {
  id: string;
  userId: string;
  name: string;
  avatar: string | null;
  department: string | null;
  position: string | null;
  joinedAt: string;
}

interface MessageAttachment {
  type: "image" | "video" | "file";
  url: string;
  name?: string;
  size?: number;
  duration?: number;
  width?: number;
  height?: number;
  thumbnailUrl?: string;
  contentType?: string;
}

interface MessageReaction {
  emoji: string;
  count: number;
  userReacted: boolean;
  users: Array<{ id: string; name: string; avatar: string | null }>;
}

interface ChannelMessage {
  id: string;
  channelId: string;
  senderId: string;
  senderType?: string;
  sender: {
    id: string;
    name: string;
    avatar: string | null;
    department: string | null;
    position: string | null;
  };
  content: string;
  messageType: string;
  attachments: MessageAttachment[];
  topicTags: string[];
  sourceChannelName: string | null;
  sourceChannelId: string | null;
  reactions: MessageReaction[];
  replyCount: number;
  replyUsers: Array<{ id: string; name: string; avatar: string | null }>;
  forwardedFromId?: string | null;
  forwardedMessage?: {
    id: string;
    senderName: string;
    senderAvatar: string | null;
    content: string;
    attachments: Array<Record<string, unknown>>;
    channelName: string | null;
    createdAt: string;
  } | null;
  isBookmarked?: boolean;
  isTemp?: boolean;
  createdAt: string;
  replyToId?: string | null;
  threadRootId?: string | null;
}

// ============ Quick Templates ============

const QUICK_TEMPLATES = [
  { name: "公告", icon: "公", description: "重要事项通知或公告", IconComponent: Megaphone },
  { name: "团队", icon: "团", description: "部门或团队的工作和讨论", IconComponent: Users },
  { name: "项目", icon: "项", description: "项目相关的合作和讨论", IconComponent: Folder },
  { name: "帮助", icon: "帮", description: "有关某一主题的帮助、资源和培训", IconComponent: HelpCircle },
];

// ============ Sub Components ============

/** 图片网格展示组件 */
/** 图片预览灯箱 */
function ImageViewer({
  images,
  initialIndex,
  onClose,
}: {
  images: { url: string; name?: string }[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && currentIndex > 0) setCurrentIndex(currentIndex - 1);
      if (e.key === "ArrowRight" && currentIndex < images.length - 1) setCurrentIndex(currentIndex + 1);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, images.length, onClose]);

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < images.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={onClose}
    >
      {/* 关闭按钮 */}
      <button
        type="button"
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition-colors"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
      >
        <X className="w-5 h-5 text-white" />
      </button>

      {/* 计数器 */}
      {images.length > 1 && (
        <div className="absolute top-4 left-4 z-10 text-white/80 text-sm bg-black/50 px-3 py-1.5 rounded-full">
          {currentIndex + 1} / {images.length}
        </div>
      )}

      {/* 左箭头 */}
      {hasPrev && (
        <button
          type="button"
          className="absolute left-4 z-10 w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition-colors"
          onClick={(e) => { e.stopPropagation(); setCurrentIndex(currentIndex - 1); }}
        >
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>
      )}

      {/* 图片 */}
      <img
        src={images[currentIndex].url}
        alt={images[currentIndex].name || ""}
        className="max-w-[90vw] max-h-[85vh] object-contain select-none"
        onClick={(e) => e.stopPropagation()}
      />

      {/* 右箭头 */}
      {hasNext && (
        <button
          type="button"
          className="absolute right-4 z-10 w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition-colors"
          onClick={(e) => { e.stopPropagation(); setCurrentIndex(currentIndex + 1); }}
        >
          <ChevronRight className="w-5 h-5 text-white" />
        </button>
      )}
    </div>
  );
}

/** 带骨架屏的懒加载图片 */
function LazyImage({ src, alt, className, loading = "lazy" }: { src: string; alt: string; className?: string; loading?: "lazy" | "eager" }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  return (
    <div className="relative">
      {!loaded && !error && (
        <div className="absolute inset-0 bg-muted animate-pulse rounded" />
      )}
      {error ? (
        <div className="flex items-center justify-center w-full h-full min-h-[80px] bg-muted/30 rounded text-muted-foreground">
          <ImageOff className="w-5 h-5" />
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          loading={loading}
          onLoad={() => setLoaded(true)}
          onError={() => { setError(true); setLoaded(true); }}
          className={className}
        />
      )}
    </div>
  );
}

function MessageImageGrid({ attachments }: { attachments: MessageAttachment[] }) {
  const images = attachments.filter((a) => a.type === "image");
  const videos = attachments.filter((a) => a.type === "video");
  const allMedia = [...images, ...videos];

  // 图片预览状态
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  // 仅图片列表用于预览（视频不参与灯箱）
  const previewImages = images.map((img) => ({ url: img.url, name: img.name }));

  const handleImageClick = (imageIndex: number) => {
    setViewerIndex(imageIndex);
    setViewerOpen(true);
  };

  if (allMedia.length === 0) return null;

  // 单张图片/视频
  if (allMedia.length === 1) {
    const item = allMedia[0];
    const isVideo = item.type === "video";
    const w = item.width || 0;
    const h = item.height || 0;
    const isPortrait = h > w;
    // 小图判断：宽高均小于200px时以原始尺寸展示
    const isSmall = w > 0 && h > 0 && w < 200 && h < 200;

    return (
      <div className="mt-2">
        <div
          className={cn(
            "relative inline-block rounded-lg overflow-hidden border border-border",
            !isVideo && !isSmall ? "cursor-pointer hover:opacity-90 transition-opacity" : "",
            isSmall
              ? "" // 小图不限制尺寸
              : isPortrait
                ? "max-h-[360px]"
                : "max-w-[360px] max-h-[360px]"
          )}
          onClick={() => { if (!isVideo && !isSmall) handleImageClick(0); }}
        >
          <LazyImage
            src={isVideo ? (item.thumbnailUrl || item.url) : item.url}
            alt=""
            className={cn(
              "object-contain",
              isSmall
                ? "" // 小图原始尺寸
                : isPortrait
                  ? "max-h-[360px] w-auto"
                  : "max-w-[360px] max-h-[360px]"
            )}
          />
          {isVideo && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <div className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center">
                <Play className="w-5 h-5 text-white fill-white" />
              </div>
            </div>
          )}
          {isVideo && item.duration && (
            <span className="absolute bottom-2 left-2 text-xs text-white bg-black/60 px-1.5 py-0.5 rounded">
              {Math.floor(item.duration / 60)}:{String(Math.floor(item.duration % 60)).padStart(2, "0")}
            </span>
          )}
          {/* 图片hover预览提示 */}
          {!isVideo && !isSmall && (
            <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/10">
              <ZoomIn className="w-6 h-6 text-white drop-shadow-md" />
            </div>
          )}
        </div>
        {/* 单图预览灯箱 */}
        {viewerOpen && previewImages.length > 0 && (
          <ImageViewer
            images={previewImages}
            initialIndex={0}
            onClose={() => setViewerOpen(false)}
          />
        )}
      </div>
    );
  }

  // 多张图片/视频网格
  const displayItems = allMedia.slice(0, 9);
  const overflowCount = allMedia.length - 9;
  // 列数逻辑：2张→2列，3张→3列，4张→2列(2×2)，5~9张→3列
  const cols = displayItems.length === 4 ? 2 : (displayItems.length <= 2 ? 2 : 3);

  return (
    <div className="mt-2">
      <div className={cn(
        "grid gap-1.5",
        cols === 2 ? "grid-cols-2 max-w-[420px]" : "grid-cols-3 max-w-[480px]"
      )}>
        {displayItems.map((item, idx) => {
          const isVideo = item.type === "video";
          const isLast = idx === displayItems.length - 1;
          const hasOverflow = overflowCount > 0 && isLast;
          // 计算该 item 在 images 数组中的真实索引（用于预览）
          const imageIndex = item.type === "image" ? images.indexOf(item) : -1;

          return (
            <div
              key={idx}
              className={cn(
                "relative aspect-square rounded-lg overflow-hidden border border-border",
                !isVideo && imageIndex >= 0 ? "cursor-pointer hover:opacity-90 transition-opacity" : ""
              )}
              onClick={() => { if (!isVideo && imageIndex >= 0) handleImageClick(imageIndex); }}
            >
              <LazyImage
                src={isVideo ? (item.thumbnailUrl || item.url) : item.url}
                alt=""
                className="w-full h-full object-cover"
              />
              {isVideo && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                  <div className="w-8 h-8 rounded-full bg-black/50 flex items-center justify-center">
                    <Play className="w-4 h-4 text-white fill-white" />
                  </div>
                </div>
              )}
              {isVideo && item.duration && (
                <span className="absolute bottom-1 left-1 text-[10px] text-white bg-black/60 px-1 py-0.5 rounded">
                  {Math.floor(item.duration / 60)}:{String(Math.floor(item.duration % 60)).padStart(2, "0")}
                </span>
              )}
              {hasOverflow && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <span className="text-white font-medium text-lg">+{overflowCount}</span>
                </div>
              )}
              {/* 图片hover预览提示 */}
              {!isVideo && imageIndex >= 0 && (
                <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/10">
                  <ZoomIn className="w-5 h-5 text-white drop-shadow-md" />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {/* 多图预览灯箱 */}
      {viewerOpen && previewImages.length > 0 && (
        <ImageViewer
          images={previewImages}
          initialIndex={viewerIndex}
          onClose={() => setViewerOpen(false)}
        />
      )}
    </div>
  );
}

/** 根据文件扩展名获取图标和颜色 */
function getFileTypeInfo(fileName: string): { icon: JSX.Element; color: string; label: string } {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  if (["doc", "docx"].includes(ext)) {
    return { icon: <FileText className="w-5 h-5" />, color: "text-blue-500 bg-blue-50", label: "DOCX" };
  }
  if (["xls", "xlsx"].includes(ext)) {
    return { icon: <FileSpreadsheet className="w-5 h-5" />, color: "text-green-600 bg-green-50", label: "XLSX" };
  }
  if (["ppt", "pptx"].includes(ext)) {
    return { icon: <FileType2 className="w-5 h-5" />, color: "text-orange-500 bg-orange-50", label: "PPTX" };
  }
  if (ext === "pdf") {
    return { icon: <FileText className="w-5 h-5" />, color: "text-red-500 bg-red-50", label: "PDF" };
  }
  if (["zip", "rar", "7z"].includes(ext)) {
    return { icon: <FileIcon className="w-5 h-5" />, color: "text-amber-600 bg-amber-50", label: ext.toUpperCase() };
  }
  if (["txt"].includes(ext)) {
    return { icon: <FileText className="w-5 h-5" />, color: "text-muted-foreground bg-muted", label: "TXT" };
  }
  if (["csv"].includes(ext)) {
    return { icon: <FileSpreadsheet className="w-5 h-5" />, color: "text-green-600 bg-green-50", label: "CSV" };
  }
  return { icon: <FileIcon className="w-5 h-5" />, color: "text-muted-foreground bg-muted", label: ext.toUpperCase() || "FILE" };
}

/** 格式化文件大小 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/** 判断文件是否支持浏览器内预览 */
function isPreviewable(name: string, contentType?: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  // PDF
  if (ext === "pdf") return true;
  // 文本类
  if (["txt", "csv", "log", "md", "json", "xml", "html", "css", "js", "ts", "py", "java", "c", "cpp", "h", "sh", "yml", "yaml", "toml", "ini", "conf", "cfg", "env"].includes(ext)) return true;
  // 图片类（contentType 兜底）
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"].includes(ext)) return true;
  // 通过 contentType 判断
  if (contentType?.startsWith("text/")) return true;
  if (contentType === "application/pdf") return true;
  if (contentType?.startsWith("image/")) return true;
  return false;
}

/** 获取预览类型 */
function getPreviewType(name: string, contentType?: string): "pdf" | "text" | "image" | "unknown" {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (ext === "pdf" || contentType === "application/pdf") return "pdf";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"].includes(ext) || contentType?.startsWith("image/")) return "image";
  if (["txt", "csv", "log", "md", "json", "xml", "html", "css", "js", "ts", "py", "java", "c", "cpp", "h", "sh", "yml", "yaml", "toml", "ini", "conf", "cfg", "env"].includes(ext) || contentType?.startsWith("text/")) return "text";
  return "unknown";
}

/** 文件预览弹窗 */
function FilePreviewDialog({
  open,
  onClose,
  attachment,
}: {
  open: boolean;
  onClose: () => void;
  attachment: MessageAttachment;
}) {
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const previewType = getPreviewType(attachment.name || "", attachment.contentType);

  useEffect(() => {
    if (!open || previewType !== "text" || !attachment.url) return;
    setLoading(true);
    setError(false);
    fetch(attachment.url)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch");
        return res.text();
      })
      .then((text) => {
        setTextContent(text);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, [open, previewType, attachment.url]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const fileName = attachment.name || "未命名文件";
  const typeInfo = getFileTypeInfo(fileName);

  const handleDownload = () => {
    if (attachment.url) {
      const link = document.createElement("a");
      link.href = attachment.url;
      link.download = fileName;
      link.target = "_blank";
      link.click();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-background rounded-xl shadow-2xl w-[90vw] max-w-4xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", typeInfo.color)}>
              {typeInfo.icon}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{fileName}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] text-muted-foreground font-medium">{typeInfo.label}</span>
                {attachment.size && (
                  <span className="text-[10px] text-muted-foreground">{formatFileSize(attachment.size)}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-3">
            <button
              type="button"
              onClick={handleDownload}
              className="h-8 px-3 inline-flex items-center gap-1.5 rounded-lg hover:bg-muted transition-colors text-sm text-muted-foreground"
            >
              <Download className="w-4 h-4" />
              下载
            </button>
            <button
              type="button"
              onClick={onClose}
              className="h-8 w-8 inline-flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 预览内容区 */}
        <div className="flex-1 min-h-0 overflow-auto">
          {previewType === "pdf" && (
            <iframe
              src={attachment.url}
              className="w-full h-full min-h-[60vh]"
              title={fileName}
            />
          )}

          {previewType === "image" && (
            <div className="flex items-center justify-center p-6 min-h-[60vh]">
              <img
                src={attachment.url}
                alt={fileName}
                className="max-w-full max-h-[70vh] object-contain rounded-lg"
              />
            </div>
          )}

          {previewType === "text" && (
            <div className="p-4">
              {loading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                  <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin mr-2" />
                  加载中...
                </div>
              ) : error ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <FileIcon className="w-10 h-10 mb-2 opacity-40" />
                  <p className="text-sm">预览加载失败</p>
                  <button
                    type="button"
                    onClick={handleDownload}
                    className="mt-2 text-primary text-sm hover:underline"
                  >
                    下载文件查看
                  </button>
                </div>
              ) : (
                <pre className="text-sm font-mono leading-relaxed whitespace-pre-wrap break-all bg-muted/30 rounded-lg p-4 border border-border/50 overflow-auto max-h-[65vh]">
                  {textContent}
                </pre>
              )}
            </div>
          )}

          {previewType === "unknown" && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <div className={cn("w-16 h-16 rounded-xl flex items-center justify-center mb-3", typeInfo.color)}>
                {typeInfo.icon}
              </div>
              <p className="text-sm font-medium mb-1">{fileName}</p>
              <p className="text-xs mb-3">此文件格式不支持在线预览</p>
              <button
                type="button"
                onClick={handleDownload}
                className="h-8 px-4 inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm"
              >
                <Download className="w-4 h-4" />
                下载文件
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** 单个文件卡片 */
function FileCard({ attachment }: { attachment: MessageAttachment }) {
  const typeInfo = getFileTypeInfo(attachment.name || "");
  const [previewOpen, setPreviewOpen] = useState(false);
  const canPreview = isPreviewable(attachment.name || "", attachment.contentType);

  const handleDownload = () => {
    if (attachment.url) {
      const link = document.createElement("a");
      link.href = attachment.url;
      link.download = attachment.name || "download";
      link.target = "_blank";
      link.click();
    }
  };

  const handleClick = () => {
    if (canPreview) {
      setPreviewOpen(true);
    } else {
      handleDownload();
    }
  };

  return (
    <>
      <div
        className="group flex items-center gap-2.5 px-3 py-2.5 border border-border rounded-lg bg-card hover:bg-muted/30 transition-colors cursor-pointer"
        onClick={handleClick}
      >
        <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", typeInfo.color)}>
          {typeInfo.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{attachment.name || "未命名文件"}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-muted-foreground font-medium">{typeInfo.label}</span>
            {attachment.size && (
              <span className="text-[10px] text-muted-foreground">{formatFileSize(attachment.size)}</span>
            )}
            {canPreview && (
              <span className="text-[10px] text-primary">预览</span>
            )}
          </div>
        </div>
        <Download className="w-4 h-4 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100" />
      </div>
      {/* 预览弹窗 */}
      {canPreview && (
        <FilePreviewDialog
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          attachment={attachment}
        />
      )}
    </>
  );
}

/** 文件附件网格展示 */
function MessageFileGrid({ attachments }: { attachments: MessageAttachment[] }) {
  const files = attachments.filter((a) => a.type === "file");
  if (files.length === 0) return null;

  return (
    <div className="mt-2 grid grid-cols-2 gap-2">
      {files.map((file, idx) => (
        <FileCard key={idx} attachment={file} />
      ))}
    </div>
  );
}

/** 消息表情反应组件 */
/** 常用表情列表（2行×5列） */
const QUICK_EMOJIS = [
  ["👍", "😄", "😂", "😮", "😢"],
  ["😡", "❤️", "🔥", "🎉", "👏"],
];

const EMOJI_CATEGORIES = [
  { name: "完成工作", emojis: ["✌️", "👍", "😶", "✅", "🎯", "💪", "🆗", "👌"] },
  {
    name: "笑脸符号和人员",
    emojis: [
      "😀", "😃", "😄", "😁", "😆", "😅",
      "😂", "😉", "😜", "😳", "😇", "😢",
      "😣", "😩", "😫", "😤", "😥", "😚",
      "😋", "😛", "😝", "😞", "😔", "😌",
      "😒", "😏", "😓", "😪", "😴", "😷",
      "😎", "🥳", "🤔", "🤗", "🤩", "🥺",
      "😏", "🙄", "😬", "🤪", "😵", "🤐",
      "😻", "😼", "😽", "🙀", "😿", "😾",
      "👻", "💩", "👽", "🤖", "💀", "🤡",
    ],
  },
  {
    name: "手势与身体",
    emojis: ["👋", "🤝", "🙌", "👏", "👊", "✊", "🤞", "🤟", "🤘", "🤙", "👈", "👉", "👆", "👇", "☝️", "🫶"],
  },
  {
    name: "动物与自然",
    emojis: ["🐵", "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🌸", "🍀", "🌈", "⭐"],
  },
  {
    name: "符号与物品",
    emojis: ["❤️", "🔥", "💡", "🎉", "🎊", "💰", "💎", "🌟", "✨", "💫", "💯", "🏅", "⚡", "🎵", "📌", "🔔"],
  },
];

/** 表情选择弹出面板 */
function EmojiPicker({
  onSelect,
}: {
  onSelect: (emoji: string) => void;
}) {
  return (
    <div className="w-[296px] max-h-[320px] flex flex-col overflow-hidden rounded-xl">
      <ScrollArea className="flex-1 min-h-0">
        {EMOJI_CATEGORIES.map((category) => (
          <div key={category.name} className="px-2 pb-1.5 pt-1.5 first:pt-2">
            <div className="text-[11px] text-muted-foreground font-medium mb-1">{category.name}</div>
            <div className="grid grid-cols-6 gap-0.5">
              {category.emojis.map((emoji, i) => (
                <button
                  type="button"
                  key={`${category.name}-${i}`}
                  onClick={() => onSelect(emoji)}
                  className="h-8 w-8 inline-flex items-center justify-center rounded hover:bg-muted/80 text-lg transition-colors"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        ))}
      </ScrollArea>
    </div>
  );
}

/** 快捷表情选择面板（2行×5列） */
function QuickEmojiPicker({
  onSelect,
}: {
  onSelect: (emoji: string) => void;
}) {
  return (
    <div className="grid grid-cols-5 gap-1 p-1.5">
      {QUICK_EMOJIS.flat().map((emoji) => (
        <button
          type="button"
          key={emoji}
          onClick={() => onSelect(emoji)}
          className="h-9 w-9 inline-flex items-center justify-center rounded-full hover:bg-muted/80 text-lg transition-colors"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

/** 消息表情反应栏 */
function MessageReactionsBar({
  reactions,
  onToggleReaction,
}: {
  reactions: MessageReaction[];
  onToggleReaction: (emoji: string, userReacted: boolean) => void;
}) {
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);

  // 无反应时也显示"+"按钮，允许用户发起第一个反应
  if (reactions.length === 0) {
    return (
      <div className="mt-1.5">
        <Popover open={emojiPickerOpen} onOpenChange={setEmojiPickerOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center justify-center w-6 h-6 rounded-full border border-dashed border-border hover:bg-muted/50 text-muted-foreground transition-colors"
            >
              <Plus className="w-3 h-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            side="top"
            align="start"
            sideOffset={4}
            collisionPadding={8}
            className="w-auto p-0 rounded-xl shadow-lg border"
          >
            <QuickEmojiPicker
              onSelect={(emoji) => {
                onToggleReaction(emoji, false);
                setEmojiPickerOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 mt-1.5 flex-wrap">
      {reactions.map((reaction) => (
        <button
          type="button"
          key={reaction.emoji}
          onClick={() => onToggleReaction(reaction.emoji, reaction.userReacted)}
          className={cn(
            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs border transition-colors",
            reaction.userReacted
              ? "bg-primary/15 border-primary/30 text-primary"
              : "bg-muted/50 border-border hover:bg-muted"
          )}
        >
          <span>{reaction.emoji}</span>
          <span className="font-medium">{reaction.count}</span>
        </button>
      ))}
      <Popover open={emojiPickerOpen} onOpenChange={setEmojiPickerOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center justify-center w-6 h-6 rounded-full border border-dashed border-border hover:bg-muted/50 text-muted-foreground transition-colors"
          >
            <Plus className="w-3 h-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="start"
          sideOffset={4}
          collisionPadding={8}
          className="w-auto p-0 rounded-xl shadow-lg border"
        >
          <QuickEmojiPicker
            onSelect={(emoji) => {
              onToggleReaction(emoji, false);
              setEmojiPickerOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** 消息底部操作栏（常驻内嵌） */
function MessageActionRow({
  replyCount,
  replyUsers,
  onOpenThread,
  onToggleReaction,
  onDelete,
  onForward,
  onBookmark,
  isOwner,
  isBookmarked,
  content,
}: {
  replyCount: number;
  replyUsers: { id: string; name: string; avatar: string | null }[];
  onOpenThread: () => void;
  onToggleReaction: (emoji: string) => void;
  onDelete?: () => void;
  onForward?: () => void;
  onBookmark?: () => void;
  isOwner?: boolean;
  isBookmarked?: boolean;
  content?: string;
}) {
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);

  return (
    <div className="flex items-center gap-1">
      {/* 回复按钮 */}
      {replyCount > 0 ? (
        <button
          type="button"
          onClick={onOpenThread}
          className="flex items-center gap-1 text-xs text-primary/80 hover:text-primary transition-colors"
        >
          {replyUsers.length > 0 && (
            <div className="flex -space-x-1.5">
              {replyUsers.slice(0, Math.min(3, replyUsers.length)).map((u) => (
                <UserAvatar key={u.id} avatarKey={u.avatar} name={u.name} className="w-5 h-5 border-[1.5px] border-background" fallbackClassName="text-[7px] bg-muted" />
              ))}
              {replyCount > 3 && (
                <div className="w-5 h-5 rounded-full bg-muted-foreground/70 flex items-center justify-center border-[1.5px] border-background shrink-0">
                  <span className="text-[8px] text-white font-medium leading-none">
                    {replyCount - 3 > 99 ? "99+" : `+${replyCount - 3}`}
                  </span>
                </div>
              )}
            </div>
          )}
          <span className="font-medium">{replyCount}条回复</span>
          <ChevronRightIcon className="w-3.5 h-3.5 text-primary/60" />
        </button>
      ) : (
        <button
          type="button"
          onClick={onOpenThread}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-1.5 py-1 rounded hover:bg-muted/60"
          title="回复"
        >
          <MessageSquare className="w-3.5 h-3.5" />
        </button>
      )}

      {/* 表情反应 */}
      <Popover open={emojiPickerOpen} onOpenChange={setEmojiPickerOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-1.5 py-1 rounded hover:bg-muted/60"
            title="添加表情"
          >
            <Smile className="w-3.5 h-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="start"
          sideOffset={4}
          className="w-auto p-0 rounded-xl shadow-md"
        >
          <EmojiPicker
            onSelect={(emoji) => {
              onToggleReaction(emoji);
              setEmojiPickerOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>

      {/* 转发 */}
      <button
        type="button"
        onClick={onForward}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-1.5 py-1 rounded hover:bg-muted/60"
        title="转发"
      >
        <Forward className="w-3.5 h-3.5" />
      </button>

      {/* 收藏 */}
      <button
        type="button"
        onClick={onBookmark}
        className={cn(
          "flex items-center gap-1 text-xs transition-colors px-1.5 py-1 rounded hover:bg-muted/60",
          isBookmarked ? "text-primary" : "text-muted-foreground hover:text-foreground"
        )}
        title={isBookmarked ? "取消收藏" : "收藏"}
      >
        {isBookmarked ? <BookmarkCheck className="w-3.5 h-3.5" /> : <Bookmark className="w-3.5 h-3.5" />}
      </button>

      {/* 更多 */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center text-xs text-muted-foreground hover:text-foreground transition-colors px-1.5 py-1 rounded hover:bg-muted/60"
            title="更多"
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[120px]">
          <DropdownMenuItem onClick={onBookmark}>
            {isBookmarked ? <BookmarkCheck className="w-3.5 h-3.5 mr-2 text-primary" /> : <Bookmark className="w-3.5 h-3.5 mr-2" />}
            {isBookmarked ? "取消收藏" : "收藏消息"}
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Link2 className="w-3.5 h-3.5 mr-2" />
            复制链接
          </DropdownMenuItem>
          {content && (
            <>
              <DropdownMenuItem onClick={() => { navigator.clipboard.writeText(content); }}>
                <Copy className="w-3.5 h-3.5 mr-2" />
                复制
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => {
                const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                const name = content.replace(/[#*`\[\]]/g, "").trim().slice(0, 30).replace(/\s+/g, "_");
                a.download = `${name || "文档"}.md`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }}>
                <FileText className="w-3.5 h-3.5 mr-2" />
                下载为 Markdown
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => {
                const html = content
                  .replace(/^### (.+)$/gm, "<h3>$1</h3>")
                  .replace(/^## (.+)$/gm, "<h2>$1</h2>")
                  .replace(/^# (.+)$/gm, "<h1>$1</h1>")
                  .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
                  .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
                  .replace(/`([^`]+)`/g, "<code>$1</code>")
                  .replace(/^- (.+)$/gm, "<li>$1</li>")
                  .replace(/\n{2,}/g, "</p><p>")
                  .replace(/\n/g, "<br/>");
                const fullHtml = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8"><style>body{font-family:宋体;font-size:12pt;line-height:1.8;padding:20pt}h1{font-size:18pt;margin:16pt 0 6pt;border-bottom:1px solid #ddd}h2{font-size:15pt;margin:12pt 0 5pt}h3{font-size:13pt;margin:10pt 0 4pt}p{margin:6pt 0}code,pre{background:#f4f4f4;padding:2pt 4pt;font-size:10pt;font-family:Consolas,monospace}pre{padding:8pt;border:1px solid #ddd;border-radius:4pt}li{margin:2pt 0}</style></head><body>${html}</body></html>`;
                const blob = new Blob(["\ufeff" + fullHtml], { type: "application/msword" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                const name = content.replace(/[#*`\[\]]/g, "").trim().slice(0, 30).replace(/\s+/g, "_");
                a.download = `${name || "文档"}.doc`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }}>
                <Download className="w-3.5 h-3.5 mr-2" />
                下载为 Word
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          {isOwner && onDelete && (
            <DropdownMenuItem className="text-destructive" onClick={onDelete}>
              <Trash2 className="w-3.5 h-3.5 mr-2" />
              删除消息
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** 频道消息项组件 */
function ChannelMessageItem({
  message: msg,
  collapsedMessages,
  onToggleCollapsed,
  onOpenThread,
  onToggleReaction,
  onNavigateToChannel,
  onNavigateToDM,
  formatTime,
  onDelete,
  onForward,
  onBookmark,
  currentUserId,
  teamId,
}: {
  message: ChannelMessage;
  collapsedMessages: Set<string>;
  onToggleCollapsed: (id: string) => void;
  onOpenThread: (msg: ChannelMessage) => void;
  onToggleReaction: (messageId: string, emoji: string, userReacted: boolean) => void;
  onNavigateToChannel?: (channelId: string) => void;
  onNavigateToDM?: (userId: string, userName: string, userAvatar: string | null, senderType: string) => void;
  formatTime: (dateStr: string) => string;
  onDelete?: (messageId: string) => void;
  onForward?: (msg: ChannelMessage) => void;
  onBookmark?: (messageId: string) => void;
  currentUserId?: string;
  teamId?: string;
}) {
  const isCollapsed = !collapsedMessages.has(msg.id);
  const isLongContent = msg.content.length > 300;
  const displayContent = isLongContent && isCollapsed
    ? sanitizeContent(msg.content).slice(0, 300) + "..."
    : sanitizeContent(msg.content);

  // 防御性检查：确保 sender 存在
  const sender = msg.sender || { id: msg.senderId || "", name: "未知用户", avatar: null, department: null, position: null };

  // 智能体反馈状态 - 从 localStorage 恢复
  const feedbackStorageKey = `agent-feedback-${msg.id}`;
  const [agentFeedback, setAgentFeedback] = useState<"none" | "liked" | "disliked">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(feedbackStorageKey);
      if (saved === "liked" || saved === "disliked") return saved;
    }
    return "none";
  });
  const [agentShowCorrection, setAgentShowCorrection] = useState(false);
  const [agentCorrection, setAgentCorrection] = useState("");
  const [agentSubmitting, setAgentSubmitting] = useState(false);

  // 持久化反馈状态到 localStorage
  useEffect(() => {
    if (agentFeedback !== "none") {
      localStorage.setItem(feedbackStorageKey, agentFeedback);
    }
  }, [agentFeedback, feedbackStorageKey]);

  // 富文本渲染：支持粗体、斜体、删除线、行内代码、链接、话题标签
  const renderContent = (text: string) => {
    // 先处理行级格式（标题、引用、列表），再处理内联格式
    const lines = text.split("\n");
    const elements: JSX.Element[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const isLastLine = i === lines.length - 1;

      // 标题渲染 (## / ### / ####)
      const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const headingText = headingMatch[2];
        const headingClass =
          level === 1 ? "text-lg font-bold mt-3 mb-1.5" :
          level === 2 ? "text-base font-semibold mt-2.5 mb-1" :
          level === 3 ? "text-sm font-semibold mt-2 mb-0.5" :
          "text-sm font-medium mt-1.5 mb-0.5 text-muted-foreground";
        elements.push(
          <div key={i} className={headingClass}>
            {renderInlineContent(headingText)}
          </div>
        );
        i++;
        continue;
      }

      // 引用块（多行合并，持续到新章节标题/分隔线为止）
      if (line.startsWith("> ")) {
        const quoteLines: string[] = [];
        // 第一行去掉 > 前缀
        quoteLines.push(line.slice(2));
        i++;
        // 收集后续所有引用内容，直到遇到章节标题或分隔线
        while (i < lines.length) {
          const trimmed = lines[i].trim();
          // 遇到 Markdown 标题或分隔线 → 引用块结束
          if (/^#{1,6}\s/.test(trimmed) || trimmed === "---" || trimmed === "___" || trimmed === "***") {
            break;
          }
          // 遇到空行后，检查下一非空行是否为新章节
          if (trimmed === "") {
            let j = i + 1;
            while (j < lines.length && lines[j].trim() === "") { j++; }
            if (j < lines.length) {
              const next = lines[j].trim();
              // 下一非空行是标题/分隔线 → 结束引用
              if (/^#{1,6}\s/.test(next) || next === "---" || next === "___" || next === "***") {
                break;
              }
              // 下一非空行不是编号项也不是续行(无数字开头) → 新章节，结束引用
              if (!/^\d+\./.test(next) && !/^[-*]\s/.test(next)) {
                break;
              }
            }
            // 空行仍属于引用
            quoteLines.push(lines[i]);
            i++;
            continue;
          }
          // 非空行：保留到引用块中
          if (lines[i].startsWith("> ")) {
            quoteLines.push(lines[i].slice(2));
          } else {
            quoteLines.push(lines[i]);
          }
          i++;
        }
        elements.push(
          <div key={"quote-" + i} className="border-l-2 border-primary/40 pl-3 py-1.5 my-1.5 text-muted-foreground bg-primary/5 rounded-r">
            {quoteLines.map((qLine, qIdx) => (
              <span key={qIdx}>
                {renderInlineContent(qLine)}
                {qIdx < quoteLines.length - 1 && <br />}
              </span>
            ))}
          </div>
        );
        continue;
      }

      // 无序列表
      if (/^- /.test(line)) {
        elements.push(
          <div key={i} className="flex gap-2 my-0.5">
            <span className="text-muted-foreground shrink-0">•</span>
            <span>{renderInlineContent(line.slice(2))}</span>
          </div>
        );
        i++;
        continue;
      }

      // 有序列表
      const olMatch = line.match(/^(\d+)\.\s(.*)$/);
      if (olMatch) {
        elements.push(
          <div key={i} className="flex gap-2 my-0.5">
            <span className="text-muted-foreground shrink-0 tabular-nums">{olMatch[1]}.</span>
            <span>{renderInlineContent(olMatch[2])}</span>
          </div>
        );
        i++;
        continue;
      }

      // 分隔线 (---)
      if (/^---+$/.test(line.trim())) {
        elements.push(<hr key={i} className="my-2 border-border/60" />);
        i++;
        continue;
      }

      // 普通文本行
      const lineElement = renderInlineContent(line);
      const lineBody = isLastLine ? lineElement : <>{lineElement}<br /></>;
      elements.push(<span key={i}>{lineBody}</span>);
      i++;
    }

    return elements;
  };

  // 内联格式渲染：@提及、粗体、斜体、删除线、行内代码、链接、话题标签
  const renderInlineContent = (text: string): JSX.Element[] => {
    // 匹配顺序：行内代码 > @提及 > 图片 > 链接 > 粗体 > 斜体 > 删除线 > 话题标签
    const regex = /(`[^`]+`)|(@\[([^\]]+)\]\(([^)]+)\))|(!\[([^\]]*)\]\(([^)]+)\))|(\[([^\]]+)\]\(([^)]+)\))|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(~~[^~]+~~)|(#\S+)/g;
    const parts: JSX.Element[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let keyIdx = 0;

    while ((match = regex.exec(text)) !== null) {
      // 匹配前的普通文本
      if (match.index > lastIndex) {
        parts.push(<span key={keyIdx++}>{text.slice(lastIndex, match.index)}</span>);
      }

      const fullMatch = match[0];

      if (match[1]) {
        // 行内代码 `code`
        parts.push(
          <code key={keyIdx++} className="bg-muted px-1.5 py-0.5 rounded text-[13px] font-mono text-primary/80">
            {fullMatch.slice(1, -1)}
          </code>
        );
      } else if (match[2]) {
        // @提及 @[name](userId)
        parts.push(
          <span key={keyIdx++} className="text-primary font-medium cursor-pointer hover:underline">
            @{match[3]}
          </span>
        );
      } else if (match[5]) {
        // 图片 ![alt](url)
        const imgSrc = match[7];
        const imgAlt = match[6] || "图片";
        parts.push(
          <span key={keyIdx++} className="block my-2">
            <img
              src={imgSrc}
              alt={imgAlt}
              className="max-w-full rounded-lg border border-border/60"
              style={{ maxHeight: 400 }}
              loading="lazy"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
                (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
              }}
            />
            <span className="hidden text-xs text-muted-foreground mt-1">图片加载失败：<a href={imgSrc} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">查看原图</a></span>
          </span>
        );
      } else if (match[8]) {
        // 链接 [text](url)
        parts.push(
          <a key={keyIdx++} href={match[10]} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
            {match[9]}
          </a>
        );
      } else if (match[11]) {
        // 粗体 **text**
        parts.push(<strong key={keyIdx++} className="font-semibold">{fullMatch.slice(2, -2)}</strong>);
      } else if (match[12]) {
        // 斜体 *text*
        parts.push(<em key={keyIdx++}>{fullMatch.slice(1, -1)}</em>);
      } else if (match[13]) {
        // 删除线 ~~text~~
        parts.push(<del key={keyIdx++} className="text-muted-foreground">{fullMatch.slice(2, -2)}</del>);
      } else if (match[14]) {
        // 话题标签 #tag
        parts.push(
          <span key={keyIdx++} className="text-primary cursor-pointer hover:underline">
            {fullMatch}
          </span>
        );
      }

      lastIndex = match.index + fullMatch.length;
    }

    // 剩余文本
    if (lastIndex < text.length) {
      parts.push(<span key={keyIdx++}>{text.slice(lastIndex)}</span>);
    }

    return parts;
  };

  // 智能体反馈处理
  const handleAgentFeedback = async (rating: number) => {
    if (agentSubmitting || !teamId || !currentUserId) return;
    if (rating === 5) {
      // 有用 → 点赞
      setAgentFeedback("liked");
    } else {
      // 需改进 → 显示修正输入框
      setAgentFeedback("disliked");
      setAgentShowCorrection(true);
      return;
    }
    setAgentSubmitting(true);
    try {
      await fetch("/api/agents/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: msg.senderId,
          teamId,
          userId: currentUserId,
          rating,
          source: "channel",
          messageId: msg.id,
        }),
      });
    } catch (err) {
      console.error("提交反馈失败:", err);
    } finally {
      setAgentSubmitting(false);
    }
  };

  const submitAgentCorrection = async () => {
    if (!teamId || !currentUserId) return;
    setAgentSubmitting(true);
    try {
      await fetch("/api/agents/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: msg.senderId,
          teamId,
          userId: currentUserId,
          rating: 1,
          correction: agentCorrection.trim(),
          source: "channel",
          messageId: msg.id,
        }),
      });
      setAgentShowCorrection(false);
      setAgentCorrection("");
      setAgentFeedback("liked");
    } catch (err) {
      console.error("提交修正失败:", err);
    } finally {
      setAgentSubmitting(false);
    }
  };

  return (
    <div id={`msg-${msg.id}`} className="group relative px-4 py-1.5 transition-colors hover:bg-muted/20">
      <div className="flex gap-2.5">
        {/* 左列：头像 */}
        <div className="shrink-0 pt-0.5">
          {msg.senderType === "agent" ? (
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center cursor-pointer" onClick={() => onNavigateToDM?.(msg.senderId!, sender.name, sender.avatar, msg.senderType || "user")}>
              <Bot className="w-4 h-4 text-primary" />
            </div>
          ) : (
            <div className="cursor-pointer" onClick={() => onNavigateToDM?.(msg.senderId!, sender.name, sender.avatar, msg.senderType || "user")}>
              <UserAvatar avatarKey={sender.avatar} name={sender.name} className="w-8 h-8" fallbackClassName="text-xs" />
            </div>
          )}
        </div>

        {/* 右列：名称 + 内容卡片 + 操作区 */}
        <div className="flex-1 min-w-0">
          {/* 名称行 */}
          <div className="flex items-center gap-1.5 h-5">
            <span className="text-sm font-medium text-foreground cursor-pointer hover:underline leading-none" onClick={() => onNavigateToDM?.(msg.senderId!, sender.name, sender.avatar, msg.senderType || "user")}>{sender.name}</span>
            {msg.senderType === "agent" && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-primary bg-primary/10 px-1 py-0.5 rounded leading-none">
                <Bot className="w-2.5 h-2.5" />智能体
              </span>
            )}
            <span className="text-[11px] text-muted-foreground/60 leading-none">{formatTime(msg.createdAt)}</span>
            {msg.sourceChannelName && msg.sourceChannelId && (
              <span className="text-[11px] text-muted-foreground/60 leading-none">
                来自 [
                <button type="button" className="text-primary hover:underline" onClick={() => onNavigateToChannel?.(msg.sourceChannelId!)}>
                  {msg.sourceChannelName}
                </button>
                ]
              </span>
            )}
          </div>

          {/* 白色圆角内容卡片 */}
          <div className="max-w-[70%] mt-1">
            <div className="bg-white rounded-xl p-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.06),0_1px_2px_-1px_rgba(0,0,0,0.04)]">
              {/* 消息内容 */}
              {msg.content && (
                <div className={cn(
                  "text-sm whitespace-pre-wrap leading-relaxed",
                  msg.senderType === "agent" && ""
                )}>
                  {renderContent(displayContent)}
                  {isLongContent && (
                    <button onClick={() => onToggleCollapsed(msg.id)} className="text-primary text-sm hover:underline ml-1">
                      {isCollapsed ? "展开全文" : "收起"}
                    </button>
                  )}
                </div>
              )}

              {/* 文档卡片（仅智能体消息） */}
              {msg.senderType === "agent" && isDocumentContent(msg.content) && (
                <DocCard content={msg.content} />
              )}
              {msg.senderType === "agent" && isDocumentContent(msg.content) && (
                <div className="mt-2">
                  <SubmitApprovalButton
                    teamId={teamId || ""}
                    userId={currentUserId || ""}
                    sessionId={msg.id}
                    sourceId={msg.id}
                    title={(() => {
                      const lines = (msg.content || "").split("\n").map(l => l.trim()).filter(Boolean);
                      for (const l of lines) {
                        const m = l.match(/^#{1,4}\s+(.+)/);
                        if (m) return m[1].trim();
                      }
                      return "方案审批";
                    })()}
                    draft={{ content: msg.content }}
                    taskType="方案审批"
                    description="智能体生成的方案，等待审批确认"
                  />
                </div>
              )}

              {/* 话题标签 */}
              {msg.topicTags && msg.topicTags.length > 0 && (
                <div className="flex items-center gap-1 mt-1.5">
                  {msg.topicTags.map((tag) => (
                    <span key={tag} className="text-xs text-primary bg-primary/5 px-1.5 py-0.5 rounded cursor-pointer hover:bg-primary/10">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              {/* 转发消息引用 */}
              {msg.forwardedFromId && msg.forwardedMessage && (() => {
                const fwd = msg.forwardedMessage;
                const fwdImageAttachments = (fwd.attachments || [])
                  .filter((a) => a.type === "image" || a.type === "video")
                  .map((a) => {
                    const att = a as Record<string, unknown>;
                    return {
                      type: (att.type as "image" | "video" | "file") || "image",
                      url: (att.url as string) || "",
                      name: (att.name as string) || undefined,
                      size: (att.size as number) || undefined,
                      duration: (att.duration as number) || undefined,
                      width: (att.width as number) || undefined,
                      height: (att.height as number) || undefined,
                      thumbnailUrl: (att.thumbnailUrl as string) || undefined,
                      contentType: (att.contentType as string) || undefined,
                    } as MessageAttachment;
                  });
                const fwdFileAttachments = (fwd.attachments || [])
                  .filter((a) => a.type === "file")
                  .map((a) => {
                    const att = a as Record<string, unknown>;
                    return {
                      type: "file" as const,
                      url: (att.url as string) || "",
                      name: (att.name as string) || undefined,
                      size: (att.size as number) || undefined,
                      contentType: (att.contentType as string) || undefined,
                    } as MessageAttachment;
                  });
                const hasMedia = fwdImageAttachments.length > 0;
                const hasFiles = fwdFileAttachments.length > 0;

                return (
                  <div className="mt-2 rounded-lg border border-border/60 bg-muted/15 overflow-hidden">
                    <div className="flex items-center gap-1.5 px-3 pt-2.5 pb-1">
                      <Forward className="w-3 h-3 text-muted-foreground" />
                      <span className="text-[11px] text-muted-foreground font-medium">转发的消息</span>
                    </div>
                    <div className="px-3 pb-2.5">
                      <div className="flex gap-2.5">
                        <UserAvatar avatarKey={fwd.senderAvatar} name={fwd.senderName} className="w-9 h-9 shrink-0" fallbackClassName="text-xs" />
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-sm leading-none">{fwd.senderName}</span>
                          {fwd.content && (
                            <div className="mt-1 text-sm whitespace-pre-wrap leading-relaxed text-foreground/80">
                              {renderContent(fwd.content.length > 300 ? fwd.content.slice(0, 300) + "..." : fwd.content)}
                            </div>
                          )}
                          {hasMedia && (
                            <div className="mt-1">
                              <MessageImageGrid attachments={fwdImageAttachments} />
                            </div>
                          )}
                          {hasFiles && (
                            <div className="mt-1">
                              <MessageFileGrid attachments={fwdFileAttachments} />
                            </div>
                          )}
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <span className="text-[11px] text-muted-foreground">{formatTime(fwd.createdAt)}</span>
                            {fwd.channelName && (
                              <span className="text-[11px] text-muted-foreground">来自 [{fwd.channelName}]</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* 图片/视频 */}
              {msg.attachments && msg.attachments.length > 0 && (
                <MessageImageGrid attachments={msg.attachments} />
              )}

              {/* 文件 */}
              {msg.attachments && msg.attachments.length > 0 && (
                <MessageFileGrid attachments={msg.attachments} />
              )}
            </div>

            {/* 操作栏：hover 显示 */}
            <div className="flex items-center gap-1 mt-1 h-6 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
              <MessageActionRow
                replyCount={msg.replyCount}
                replyUsers={msg.replyUsers}
                onOpenThread={() => onOpenThread(msg)}
                onToggleReaction={(emoji) => onToggleReaction(msg.id, emoji, false)}
                onDelete={onDelete ? () => onDelete(msg.id) : undefined}
                onForward={onForward ? () => onForward(msg) : undefined}
                onBookmark={onBookmark ? () => onBookmark(msg.id) : undefined}
                isOwner={currentUserId === msg.senderId}
                isBookmarked={msg.isBookmarked}
                content={msg.content}
              />
            </div>

            {/* 表情反应（始终显示） */}
            {msg.reactions.length > 0 && (
              <div className="mt-1">
                <MessageReactionsBar
                  reactions={msg.reactions}
                  onToggleReaction={(emoji, userReacted) => onToggleReaction(msg.id, emoji, userReacted)}
                />
              </div>
            )}

            {/* 回复计数 */}
            {msg.replyCount > 0 && (
              <button
                type="button"
                onClick={() => onOpenThread(msg)}
                className="flex items-center gap-1.5 text-xs text-primary/80 hover:text-primary transition-colors mt-1"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span className="font-medium">{msg.replyCount} 条回复</span>
                <ChevronRightIcon className="w-3 h-3 text-primary/50" />
              </button>
            )}

            {/* 智能体输出评价 */}
            {msg.senderType === "agent" && (
              <div className="mt-2 pt-2 border-t border-border/40">
                {agentFeedback === "none" ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">评价此回复：</span>
                    <button
                      type="button"
                      onClick={() => handleAgentFeedback(5)}
                      disabled={agentSubmitting}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-emerald-500 transition-colors disabled:opacity-50"
                    >
                      <ThumbsUp className="w-3.5 h-3.5" />
                      <span>有用</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAgentFeedback(1)}
                      disabled={agentSubmitting}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-amber-500 transition-colors disabled:opacity-50"
                    >
                      <ThumbsDown className="w-3.5 h-3.5" />
                      <span>需改进</span>
                    </button>
                  </div>
                ) : agentFeedback === "liked" ? (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-500">
                    <ThumbsUp className="w-3.5 h-3.5" />
                    <span>已评价</span>
                  </div>
                ) : agentFeedback === "disliked" && !agentShowCorrection ? (
                  <div className="flex items-center gap-1.5 text-xs text-amber-500">
                    <ThumbsDown className="w-3.5 h-3.5" />
                    <span>已评价</span>
                  </div>
                ) : null}
                {agentShowCorrection && (
                  <div className="mt-2 space-y-2">
                    <textarea
                      value={agentCorrection}
                      onChange={(e) => setAgentCorrection(e.target.value)}
                      placeholder="请描述期望的改进方向或正确答案..."
                      className="w-full min-h-[60px] text-xs rounded-lg border border-border bg-muted/30 p-2 resize-none focus:outline-none focus:ring-1 focus:ring-primary/40"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => { setAgentShowCorrection(false); setAgentFeedback("none"); setAgentCorrection(""); }}
                        className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-1"
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        onClick={submitAgentCorrection}
                        disabled={agentSubmitting || !agentCorrection.trim()}
                        className="text-[10px] bg-primary text-primary-foreground px-2.5 py-1 rounded-md hover:opacity-90 disabled:opacity-50"
                      >
                        {agentSubmitting ? "提交中..." : "提交"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 回复线程中的消息项 */
function ThreadMessageItem({
  message: msg,
  formatTime,
  onNavigateToChannel,
  onNavigateToDM,
  isRoot = false,
}: {
  message: ChannelMessage;
  formatTime: (dateStr: string) => string;
  onNavigateToChannel?: (channelId: string) => void;
  onNavigateToDM?: (userId: string, userName: string, userAvatar: string | null, senderType: string) => void;
  isRoot?: boolean;
}) {
  // 防御性检查：确保 sender 存在
  const sender = msg.sender || { id: msg.senderId || "", name: "未知用户", avatar: null, department: null, position: null };

  // 富文本渲染：支持粗体、斜体、删除线、行内代码、链接、话题标签
  const renderContent = (text: string) => {
    const lines = text.split("\n");
    return lines.map((line, lineIdx) => {
      const isLastLine = lineIdx === lines.length - 1;
      const lineElement = renderInlineContent(line);
      const lineBody = isLastLine ? lineElement : <>{lineElement}<br /></>;

      if (line.startsWith("> ")) {
        return (
          <div key={lineIdx} className="border-l-2 border-primary/40 pl-3 py-0.5 my-1 text-muted-foreground bg-primary/5 rounded-r">
            {renderInlineContent(line.slice(2))}
          </div>
        );
      }
      if (/^- /.test(line)) {
        return (
          <div key={lineIdx} className="flex gap-2 my-0.5">
            <span className="text-muted-foreground shrink-0">•</span>
            <span>{renderInlineContent(line.slice(2))}</span>
          </div>
        );
      }
      const olMatch = line.match(/^(\d+)\.\s(.*)$/);
      if (olMatch) {
        return (
          <div key={lineIdx} className="flex gap-2 my-0.5">
            <span className="text-muted-foreground shrink-0 tabular-nums">{olMatch[1]}.</span>
            <span>{renderInlineContent(olMatch[2])}</span>
          </div>
        );
      }
      return <span key={lineIdx}>{lineBody}</span>;
    });
  };

  const renderInlineContent = (text: string): JSX.Element[] => {
    const regex = /(`[^`]+`)|(@\[([^\]]+)\]\(([^)]+)\))|(!\[([^\]]*)\]\(([^)]+)\))|(\[([^\]]+)\]\(([^)]+)\))|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(~~[^~]+~~)|(#\S+)/g;
    const parts: JSX.Element[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let keyIdx = 0;
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(<span key={keyIdx++}>{text.slice(lastIndex, match.index)}</span>);
      }
      const fullMatch = match[0];
      if (match[1]) {
        parts.push(
          <code key={keyIdx++} className="bg-muted px-1.5 py-0.5 rounded text-[13px] font-mono text-primary/80">
            {fullMatch.slice(1, -1)}
          </code>
        );
      } else if (match[2]) {
        parts.push(
          <span key={keyIdx++} className="text-primary font-medium cursor-pointer hover:underline">
            @{match[3]}
          </span>
        );
      } else if (match[5]) {
        // 图片 ![alt](url)
        const imgSrc = match[7];
        const imgAlt = match[6] || "图片";
        parts.push(
          <span key={keyIdx++} className="block my-2">
            <img
              src={imgSrc}
              alt={imgAlt}
              className="max-w-full rounded-lg border border-border/60"
              style={{ maxHeight: 400 }}
              loading="lazy"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
                (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
              }}
            />
            <span className="hidden text-xs text-muted-foreground mt-1">图片加载失败：<a href={imgSrc} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">查看原图</a></span>
          </span>
        );
      } else if (match[8]) {
        parts.push(
          <a key={keyIdx++} href={match[10]} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
            {match[9]}
          </a>
        );
      } else if (match[11]) {
        parts.push(<strong key={keyIdx++} className="font-semibold">{fullMatch.slice(2, -2)}</strong>);
      } else if (match[9]) {
        parts.push(<em key={keyIdx++}>{fullMatch.slice(1, -1)}</em>);
      } else if (match[10]) {
        parts.push(<del key={keyIdx++} className="text-muted-foreground">{fullMatch.slice(2, -2)}</del>);
      } else if (match[11]) {
        parts.push(
          <span key={keyIdx++} className="text-primary cursor-pointer hover:underline">
            {fullMatch}
          </span>
        );
      }
      lastIndex = match.index + fullMatch.length;
    }
    if (lastIndex < text.length) {
      parts.push(<span key={keyIdx++}>{text.slice(lastIndex)}</span>);
    }
    return parts;
  };

  return (
    <div className={cn(
      "flex gap-2.5",
      isRoot ? "py-0" : "py-1"
    )}>
      {msg.senderType === "agent" ? (
        <div className={cn("rounded-lg bg-primary/10 flex items-center justify-center shrink-0 cursor-pointer", isRoot ? "w-9 h-9" : "w-8 h-8")} onClick={() => onNavigateToDM?.(msg.senderId!, sender.name, sender.avatar, msg.senderType || "user")}>
          <Bot className={cn("text-primary", isRoot ? "w-4.5 h-4.5" : "w-4 h-4")} />
        </div>
      ) : (
        <div className="cursor-pointer shrink-0" onClick={() => onNavigateToDM?.(msg.senderId!, sender.name, sender.avatar, msg.senderType || "user")}>
          <UserAvatar avatarKey={sender.avatar} name={sender.name} className={cn("shrink-0", isRoot ? "w-9 h-9" : "w-8 h-8")} fallbackClassName={isRoot ? "text-xs" : "text-[10px]"} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={cn("font-medium leading-none cursor-pointer hover:underline text-primary", isRoot ? "text-sm" : "text-[13px]")} onClick={() => onNavigateToDM?.(msg.senderId!, sender.name, sender.avatar, msg.senderType || "user")}>{sender.name}</span>
          {msg.senderType === "agent" && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-primary bg-primary/10 px-1 py-0 rounded">
              <Bot className="w-2.5 h-2.5" />智能体
            </span>
          )}
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[11px] text-muted-foreground">{formatTime(msg.createdAt)}</span>
            {msg.sourceChannelName && msg.sourceChannelId && (
              <span className="text-[11px] text-muted-foreground">
                来自 [
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => onNavigateToChannel?.(msg.sourceChannelId!)}
                >
                  {msg.sourceChannelName}
                </button>
                ]
              </span>
            )}
          </div>
        </div>
        {msg.content && (
          <div className={cn("text-sm whitespace-pre-wrap leading-relaxed text-foreground/90", isRoot ? "mt-1.5" : "mt-1")}>
            {renderContent(msg.content)}
          </div>
        )}
        {/* 图片展示 */}
        {msg.attachments && msg.attachments.length > 0 && (
          <MessageImageGrid attachments={msg.attachments} />
        )}
        {/* 文件展示 */}
        {msg.attachments && msg.attachments.length > 0 && (
          <MessageFileGrid attachments={msg.attachments} />
        )}
      </div>
    </div>
  );
}

/** 创建分区弹窗 */
function CreateSectionDialog({
  open,
  onClose,
  teamId,
  userId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  teamId: string;
  userId: string;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/channels/sections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, name: name.trim(), createdBy: userId }),
      });
      const data = await res.json();
      if (data.success) {
        setName("");
        onCreated();
        onClose();
      }
    } catch (err) {
      console.error("创建分区失败:", err);
    }
    setLoading(false);
  };

  const handleTemplate = async (templateName: string) => {
    setName(templateName);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>创建分区</DialogTitle>
          <DialogDescription className="sr-only">输入名称创建新分区</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* 名称输入 */}
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shrink-0">
              <span className="text-primary-foreground font-medium text-sm">
                {name ? name.charAt(0) : "C"}
              </span>
            </div>
            <Input
              placeholder="分区的名称"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
              }}
            />
          </div>

          {/* 快速创建模板 */}
          <div>
            <p className="text-xs text-muted-foreground mb-2">快速创建分区</p>
            <div className="space-y-1">
              {QUICK_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.name}
                  onClick={() => handleTemplate(tpl.name)}
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted/50 rounded-lg transition-colors text-left"
                >
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
                    <span className="text-primary-foreground text-xs font-medium">{tpl.icon}</span>
                  </div>
                  <div>
                    <span className="text-sm font-medium">{tpl.name}</span>
                    <span className="text-sm text-muted-foreground"> -- {tpl.description}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleCreate} disabled={!name.trim() || loading}>
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 重命名分区弹窗 */
function RenameSectionDialog({
  open,
  onClose,
  section,
  onRenamed,
}: {
  open: boolean;
  onClose: () => void;
  section: SectionItem | null;
  onRenamed: () => void;
}) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (section) setName(section.name);
  }, [section]);

  const handleSave = async () => {
    if (!name.trim() || !section) return;
    setLoading(true);
    try {
      const res = await fetch("/api/channels/sections", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionId: section.id, name: name.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        onRenamed();
        onClose();
      }
    } catch (err) {
      console.error("重命名分区失败:", err);
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>更改分区名称</DialogTitle>
          <DialogDescription className="sr-only">输入新名称更改分区</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shrink-0">
            <span className="text-primary-foreground font-medium text-sm">
              {name ? name.charAt(0) : "C"}
            </span>
          </div>
          <div className="relative flex-1">
            <Input
              placeholder="分区的名称"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
            />
            {name && (
              <button
                onClick={() => setName("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || loading}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 创建频道弹窗 */
function CreateChannelDialog({
  open,
  onClose,
  teamId,
  userId,
  sectionId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  teamId: string;
  userId: string;
  sectionId: string | null;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<"public" | "private">("public");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          sectionId,
          name: name.trim(),
          description: description.trim() || undefined,
          type,
          creatorId: userId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setName("");
        setDescription("");
        setType("public");
        onCreated();
        onClose();
      }
    } catch (err) {
      console.error("创建频道失败:", err);
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>创建频道</DialogTitle>
          <DialogDescription className="sr-only">输入频道信息创建新频道</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">频道名称</label>
            <Input
              placeholder="例如: 产品讨论"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">描述（可选）</label>
            <Input
              placeholder="频道的用途简述"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">频道类型</label>
            <div className="flex gap-3">
              <button
                onClick={() => setType("public")}
                className={cn(
                  "flex-1 flex items-center gap-2 px-3 py-2.5 border rounded-lg transition-colors",
                  type === "public"
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border hover:bg-muted/50"
                )}
              >
                <Hash className="w-4 h-4" />
                <div className="text-left">
                  <p className="text-sm font-medium">公开频道</p>
                  <p className="text-xs text-muted-foreground">所有人可见</p>
                </div>
              </button>
              <button
                onClick={() => setType("private")}
                className={cn(
                  "flex-1 flex items-center gap-2 px-3 py-2.5 border rounded-lg transition-colors",
                  type === "private"
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border hover:bg-muted/50"
                )}
              >
                <Lock className="w-4 h-4" />
                <div className="text-left">
                  <p className="text-sm font-medium">私密频道</p>
                  <p className="text-xs text-muted-foreground">仅受邀成员</p>
                </div>
              </button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleCreate} disabled={!name.trim() || loading}>
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 编辑频道名称弹窗 */
function EditChannelNameDialog({
  open,
  onClose,
  channel,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  channel: ChannelItem | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (channel) setName(channel.name);
  }, [channel]);

  const handleSave = async () => {
    if (!name.trim() || !channel) return;
    setLoading(true);
    try {
      const res = await fetch("/api/channels", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: channel.id, name: name.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        onSaved();
        onClose();
      }
    } catch (err) {
      console.error("修改频道名称失败:", err);
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>编辑名称</DialogTitle>
          <DialogDescription className="sr-only">修改频道名称</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium mb-1.5 block">频道名称</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="输入频道名称"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            频道名称是团队成员识别和找到此频道的主要方式。
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || loading}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 编辑频道主题弹窗 */
function EditChannelTopicDialog({
  open,
  onClose,
  channel,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  channel: ChannelItem | null;
  onSaved: () => void;
}) {
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (channel) setTopic(channel.description || "");
  }, [channel]);

  const handleSave = async () => {
    if (!channel) return;
    setLoading(true);
    try {
      const res = await fetch("/api/channels", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: channel.id, description: topic.trim() || null }),
      });
      const data = await res.json();
      if (data.success) {
        onSaved();
        onClose();
      }
    } catch (err) {
      console.error("修改频道主题失败:", err);
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>编辑主题</DialogTitle>
          <DialogDescription className="sr-only">修改频道主题描述</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="描述频道现在的重点，如产品设计讨论、项目里程碑等"
            rows={3}
            className="w-full px-3 py-2 bg-muted/30 border border-border/50 rounded-lg resize-none text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
          />
          <p className="text-xs text-muted-foreground">
            描述频道现在的重点，如产品设计讨论、项目里程碑等。
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 频道详情弹窗（关于 + 成员 Tab） */
function ChannelDetailDialog({
  open,
  onClose,
  channel,
  onSaved,
  onEditName,
  onEditTopic,
  onLeaveChannel,
}: {
  open: boolean;
  onClose: () => void;
  channel: ChannelItem | null;
  onSaved: () => void;
  onEditName: () => void;
  onEditTopic: () => void;
  onLeaveChannel: () => void;
}) {
  const { user } = useAuth();
  const teamId = user?.currentTeamId || "";
  const [activeTab, setActiveTab] = useState<"about" | "members" | "knowledge" | "ai_assistant">("about");
  const [members, setMembers] = useState<ChannelMember[]>([]);
  const [memberCount, setMemberCount] = useState(0);
  const [muted, setMuted] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [channelDetail, setChannelDetail] = useState<{
    creatorName: string;
    creatorId: string;
    createdAt: string;
  } | null>(null);

  // 知识库绑定相关状态
  const [datasets, setDatasets] = useState<Array<{ id: string; name: string; description?: string; documentCount?: number }>>([]);
  const [boundDatasetIds, setBoundDatasetIds] = useState<string[]>([]);
  const [loadingKnowledge, setLoadingKnowledge] = useState(false);
  const [savingKnowledge, setSavingKnowledge] = useState(false);

  // 添加成员弹窗状态
  const [showAddMember, setShowAddMember] = useState(false);

  // 移除成员确认状态
  const [removeTarget, setRemoveTarget] = useState<ChannelMember | null>(null);
  const [removing, setRemoving] = useState(false);

  const userId = user?.id || "";

  // 加载知识库列表和绑定关系
  const loadKnowledgeBindings = useCallback(async () => {
    if (!channel || !teamId) return;
    setLoadingKnowledge(true);
    try {
      // 加载团队所有知识库
      const [datasetsRes, bindingsRes] = await Promise.all([
        fetch(`/api/rag?teamId=${teamId}`).then(r => r.json()),
        fetch(`/api/channels/rag-bindings?channelId=${channel.id}`).then(r => r.json())
      ]);
      
      if (datasetsRes.success) {
        setDatasets(datasetsRes.datasets || []);
      }
      if (bindingsRes.success) {
        setBoundDatasetIds((bindingsRes.bindings || []).map((b: { ragDatasetId: string }) => b.ragDatasetId));
      }
    } catch (err) {
      console.error("加载知识库绑定失败:", err);
    } finally {
      setLoadingKnowledge(false);
    }
  }, [channel, teamId]);

  // 保存知识库绑定
  const saveKnowledgeBindings = async () => {
    if (!channel) return;
    setSavingKnowledge(true);
    try {
      const res = await fetch("/api/channels/rag-bindings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId: channel.id,
          ragDatasetIds: boundDatasetIds,
          createdBy: userId
        })
      });
      const data = await res.json();
      if (data.success) {
        alert("保存成功");
      } else {
        alert(data.error || "保存失败");
      }
    } catch (err) {
      console.error("保存知识库绑定失败:", err);
      alert("保存失败，请重试");
    } finally {
      setSavingKnowledge(false);
    }
  };

  // 加载成员列表
  const loadMembers = useCallback(() => {
    if (channel) {
      fetch(`/api/channels/members?channelId=${channel.id}&userId=${userId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setMembers(data.members);
            setMemberCount(data.members.length);
          }
        })
        .catch(() => {});
    }
  }, [channel, userId]);

  useEffect(() => {
    if (open && channel) {
      setActiveTab("about");
      setPinned(channel.isPinned || false);
      setMemberSearch("");
      setBoundDatasetIds([]);
      // 加载频道详情
      fetch(`/api/channels?channelId=${channel.id}&userId=${userId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            const ch = data.channel as {
              memberCount: number;
              creator_id: string;
              created_at: string;
              creatorName: string;
              is_pinned: boolean;
              isMember: boolean;
            };
            setMemberCount(ch.memberCount || 0);
            setPinned(ch.is_pinned || false);
            // 格式化创建时间
            const date = new Date(ch.created_at);
            const formatted = `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
            setChannelDetail({
              creatorName: ch.creatorName || "创建者",
              creatorId: ch.creator_id,
              createdAt: formatted,
            });
          }
        })
        .catch(() => {});
    }
  }, [open, channel, userId]);

  useEffect(() => {
    if (open && channel && activeTab === "knowledge") {
      loadKnowledgeBindings();
    }
  }, [open, channel, activeTab, loadKnowledgeBindings]);

  useEffect(() => {
    if (open && channel && activeTab === "members") {
      loadMembers();
    }
  }, [open, channel, activeTab, loadMembers]);

  // 过滤成员列表
  const filteredMembers = memberSearch.trim()
    ? members.filter((m) =>
        m.name.toLowerCase().includes(memberSearch.toLowerCase()) ||
        (m.department && m.department.toLowerCase().includes(memberSearch.toLowerCase()))
      )
    : members;

  // 移除成员
  const handleRemoveMember = async () => {
    if (!removeTarget || !channel) return;
    setRemoving(true);
    try {
      const res = await fetch(`/api/channels/members?channelId=${channel.id}&userId=${removeTarget.userId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        setRemoveTarget(null);
        loadMembers();
      } else {
        alert(data.error || "移除失败");
      }
    } catch (err) {
      console.error("移除成员失败:", err);
    }
    setRemoving(false);
  };

  if (!channel) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {channel.type === "private" ? (
              <Lock className="w-4 h-4 text-muted-foreground" />
            ) : (
              <Hash className="w-4 h-4 text-muted-foreground" />
            )}
            {channel.name}
          </DialogTitle>
          <DialogDescription className="sr-only">频道详情</DialogDescription>
        </DialogHeader>

        {/* 操作按钮 */}
        <div className="flex items-center gap-2 -mt-1">
          <Button
            variant={pinned ? "secondary" : "ghost"}
            size="sm"
            className={cn("h-8", pinned ? "text-primary" : "text-muted-foreground")}
            onClick={async () => {
              const newPinned = !pinned;
              try {
                const res = await fetch("/api/channels", {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ channelId: channel!.id, isPinned: newPinned }),
                });
                const data = await res.json();
                if (data.success) {
                  setPinned(newPinned);
                  onSaved();
                }
              } catch (err) {
                console.error("置顶操作失败:", err);
              }
            }}
          >
            <Pin className={cn("w-4 h-4 mr-1.5", pinned && "fill-current")} />
            {pinned ? "取消置顶" : "置顶"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground h-8"
            onClick={() => setMuted(!muted)}
          >
            {muted ? <BellOff className="w-4 h-4 mr-1.5" /> : <Bell className="w-4 h-4 mr-1.5" />}
            {muted ? "关闭消息通知" : "开启消息通知"}
          </Button>
          {!channel.isDefault && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive h-8"
              onClick={onLeaveChannel}
            >
              <LogOut className="w-4 h-4 mr-1.5" />
              退出频道
            </Button>
          )}
        </div>

        {/* Tab 切换 */}
        <div className="flex border-b border-border -mx-6 px-6">
          <button
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
              activeTab === "about"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setActiveTab("about")}
          >
            关于
          </button>
          <button
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
              activeTab === "members"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setActiveTab("members")}
          >
            成员 ({memberCount})
          </button>
          <button
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
              activeTab === "knowledge"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setActiveTab("knowledge")}
          >
            知识库绑定
          </button>
          <button
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
              activeTab === "ai_assistant"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setActiveTab("ai_assistant")}
          >
            <Bot className="w-3.5 h-3.5 inline-block mr-1" />
            AI助手
          </button>
        </div>

        {/* Tab 内容 */}
        <ScrollArea className="flex-1 min-h-0 -mx-6 px-6">
          {activeTab === "about" ? (
            <div className="py-3">
              {/* 频道名称 */}
              <div className="flex items-center justify-between border border-border rounded-lg px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground mb-0.5">频道名称</p>
                  <p className="text-sm font-semibold truncate">{channel.name}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-primary hover:text-primary h-8 shrink-0 ml-3 px-2"
                  onClick={onEditName}
                >
                  编辑
                </Button>
              </div>

              {/* 频道主题 */}
              <div className="flex items-start justify-between border border-border rounded-lg px-4 py-3 mt-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground mb-0.5">频道主题</p>
                  <p className="text-sm truncate">
                    {channel.description || "暂无主题"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-primary hover:text-primary h-8 shrink-0 ml-3 px-2"
                  onClick={onEditTopic}
                >
                  编辑
                </Button>
              </div>

              {/* 创建者 */}
              {channelDetail && (
                <div className="border border-border rounded-lg px-4 py-3 mt-2">
                  <p className="text-xs text-muted-foreground mb-0.5">创建者</p>
                  <p className="text-sm">
                    {channelDetail.creatorName} 于 {channelDetail.createdAt}创建
                  </p>
                </div>
              )}

              {/* 频道类型 */}
              <div className="border border-border rounded-lg px-4 py-3 mt-2">
                <p className="text-xs text-muted-foreground mb-0.5">频道类型</p>
                <p className="text-sm flex items-center gap-1.5">
                  {channel.type === "private" ? (
                    <>
                      <Lock className="w-3.5 h-3.5" />
                      私密频道 — 仅受邀成员可见
                    </>
                  ) : (
                    <>
                      <Hash className="w-3.5 h-3.5" />
                      公开频道 — 所有人可见
                    </>
                  )}
                </p>
              </div>
            </div>
          ) : activeTab === "knowledge" ? (
            <div className="py-3">
              <div className="mb-3">
                <p className="text-xs text-muted-foreground">
                  绑定的知识库将在智能体回复此频道消息时一并检索，与智能体全局关联的知识库合并使用。
                </p>
              </div>
              
              {loadingKnowledge ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">加载中...</span>
                </div>
              ) : datasets.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  暂无知识库，请到「应用」页面创建
                </div>
              ) : (
                <div className="space-y-2">
                  {datasets.map((dataset) => (
                    <label key={dataset.id} className="flex items-start gap-2 p-3 border border-border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={boundDatasetIds.includes(dataset.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setBoundDatasetIds([...boundDatasetIds, dataset.id]);
                          } else {
                            setBoundDatasetIds(boundDatasetIds.filter(id => id !== dataset.id));
                          }
                        }}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{dataset.name}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                          {dataset.description || `含 ${dataset.documentCount || 0} 个文档`}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              )}

              <div className="pt-4 border-t border-border mt-4">
                <Button
                  onClick={saveKnowledgeBindings}
                  disabled={savingKnowledge}
                  className="w-full h-9"
                >
                  {savingKnowledge && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                  保存
                </Button>
              </div>
            </div>
          ) : activeTab === "ai_assistant" ? (
            <div className="py-3">
              <div className="p-4 bg-muted/30 rounded-lg border border-border">
                <div className="flex items-start gap-3">
                  <Bot className="w-5 h-5 text-primary mt-1" />
                  <div>
                    <p className="text-sm font-medium">频道AI助手</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      频道AI助手是内置的系统级助手，无需额外配置即可使用。它基于频道上下文帮助你总结讨论、搜索消息、提取待办事项。
                    </p>
                    <p className="text-xs text-muted-foreground mt-3">
                      在频道右上角点击 <Bot className="w-3 h-3 inline" /> 图标即可打开 AI 助手面板。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-3">
              {/* 搜索和操作栏 */}
              <div className="flex items-center gap-2 mb-3">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    placeholder="搜索"
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    className="h-8 pl-8 text-sm"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-primary hover:text-primary h-8 shrink-0"
                  onClick={() => setShowAddMember(true)}
                >
                  <UserPlus className="w-4 h-4 mr-1" />
                  添加人员
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground h-8 shrink-0"
                >
                  <Link2 className="w-4 h-4 mr-1" />
                  共享链接
                </Button>
              </div>

              {/* 成员列表 */}
              {members.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  暂无成员
                </div>
              ) : filteredMembers.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  未找到匹配的成员
                </div>
              ) : (
                <div>
                  {filteredMembers.map((member) => {
                    const isCreator = channelDetail?.creatorId === member.userId;
                    return (
                      <div
                        key={member.id}
                        className="flex items-center gap-3 px-2 py-2.5 border-b border-border last:border-b-0"
                      >
                        <UserAvatar avatarKey={member.avatar} name={member.name} className="w-8 h-8 shrink-0" fallbackClassName="text-xs" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {member.name}
                            {isCreator && (
                              <span className="text-xs text-muted-foreground font-normal ml-1.5">创建者</span>
                            )}
                          </p>
                          {member.department && (
                            <p className="text-xs text-muted-foreground truncate">
                              {member.department}{member.position ? ` · ${member.position}` : ""}
                            </p>
                          )}
                        </div>
                        {!isCreator && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive h-7 shrink-0 px-2 text-xs"
                            onClick={() => setRemoveTarget(member)}
                          >
                            移除
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        {/* 添加成员弹窗 */}
        <AddMemberDialog
          open={showAddMember}
          onClose={() => setShowAddMember(false)}
          channelId={channel.id}
          teamId={teamId}
          existingMembers={members}
          onAdded={() => {
            loadMembers();
          }}
        />

        {/* 移除成员确认 */}
        <AlertDialog open={!!removeTarget} onOpenChange={(v) => !v && setRemoveTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>移除成员</AlertDialogTitle>
              <AlertDialogDescription>
                确定要将 {removeTarget?.name} 从该频道中移除吗？移除后该成员将无法查看频道内容。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={removing}>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleRemoveMember}
                disabled={removing}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {removing ? "移除中..." : "确认移除"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

/** 添加频道成员弹窗 */
function AddMemberDialog({
  open,
  onClose,
  channelId,
  teamId,
  existingMembers,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  channelId: string;
  teamId: string;
  existingMembers: ChannelMember[];
  onAdded: () => void;
}) {
  const [search, setSearch] = useState("");
  const [teamMembers, setTeamMembers] = useState<Array<{
    id: string;
    name: string;
    avatar: string | null;
    department: string | null;
    position: string | null;
  }>>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 加载团队成员
  useEffect(() => {
    if (open && teamId) {
      setSearch("");
      setSelectedIds(new Set());
      setLoading(true);
      fetch(`/api/teams/members?teamId=${teamId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setTeamMembers(
              (data.members || []).map((m: {
                id: string;
                name: string;
                avatar: string | null;
                department: string | null;
                position: string | null;
              }) => ({
                id: m.id,
                name: m.name,
                avatar: m.avatar,
                department: m.department,
                position: m.position,
              }))
            );
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [open, teamId]);

  // 已在频道中的成员ID集合
  const existingIds = new Set(existingMembers.map((m) => m.userId));

  // 可添加的成员（排除已在频道中的）
  const availableMembers = teamMembers.filter((m) => !existingIds.has(m.id));

  // 搜索过滤
  const filteredAvailable = search.trim()
    ? availableMembers.filter((m) =>
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        (m.department && m.department.toLowerCase().includes(search.toLowerCase()))
      )
    : availableMembers;

  const toggleSelect = (userId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const handleAdd = async () => {
    if (selectedIds.size === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/channels/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId,
          userIds: Array.from(selectedIds),
        }),
      });
      const data = await res.json();
      if (data.success) {
        onAdded();
        onClose();
      } else {
        alert(data.error || "添加失败");
      }
    } catch (err) {
      console.error("添加成员失败:", err);
    }
    setSubmitting(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md max-h-[70vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>添加人员</DialogTitle>
          <DialogDescription className="sr-only">从团队成员中选择添加到频道</DialogDescription>
        </DialogHeader>

        {/* 搜索框 */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="搜索团队成员"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-8"
          />
        </div>

        {/* 成员列表 */}
        <ScrollArea className="flex-1 min-h-0 -mx-6 px-6">
          {loading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">加载中...</div>
          ) : filteredAvailable.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {search ? "未找到匹配的成员" : "所有团队成员已在频道中"}
            </div>
          ) : (
            <div>
              {filteredAvailable.map((member) => {
                const isSelected = selectedIds.has(member.id);
                return (
                  <div
                    key={member.id}
                    className="flex items-center gap-3 px-2 py-2.5 border-b border-border last:border-b-0 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => toggleSelect(member.id)}
                  >
                    <UserAvatar avatarKey={member.avatar} name={member.name} className="w-8 h-8 shrink-0" fallbackClassName="text-xs" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{member.name}</p>
                      {member.department && (
                        <p className="text-xs text-muted-foreground truncate">
                          {member.department}{member.position ? ` · ${member.position}` : ""}
                        </p>
                      )}
                    </div>
                    <div
                      className={cn(
                        "w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                        isSelected
                          ? "bg-primary border-primary"
                          : "border-muted-foreground/30"
                      )}
                    >
                      {isSelected && (
                        <svg className="w-3 h-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {/* 底部操作 */}
        {selectedIds.size > 0 && (
          <DialogFooter className="border-t border-border pt-3 -mx-6 px-6">
            <span className="text-sm text-muted-foreground mr-auto">
              已选择 {selectedIds.size} 人
            </span>
            <Button variant="outline" onClick={onClose} disabled={submitting}>
              取消
            </Button>
            <Button onClick={handleAdd} disabled={submitting}>
              {submitting ? "添加中..." : "确认添加"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** 浏览频道弹窗 - 展示所有频道，支持加入 */
function BrowseChannelsDialog({
  open,
  onClose,
  sections,
  userId,
  onJoinChannel,
  browseMode,
  onBrowseModeChange,
}: {
  open: boolean;
  onClose: () => void;
  sections: SectionItem[];
  userId: string;
  onJoinChannel: (channelId: string) => void;
  browseMode: boolean;
  onBrowseModeChange: (v: boolean) => void;
}) {
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const handleJoin = async (channelId: string) => {
    setJoiningId(channelId);
    try {
      const res = await fetch("/api/channels/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId, userId }),
      });
      const data = await res.json();
      if (data.success) {
        onJoinChannel(channelId);
      }
    } catch (err) {
      console.error("加入频道失败:", err);
    }
    setJoiningId(null);
  };

  // 扁平化所有频道并搜索过滤
  const allChannels = sections.flatMap((s) =>
    s.channels.map((c) => ({ ...c, sectionName: s.name }))
  );
  const filtered = searchQuery
    ? allChannels.filter((c) =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : allChannels;

  // 按分区分组
  const groupedBySection = sections
    .map((s) => ({
      ...s,
      channels: searchQuery
        ? s.channels.filter((c) =>
            c.name.toLowerCase().includes(searchQuery.toLowerCase())
          )
        : s.channels,
    }))
    .filter((s) => s.channels.length > 0);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Hash className="w-5 h-5 text-primary" />
            浏览频道
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground mt-1">
            发现并加入团队中的公开频道
          </DialogDescription>
        </DialogHeader>

        {/* 搜索栏 */}
        <div className="px-5 pb-3 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="搜索频道名称..."
              className="pl-9 h-9 text-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* 浏览模式开关 */}
        <div className="px-5 pb-3 shrink-0 flex items-center justify-between">
          <span className="text-xs text-muted-foreground flex items-center gap-1.5">
            {browseMode ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            在侧边栏显示未加入的频道
          </span>
          <Switch
            checked={browseMode}
            onCheckedChange={onBrowseModeChange}
          />
        </div>

        {/* 频道列表 */}
        <div className="flex-1 overflow-y-auto px-2 pb-2 min-h-0">
          {groupedBySection.map((section) => (
            <div key={section.id} className="mb-3">
              {/* 分区标题 */}
              <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {section.name}
              </div>
              {/* 频道列表 */}
              <div className="space-y-0.5">
                {section.channels.map((channel) => {
                  const isJoined = channel.isMember !== false;
                  const isPrivate = channel.type === "private";

                  return (
                    <div
                      key={channel.id}
                      className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                          isJoined ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                        )}>
                          {isPrivate ? (
                            <Lock className="w-4 h-4" />
                          ) : (
                            <Hash className="w-4 h-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium truncate">{channel.name}</span>
                            {channel.isDefault && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
                                全员
                              </Badge>
                            )}
                            {isPrivate && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
                                私密
                              </Badge>
                            )}
                          </div>
                          {channel.description && (
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              {channel.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 ml-3">
                        {isJoined ? (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            已加入
                          </span>
                        ) : isPrivate ? (
                          <span className="text-xs text-muted-foreground/60">仅邀请</span>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs px-3"
                            disabled={joiningId === channel.id}
                            onClick={() => handleJoin(channel.id)}
                          >
                            {joiningId === channel.id ? "加入中..." : "加入"}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {groupedBySection.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              没有找到匹配的频道
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============ Main Page ============

export default function ChannelsPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const channelParam = searchParams.get("channelId");
  const router = useRouter();
  const teamId = user?.currentTeamId || "";
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const shouldScrollRef = useRef(false);

  // 记住上次选中的频道（按团队隔离存储）
  const getLastChannelId = useCallback((tid: string): string | null => {
    if (typeof window === "undefined" || !tid) return null;
    return localStorage.getItem(`lastChannelId_${tid}`);
  }, []);
  const setLastChannelId = useCallback((tid: string, channelId: string) => {
    if (typeof window === "undefined" || !tid) return;
    localStorage.setItem(`lastChannelId_${tid}`, channelId);
  }, []);

  // 频道未读状态
  const [unreadCount, setUnreadCount] = useState(0);
  const [lastReadAt, setLastReadAt] = useState<string | null>(null);
  const [showUnreadBar, setShowUnreadBar] = useState(false); // 是否显示未读浮条
  const [isAtBottom, setIsAtBottom] = useState(true); // 是否在底部

  // 拖拽排序状态
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);

  // 拖拽传感器配置
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // 拖拽开始
  const handleDragStart = (event: { active: { id: string | number } }, sectionId: string) => {
    setActiveId(String(event.active.id));
    setActiveSectionId(sectionId);
  };

  // 拖拽结束
  const handleDragEnd = async (event: DragEndEvent, sectionId: string) => {
    const { active, over } = event;
    setActiveId(null);
    setActiveSectionId(null);

    if (!over || active.id === over.id) return;

    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;

    const oldIndex = section.channels.findIndex((c) => c.id === active.id);
    const newIndex = section.channels.findIndex((c) => c.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    // 更新本地状态
    const newChannels = [...section.channels];
    const [removed] = newChannels.splice(oldIndex, 1);
    newChannels.splice(newIndex, 0, removed);

    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId ? { ...s, channels: newChannels } : s
      )
    );

    // 调用 API 保存排序
    try {
      await fetch("/api/channels/sort", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId: String(active.id),
          newSortOrder: newIndex,
          sectionId,
        }),
      });
    } catch (error) {
      console.error("保存频道排序失败:", error);
    }
  };

  const [sections, setSections] = useState<SectionItem[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(() => getLastChannelId(teamId));
  const selectChannel = useCallback((channelId: string | null) => {
    setSelectedChannelId(channelId);
    if (channelId) setLastChannelId(teamId, channelId);
  }, [teamId, setLastChannelId]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // 弹窗状态
  const [showCreateSection, setShowCreateSection] = useState(false);
  const [showRenameSection, setShowRenameSection] = useState(false);
  const [renameTarget, setRenameTarget] = useState<SectionItem | null>(null);
  const [showDeleteSection, setShowDeleteSection] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SectionItem | null>(null);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [createChannelSectionId, setCreateChannelSectionId] = useState<string | null>(null);

  // 频道详情/编辑弹窗状态
  const [showChannelDetail, setShowChannelDetail] = useState(false);
  const [showEditChannelName, setShowEditChannelName] = useState(false);
  const [showEditChannelTopic, setShowEditChannelTopic] = useState(false);

  // 删除频道状态
  const [showDeleteChannel, setShowDeleteChannel] = useState(false);
  const [deleteChannelTarget, setDeleteChannelTarget] = useState<ChannelItem | null>(null);

  // 退出频道状态
  const [showLeaveChannel, setShowLeaveChannel] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // 删除消息状态
  const [showDeleteMessage, setShowDeleteMessage] = useState(false);
  const [deleteMessageTarget, setDeleteMessageTarget] = useState<string | null>(null);
  const [deletingMessage, setDeletingMessage] = useState(false);

  // 转发消息状态
  const [showForwardDialog, setShowForwardDialog] = useState(false);
  const [forwardMessage, setForwardMessage] = useState<ChannelMessage | null>(null);

  // 消息列表状态
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // 频道消息缓存：切频道时暂存已加载的消息，切回来时先显示缓存
  const messagesCacheRef = useRef<Map<string, { messages: ChannelMessage[]; hasMore: boolean }>>(new Map());

  // 附件上传状态
  const [pendingAttachments, setPendingAttachments] = useState<Array<{
    id: string;
    file: File;
    type: "image" | "video" | "file";
    previewUrl: string;
    progress: number; // 0-100
    status: "uploading" | "done" | "error";
    key?: string;
    url?: string;
    name: string;
    size: number;
    contentType?: string;
  }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 超字数限制
  const MAX_MESSAGE_LENGTH = 5000;

  // @成员选择面板
  const [showMentionPanel, setShowMentionPanel] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const [mentionPosition, setMentionPosition] = useState(0); // 光标位置
  const [mentionTab, setMentionTab] = useState<"members" | "agents">("members");
  const [mentionMap, setMentionMap] = useState<Map<string, string>>(new Map()); // @name -> userId 映射
  const [channelMembers, setChannelMembers] = useState<Array<{ userId: string; name: string; nickname: string | null; avatar: string | null }>>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const threadTextareaRef = useRef<HTMLTextAreaElement>(null);

  // #话题选择面板
  const [showTopicPanel, setShowTopicPanel] = useState(false);
  const [topicSearch, setTopicSearch] = useState("");
  const [topicPosition, setTopicPosition] = useState(0);
  const [recentTopics, setRecentTopics] = useState<string[]>([]);

  // /智能体选择面板
  const [showAgentPanel, setShowAgentPanel] = useState(false);
  const [agentSearch, setAgentSearch] = useState("");
  const [agentPosition, setAgentPosition] = useState(0);
  const [agentList, setAgentList] = useState<Array<{ id: string; name: string; description: string; status?: string }>>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedAgentName, setSelectedAgentName] = useState<string | null>(null);
  const [agentResponding, setAgentResponding] = useState(false);

  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [toolCalls, setToolCalls] = useState<ToolCallItem[]>([]);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [safetyIntercepted, setSafetyIntercepted] = useState(false);
  const [agentProgress, setAgentProgress] = useState<any>(null);
  const [activeAgentIdx, setActiveAgentIdx] = useState(0);

  // 链接创建弹窗
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkText, setLinkText] = useState("");
  const [linkUrl, setLinkUrl] = useState("");

  // 添加应用/文件面板
  const [showAttachPanel, setShowAttachPanel] = useState(false);

  // 加载智能体列表
  const loadAgentList = useCallback(async () => {
    if (!teamId) return;
    try {
      const res = await fetch(`/api/agents?teamId=${teamId}`);
      const data = await res.json();
      if (data.success) {
        setAgentList(data.agents.map((a: { id: string; name: string; description: string; status?: string }) => ({
          id: a.id, name: a.name, description: a.description || "", status: a.status,
        })));
      }
    } catch (err) {
      console.error("加载智能体列表失败:", err);
    }
  }, [teamId]);

  // 回复线程面板状态
  const [threadOpen, setThreadOpen] = useState(false);
  const [threadRootMessage, setThreadRootMessage] = useState<ChannelMessage | null>(null);
  const [threadReplies, setThreadReplies] = useState<ChannelMessage[]>([]);
  const [threadReplyContent, setThreadReplyContent] = useState("");
  const [sendingReply, setSendingReply] = useState(false);

  // 回复区专用状态
  const [threadPendingAttachments, setThreadPendingAttachments] = useState<Array<{
    id: string; file: File; type: "image" | "video" | "file"; previewUrl: string; name: string; size: number; status: "uploading" | "done" | "error"; key?: string; url?: string;
  }>>([]);
  const [threadShowMentionPanel, setThreadShowMentionPanel] = useState(false);
  const [threadMentionSearch, setThreadMentionSearch] = useState("");
  const [threadMentionPosition, setThreadMentionPosition] = useState(0);
  const [threadMentionTab, setThreadMentionTab] = useState<"members" | "agents">("members");
  const [threadShowTopicPanel, setThreadShowTopicPanel] = useState(false);
  const [threadTopicSearch, setThreadTopicSearch] = useState("");
  const [threadTopicPosition, setThreadTopicPosition] = useState(0);
  const [threadShowAgentPanel, setThreadShowAgentPanel] = useState(false);
  const [threadAgentSearch, setThreadAgentSearch] = useState("");
  const [threadAgentPosition, setThreadAgentPosition] = useState(0);
  const [threadSelectedAgentId, setThreadSelectedAgentId] = useState<string | null>(null);
  const [threadSelectedAgentName, setThreadSelectedAgentName] = useState<string | null>(null);
  const [threadActiveAgentIdx, setThreadActiveAgentIdx] = useState(0);
  const [threadShowLinkDialog, setThreadShowLinkDialog] = useState(false);
  const [threadLinkText, setThreadLinkText] = useState("");
  const [threadLinkUrl, setThreadLinkUrl] = useState("");
  const [threadShowAttachPanel, setThreadShowAttachPanel] = useState(false);
  const threadFileInputRef = useRef<HTMLInputElement>(null);
  const threadImageInputRef = useRef<HTMLInputElement>(null);
  const threadVideoInputRef = useRef<HTMLInputElement>(null);
  const [threadMentionMap, setThreadMentionMap] = useState<Record<string, string>>({});
  const [threadEmojiPopoverOpen, setThreadEmojiPopoverOpen] = useState(false);

  // 长文折叠状态
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());

  // 浏览频道状态
  const [showBrowseChannels, setShowBrowseChannels] = useState(false);
  const [browseMode, setBrowseMode] = useState(true); // 开：显示未加入公开频道；关：只显示已加入频道

  // 团队成员列表（用于转发）
  const [teamMemberList, setTeamMemberList] = useState<Array<{ userId: string; name: string; nickname: string | null; avatar: string | null }>>([]);

  // AI助手面板状态（专职系统助手，始终可用）
  const [showAiPanel, setShowAiPanel] = useState(false);

  // 频道文件面板状态
  const [showFilesPanel, setShowFilesPanel] = useState(false);

  // 加载分区和频道数据
  const loadData = useCallback(async () => {
    if (!teamId) return;
    try {
      const res = await fetch(`/api/channels/sections?teamId=${teamId}&userId=${user?.id || ""}`);
      const data = await res.json();
      if (data.success) {
        // 将孤立频道（section_id 为 null）归入默认分区
        const orphanChannels = data.orphanChannels || [];
        const processedSections = data.sections.map((section: SectionItem) => {
          if (section.isDefault && orphanChannels.length > 0) {
            return { ...section, channels: [...section.channels, ...orphanChannels] };
          }
          return section;
        });
        setSections(processedSections);
        // 自动选中频道：优先 URL 参数 > 上次选中 > 第一个
        if (processedSections.length > 0) {
          const allChannelIds = processedSections.flatMap((s: SectionItem) => s.channels.map((c: { id: string }) => c.id));
          // 1. URL 参数指定了频道且存在
          if (channelParam && allChannelIds.includes(channelParam)) {
            selectChannel(channelParam);
          }
          // 2. 恢复上次选中的频道
          else if (!channelParam) {
            const lastId = getLastChannelId(teamId);
            if (lastId && allChannelIds.includes(lastId)) {
              if (selectedChannelId !== lastId) {
                selectChannel(lastId);
              }
            } else if (!selectedChannelId || !allChannelIds.includes(selectedChannelId)) {
              for (const section of processedSections) {
                if (section.channels.length > 0) {
                  selectChannel(section.channels[0].id);
                  break;
                }
              }
            }
          }
          // 3. URL 指定了频道但不存在，回退到上次选中或第一个
          else {
            const lastId = getLastChannelId(teamId);
            if (lastId && allChannelIds.includes(lastId)) {
              selectChannel(lastId);
            } else {
              for (const section of processedSections) {
                if (section.channels.length > 0) {
                  selectChannel(section.channels[0].id);
                  break;
                }
              }
            }
          }
        }
      }
    } catch (err) {
      console.error("加载频道数据失败:", err);
    }
    setLoading(false);
  }, [teamId, selectedChannelId, user?.id, getLastChannelId, channelParam]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 消费 URL 参数后清除，避免刷新时重复覆盖 localStorage 记忆
  useEffect(() => {
    if (channelParam) {
      router.replace("/channels");
    }
  }, [channelParam, router]);

  // 找到当前选中的频道
  const findChannel = useCallback(
    (channelId: string | null) => {
      if (!channelId) return null;
      for (const section of sections) {
        const ch = section.channels.find((c) => c.id === channelId);
        if (ch) return { ...ch, sectionName: section.name };
      }
      return null;
    },
    [sections]
  );

  const currentChannel = findChannel(selectedChannelId);

  // 静默刷新消息列表（不触发 loading 状态，避免页面闪烁）
  const silentRefreshMessages = useCallback(async () => {
    if (!selectedChannelId || !user?.id) return;
    try {
      const msgRes = await fetch(`/api/channels/messages?channelId=${selectedChannelId}&userId=${user.id}&limit=20`);
      const msgData = await msgRes.json();
      if (msgData.success) {
        setMessages(msgData.messages || []);
        setHasMoreMessages(!!msgData.nextCursor);
        // 更新缓存
        messagesCacheRef.current.set(selectedChannelId, {
          messages: msgData.messages || [],
          hasMore: !!msgData.nextCursor,
        });
      }
    } catch { /* ignore */ }
  }, [selectedChannelId, user?.id]);

  // 页面可见性变化时自动刷新（用户切换回来时，智能体可能已完成回复）
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && selectedChannelId) {
        silentRefreshMessages();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [selectedChannelId, silentRefreshMessages]);

  // 加载频道消息
  const loadMessages = useCallback(async (forceRefresh = false) => {
    if (!selectedChannelId || !user?.id) return;

    // 如果有缓存且非强制刷新，先使用缓存，后台静默刷新
    if (!forceRefresh) {
      const cached = messagesCacheRef.current.get(selectedChannelId);
      if (cached) {
        setMessages(cached.messages);
        setHasMoreMessages(cached.hasMore);
        setMessagesLoading(false);
        shouldScrollRef.current = true;
        // 后台静默刷新最新数据，不触发 loading 状态
        silentRefreshMessages();
        return;
      }
    }

    setMessagesLoading(true);
    shouldScrollRef.current = true;
    try {
      const res = await fetch(`/api/channels/messages?channelId=${selectedChannelId}&userId=${user.id}&limit=20`);
      const data = await res.json();
      if (data.success) {
        setMessages(data.messages || []);
        setHasMoreMessages(!!data.nextCursor);
        // 更新缓存
        messagesCacheRef.current.set(selectedChannelId, {
          messages: data.messages || [],
          hasMore: !!data.nextCursor,
        });
      }
    } catch (err) {
      console.error("加载频道消息失败:", err);
    }
    setMessagesLoading(false);
  }, [selectedChannelId, user?.id, silentRefreshMessages]);

  // 向上滚动加载更多历史消息
  const loadMoreMessages = useCallback(async () => {
    if (!selectedChannelId || !user?.id || loadingMore || !hasMoreMessages) return;

    // 获取最早消息的时间作为 cursor
    const oldestMessage = messages[messages.length - 1];
    if (!oldestMessage) return;

    setLoadingMore(true);
    try {
      const res = await fetch(`/api/channels/messages?channelId=${selectedChannelId}&userId=${user.id}&limit=20&before=${encodeURIComponent(oldestMessage.createdAt)}`);
      const data = await res.json();
      if (data.success && data.messages && data.messages.length > 0) {
        // 新旧消息合并（旧消息在数组末尾，因为 API 返回降序）
        const newMessages = [...messages, ...data.messages];
        setMessages(newMessages);
        setHasMoreMessages(!!data.nextCursor);
        // 更新缓存
        messagesCacheRef.current.set(selectedChannelId, {
          messages: newMessages,
          hasMore: !!data.nextCursor,
        });
      } else {
        setHasMoreMessages(false);
      }
    } catch (err) {
      console.error("加载更多消息失败:", err);
    }
    setLoadingMore(false);
  }, [selectedChannelId, user?.id, messages, loadingMore, hasMoreMessages]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // 切换频道时刷新
  useEffect(() => {
    setShowAiPanel(false);
    if (!selectedChannelId) return;
  }, [selectedChannelId]);

  // 加载频道已读状态
  const loadReadState = useCallback(async () => {
    if (!selectedChannelId || !user?.id) {
      setUnreadCount(0);
      setShowUnreadBar(false);
      setLastReadAt(null);
      return;
    }
    // 先重置，防止切换频道时显示旧数据
    setUnreadCount(0);
    setShowUnreadBar(false);
    try {
      const res = await fetch(`/api/channels/read-state?channelId=${selectedChannelId}&userId=${user.id}`);
      const data = await res.json();
      if (data.success) {
        setLastReadAt(data.lastReadAt);
        const count = data.unreadCount || 0;
        setUnreadCount(count);
        // 有未读消息时显示浮条
        setShowUnreadBar(count > 0);
      }
    } catch { /* ignore */ }
  }, [selectedChannelId, user?.id]);

  useEffect(() => {
    loadReadState();
  }, [loadReadState]);

  // 更新已读状态
  const markAsRead = useCallback(async () => {
    if (!selectedChannelId || !user?.id) return;
    try {
      await fetch("/api/channels/read-state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: selectedChannelId, userId: user.id }),
      });
      setUnreadCount(0);
      setShowUnreadBar(false);
    } catch { /* ignore */ }
  }, [selectedChannelId, user?.id]);

  // 消息加载后自动滚动到底部（仅在 shouldScrollRef 为 true 时触发）
  const scrollToBottom = useCallback((instant = false) => {
    const viewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
    if (viewport) {
      // 直接操作 ScrollArea viewport 的 scrollTop，比 scrollIntoView 更可靠
      if (instant) {
        viewport.scrollTop = viewport.scrollHeight;
      } else {
        viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
      }
    }
  }, []);

  useEffect(() => {
    if (!messagesLoading && messages.length > 0 && shouldScrollRef.current) {
      // 使用 requestAnimationFrame 确保 DOM 已完成渲染再滚动
      requestAnimationFrame(() => {
        scrollToBottom(true);
      });
      shouldScrollRef.current = false;
      // 首次加载滚到底部时标记已读
      markAsRead();
    }
  }, [messagesLoading, messages, scrollToBottom, markAsRead]);

  // 监听滚动位置：检测是否在底部、是否在顶部（加载更多）
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const markReadOnScroll = useCallback(() => {
    const el = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    setIsAtBottom(atBottom);
    if (atBottom && unreadCount > 0) {
      markAsRead();
    }
    // 检测滚动到顶部，加载更多历史消息
    if (el.scrollTop < 100 && hasMoreMessages && !loadingMore) {
      // 记录当前滚动位置，加载完成后恢复
      const prevScrollHeight = el.scrollHeight;
      const prevScrollTop = el.scrollTop;
      loadMoreMessages().then(() => {
        // 加载完成后恢复滚动位置（避免跳动）
        requestAnimationFrame(() => {
          const newEl = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
          if (newEl) {
            newEl.scrollTop = newEl.scrollHeight - prevScrollHeight + prevScrollTop;
          }
        });
      });
    }
  }, [unreadCount, markAsRead, hasMoreMessages, loadingMore, loadMoreMessages]);

  // 绑定滚动事件到 ScrollArea 的 viewport
  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
    if (!viewport) return;
    viewport.addEventListener("scroll", markReadOnScroll, { passive: true });
    return () => viewport.removeEventListener("scroll", markReadOnScroll);
  }, [markReadOnScroll]);

  // 滚动到第一条未读消息
  const scrollToFirstUnread = useCallback(() => {
    if (!lastReadAt) return;
    // messages 是按 created_at 降序排列的，reverse 后升序
    const sortedMessages = [...messages].reverse();
    const firstUnread = sortedMessages.find(m => m.createdAt > lastReadAt);
    if (firstUnread) {
      const el = document.getElementById(`msg-${firstUnread.id}`);
      const viewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
      if (el && viewport) {
        const elRect = el.getBoundingClientRect();
        const viewportRect = viewport.getBoundingClientRect();
        const offset = elRect.top - viewportRect.top + viewport.scrollTop - viewport.clientHeight / 2;
        viewport.scrollTo({ top: Math.max(0, offset), behavior: "smooth" });
      }
    }
  }, [messages, lastReadAt]);

  // 发送频道消息
  const handleSendMessage = async () => {
    if ((!message.trim() && pendingAttachments.length === 0) || !selectedChannelId || !user?.id) return;

    // 检查是否有未上传完成的附件
    const hasUploading = pendingAttachments.some(a => a.status === "uploading");
    if (hasUploading) return;

    // 从 mentionMap 中提取被@用户的ID列表
    const mentionUserIds: string[] = [];
    mentionMap.forEach((userId, mentionKey) => {
      // 检查消息内容中是否仍包含该 @提及
      if (message.includes(mentionKey)) {
        mentionUserIds.push(userId);
      }
    });
    // 也匹配简单的 @用户名 格式（从团队成员列表匹配，排除已在 mentionMap 中的）
    const simpleMentionRegex = /@(\S+)/g;
    let simpleMatch: RegExpExecArray | null;
    while ((simpleMatch = simpleMentionRegex.exec(message)) !== null) {
      const mentionName = simpleMatch[1];
      const mentionKey = `@${mentionName}`;
      // 跳过已经在 mentionMap 中的
      if (mentionMap.has(mentionKey)) continue;
      const matchedMember = teamMemberList.find(m => m.name === mentionName);
      if (matchedMember && !mentionUserIds.includes(matchedMember.userId)) {
        mentionUserIds.push(matchedMember.userId);
      }
    }

    let invokingAgentId: string | null = selectedAgentId;
    let invokingAgentQuestion = "";

    // 单智能体检测逻辑
    if (!invokingAgentId) {
      const agentInvokeMatch = message.trim().match(/^\/([^\s]+)\s*([\s\S]*)/);
      if (agentInvokeMatch) {
        const agentName = agentInvokeMatch[1];
        const found = agentList.find(a => a.name === agentName);
        if (found) {
          invokingAgentId = found.id;
          invokingAgentQuestion = agentInvokeMatch[2].trim() || "你好";
        }
      }
      // 检测 @智能体名 手动输入（无需通过 mention 面板）
      if (!invokingAgentId) {
        const agentMentionMatch = message.trim().match(/^@([^\s]+)\s*([\s\S]*)/);
        if (agentMentionMatch) {
          const agentName = agentMentionMatch[1];
          const found = agentList.find(a => a.name === agentName);
          if (found) {
            invokingAgentId = found.id;
            invokingAgentQuestion = agentMentionMatch[2].trim() || "你好";
          }
        }
      }
    } else {
      // 从消息中剥离 @智能体名 作为问题
      const trimmedMsg = message.trim();
      if (selectedAgentName && trimmedMsg.startsWith(`@${selectedAgentName}`)) {
        invokingAgentQuestion = trimmedMsg.replace(`@${selectedAgentName}`, '').trim() || "你好";
      } else {
        invokingAgentQuestion = trimmedMsg || "你好";
      }
    }

    // 如果是智能体调用，在消息中标注智能体名
    let contentToStore = message.trim();
    if (invokingAgentId) {
      const invokedAgent = agentList.find(a => a.id === invokingAgentId);
      if (invokedAgent) {
        const agentPrefix = `/${invokedAgent.name}`;
        const agentMention = `@${invokedAgent.name}`;
        if (contentToStore.startsWith(agentPrefix)) {
          // /智能体名 格式 → 替换为 @智能体名
          contentToStore = `@${invokedAgent.name}${contentToStore.slice(agentPrefix.length)}`;
        } else if (contentToStore.startsWith(agentMention)) {
          // @智能体名 格式 → 已经是 @mention 格式，保持原样
          // 不做额外处理
        } else {
          // Bot按钮选择 → 前面添加 @智能体名
          contentToStore = `@${invokedAgent.name} ${contentToStore}`;
        }
      }
    }

    // 将消息内容中的 @name 替换为 @[name](userId) 格式用于存储
    mentionMap.forEach((userId, mentionKey) => {
      if (contentToStore.includes(mentionKey)) {
        const name = mentionKey.slice(1); // 去掉 @
        contentToStore = contentToStore.replace(new RegExp(`@${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g'), `@[${name}](${userId})`);
      }
    });

    // 乐观更新：创建临时消息并立即显示
    const tempId = `temp-${Date.now()}`;
    const tempMessage: ChannelMessage = {
      id: tempId,
      channelId: selectedChannelId,
      senderId: user.id,
      sender: {
        id: user.id,
        name: user.name || user.phone || "我",
        avatar: user.avatar || null,
        department: null,
        position: null,
      },
      content: contentToStore,
      messageType: (pendingAttachments.filter(a => a.status === "done" && a.key).length > 0 && contentToStore ? "text" : 
        pendingAttachments.filter(a => a.status === "done" && a.key).length > 0 ? "media" : "text") as "text" | "media" | "system",
      attachments: pendingAttachments.filter(a => a.status === "done" && a.key).map(a => ({ url: a.key!, name: a.name, type: a.type, size: a.size, contentType: a.contentType })),
      topicTags: [],
      sourceChannelName: null,
      sourceChannelId: null,
      replyUsers: [],
      createdAt: new Date().toISOString(),
      reactions: [],
      replyCount: 0,
      isTemp: true,
    };
    setMessages(prev => [tempMessage, ...prev]);

    setSendingMessage(true);
    try {
      // 构建附件列表（仅已上传完成的，存储 key 而非 url）
      const attachments = pendingAttachments
        .filter(a => a.status === "done" && a.key)
        .map(a => ({
          type: a.type,
          key: a.key!,
          name: a.name,
          size: a.size,
          contentType: a.contentType,
        }));

      const res = await fetch("/api/channels/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId: selectedChannelId,
          senderId: user.id,
          content: contentToStore,
          messageType: attachments.length > 0 ? (contentToStore ? "text" : "media") : "text",
          attachments,
          mentions: mentionUserIds.length > 0 ? mentionUserIds : undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        const sentMessageId = data.message?.id;
        // 替换临时消息为真实消息
        setMessages(prev => prev.map(m => m.id === tempId ? data.message : m));
        setMessage("");
        setMentionMap(new Map());
        setPendingAttachments([]);
        setSelectedAgentId(null);
        setSelectedAgentName(null);
        shouldScrollRef.current = true;
        markAsRead();
        // 重置输入框高度
        if (textareaRef.current) {
          textareaRef.current.style.height = "auto";
        }
        if (invokingAgentId && sentMessageId) {
          invokeAgent(invokingAgentId, selectedChannelId, invokingAgentQuestion, sentMessageId, attachments);
        }
      } else {
        // API 返回失败，移除临时消息
        setMessages(prev => prev.filter(m => m.id !== tempId));
      }
    } catch (err) {
      // 请求失败，移除临时消息
      setMessages(prev => prev.filter(m => m.id !== tempId));
      console.error("发送消息失败:", err);
    }
    setSendingMessage(false);
  };

  // 处理文件选择
  const handleFileSelect = async (files: FileList | File[], forcedType?: "image" | "video" | "file") => {
    const newAttachments = Array.from(files).map((file) => {
      let type: "image" | "video" | "file" = "file";
      if (forcedType) {
        type = forcedType;
      } else if (file.type.startsWith("image/")) {
        type = "image";
      } else if (file.type.startsWith("video/")) {
        type = "video";
      }
      return {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        file,
        type,
        previewUrl: type === "image" ? URL.createObjectURL(file) : (type === "video" ? URL.createObjectURL(file) : ""),
        progress: 0,
        status: "uploading" as const,
        name: file.name,
        size: file.size,
        contentType: file.type,
      };
    });

    // 最多9个附件
    const currentCount = pendingAttachments.length;
    const allowed = newAttachments.slice(0, 9 - currentCount);
    if (allowed.length === 0) return;

    setPendingAttachments(prev => [...prev, ...allowed]);

    // 逐个上传
    for (const att of allowed) {
      try {
        const formData = new FormData();
        formData.append("file", att.file);
        formData.append("userId", user?.id || "");

        // 模拟进度（XMLHttpRequest 不方便，用 fake progress）
        setPendingAttachments(prev =>
          prev.map(a => a.id === att.id ? { ...a, progress: 30 } : a)
        );

        const res = await fetch("/api/upload/attachment", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();
        if (data.success) {
          setPendingAttachments(prev =>
            prev.map(a => a.id === att.id ? { ...a, progress: 100, status: "done", key: data.key, url: data.url, contentType: data.contentType || a.contentType } : a)
          );
        } else {
          setPendingAttachments(prev =>
            prev.map(a => a.id === att.id ? { ...a, progress: 0, status: "error" } : a)
          );
        }
      } catch {
        setPendingAttachments(prev =>
          prev.map(a => a.id === att.id ? { ...a, progress: 0, status: "error" } : a)
        );
      }
    }
  };

  // 删除附件
  const removeAttachment = (id: string) => {
    setPendingAttachments(prev => {
      const att = prev.find(a => a.id === id);
      if (att?.previewUrl) URL.revokeObjectURL(att.previewUrl);
      return prev.filter(a => a.id !== id);
    });
  };

  // 加载频道成员（用于@提及）
  const loadChannelMembers = useCallback(async () => {
    if (!selectedChannelId || !user?.id) return;
    try {
      const res = await fetch(`/api/channels/members?channelId=${selectedChannelId}&userId=${user.id}`);
      const data = await res.json();
      if (data.success && data.members) {
        setChannelMembers(
          data.members.map((m: { userId: string; name: string; nickname: string | null; avatar: string | null }) => ({
            userId: m.userId,
            name: m.name,
            nickname: m.nickname || null,
            avatar: m.avatar,
          }))
        );
      }
    } catch { /* ignore */ }
  }, [selectedChannelId, user?.id]);

  useEffect(() => {
    loadChannelMembers();
  }, [loadChannelMembers]);

  // 加载团队成员列表（频道加载时即加载，供@提及面板和转发弹窗使用）
  useEffect(() => {
    if (!teamId) return;
    const loadTeamMembers = async () => {
      try {
        const res = await fetch(`/api/teams/members?teamId=${teamId}`);
        const data = await res.json();
        if (data.success && data.members) {
          setTeamMemberList(
            data.members.map((m: { id: string; name: string; nickname: string | null; avatar: string }) => ({
              userId: m.id,
              name: m.name,
              nickname: m.nickname || null,
              avatar: m.avatar || null,
            }))
          );
        }
      } catch { /* ignore */ }
    };
    loadTeamMembers();
  }, [teamId]);

  // 加载智能体列表
  useEffect(() => {
    loadAgentList();
  }, [teamId, loadAgentList]);

  // 加载最近话题标签（从当前消息中提取）
  useEffect(() => {
    const topics = new Set<string>();
    for (const msg of messages) {
      if (msg.topicTags) {
        msg.topicTags.forEach(t => topics.add(t));
      }
    }
    setRecentTopics([...topics].slice(0, 20));
  }, [messages]);

  // 自动调整输入框高度：1行起步，最大10行
  const autoResizeTextarea = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    const lineHeight = 20; // text-sm 行高约 20px
    const maxRows = 10;
    const maxHeight = lineHeight * maxRows;
    el.style.height = Math.min(el.scrollHeight, maxHeight) + "px";
  };

  // 包裹选中文本的辅助函数
  const wrapSelection = (prefix: string, suffix: string, placeholder?: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selectedText = message.slice(start, end);
    const replacement = selectedText || (placeholder || "文本");
    const newText = message.slice(0, start) + prefix + replacement + suffix + message.slice(end);
    setMessage(newText);
    // 设置光标位置：如果有选中文本则包裹，否则选中 placeholder
    requestAnimationFrame(() => {
      el.focus();
      if (selectedText) {
        el.setSelectionRange(start + prefix.length, start + prefix.length + selectedText.length);
      } else {
        el.setSelectionRange(start + prefix.length, start + prefix.length + replacement.length);
      }
      autoResizeTextarea(el);
    });
  };

  // 在行首插入前缀（用于列表、引用等块级格式）
  // 在行首插入/移除前缀（支持多行选区，有序列表自动递增序号）
  const insertLinePrefix = (prefix: string, ordered = false) => {
    const el = textareaRef.current;
    if (!el) return;
    const selStart = el.selectionStart;
    const selEnd = el.selectionEnd;

    // 找到选区覆盖的首行起始位置
    const firstLineStart = message.lastIndexOf("\n", selStart - 1) + 1;
    // 找到选区覆盖的末行结束位置
    const lastLineEnd = selEnd >= message.length ? message.length : (message.indexOf("\n", selEnd) === -1 ? message.length : message.indexOf("\n", selEnd));

    // 提取所有覆盖的行
    const coveredText = message.slice(firstLineStart, lastLineEnd);
    const lines = coveredText.split("\n");

    // 有序列表前缀正则：匹配 "1. ", "2. " 等
    const orderedPrefixRe = /^\d+\.\s/;

    // 判断 toggle 方向
    let allHavePrefix: boolean;
    if (ordered) {
      // 有序列表：检查所有行是否都有数字前缀
      allHavePrefix = lines.every((line) => orderedPrefixRe.test(line) || line === "");
    } else {
      allHavePrefix = lines.every((line) => line.startsWith(prefix) || line === "");
    }

    let newLines: string[];
    if (allHavePrefix) {
      // 移除所有行的前缀
      if (ordered) {
        newLines = lines.map((line) => line.replace(orderedPrefixRe, ""));
      } else {
        newLines = lines.map((line) => (line.startsWith(prefix) ? line.slice(prefix.length) : line));
      }
    } else {
      // 先移除已有前缀，再添加新前缀
      const cleanedLines = ordered
        ? lines.map((line) => line.replace(orderedPrefixRe, ""))
        : lines.map((line) => (line.startsWith(prefix) ? line.slice(prefix.length) : line));

      if (ordered) {
        // 有序列表：递增序号
        newLines = cleanedLines.map((line, idx) => (line === "" ? line : `${idx + 1}. ${line}`));
      } else {
        newLines = cleanedLines.map((line) => (line === "" ? line : prefix + line));
      }
    }

    const newCoveredText = newLines.join("\n");
    const finalText = message.slice(0, firstLineStart) + newCoveredText + message.slice(lastLineEnd);
    setMessage(finalText);

    requestAnimationFrame(() => {
      el.focus();
      // 恢复选区：保持覆盖所有修改过的行
      const newSelEnd = firstLineStart + newCoveredText.length;
      if (selStart === selEnd) {
        // 无选区：光标偏移量估算
        const avgPrefixLen = ordered ? 3 : prefix.length;
        const offset = allHavePrefix ? -avgPrefixLen : avgPrefixLen;
        const adjustedPos = Math.max(firstLineStart, selStart + offset);
        el.setSelectionRange(adjustedPos, adjustedPos);
      } else {
        el.setSelectionRange(firstLineStart, newSelEnd);
      }
      autoResizeTextarea(el);
    });
  };

  // 处理输入框内容变化，检测 @ 和 # 触发
  const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setMessage(value);

    // 自动调整输入框高度
    autoResizeTextarea(e.target);

    // 检测 @ 触发
    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@([^\s@]*)$/);
    if (atMatch) {
      setShowMentionPanel(true);
      setMentionTab("members");
      setMentionSearch(atMatch[1]);
      setMentionPosition(cursorPos - atMatch[0].length);
    } else {
      setShowMentionPanel(false);
    }

    // 检测 # 触发
    const hashMatch = textBeforeCursor.match(/#([^\s#]*)$/);
    if (hashMatch && !hashMatch[0].startsWith("##")) {
      setShowTopicPanel(true);
      setTopicSearch(hashMatch[1]);
      setTopicPosition(cursorPos - hashMatch[0].length);
    } else {
      setShowTopicPanel(false);
    }

    // 检测 / 触发（智能体面板，仅在行首或空格后）
    const slashMatch = textBeforeCursor.match(/(?:^|\s)\/([^\s/]*)$/);
    if (slashMatch) {
      setShowAgentPanel(true);
      setAgentSearch(slashMatch[1]);
      setActiveAgentIdx(0);
      setAgentPosition(cursorPos - slashMatch[1].length - 1); // -1 包含 /
    } else {
      setShowAgentPanel(false);
    }
  };

  // 插入 @成员
  const insertMention = (name: string, userId?: string) => {
    const before = message.slice(0, mentionPosition);
    const after = message.slice(textareaRef.current?.selectionStart || message.length);
    // 输入框只显示干净的 @name，userId 存入 mentionMap
    const mentionKey = `@${name}`;
    if (userId) {
      setMentionMap(prev => new Map(prev).set(mentionKey, userId));
    }
    const newMessage = `${before}${mentionKey} ${after}`;
    setMessage(newMessage);
    setShowMentionPanel(false);
    textareaRef.current?.focus();
    // 延迟调整高度，等待 React 渲染完成
    requestAnimationFrame(() => { if (textareaRef.current) autoResizeTextarea(textareaRef.current); });
  };

  // 插入 @智能体 提及（从 @mention 面板选择智能体）
  const insertAgentMention = (agent: { id: string; name: string }) => {
    const before = message.slice(0, mentionPosition);
    const after = message.slice(textareaRef.current?.selectionStart || message.length);
    const mentionKey = `@${agent.name}`;
    const newMessage = `${before}${mentionKey} ${after}`;
    setMessage(newMessage);
    // 设置 selectedAgentId 触发智能体调用
    setSelectedAgentId(agent.id);
    setSelectedAgentName(agent.name);
    setShowMentionPanel(false);
    textareaRef.current?.focus();
    requestAnimationFrame(() => { if (textareaRef.current) autoResizeTextarea(textareaRef.current); });
  };

  // 插入 #话题
  const insertTopic = (topic: string) => {
    const before = message.slice(0, topicPosition);
    const after = message.slice(textareaRef.current?.selectionStart || message.length);
    const newMessage = `${before}#${topic} ${after}`;
    setMessage(newMessage);
    setShowTopicPanel(false);
    textareaRef.current?.focus();
    requestAnimationFrame(() => { if (textareaRef.current) autoResizeTextarea(textareaRef.current); });
  };

  // 选择智能体（插入 /智能体名 到输入框）
  const selectAgent = (agent: { id: string; name: string; description: string }) => {
    const before = message.slice(0, agentPosition);
    const after = message.slice(textareaRef.current?.selectionStart || message.length);
    // 移除已输入的 /部分
    const slashMatch = before.match(/\/[^/\s]*$/);
    const cleanBefore = slashMatch ? before.slice(0, before.length - slashMatch[0].length) : before;
    // 清除斜杠命令文本，仅保留用户后续输入
    const newMessage = `${cleanBefore}${after}`;
    setMessage(newMessage);
    setSelectedAgentId(agent.id);
    setSelectedAgentName(agent.name);
    setShowAgentPanel(false);
    setAgentSearch("");
    setActiveAgentIdx(0);
    textareaRef.current?.focus();
    requestAnimationFrame(() => { if (textareaRef.current) autoResizeTextarea(textareaRef.current); });
  };

  // 清除已选智能体
  const clearSelectedAgent = useCallback(() => {
    setSelectedAgentId(null);
    setSelectedAgentName(null);
  }, []);

  // 调用智能体回复
  const invokeAgent = useCallback(async (agentId: string, channelId: string, userMessage: string, userMessageId: string, attachments?: any[]) => {
    setAgentResponding(true);
    setToolCalls([]);
    setAgentError(null);
    setSafetyIntercepted(false);
    setAgentProgress(null);
    const toolMap = new Map<string, ToolCallItem>();
    const toolOrder: string[] = [];
    let toolCallStartTime = 0;
    try {
      const res = await fetch("/api/channels/messages/agent", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-user-id": user?.id || "",
        },
        body: JSON.stringify({ agentId, channelId, userMessage, userMessageId, attachments }),
      });

      if (!res.ok) {
        console.error("调用智能体失败:", res.status);
        setAgentError(`调用失败 (${res.status})`);
        setAgentResponding(false);
        return;
      }

      // 读取 SSE 流
      const reader = res.body?.getReader();
      if (!reader) { setAgentResponding(false); return; }

      const decoder = new TextDecoder();
      let messageId: string | null = null;
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

              // 处理步骤事件
              if (parsed.type === "step") {
                setCurrentStep(parsed.content);
              }

              // 处理工具调用结果
              if (parsed.type === "tool_result") {
                const key = `${parsed.tool}-${Date.now()}`;
                if (!toolMap.has(key)) {
                  toolOrder.push(key);
                }
                toolMap.set(key, {
                  name: parsed.tool,
                  status: parsed.success ? "success" : "error",
                  result: typeof parsed.result === "string" ? parsed.result.slice(0, 200) : JSON.stringify(parsed.result).slice(0, 200),
                  durationMs: Date.now() - (toolCallStartTime || Date.now()),
                });
                setToolCalls(Array.from(toolMap.values()));
              }

              // 处理进度事件
              if (parsed.type === "progress") {
                setAgentProgress({
                  iteration: parsed.iteration || 0,
                  maxIterations: parsed.maxIterations || 10,
                  toolsCalled: parsed.toolsCalled || 0,
                  elapsedMs: parsed.elapsedMs || 0,
                  tokenUsage: parsed.tokenUsage || 0,
                  summary: parsed.summary || "",
                  budget: parsed.budget || "",
                });
              }

              // 处理工具调用开始（stream-agent-chat 格式）
              if (parsed.type === "function_call_detail") {
                toolCallStartTime = Date.now();
                const match = parsed.content?.match(/调用:\s*(\w+)/);
                if (match) {
                  const toolName = match[1];
                  const key = `${toolName}-${Date.now()}`;
                  if (!toolMap.has(key)) {
                    toolOrder.push(key);
                  }
                  toolMap.set(key, {
                    name: toolName,
                    args: parsed.content.replace(/^调用:\s*\w+\s*/, "").slice(0, 60),
                    status: "executing",
                  });
                  setToolCalls(Array.from(toolMap.values()));
                }
              }

              // 处理委托事件
              if (parsed.type === "delegate_agent_start") {
                const agentName = parsed.agent_name || "";
                // 更新已存在的 delegate_agent 工具调用
                setToolCalls(prev => prev.map(tc =>
                  tc.name === "delegate_agent" && tc.status === "executing"
                    ? { ...tc, delegateTo: agentName }
                    : tc
                ));
              }

              // 处理错误事件
              if (parsed.type === "error") {
                setAgentError(parsed.content || "执行出错");
              }

              // 处理安全拦截（死循环/超预算）
              if (parsed.type === "safety_intercepted") {
                setSafetyIntercepted(true);
              }

              if (parsed.done && parsed.messageId) {
                messageId = parsed.messageId;
              }
            } catch { /* ignore */ }
          }
        }
      }

      // 清除步骤指示
      setCurrentStep(null);

      // 刷新频道消息列表（智能体回复现在是顶级帖子，直接出现在频道流中）
      if (channelId) {
        try {
          const msgRes = await fetch(`/api/channels/messages?channelId=${channelId}&userId=${user?.id}&limit=20`);
          const msgData = await msgRes.json();
          if (msgData.success) {
            setMessages(msgData.messages || []);
            shouldScrollRef.current = true;
          }
        } catch (e) {
          console.error("刷新消息失败:", e);
        }
      }
    } catch (err) {
      console.error("调用智能体失败:", err);
      setAgentError(err instanceof Error ? err.message : "网络请求失败");
    } finally {
      setAgentResponding(false);
      setCurrentStep(null);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 插入链接
  const insertLink = () => {
    if (!linkText.trim() || !linkUrl.trim()) return;
    const linkMarkdown = `[${linkText.trim()}](${linkUrl.trim()})`;
    const cursorPos = textareaRef.current?.selectionStart || message.length;
    setMessage(message.slice(0, cursorPos) + linkMarkdown + message.slice(cursorPos));
    setShowLinkDialog(false);
    setLinkText("");
    setLinkUrl("");
    textareaRef.current?.focus();
    requestAnimationFrame(() => { if (textareaRef.current) autoResizeTextarea(textareaRef.current); });
  };

  // ============ 回复区专用处理函数 ============
  // 回复区 wrapSelection
  const threadWrapSelection = (prefix: string, suffix: string, placeholder?: string) => {
    const el = threadTextareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = threadReplyContent.slice(start, end);
    const text = selected || placeholder || "";
    const newText = threadReplyContent.slice(0, start) + prefix + text + suffix + threadReplyContent.slice(end);
    setThreadReplyContent(newText);
    requestAnimationFrame(() => {
      if (el) {
        const pos = start + prefix.length + text.length;
        el.selectionStart = el.selectionEnd = pos;
        el.focus();
        autoResizeTextarea(el);
      }
    });
  };

  // 回复区 insertLinePrefix
  const threadInsertLinePrefix = (prefix: string, ordered = false) => {
    const el = threadTextareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const before = threadReplyContent.slice(0, start);
    const after = threadReplyContent.slice(start);
    const lineStart = before.lastIndexOf("\n") + 1;
    const currentLine = before.slice(lineStart);
    const hasPrefix = ordered
      ? /^\d+\.\s/.test(currentLine)
      : currentLine.startsWith(prefix);
    if (hasPrefix) {
      const newBefore = before.slice(0, lineStart) + after;
      setThreadReplyContent(newBefore);
      requestAnimationFrame(() => {
        if (el) { el.selectionStart = el.selectionEnd = lineStart; el.focus(); autoResizeTextarea(el); }
      });
    } else {
      let insertPrefix = prefix;
      if (ordered) {
        const prevLines = before.slice(0, lineStart).split("\n");
        let lastNum = 0;
        for (let i = prevLines.length - 1; i >= 0; i--) {
          const m = prevLines[i].match(/^(\d+)\.\s/);
          if (m) { lastNum = parseInt(m[1]); break; }
        }
        insertPrefix = `${lastNum + 1}. `;
      }
      const newBefore = before.slice(0, lineStart) + insertPrefix + before.slice(lineStart);
      setThreadReplyContent(newBefore + after);
      requestAnimationFrame(() => {
        if (el) { el.selectionStart = el.selectionEnd = lineStart + insertPrefix.length; el.focus(); autoResizeTextarea(el); }
      });
    }
  };

  // 回复区文件选择
  const threadHandleFileSelect = async (files: FileList | File[], forcedType?: "image" | "video" | "file") => {
    const currentCount = threadPendingAttachments.length;
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
      const id = `thread-att-${Date.now()}-${i}`;
      const previewUrl = type === "image" ? URL.createObjectURL(file) : "";
      const newAtt = { id, file, type, previewUrl, name: file.name, size: file.size, status: "uploading" as const };
      setThreadPendingAttachments(prev => [...prev, newAtt]);
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("type", type);
        formData.append("userId", user?.id || "");
        const res = await fetch("/api/upload/attachment", { method: "POST", body: formData });
        const data = await res.json();
        if (data.success) {
          setThreadPendingAttachments(prev => prev.map(a => a.id === id ? { ...a, status: "done" as const, key: data.key, url: data.url } : a));
        } else {
          setThreadPendingAttachments(prev => prev.map(a => a.id === id ? { ...a, status: "error" as const } : a));
        }
      } catch {
        setThreadPendingAttachments(prev => prev.map(a => a.id === id ? { ...a, status: "error" as const } : a));
      }
    }
  };

  const threadRemoveAttachment = (id: string) => {
    setThreadPendingAttachments(prev => {
      const att = prev.find(a => a.id === id);
      if (att?.previewUrl) URL.revokeObjectURL(att.previewUrl);
      return prev.filter(a => a.id !== id);
    });
  };

  // 回复区 insertMention
  const threadInsertMention = (userId: string, name: string) => {
    const before = threadReplyContent.slice(0, threadMentionPosition);
    const afterAt = threadReplyContent.slice(threadMentionPosition + threadMentionSearch.length + 1);
    setThreadMentionMap(prev => ({ ...prev, [`@${name}`]: userId }));
    setThreadReplyContent(before + `@${name} ` + afterAt);
    setThreadShowMentionPanel(false);
    threadTextareaRef.current?.focus();
    requestAnimationFrame(() => { if (threadTextareaRef.current) autoResizeTextarea(threadTextareaRef.current); });
  };

  // 回复区 insertAgentMention（@智能体选择）
  const threadInsertAgentMention = (agent: { id: string; name: string }) => {
    const before = threadReplyContent.slice(0, threadMentionPosition);
    const afterAt = threadReplyContent.slice(threadMentionPosition + threadMentionSearch.length + 1);
    setThreadReplyContent(before + `@${agent.name} ` + afterAt);
    setThreadSelectedAgentId(agent.id);
    setThreadSelectedAgentName(agent.name);
    setThreadShowMentionPanel(false);
    threadTextareaRef.current?.focus();
    requestAnimationFrame(() => { if (threadTextareaRef.current) autoResizeTextarea(threadTextareaRef.current); });
  };

  // 回复区 insertTopic
  const threadInsertTopic = (topic: string) => {
    const before = threadReplyContent.slice(0, threadTopicPosition);
    const afterHash = threadReplyContent.slice(threadTopicPosition + threadTopicSearch.length + 1);
    setThreadReplyContent(before + `#${topic} ` + afterHash);
    setThreadShowTopicPanel(false);
    threadTextareaRef.current?.focus();
    requestAnimationFrame(() => { if (threadTextareaRef.current) autoResizeTextarea(threadTextareaRef.current); });
  };

  // 回复区 selectAgent
  const threadSelectAgent = (agent: { id: string; name: string; description: string }) => {
    const before = threadReplyContent.slice(0, threadAgentPosition);
    const afterSlash = threadReplyContent.slice(threadAgentPosition + threadAgentSearch.length + 1);
    // 清除斜杠命令文本，仅保留用户后续输入
    setThreadReplyContent(before + afterSlash);
    setThreadSelectedAgentId(agent.id);
    setThreadSelectedAgentName(agent.name);
    setThreadShowAgentPanel(false);
    setThreadActiveAgentIdx(0);
    threadTextareaRef.current?.focus();
    requestAnimationFrame(() => { if (threadTextareaRef.current) autoResizeTextarea(threadTextareaRef.current); });
  };

  // 清除线程已选智能体
  const clearThreadSelectedAgent = useCallback(() => {
    setThreadSelectedAgentId(null);
    setThreadSelectedAgentName(null);
  }, []);

  // 回复区 insertLink
  const threadInsertLink = () => {
    if (!threadLinkText.trim() || !threadLinkUrl.trim()) return;
    const linkMarkdown = `[${threadLinkText.trim()}](${threadLinkUrl.trim()})`;
    const cursorPos = threadTextareaRef.current?.selectionStart || threadReplyContent.length;
    setThreadReplyContent(threadReplyContent.slice(0, cursorPos) + linkMarkdown + threadReplyContent.slice(cursorPos));
    setThreadShowLinkDialog(false);
    setThreadLinkText("");
    setThreadLinkUrl("");
    threadTextareaRef.current?.focus();
    requestAnimationFrame(() => { if (threadTextareaRef.current) autoResizeTextarea(threadTextareaRef.current); });
  };

  // 回复区 handleMessageChange（支持 @/# 检测）
  const threadHandleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setThreadReplyContent(val);
    autoResizeTextarea(e.target);

    // @ 检测
    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = val.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@([^\s@]*)$/);
    if (atMatch) {
      setThreadShowMentionPanel(true);
      setThreadMentionTab("members");
      setThreadMentionSearch(atMatch[1]);
      setThreadMentionPosition(cursorPos - atMatch[1].length - 1);
      setThreadShowTopicPanel(false);
      setThreadShowAgentPanel(false);
    } else {
      setThreadShowMentionPanel(false);
    }

    // # 检测
    const hashMatch = textBeforeCursor.match(/#([^\s#]*)$/);
    if (hashMatch && !atMatch) {
      setThreadShowTopicPanel(true);
      setThreadTopicSearch(hashMatch[1]);
      setThreadTopicPosition(cursorPos - hashMatch[1].length - 1);
      setThreadShowMentionPanel(false);
      setThreadShowAgentPanel(false);
    } else if (!atMatch) {
      setThreadShowTopicPanel(false);
    }

    // / 检测（智能体）
    const slashMatch = textBeforeCursor.match(/\/([^\s/]*)$/);
    if (slashMatch && !atMatch && !hashMatch) {
      setThreadShowAgentPanel(true);
      setThreadAgentSearch(slashMatch[1]);
      setThreadActiveAgentIdx(0);
      setThreadAgentPosition(cursorPos - slashMatch[1].length - 1);
      setThreadShowMentionPanel(false);
      setThreadShowTopicPanel(false);
    } else if (!atMatch && !hashMatch) {
      setThreadShowAgentPanel(false);
    }
  };

  // 切换表情反应（轻量刷新，不触发 loading 状态）
  const handleToggleReaction = async (messageId: string, emoji: string, userReacted: boolean) => {
    if (!user?.id) return;
    try {
      const res = await fetch("/api/channels/messages/reactions", {
        method: userReacted ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, userId: user.id, emoji }),
      });
      const data = await res.json();
      if (data.success) {
        silentRefreshMessages();
        if (threadOpen) loadThreadReplies(threadRootMessage?.id || "");
      }
    } catch (err) {
      console.error("切换反应失败:", err);
    }
  };

  // 收藏/取消收藏消息
  const handleToggleBookmark = async (messageId: string) => {
    if (!user?.id) return;
    try {
      const msg = messages.find(m => m.id === messageId);
      const isBookmarked = msg?.isBookmarked || false;

      if (isBookmarked) {
        const res = await fetch(`/api/channels/bookmarks?messageId=${messageId}&userId=${user.id}`, {
          method: "DELETE",
        });
        const data = await res.json();
        if (data.success) {
          silentRefreshMessages();
          toast.success("已取消收藏");
        }
      } else {
        const res = await fetch("/api/channels/bookmarks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageId, userId: user.id }),
        });
        const data = await res.json();
        if (data.success) {
          silentRefreshMessages();
          toast.success("收藏成功");
        }
      }
    } catch (err) {
      console.error("收藏操作失败:", err);
      toast.error("操作失败，请重试");
    }
  };

  // 打开回复线程
  const openThread = async (msg: ChannelMessage) => {
    setThreadRootMessage(msg);
    setThreadOpen(true);
    setThreadReplyContent("");
    if (threadTextareaRef.current) threadTextareaRef.current.style.height = "auto";
    await loadThreadReplies(msg.id);
  };

  const loadThreadReplies = async (messageId: string) => {
    if (!user?.id) return;
    try {
      const res = await fetch(`/api/channels/messages/replies?messageId=${messageId}&userId=${user.id}`);
      const data = await res.json();
      if (data.success) {
        setThreadRootMessage(data.rootMessage);
        setThreadReplies(data.replies || []);
      }
    } catch (err) {
      console.error("加载回复线程失败:", err);
    }
  };

  // 发送回复
  const handleSendReply = async () => {
    if ((!threadReplyContent.trim() && threadPendingAttachments.length === 0) || !threadRootMessage || !user?.id) return;
    const hasUploading = threadPendingAttachments.some(a => a.status === "uploading");
    if (hasUploading) return;

    // 检测 @智能体 调用
    let invokingAgentId: string | null = threadSelectedAgentId;
    let invokingAgentQuestion = "";

    if (!invokingAgentId) {
      const agentInvokeMatch = threadReplyContent.trim().match(/^\/([^\s]+)\s*([\s\S]*)/);
      if (agentInvokeMatch) {
        const agentName = agentInvokeMatch[1];
        const found = agentList.find(a => a.name === agentName);
        if (found) {
          invokingAgentId = found.id;
          invokingAgentQuestion = agentInvokeMatch[2].trim() || "你好";
        }
      }
      // 检测 @智能体名 手动输入
      if (!invokingAgentId) {
        const agentMentionMatch = threadReplyContent.trim().match(/^@([^\s]+)\s*([\s\S]*)/);
        if (agentMentionMatch) {
          const agentName = agentMentionMatch[1];
          const found = agentList.find(a => a.name === agentName);
          if (found) {
            invokingAgentId = found.id;
            invokingAgentQuestion = agentMentionMatch[2].trim() || "你好";
          }
        }
      }
    } else {
      // selectedAgentId 已设置（通过 @mention 或 Bot 按钮）
      const agentMention = `@${threadSelectedAgentName}`;
      const trimmed = threadReplyContent.trim();
      if (trimmed.startsWith(agentMention)) {
        invokingAgentQuestion = trimmed.slice(agentMention.length).trim() || "你好";
      } else {
        invokingAgentQuestion = trimmed || "你好";
      }
    }

    setSendingReply(true);
    try {
      // 处理 @提及替换
      let contentToSend = threadReplyContent.trim();
      for (const [displayName, userId] of Object.entries(threadMentionMap)) {
        contentToSend = contentToSend.replace(displayName, `@[${displayName.slice(1)}](${userId})`);
      }
      // 提取 mentions
      const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
      const mentions: string[] = [];
      let m;
      while ((m = mentionRegex.exec(contentToSend)) !== null) {
        mentions.push(m[2]);
      }
      // 处理附件
      const attachments = threadPendingAttachments
        .filter(a => a.status === "done" && a.key)
        .map(a => ({ type: a.type, key: a.key, name: a.name, size: a.size }));

      const res = await fetch("/api/channels/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId: threadRootMessage.channelId,
          senderId: user.id,
          content: contentToSend,
          messageType: "text",
          replyToId: threadRootMessage.id,
          threadRootId: threadRootMessage.id,
          attachments,
          mentions,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setThreadReplyContent("");
        setThreadMentionMap({});
        setThreadPendingAttachments([]);
        setThreadSelectedAgentId(null);
        setThreadSelectedAgentName(null);
        if (threadTextareaRef.current) threadTextareaRef.current.style.height = "auto";
        loadThreadReplies(threadRootMessage.id);
        silentRefreshMessages();

        // 如果是智能体调用，异步触发智能体回复
        if (invokingAgentId && data.message?.id) {
          invokeAgent(invokingAgentId, threadRootMessage.channelId, invokingAgentQuestion, data.message.id, attachments);
        }
      }
    } catch (err) {
      console.error("发送回复失败:", err);
    }
    setSendingReply(false);
  };

  // 切换长文折叠
  const toggleCollapsed = (msgId: string) => {
    setExpandedMessages((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) {
        next.delete(msgId);
      } else {
        next.add(msgId);
      }
      return next;
    });
  };

  // 跳转到指定频道
  const handleNavigateToChannel = async (channelId: string) => {
    // 关闭线程面板
    if (threadOpen) {
      setThreadOpen(false);
      setThreadRootMessage(null);
      setThreadReplies([]);
      setThreadReplyContent("");
      setThreadMentionMap({});
      setThreadPendingAttachments([]);
      setThreadShowMentionPanel(false);
      setThreadShowTopicPanel(false);
      setThreadShowAgentPanel(false);
    }

    // 如果目标频道不在当前可见列表中，先刷新分区数据
    const exists = findChannel(channelId);
    if (!exists) {
      await loadData();
    }

    // 切换到目标频道
    selectChannel(channelId);
  };

  // 导航到私聊
  const navigateToDM = (userId: string, _userName: string, _userAvatar: string | null, senderType: string) => {
    if (senderType === "agent") {
      router.push(`/dms?chatWithAgent=${userId}`);
    } else {
      router.push(`/dms?chatWith=${userId}`);
    }
  };

  // 删除消息
  const handleDeleteMessage = async (messageId: string) => {
    setDeleteMessageTarget(messageId);
    setShowDeleteMessage(true);
  };

  // 确认删除消息
  const confirmDeleteMessage = async () => {
    const msgId = deleteMessageTarget;
    if (!msgId) return;
    setDeletingMessage(true);
    try {
      const res = await fetch(`/api/channels/messages?messageId=${encodeURIComponent(msgId)}&userId=${encodeURIComponent(user?.id || "")}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "删除失败");
        return;
      }
      // 静默刷新消息列表
      await silentRefreshMessages();
    } catch {
      alert("删除失败，请重试");
    } finally {
      setDeletingMessage(false);
      setShowDeleteMessage(false);
      setDeleteMessageTarget(null);
    }
  };

  // 打开转发弹窗
  const handleOpenForward = (msg: ChannelMessage) => {
    setForwardMessage(msg);
    setShowForwardDialog(true);
  };

  // 转发到频道
  const handleForwardToChannel = async (channelId: string, content: string, forwardedFromId: string) => {
    const res = await fetch("/api/channels/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channelId,
        senderId: user?.id,
        content: content || null,
        messageType: "text",
        forwardedFromId,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "转发失败");
      throw new Error(data.error);
    }
    // 如果转发到当前频道，刷新消息列表
    if (channelId === selectedChannelId) {
      await silentRefreshMessages();
    }
  };

  // 转发到用户（私聊）
  const handleForwardToUser = async (targetUserId: string, content: string, originalMessage: ChannelMessage) => {
    // 先创建/获取会话
    const convRes = await fetch("/api/dms/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teamId,
        userId: user?.id,
        otherUserId: targetUserId,
      }),
    });
    const convData = await convRes.json();
    if (!convRes.ok) {
      alert(convData.error || "创建会话失败");
      throw new Error(convData.error);
    }

    const conversationId = convData.conversation?.id || convData.conversationId;
    if (!conversationId) {
      alert("创建会话失败");
      throw new Error("创建会话失败");
    }

    // 构建转发内容：附言 + 原消息引用
    const forwardLabel = `--- 转发自 ${originalMessage.sender.name} ---`;

    const msgRes = await fetch("/api/dms/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId,
        senderId: user?.id,
        content: content || forwardLabel,
        messageType: "text",
        forwardedFromType: "channel_message",
        forwardedFromId: originalMessage.id,
      }),
    });
    const msgData = await msgRes.json();
    if (!msgRes.ok) {
      alert(msgData.error || "发送失败");
      throw new Error(msgData.error);
    }
  };

  // 格式化时间
  const formatTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const timeStr = date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });

      if (diffDays === 0) {
        return `今天 ${timeStr}`;
      } else if (diffDays === 1) {
        return `昨天 ${timeStr}`;
      } else if (diffDays < 7) {
        return `${diffDays}天前 ${timeStr}`;
      } else {
        return `${date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" })} ${timeStr}`;
      }
    } catch {
      return dateStr;
    }
  };

  // 切换分区折叠状态
  const toggleSectionCollapse = async (section: SectionItem) => {
    try {
      await fetch("/api/channels/sections", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectionId: section.id,
          isCollapsed: !section.isCollapsed,
        }),
      });
      setSections((prev) =>
        prev.map((s) =>
          s.id === section.id ? { ...s, isCollapsed: !s.isCollapsed } : s
        )
      );
    } catch (err) {
      console.error("更新折叠状态失败:", err);
    }
  };

  // 删除分区
  const handleDeleteSection = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/channels/sections?sectionId=${deleteTarget.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        loadData();
        setShowDeleteSection(false);
        setDeleteTarget(null);
      } else {
        alert(data.error || "删除失败");
      }
    } catch (err) {
      console.error("删除分区失败:", err);
    }
  };

  // 删除频道
  const handleDeleteChannel = async () => {
    if (!deleteChannelTarget) return;
    try {
      const res = await fetch(`/api/channels?channelId=${deleteChannelTarget.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        // 如果删除的是当前选中的频道，清除选中状态
        if (selectedChannelId === deleteChannelTarget.id) {
          setSelectedChannelId(null);
        }
        loadData();
        setShowDeleteChannel(false);
        setDeleteChannelTarget(null);
      } else {
        alert(data.error || "删除失败");
      }
    } catch (err) {
      console.error("删除频道失败:", err);
    }
  };

  // 退出频道
  const handleLeaveChannel = async () => {
    if (!currentChannel || !user?.id) return;
    setLeaving(true);
    try {
      const res = await fetch(`/api/channels/join?channelId=${currentChannel.id}&userId=${user.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        setShowChannelDetail(false);
        setShowLeaveChannel(false);
        setSelectedChannelId(null);
        loadData();
      } else {
        alert(data.error || "退出失败");
      }
    } catch (err) {
      console.error("退出频道失败:", err);
    }
    setLeaving(false);
  };

  // 搜索过滤 + 浏览模式过滤
  const filteredSections = (() => {
    let result = sections;

    // 浏览模式关闭时，过滤掉未加入的公开频道
    if (!browseMode) {
      result = result.map((s) => ({
        ...s,
        channels: s.channels.filter((c) => c.isMember !== false),
      }));
    }

    // 搜索过滤
    if (searchQuery) {
      result = result
        .map((s) => ({
          ...s,
          channels: s.channels.filter((c) =>
            c.name.toLowerCase().includes(searchQuery.toLowerCase())
          ),
        }))
        .filter((s) => s.channels.length > 0 || s.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }

    return result;
  })();

  return (
    <div className="h-full flex overflow-hidden">
      {/* ========== 左侧频道列表 ========== */}
      <div className="w-80 border-r border-border flex flex-col bg-card shrink-0">
        {/* 顶部标题栏 */}
        <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
          <h2 className="font-semibold text-base">频道</h2>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowBrowseChannels(true)}>
            <LayoutGrid className="w-4 h-4" />
          </Button>
        </div>

        {/* 搜索 */}
        <div className="px-3 py-2 border-b border-border/50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="搜索频道..."
              className="pl-9 h-9 text-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>


        {/* 分区和频道列表 */}
        <ScrollArea className="flex-1 min-h-0">
          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">加载中...</div>
          ) : (
            <div className="p-1.5">
              {filteredSections.map((section) => (
                <div key={section.id} className="mb-0.5">
                  {/* 分区标题行 */}
                  <div className="flex items-center group">
                    <button
                      onClick={() => toggleSectionCollapse(section)}
                      className="flex items-center gap-1.5 flex-1 px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground rounded transition-colors"
                    >
                      {section.isCollapsed ? (
                        <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span className="truncate">{section.name}</span>
                    </button>
                    {/* 加号按钮 - 弹出创建菜单 */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="opacity-0 group-hover:opacity-100 h-6 w-6 flex items-center justify-center rounded hover:bg-muted transition-opacity shrink-0">
                          <Plus className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-40">
                        <DropdownMenuItem onClick={() => setShowCreateSection(true)}>
                          <Folder className="w-3.5 h-3.5 mr-2" />
                          创建新分区
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setCreateChannelSectionId(section.id);
                            setShowCreateChannel(true);
                          }}
                        >
                          <Hash className="w-3.5 h-3.5 mr-2" />
                          创建新频道
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setShowBrowseChannels(true)}>
                          <Search className="w-3.5 h-3.5 mr-2" />
                          浏览频道
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    {/* 更多操作（默认分区不显示） */}
                    {!section.isDefault && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="opacity-0 group-hover:opacity-100 h-6 w-6 flex items-center justify-center rounded hover:bg-muted transition-opacity shrink-0">
                            <MoreHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem
                            onClick={() => {
                              setRenameTarget(section);
                              setShowRenameSection(true);
                            }}
                          >
                            <Pencil className="w-3.5 h-3.5 mr-2" />
                            更改分区名称
                          </DropdownMenuItem>
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => {
                                setDeleteTarget(section);
                                setShowDeleteSection(true);
                              }}
                            >
                              <Trash2 className="w-3.5 h-3.5 mr-2" />
                              删除此分区
                            </DropdownMenuItem>
                          </>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>

                  {/* 频道列表 */}
                  {!section.isCollapsed && (
                    <div className="ml-1">
                      {section.channels.map((channel) => {
                        const isPreview = channel.type === "public" && !channel.isMember;
                        return (
                          <div
                            key={channel.id}
                            onClick={() => selectChannel(channel.id)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => { if (e.key === "Enter") selectChannel(channel.id); }}
                            className={cn(
                              "group/channel relative flex items-center justify-between w-full px-4 py-2 text-sm rounded transition-colors cursor-pointer",
                              selectedChannelId === channel.id
                                ? "bg-primary/15 text-primary font-semibold"
                                : isPreview
                                  ? "text-muted-foreground/70 hover:bg-muted hover:text-foreground"
                                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            )}
                          >
                            {/* 选中左侧竖条指示 */}
                            {selectedChannelId === channel.id && (
                              <div className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r bg-primary" />
                            )}
                            <span className="flex items-center gap-1.5 truncate">
                              {channel.type === "private" ? (
                                <Lock className="w-3.5 h-3.5 shrink-0" />
                              ) : (
                                <Hash className="w-3.5 h-3.5 shrink-0" />
                              )}
                              <span className={cn("truncate", isPreview && "italic")}>{channel.name}</span>
                              {isPreview && (
                                <span className="text-xs text-muted-foreground/60 shrink-0">预览</span>
                              )}
                            </span>
                          <span className="flex items-center gap-1 shrink-0">
                              {channel.isPinned && (
                                <Pin className="w-3 h-3 fill-current opacity-60" />
                              )}
                              {channel.isMember !== false && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button
                                      className="opacity-0 group-hover/channel:opacity-100 h-5 w-5 flex items-center justify-center rounded hover:bg-muted-foreground/10 transition-opacity"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <MoreHorizontal className="w-3.5 h-3.5" />
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-40">
                                    <DropdownMenuItem
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        selectChannel(channel.id);
                                        setShowChannelDetail(true);
                                      }}
                                    >
                                      频道设置
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        const newPinned = !channel.isPinned;
                                        try {
                                          const res = await fetch("/api/channels", {
                                            method: "PUT",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({ channelId: channel.id, isPinned: newPinned }),
                                          });
                                          const data = await res.json();
                                          if (data.success) loadData();
                                        } catch (err) {
                                          console.error("置顶操作失败:", err);
                                        }
                                      }}
                                    >
                                      <Pin className="w-3.5 h-3.5 mr-2" />
                                      {channel.isPinned ? "取消置顶" : "置顶频道"}
                                    </DropdownMenuItem>
                                    {!channel.isDefault && (
                                      <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                          className="text-destructive focus:text-destructive"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setDeleteChannelTarget(channel);
                                            setShowDeleteChannel(true);
                                          }}
                                        >
                                          <Trash2 className="w-3.5 h-3.5 mr-2" />
                                          删除频道
                                        </DropdownMenuItem>
                                      </>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}

            </div>
          )}
        </ScrollArea>
      </div>

      {/* ========== 右侧聊天区域 ========== */}
      <div className={cn("flex-1 flex flex-col min-w-0 overflow-hidden relative", threadOpen && "border-r border-border")}>
        {currentChannel ? (
          (() => {
            const isChannelJoined = currentChannel.isMember !== false;
            const isPrivateLocked = currentChannel.type === "private" && !isChannelJoined;

            return (
              <>
                {/* 频道标题 */}
                <div className="h-13 border-b border-border flex items-center justify-between px-4 shrink-0">
                  <button
                    className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                    onClick={() => isChannelJoined && setShowChannelDetail(true)}
                  >
                    {currentChannel.type === "private" ? (
                      <Lock className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <Hash className="w-4 h-4 text-muted-foreground" />
                    )}
                    <span className="font-medium text-sm">{currentChannel.name}</span>
                    {currentChannel.type === "private" && isChannelJoined && (
                      <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">私密</span>
                    )}
                    {currentChannel.sectionName && (
                      <span className="text-xs text-muted-foreground">
                        / {currentChannel.sectionName}
                      </span>
                    )}
                  </button>
                  <div className="flex items-center gap-1">
                    {isChannelJoined && (
                      <>
                        {/* 频道文件按钮 */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn("h-8 w-8", showFilesPanel && "text-primary bg-accent")}
                          onClick={() => setShowFilesPanel(!showFilesPanel)}
                          title="频道文件"
                        >
                          <FolderOpen className="w-4 h-4" />
                        </Button>
                        {/* AI助手按钮 - 专职系统助手，始终可用 */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn("h-8 w-8", showAiPanel && "text-primary bg-accent")}
                          onClick={() => setShowAiPanel(!showAiPanel)}
                          title="AI 助手"
                        >
                          <Bot className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowChannelDetail(true)}>
                          <Users className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn("h-8 w-8", currentChannel.isPinned && "text-primary")}
                          onClick={async () => {
                            const newPinned = !currentChannel.isPinned;
                            try {
                              const res = await fetch("/api/channels", {
                                method: "PUT",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ channelId: currentChannel.id, isPinned: newPinned }),
                              });
                              const data = await res.json();
                              if (data.success) {
                                loadData();
                              }
                            } catch (err) {
                              console.error("置顶操作失败:", err);
                            }
                          }}
                        >
                          <Pin className={cn("w-4 h-4", currentChannel.isPinned && "fill-current")} />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Search className="w-4 h-4" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={async () => {
                                const newPinned = !currentChannel.isPinned;
                                try {
                                  const res = await fetch("/api/channels", {
                                    method: "PUT",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ channelId: currentChannel.id, isPinned: newPinned }),
                                  });
                                  const data = await res.json();
                                  if (data.success) {
                                    loadData();
                                  }
                                } catch (err) {
                                  console.error("置顶操作失败:", err);
                                }
                              }}
                            >
                              <Pin className="w-4 h-4 mr-2" />
                              {currentChannel.isPinned ? "取消置顶" : "置顶频道"}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setShowChannelDetail(true)}>
                              频道设置
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setShowChannelDetail(true)}>
                              成员管理
                            </DropdownMenuItem>
                            <DropdownMenuItem>通知设置</DropdownMenuItem>
                            {!currentChannel.isDefault && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => {
                                    setDeleteChannelTarget(currentChannel);
                                    setShowDeleteChannel(true);
                                  }}
                                >
                                  <Trash2 className="w-4 h-4 mr-2" />
                                  删除频道
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </>
                    )}
                  </div>
                </div>

                {/* 私密频道锁定视图 */}
                {isPrivateLocked ? (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-center space-y-4 max-w-xs">
                      <div className="w-16 h-16 mx-auto rounded-full bg-muted flex items-center justify-center">
                        <Lock className="w-8 h-8 text-muted-foreground" />
                      </div>
                      <div>
                        <h3 className="font-medium text-base mb-1">这是私密频道</h3>
                        <p className="text-sm text-muted-foreground">
                          仅受邀成员可以查看和发送消息。如需加入，请联系频道管理员邀请。
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* 公开频道未加入 - 加入横幅 */}
                    {!isChannelJoined && (
                      <div className="px-4 py-3 bg-primary/5 border-b border-primary/10 flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-2">
                          <Hash className="w-4 h-4 text-primary" />
                          <span className="text-sm text-primary">
                            加入此频道以参与讨论和接收通知
                          </span>
                        </div>
                        <Button
                          size="sm"
                          onClick={async () => {
                            try {
                              const res = await fetch("/api/channels/join", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ channelId: currentChannel.id, userId: user?.id }),
                              });
                              const data = await res.json();
                              if (data.success) {
                                loadData();
                              } else {
                                alert(data.error || "加入失败");
                              }
                            } catch (err) {
                              console.error("加入频道失败:", err);
                            }
                          }}
                        >
                          加入频道
                        </Button>
                      </div>
                    )}

                    {/* 消息列表 */}
                    <ScrollArea ref={scrollAreaRef} className="flex-1 min-h-0 bg-muted/50 p-4 relative">
                      {/* 未读消息浮条 */}
                      {showUnreadBar && unreadCount > 0 && (
                        <div className="sticky top-0 z-10 flex justify-center pointer-events-none">
                          <button
                            type="button"
                            onClick={() => {
                              if (isAtBottom) {
                                // 已在底部，跳转到第一条未读
                                scrollToFirstUnread();
                              } else {
                                // 不在底部，跳回最新
                                scrollToBottom();
                                markAsRead();
                              }
                            }}
                            className="pointer-events-auto mt-1 px-3 py-1 rounded-full bg-primary text-primary-foreground text-xs font-medium shadow-md hover:bg-primary/90 transition-colors flex items-center gap-1"
                          >
                            {isAtBottom ? (
                              <>↑ {unreadCount}条未读消息，点击查看</>
                            ) : (
                              <>↓ 回到最新</>
                            )}
                          </button>
                        </div>
                      )}
                      {/* 加载更多指示器 */}
                      {loadingMore && (
                        <div className="flex items-center justify-center py-2 mb-1">
                          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground mr-2" />
                          <span className="text-xs text-muted-foreground">加载更多消息...</span>
                        </div>
                      )}
                      <div className="space-y-1">
                        {messagesLoading ? (
                          <MessageSkeleton />
                        ) : messages.length === 0 ? (
                          <div className="flex items-center justify-center py-12">
                            <div className="text-center space-y-2">
                              <Hash className="w-8 h-8 mx-auto text-muted-foreground/50" />
                              <p className="text-sm text-muted-foreground">还没有消息，来发起第一段对话吧</p>
                            </div>
                          </div>
                        ) : (
                          (() => {
                            const reversed = [...messages].reverse();
                            const elements: JSX.Element[] = [];
                            let lastDate = "";
                            reversed.forEach((msg) => {
                              const msgDate = new Date(msg.createdAt).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" });
                              if (msgDate !== lastDate) {
                                elements.push(
                                  <div key={`date-${msgDate}`} className="flex items-center gap-3 px-4 py-2">
                                  <div className="flex-1 h-px bg-border/40" />
                                  <span className="text-[11px] font-medium text-muted-foreground/60 whitespace-nowrap">{msgDate}</span>
                                  <div className="flex-1 h-px bg-border/40" />
                                </div>
                                );
                                lastDate = msgDate;
                              }
                              elements.push(
                                <ChannelMessageItem
                                  key={msg.id}
                                  message={msg}
                                  collapsedMessages={expandedMessages}
                                  onToggleCollapsed={toggleCollapsed}
                                  onOpenThread={openThread}
                                  onToggleReaction={handleToggleReaction}
                                  onNavigateToChannel={handleNavigateToChannel}
                                  onNavigateToDM={navigateToDM}
                                  onDelete={handleDeleteMessage}
                                  onForward={handleOpenForward}
                                  onBookmark={handleToggleBookmark}
                                  currentUserId={user?.id || ''}
                                  teamId={teamId}
                                  formatTime={formatTime}
                                />
                              );
                            });
                            return elements;
                          })()
                        )}
                        {agentResponding && (
                          <AgentThinkingPanel
                            currentStep={currentStep}
                            toolCalls={toolCalls}
                            isResponding={agentResponding}
                            error={agentError}
                            safetyIntercepted={safetyIntercepted}
                            progress={agentProgress}
                          />
                        )}
                      </div>
                      {messages.length > 0 && <div className="h-44 shrink-0" />}
                      <div ref={messagesEndRef} />
                    </ScrollArea>

                    {/* 消息输入框 - 悬浮样式 */}
                    {isChannelJoined ? (
                      <div className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none">
                        <div className="h-8 bg-gradient-to-t from-muted/30 to-transparent" />
                        <div className="relative px-4 pb-4 pointer-events-auto">
                          <div className="bg-background rounded-xl border border-border/60 overflow-hidden shadow-lg">
                          {/* 格式工具栏 */}
                          <div className="flex items-center gap-0 px-2.5 pt-2 text-muted-foreground">
                            <button type="button" onClick={() => wrapSelection("**", "**", "粗体文本")} className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-muted/80 transition-colors" title="粗体"><Bold className="w-3.5 h-3.5" /></button>
                            <button type="button" onClick={() => wrapSelection("*", "*", "斜体文本")} className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-muted/80 transition-colors" title="斜体"><Italic className="w-3.5 h-3.5" /></button>
                            <button type="button" onClick={() => wrapSelection("~~", "~~", "删除线文本")} className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-muted/80 transition-colors" title="删除线"><Strikethrough className="w-3.5 h-3.5" /></button>
                            <div className="w-px h-3.5 bg-border/60 mx-0.5" />
                            <button type="button" onClick={() => setShowLinkDialog(true)} className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-muted/80 transition-colors" title="链接"><Link2 className="w-3.5 h-3.5" /></button>
                            <button type="button" onClick={() => insertLinePrefix("- ")} className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-muted/80 transition-colors" title="无序列表"><List className="w-3.5 h-3.5" /></button>
                            <button type="button" onClick={() => insertLinePrefix("1. ", true)} className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-muted/80 transition-colors" title="有序列表"><ListOrdered className="w-3.5 h-3.5" /></button>
                            <button type="button" onClick={() => insertLinePrefix("> ")} className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-muted/80 transition-colors" title="引用"><Quote className="w-3.5 h-3.5" /></button>
                            <button type="button" onClick={() => wrapSelection("`", "`", "代码")} className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-muted/80 transition-colors" title="行内代码"><Code className="w-3.5 h-3.5" /></button>
                          </div>

                          {/* 输入框（含 @/# 弹出面板） */}
                          <div className="relative">
                            {/* 已选智能体标签 */}
                            {selectedAgentId && selectedAgentName && (
                              <div className="px-3 pt-2 flex items-center gap-1.5">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-medium">
                                  <Bot className="w-3 h-3" />
                                  {selectedAgentName}
                                  <button
                                    type="button"
                                    onClick={clearSelectedAgent}
                                    className="ml-0.5 hover:text-destructive transition-colors"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </span>
                                <span className="text-[10px] text-muted-foreground">输入问题后发送</span>
                              </div>
                            )}
                            <textarea
                              ref={textareaRef}
                              value={message}
                              onChange={handleMessageChange}
                              onKeyDown={(e) => {
                                // 智能体面板键盘导航
                                if (showAgentPanel) {
                                  const q = agentSearch.toLowerCase();
                                  const filtered = agentList.filter(a => a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q));
                                  if (e.key === "ArrowDown") {
                                    e.preventDefault();
                                    setActiveAgentIdx(prev => (prev + 1) % Math.max(filtered.length, 1));
                                    return;
                                  }
                                  if (e.key === "ArrowUp") {
                                    e.preventDefault();
                                    setActiveAgentIdx(prev => (prev - 1 + Math.max(filtered.length, 1)) % Math.max(filtered.length, 1));
                                    return;
                                  }
                                  if (e.key === "Enter" && !e.metaKey && !e.ctrlKey && filtered.length > 0) {
                                    e.preventDefault();
                                    selectAgent(filtered[activeAgentIdx]);
                                    return;
                                  }
                                  if (e.key === "Escape") {
                                    e.preventDefault();
                                    setShowAgentPanel(false);
                                    return;
                                  }
                                }
                                if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && (message.trim() || pendingAttachments.length > 0)) {
                                  handleSendMessage();
                                }
                              }}
                              placeholder={`向 #${currentChannel.name} 发送消息`}
                              rows={2}
                              className="w-full px-3 py-1.5 bg-transparent resize-none text-sm focus:outline-none placeholder:text-muted-foreground/60 max-h-[200px] overflow-y-auto"
                            />

                          </div>

                          {/* 附件预览区 */}
                          {pendingAttachments.length > 0 && (
                            <div className="px-3 pb-1.5">
                              <div className="flex flex-wrap gap-2">
                                {pendingAttachments.map((att) => (
                                  <div key={att.id} className="relative group">
                                    {att.type === "image" ? (
                                      <div className="relative w-20 h-20 rounded-lg overflow-hidden border border-border/60">
                                        <img src={att.previewUrl} alt="" className="w-full h-full object-cover" />
                                        {att.status === "uploading" && (
                                          <div className="absolute inset-0 bg-white/50 flex items-center justify-center">
                                            <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                                          </div>
                                        )}
                                        {att.status === "done" && (
                                          <button
                                            type="button"
                                            onClick={() => removeAttachment(att.id)}
                                            className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                          >
                                            <X className="w-3 h-3" />
                                          </button>
                                        )}
                                      </div>
                                    ) : att.type === "video" ? (
                                      <div className="relative w-20 h-20 rounded-lg overflow-hidden border border-border/60 bg-muted flex items-center justify-center">
                                        <Play className="w-6 h-6 text-muted-foreground" />
                                        {att.status === "uploading" && (
                                          <div className="absolute inset-0 bg-white/50 flex items-center justify-center">
                                            <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                                          </div>
                                        )}
                                        {att.status === "done" && (
                                          <button
                                            type="button"
                                            onClick={() => removeAttachment(att.id)}
                                            className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                          >
                                            <X className="w-3 h-3" />
                                          </button>
                                        )}
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-2 h-10 px-2.5 rounded-lg border border-border/60 bg-muted/30">
                                        <Paperclip className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                        <span className="text-xs text-foreground truncate max-w-[100px]">{att.name}</span>
                                        {att.status === "done" && (
                                          <button
                                            type="button"
                                            onClick={() => removeAttachment(att.id)}
                                            className="shrink-0 w-4 h-4 rounded-full hover:bg-muted/80 flex items-center justify-center"
                                          >
                                            <X className="w-3 h-3" />
                                          </button>
                                        )}
                                      </div>
                                    )}
                                    {att.status === "error" && (
                                      <button
                                        type="button"
                                        onClick={() => removeAttachment(att.id)}
                                        className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* @成员/智能体选择面板（Tab切换 + 搜索过滤） */}
                          {showMentionPanel && (
                            <div className="absolute bottom-full left-7 mb-2 w-64 bg-popover rounded-lg border border-border shadow-lg z-20">
                              {/* Tabs */}
                              <div className="flex border-b border-border">
                                <button
                                  type="button"
                                  className={`flex-1 px-3 py-2 text-xs font-medium text-center transition-colors ${mentionTab === "members" ? "text-foreground border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}
                                  onClick={() => setMentionTab("members")}
                                >
                                  成员
                                </button>
                                <button
                                  type="button"
                                  className={`flex-1 px-3 py-2 text-xs font-medium text-center transition-colors ${mentionTab === "agents" ? "text-foreground border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}
                                  onClick={() => setMentionTab("agents")}
                                >
                                  智能体
                                </button>
                              </div>
                              {/* 搜索框 */}
                              <div className="p-2 border-b border-border">
                                <div className="relative">
                                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                                  <input
                                    type="text"
                                    placeholder="搜索名称..."
                                    value={mentionSearch}
                                    onChange={(e) => setMentionSearch(e.target.value)}
                                    className="w-full h-7 pl-7 pr-2 text-xs bg-muted/50 rounded-md border border-border/50 focus:outline-none focus:border-primary/50"
                                    onKeyDown={(e) => {
                                      if (e.key === "Escape") {
                                        setShowMentionPanel(false);
                                      }
                                    }}
                                  />
                                </div>
                              </div>
                              {/* 列表 */}
                              <div className="max-h-60 overflow-y-auto">
                                {mentionTab === "members" ? (
                                  (() => {
                                    if (teamMemberList.length === 0) {
                                      return <div className="px-3 py-3 text-xs text-muted-foreground text-center">加载中...</div>;
                                    }
                                    const q = mentionSearch.toLowerCase();
                                    const allFiltered = teamMemberList.filter(m =>
                                      (m.name.toLowerCase().includes(q) || (m.nickname && m.nickname.toLowerCase().includes(q))) && m.userId !== user?.id
                                    );
                                    const filtered = allFiltered.slice(0, 10);
                                    if (filtered.length === 0) {
                                      return <div className="px-3 py-3 text-xs text-muted-foreground text-center">无匹配成员</div>;
                                    }
                                    return (
                                      <>
                                        {filtered.map(member => (
                                          <button
                                            key={member.userId}
                                            type="button"
                                            className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted/80 flex items-center gap-2"
                                            onClick={() => insertMention(member.name, member.userId)}
                                          >
                                            <UserAvatar avatarKey={member.avatar} name={member.name} className="w-6 h-6 shrink-0" fallbackClassName="text-[10px]" />
                                            <div className="flex items-center gap-1.5 min-w-0">
                                              <span className="text-xs font-medium truncate">{member.name}</span>
                                              {member.nickname && (
                                                <span className="text-[10px] text-muted-foreground truncate">({member.nickname})</span>
                                              )}
                                            </div>
                                          </button>
                                        ))}
                                        {allFiltered.length > 10 && (
                                          <div className="px-3 py-1.5 text-[10px] text-muted-foreground text-center border-t border-border/50">
                                            共 {allFiltered.length} 人，请输入更精确的关键词
                                          </div>
                                        )}
                                      </>
                                    );
                                  })()
                                ) : (
                                  (() => {
                                    const q = mentionSearch.toLowerCase();
                                    const allFiltered = agentList.filter(a =>
                                      a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q)
                                    );
                                    const filtered = allFiltered.slice(0, 10);
                                    if (filtered.length === 0) {
                                      return <div className="px-3 py-3 text-xs text-muted-foreground text-center">无匹配智能体</div>;
                                    }
                                    return (
                                      <>
                                        {filtered.map(agent => (
                                          <button
                                            key={agent.id}
                                            type="button"
                                            className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted/80 flex items-center gap-2"
                                            onClick={() => insertAgentMention(agent)}
                                          >
                                            <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                              <Bot className="w-3.5 h-3.5 text-primary" />
                                            </div>
                                            <div className="flex items-center gap-1.5 min-w-0">
                                              <span className="text-xs font-medium truncate">{agent.name}</span>
                                            </div>
                                          </button>
                                        ))}
                                        {allFiltered.length > 10 && (
                                          <div className="px-3 py-1.5 text-[10px] text-muted-foreground text-center border-t border-border/50">
                                            共 {allFiltered.length} 个智能体，请输入更精确的关键词
                                          </div>
                                        )}
                                      </>
                                    );
                                  })()
                                )}
                              </div>
                            </div>
                          )}

                          {/* #话题选择面板（放在容器外，避免被 overflow-hidden 裁剪） */}
                          {showTopicPanel && (
                            <div className="absolute bottom-full left-7 mb-2 w-56 bg-popover rounded-lg border border-border shadow-lg z-20">
                              <div className="p-2 border-b border-border">
                                <span className="text-[11px] text-muted-foreground font-medium">最近的话题</span>
                              </div>
                              <div className="max-h-60 overflow-y-auto">
                                {recentTopics
                                  .filter(t => t.toLowerCase().includes(topicSearch.toLowerCase()))
                                  .length === 0 ? (
                                  <div className="px-3 py-3 text-xs text-muted-foreground text-center">暂无话题</div>
                                ) : (
                                  recentTopics
                                    .filter(t => t.toLowerCase().includes(topicSearch.toLowerCase()))
                                    .map(topic => (
                                      <button
                                        key={topic}
                                        type="button"
                                        className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted/80 flex items-center gap-1.5"
                                        onClick={() => insertTopic(topic)}
                                      >
                                        <Hash className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                        <span className="text-xs text-primary">{topic}</span>
                                      </button>
                                    ))
                                )
                                }
                              </div>
                            </div>
                          )}

                          {/* /智能体选择面板 */}
                          {showAgentPanel && (
                            <div className="absolute bottom-full left-7 mb-2 w-72 bg-popover rounded-lg border border-border shadow-lg z-20 overflow-hidden">
                              <div className="px-3 py-2 border-b border-border flex items-center justify-between">
                                <span className="text-xs font-medium text-foreground">选择智能体</span>
                                <span className="text-[10px] text-muted-foreground">↑↓ 选择 · Enter 确认 · Esc 关闭</span>
                              </div>
                              <div className="max-h-60 overflow-y-auto py-1">
                                {(() => {
                                  if (agentList.length === 0) {
                                    return <div className="px-3 py-4 text-xs text-muted-foreground text-center">暂无可用智能体</div>;
                                  }
                                  const q = agentSearch.toLowerCase();
                                  const filtered = agentList.filter(a => a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q));
                                  if (filtered.length === 0) {
                                    return <div className="px-3 py-4 text-xs text-muted-foreground text-center">无匹配智能体</div>;
                                  }
                                  // 确保高亮索引在范围内
                                  const safeIdx = Math.min(activeAgentIdx, filtered.length - 1);
                                  return filtered.map((agent, idx) => {
                                    const isActive = idx === safeIdx;
                                    // 搜索关键词高亮
                                    const highlightText = (text: string) => {
                                      if (!q) return text;
                                      const lower = text.toLowerCase();
                                      const matchIdx = lower.indexOf(q);
                                      if (matchIdx === -1) return text;
                                      return (
                                        <>
                                          {text.slice(0, matchIdx)}
                                          <span className="text-primary font-medium">{text.slice(matchIdx, matchIdx + q.length)}</span>
                                          {text.slice(matchIdx + q.length)}
                                        </>
                                      );
                                    };
                                    // 彩色头像
                                    const avatarColors = ["bg-blue-500", "bg-emerald-500", "bg-violet-500", "bg-amber-500", "bg-rose-500", "bg-cyan-500"];
                                    let hash = 0;
                                    for (let i = 0; i < agent.name.length; i++) hash = agent.name.charCodeAt(i) + ((hash << 5) - hash);
                                    const avatarColor = avatarColors[Math.abs(hash) % avatarColors.length];
                                    return (
                                      <button
                                        key={agent.id}
                                        type="button"
                                        className={cn(
                                          "w-full px-3 py-2 text-left text-sm flex items-center gap-2.5 transition-colors",
                                          isActive ? "bg-primary/10" : "hover:bg-muted/60"
                                        )}
                                        onClick={() => selectAgent(agent)}
                                        onMouseEnter={() => setActiveAgentIdx(idx)}
                                      >
                                        <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-white text-xs font-bold", avatarColor)}>
                                          {agent.name.charAt(0)}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                          <div className="text-xs font-medium truncate">{highlightText(agent.name)}</div>
                                        </div>
                                        {isActive && (
                                          <kbd className="text-[9px] text-muted-foreground bg-muted/60 px-1 py-0.5 rounded shrink-0">↵</kbd>
                                        )}
                                      </button>
                                    );
                                  });
                                })()}
                              </div>
                            </div>
                          )}

                          {/* 超字数提示 */}
                          {message.length > MAX_MESSAGE_LENGTH && (
                            <div className="px-3 pb-1">
                              <span className="text-xs text-destructive">
                                已超过{message.length - MAX_MESSAGE_LENGTH}字
                              </span>
                            </div>
                          )}

                          {/* 底部操作栏 */}
                          <div className="flex items-center justify-between px-2.5 pb-2">
                            <div className="flex items-center gap-0.5 text-muted-foreground">
                              {/* + 添加应用/文件 */}
                              <Popover open={showAttachPanel} onOpenChange={setShowAttachPanel}>
                                <PopoverTrigger asChild>
                                  <button type="button" className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-muted/80 transition-colors"><Plus className="w-4 h-4" /></button>
                                </PopoverTrigger>
                                <PopoverContent side="top" align="start" sideOffset={4} collisionPadding={8} className="w-48 p-1">
                                  <button
                                    type="button"
                                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted/80 rounded flex items-center gap-2"
                                    onClick={() => {
                                      setShowAttachPanel(false);
                                      if (fileInputRef.current) {
                                        fileInputRef.current.accept = "image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar";
                                        fileInputRef.current.click();
                                      }
                                    }}
                                  >
                                    <Paperclip className="w-4 h-4 text-muted-foreground" />
                                    <span>文件</span>
                                  </button>
                                  <button
                                    type="button"
                                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted/80 rounded flex items-center gap-2"
                                    onClick={() => {
                                      setShowAttachPanel(false);
                                      if (fileInputRef.current) {
                                        fileInputRef.current.accept = "image/*";
                                        fileInputRef.current.click();
                                      }
                                    }}
                                  >
                                    <ImageIcon className="w-4 h-4 text-muted-foreground" />
                                    <span>图片</span>
                                  </button>
                                  <button
                                    type="button"
                                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted/80 rounded flex items-center gap-2"
                                    onClick={() => {
                                      setShowAttachPanel(false);
                                      if (fileInputRef.current) {
                                        fileInputRef.current.accept = "video/*";
                                        fileInputRef.current.click();
                                      }
                                    }}
                                  >
                                    <Play className="w-4 h-4 text-muted-foreground" />
                                    <span>视频</span>
                                  </button>
                                </PopoverContent>
                              </Popover>
                              {/* 图片 */}
                              <button type="button" onClick={() => { if (fileInputRef.current) { fileInputRef.current.accept = "image/*"; fileInputRef.current.click(); } }} className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-muted/80 transition-colors"><ImageIcon className="w-4 h-4" /></button>
                              {/* 附件 */}
                              <button type="button" onClick={() => { if (fileInputRef.current) { fileInputRef.current.accept = "*"; fileInputRef.current.click(); } }} className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-muted/80 transition-colors"><Paperclip className="w-4 h-4" /></button>
                              {/* 表情 - 使用完整版 */}
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button type="button" className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-muted/80 transition-colors"><Smile className="w-4 h-4" /></button>
                                </PopoverTrigger>
                                <PopoverContent side="top" align="start" sideOffset={4} collisionPadding={8} className="w-auto p-0">
                                  <EmojiPicker onSelect={(emoji: string) => {
                                    const pos = textareaRef.current?.selectionStart ?? message.length;
                                    setMessage(message.slice(0, pos) + emoji + message.slice(pos));
                                    textareaRef.current?.focus();
                                    requestAnimationFrame(() => { if (textareaRef.current) autoResizeTextarea(textareaRef.current); });
                                  }} />
                                </PopoverContent>
                              </Popover>
                              {/* @ */}
                              <button type="button" onClick={() => { setMessage(prev => prev + "@"); setShowMentionPanel(true); setMentionTab("members"); setMentionSearch(""); setMentionPosition(message.length); textareaRef.current?.focus(); }} className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-muted/80 transition-colors"><AtSign className="w-4 h-4" /></button>
                              {/* # */}
                              <button type="button" onClick={() => { setMessage(prev => prev + "#"); setShowTopicPanel(true); setTopicSearch(""); setTopicPosition(message.length); textareaRef.current?.focus(); }} className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-muted/80 transition-colors"><HashIcon className="w-4 h-4" /></button>
                              <button type="button" onClick={() => { setMessage(prev => prev + "/"); setShowAgentPanel(true); setAgentSearch(""); setActiveAgentIdx(0); setAgentPosition(message.length); textareaRef.current?.focus(); }} className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-muted/80 transition-colors" title="智能体"><Bot className="w-4 h-4" /></button>
                              {/* 隐藏文件输入 */}
                              <input
                                ref={fileInputRef}
                                type="file"
                                multiple
                                className="hidden"
                                onChange={(e) => {
                                  if (e.target.files && e.target.files.length > 0) {
                                    handleFileSelect(e.target.files);
                                    e.target.value = "";
                                  }
                                }}
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              {message.length > 0 && (
                                <span className={cn(
                                  "text-[11px]",
                                  message.length > MAX_MESSAGE_LENGTH ? "text-destructive font-medium" : "text-muted-foreground"
                                )}>
                                  {message.length}/{MAX_MESSAGE_LENGTH}
                                </span>
                              )}
                              <Button
                                size="sm"
                                disabled={(!message.trim() && pendingAttachments.length === 0) || sendingMessage || pendingAttachments.some(a => a.status === "uploading") || message.length > MAX_MESSAGE_LENGTH}
                                onClick={handleSendMessage}
                                className="h-7 px-3 rounded-lg text-xs"
                              >
                                <Send className="w-3.5 h-3.5 mr-1" />
                                {sendingMessage ? "发送中..." : "发送"}
                              </Button>
                            </div>
                          </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="absolute bottom-0 left-0 right-0 z-10">
                        <div className="h-6 bg-gradient-to-t from-muted/30 to-transparent" />
                        <div className="border-t border-border px-4 py-3 bg-muted/20">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Hash className="w-4 h-4" />
                            <span>加入频道后可参与讨论</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            );
          })()
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-3">
              <div className="w-16 h-16 mx-auto rounded-full bg-muted flex items-center justify-center">
                <Hash className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground text-sm">选择一个频道开始浏览</p>
            </div>
          </div>
        )}
      </div>

      {/* ========== 链接创建弹窗 ========== */}
      <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>创建链接</DialogTitle>
            <DialogDescription>插入一个链接到消息中</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">链接文本</label>
              <Input
                value={linkText}
                onChange={(e) => setLinkText(e.target.value)}
                placeholder="输入链接文本"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">链接地址</label>
              <Input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="输入链接地址"
                className="h-9"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLinkDialog(false)} className="h-8">取消</Button>
            <Button onClick={insertLink} disabled={!linkText.trim() || !linkUrl.trim()} className="h-8">创建</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 回复区链接弹窗 */}
      <Dialog open={threadShowLinkDialog} onOpenChange={setThreadShowLinkDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>创建链接</DialogTitle>
            <DialogDescription>插入一个链接到回复中</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">链接文本</label>
              <Input
                value={threadLinkText}
                onChange={(e) => setThreadLinkText(e.target.value)}
                placeholder="输入链接文本"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">链接地址</label>
              <Input
                value={threadLinkUrl}
                onChange={(e) => setThreadLinkUrl(e.target.value)}
                placeholder="输入链接地址"
                className="h-9"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setThreadShowLinkDialog(false)} className="h-8">取消</Button>
            <Button onClick={threadInsertLink} disabled={!threadLinkText.trim() || !threadLinkUrl.trim()} className="h-8">创建</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {threadOpen && threadRootMessage && (
        <div className="w-[380px] shrink-0 flex flex-col border-l border-border bg-muted/30 overflow-hidden">
          {/* 面板标题 */}
          <div className="h-12 border-b border-border/60 flex items-center justify-between px-4 shrink-0 bg-background">
            <span className="font-medium text-sm">回复 {threadReplies.length}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => setThreadOpen(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* 回复列表 */}
          <ScrollArea className="flex-1 min-h-0 px-4 py-3">
            <div className="space-y-1">
              {/* 原始消息 */}
              <div className="pb-3 mb-1">
                <ThreadMessageItem message={threadRootMessage} formatTime={formatTime} onNavigateToChannel={handleNavigateToChannel} onNavigateToDM={navigateToDM} isRoot />
              </div>

              {/* 分隔线 */}
              <div className="flex items-center gap-2 py-1.5 mb-1">
                <div className="flex-1 h-px bg-border/60" />
                <span className="text-[11px] text-muted-foreground shrink-0">{threadReplies.length} 条回复</span>
                <div className="flex-1 h-px bg-border/60" />
              </div>

              {/* 回复列表 */}
              {threadReplies.map((reply) => (
                <div key={reply.id} className="py-1.5">
                  <ThreadMessageItem message={reply} formatTime={formatTime} onNavigateToChannel={handleNavigateToChannel} onNavigateToDM={navigateToDM} />
                </div>
              ))}

              {threadReplies.length === 0 && (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  暂无回复，来发起第一条回复吧
                </div>
              )}
            </div>
          </ScrollArea>

          {/* 回复输入区 */}
          <div className="shrink-0 px-3 pb-3 pt-2 bg-muted/30 relative">
            <div className="bg-background rounded-xl border border-border/60">
              {/* 格式工具栏 */}
              <div className="flex items-center gap-0 px-2.5 pt-2 text-muted-foreground">
                <button type="button" onClick={() => threadWrapSelection("**", "**", "粗体文本")} className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-muted/80 transition-colors" title="粗体"><Bold className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={() => threadWrapSelection("_", "_", "斜体文本")} className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-muted/80 transition-colors" title="斜体"><Italic className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={() => threadWrapSelection("~~", "~~", "删除线文本")} className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-muted/80 transition-colors" title="删除线"><Strikethrough className="w-3.5 h-3.5" /></button>
                <div className="w-px h-3.5 bg-border/60 mx-0.5" />
                <button type="button" onClick={() => threadInsertLinePrefix("- ")} className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-muted/80 transition-colors" title="无序列表"><List className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={() => threadInsertLinePrefix("1. ", true)} className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-muted/80 transition-colors" title="有序列表"><ListOrdered className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={() => threadInsertLinePrefix("> ")} className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-muted/80 transition-colors" title="引用"><Quote className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={() => threadWrapSelection("`", "`", "代码")} className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-muted/80 transition-colors" title="行内代码"><Code className="w-3.5 h-3.5" /></button>
                <div className="w-px h-3.5 bg-border/60 mx-0.5" />
                <button type="button" onClick={() => setThreadShowLinkDialog(true)} className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-muted/80 transition-colors" title="链接"><Link2 className="w-3.5 h-3.5" /></button>
              </div>

              {/* 输入框 */}
              <div className="relative">
                {/* 已选智能体标签 */}
                {threadSelectedAgentId && threadSelectedAgentName && (
                  <div className="px-3 pt-2 flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-medium">
                      <Bot className="w-3 h-3" />
                      {threadSelectedAgentName}
                      <button
                        type="button"
                        onClick={clearThreadSelectedAgent}
                        className="ml-0.5 hover:text-destructive transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                    <span className="text-[10px] text-muted-foreground">输入问题后发送</span>
                  </div>
                )}
                <textarea
                  ref={threadTextareaRef}
                  value={threadReplyContent}
                  onChange={(e) => {
                    threadHandleMessageChange(e);
                  }}
                  onKeyDown={(e) => {
                    // 智能体面板键盘导航
                    if (threadShowAgentPanel) {
                      const q = threadAgentSearch.toLowerCase();
                      const filtered = agentList.filter(a => a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q));
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setThreadActiveAgentIdx(prev => (prev + 1) % Math.max(filtered.length, 1));
                        return;
                      }
                      if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setThreadActiveAgentIdx(prev => (prev - 1 + Math.max(filtered.length, 1)) % Math.max(filtered.length, 1));
                        return;
                      }
                      if (e.key === "Enter" && !e.metaKey && !e.ctrlKey && filtered.length > 0) {
                        e.preventDefault();
                        threadSelectAgent(filtered[threadActiveAgentIdx]);
                        return;
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        setThreadShowAgentPanel(false);
                        return;
                      }
                    }
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && (threadReplyContent.trim() || threadPendingAttachments.length > 0)) {
                      e.preventDefault();
                      handleSendReply();
                    }
                  }}
                  placeholder="回复..."
                  rows={2}
                  className="w-full px-3 py-1.5 bg-transparent resize-none text-sm focus:outline-none placeholder:text-muted-foreground/60 max-h-[160px] overflow-y-auto"
                />
                {/* @提及面板 */}
                {threadShowMentionPanel && (
                  <div className="absolute bottom-full left-0 right-0 mb-1 bg-background border border-border rounded-lg shadow-lg z-50">
                    {/* Tabs */}
                    <div className="flex border-b border-border">
                      <button
                        type="button"
                        className={`flex-1 px-3 py-1.5 text-[11px] font-medium text-center transition-colors ${threadMentionTab === "members" ? "text-foreground border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}
                        onClick={() => setThreadMentionTab("members")}
                      >成员</button>
                      <button
                        type="button"
                        className={`flex-1 px-3 py-1.5 text-[11px] font-medium text-center transition-colors ${threadMentionTab === "agents" ? "text-foreground border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}
                        onClick={() => setThreadMentionTab("agents")}
                      >智能体</button>
                    </div>
                    {/* Search */}
                    <div className="p-1.5 border-b border-border/50">
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                        <input
                          type="text"
                          placeholder="搜索名称..."
                          value={threadMentionSearch}
                          onChange={(e) => setThreadMentionSearch(e.target.value)}
                          className="w-full h-7 pl-7 pr-2 text-xs bg-muted/30 rounded-md border border-border/50 focus:outline-none focus:border-primary/40"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    </div>
                    {/* List */}
                    <div className="max-h-48 overflow-y-auto">
                      {threadMentionTab === "members" ? (
                        (() => {
                          if (teamMemberList.length === 0) {
                            return <div className="px-3 py-3 text-xs text-muted-foreground text-center">加载中...</div>;
                          }
                          const q = threadMentionSearch.toLowerCase();
                          const filtered = teamMemberList.filter(m =>
                            (m.name.toLowerCase().includes(q) || (m.nickname && m.nickname.toLowerCase().includes(q))) && m.userId !== user?.id
                          ).slice(0, 10);
                          if (filtered.length === 0) {
                            return <div className="px-3 py-3 text-xs text-muted-foreground text-center">无匹配成员</div>;
                          }
                          return (
                            <>
                              {filtered.map((m) => (
                                <button
                                  key={m.userId}
                                  type="button"
                                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/60 transition-colors text-left"
                                  onClick={() => threadInsertMention(m.userId, m.name)}
                                >
                                  <UserAvatar avatarKey={m.avatar} name={m.name} className="w-6 h-6 shrink-0" fallbackClassName="text-[10px]" />
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="text-xs font-medium truncate">{m.name}</span>
                                    {m.nickname && (
                                      <span className="text-[10px] text-muted-foreground truncate">({m.nickname})</span>
                                    )}
                                  </div>
                                </button>
                              ))}
                              <div className="px-3 py-1 text-[10px] text-muted-foreground text-center border-t border-border/50">
                                {teamMemberList.filter(m => (m.name.toLowerCase().includes(q) || (m.nickname?.toLowerCase() || "").includes(q)) && m.userId !== user?.id).length} 人，显示前10条
                              </div>
                            </>
                          );
                        })()
                      ) : (
                        (() => {
                          const q = threadMentionSearch.toLowerCase();
                          const filtered = agentList.filter(a =>
                            a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q)
                          ).slice(0, 10);
                          if (filtered.length === 0) {
                            return <div className="px-3 py-3 text-xs text-muted-foreground text-center">无匹配智能体</div>;
                          }
                          return (
                            <>
                              {filtered.map((a) => (
                                <button
                                  key={a.id}
                                  type="button"
                                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/60 transition-colors text-left"
                                  onClick={() => threadInsertAgentMention(a)}
                                >
                                  <BotIcon className="w-4 h-4 text-primary shrink-0" />
                                  <span className="text-xs font-medium truncate">{a.name}</span>
                                </button>
                              ))}
                              <div className="px-3 py-1 text-[10px] text-muted-foreground text-center border-t border-border/50">
                                {agentList.filter(a => a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q)).length} 个智能体，显示前10条
                              </div>
                            </>
                          );
                        })()
                      )}
                    </div>
                  </div>
                )}
                {/* #话题面板 */}
                {threadShowTopicPanel && (
                  <div className="absolute bottom-full left-0 right-0 mb-1 bg-background border border-border rounded-lg shadow-lg max-h-[200px] overflow-y-auto z-50">
                    {(() => {
                      const filtered = recentTopics.filter(t => t.toLowerCase().includes(threadTopicSearch.toLowerCase()));
                      return filtered.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground">无匹配话题</div>
                      ) : (
                        filtered.map((t) => (
                          <button
                            key={t}
                            type="button"
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/60 transition-colors text-left"
                            onClick={() => threadInsertTopic(t)}
                          >
                            <HashIcon className="w-3.5 h-3.5 text-muted-foreground" />
                            <span>{t}</span>
                          </button>
                        ))
                      );
                    })()}
                  </div>
                )}
                {/* /智能体面板 */}
                {threadShowAgentPanel && (
                  <div className="absolute bottom-full left-0 right-0 mb-1 bg-popover border border-border rounded-lg shadow-lg overflow-hidden z-50 max-h-[250px]">
                    <div className="px-3 py-1.5 border-b border-border flex items-center justify-between">
                      <span className="text-xs font-medium text-foreground">选择智能体</span>
                      <span className="text-[10px] text-muted-foreground">↑↓ · Enter · Esc</span>
                    </div>
                    <div className="max-h-[200px] overflow-y-auto py-1">
                      {(() => {
                        if (agentList.length === 0) {
                          return <div className="px-3 py-3 text-xs text-muted-foreground text-center">无可用智能体</div>;
                        }
                        const q = threadAgentSearch.toLowerCase();
                        const filtered = agentList.filter(a => a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q));
                        if (filtered.length === 0) {
                          return <div className="px-3 py-3 text-xs text-muted-foreground text-center">无匹配智能体</div>;
                        }
                        const safeIdx = Math.min(threadActiveAgentIdx, filtered.length - 1);
                        return filtered.map((a, idx) => {
                          const isActive = idx === safeIdx;
                          const avatarColors = ["bg-blue-500", "bg-emerald-500", "bg-violet-500", "bg-amber-500", "bg-rose-500", "bg-cyan-500"];
                          let hash = 0;
                          for (let i = 0; i < a.name.length; i++) hash = a.name.charCodeAt(i) + ((hash << 5) - hash);
                          const avatarColor = avatarColors[Math.abs(hash) % avatarColors.length];
                          return (
                            <button
                              key={a.id}
                              type="button"
                              className={cn(
                                "w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors text-left",
                                isActive ? "bg-primary/10" : "hover:bg-muted/60"
                              )}
                              onClick={() => threadSelectAgent(a)}
                              onMouseEnter={() => setThreadActiveAgentIdx(idx)}
                            >
                              <div className={cn("w-6 h-6 rounded-md flex items-center justify-center shrink-0 text-white text-[10px] font-bold", avatarColor)}>
                                {a.name.charAt(0)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-medium truncate">{a.name}</div>
                                {a.description && <div className="text-[10px] text-muted-foreground truncate">{a.description}</div>}
                              </div>
                            </button>
                          );
                        });
                      })()}
                    </div>
                  </div>
                )}
              </div>

              {/* 附件预览 */}
              {threadPendingAttachments.length > 0 && (
                <div className="flex flex-wrap gap-2 px-3 pb-1">
                  {threadPendingAttachments.map((att, idx) => (
                    <div key={att.id} className="relative group rounded-lg border border-border/60 overflow-hidden bg-muted/20">
                      {att.type === "image" ? (
                        <div className="w-20 h-20">
                          <img src={att.previewUrl} alt="" className="w-full h-full object-cover" />
                        </div>
                      ) : att.type === "video" ? (
                        <div className="w-20 h-20 flex items-center justify-center bg-muted/40">
                          <Video className="w-6 h-6 text-muted-foreground" />
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 px-2 py-1.5 max-w-[160px]">
                          <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                          <span className="text-xs text-muted-foreground truncate">{att.name}</span>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => threadRemoveAttachment(att.id)}
                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                      {att.status === "uploading" && (
                        <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                          <Loader2 className="w-5 h-5 animate-spin text-primary" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* 超字数提示 */}
              {threadReplyContent.length > MAX_MESSAGE_LENGTH && (
                <div className="px-3 pb-1">
                  <span className="text-xs text-destructive">
                    已超过{threadReplyContent.length - MAX_MESSAGE_LENGTH}字
                  </span>
                </div>
              )}

              {/* 底部操作栏 */}
              <div className="flex items-center justify-between px-2 pb-2">
                <div className="flex items-center gap-0.5 text-muted-foreground">
                  <Popover open={threadShowAttachPanel} onOpenChange={setThreadShowAttachPanel}>
                    <PopoverTrigger asChild>
                      <button type="button" className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-muted/80 transition-colors" title="添加附件"><Plus className="w-4 h-4" /></button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-40 p-1">
                      <button type="button" className="w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded hover:bg-muted/60 transition-colors" onClick={() => { threadFileInputRef.current?.click(); setThreadShowAttachPanel(false); }}>
                        <FileText className="w-4 h-4" />文件
                      </button>
                      <button type="button" className="w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded hover:bg-muted/60 transition-colors" onClick={() => { if(threadImageInputRef.current) threadImageInputRef.current.click(); setThreadShowAttachPanel(false); }}>
                        <ImageIcon className="w-4 h-4" />图片
                      </button>
                      <button type="button" className="w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded hover:bg-muted/60 transition-colors" onClick={() => { if(threadVideoInputRef.current) threadVideoInputRef.current.click(); setThreadShowAttachPanel(false); }}>
                        <Video className="w-4 h-4" />视频
                      </button>
                    </PopoverContent>
                  </Popover>
                  <input ref={threadFileInputRef} type="file" className="hidden" onChange={(e) => { if (e.target.files) threadHandleFileSelect(Array.from(e.target.files), "file"); e.target.value = ""; }} />
                  <input ref={threadImageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { if (e.target.files) threadHandleFileSelect(Array.from(e.target.files), "image"); e.target.value = ""; }} />
                  <input ref={threadVideoInputRef} type="file" accept="video/*" className="hidden" onChange={(e) => { if (e.target.files) threadHandleFileSelect(Array.from(e.target.files), "video"); e.target.value = ""; }} />
                  <Popover open={threadEmojiPopoverOpen} onOpenChange={setThreadEmojiPopoverOpen}>
                    <PopoverTrigger asChild>
                      <button type="button" className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-muted/80 transition-colors" title="表情"><Smile className="w-4 h-4" /></button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-auto p-2">
                      <EmojiPicker onSelect={(emoji: string) => { setThreadReplyContent(prev => prev + emoji); setThreadEmojiPopoverOpen(false); threadTextareaRef.current?.focus(); }} />
                    </PopoverContent>
                  </Popover>
                  <button type="button" className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-muted/80 transition-colors" title="@提及" onClick={() => { setThreadShowMentionPanel(!threadShowMentionPanel); setThreadMentionTab("members"); setThreadMentionSearch(""); setThreadShowTopicPanel(false); setThreadShowAgentPanel(false); }}><AtSign className="w-4 h-4" /></button>
                  <button type="button" className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-muted/80 transition-colors" title="#话题" onClick={() => { setThreadShowTopicPanel(!threadShowTopicPanel); setThreadShowMentionPanel(false); setThreadShowAgentPanel(false); }}><HashIcon className="w-4 h-4" /></button>
                </div>
                <div className="flex items-center gap-2">
                  {threadReplyContent.length > 0 && (
                    <span className={cn(
                      "text-[11px]",
                      threadReplyContent.length > MAX_MESSAGE_LENGTH ? "text-destructive font-medium" : "text-muted-foreground"
                    )}>
                      {threadReplyContent.length > MAX_MESSAGE_LENGTH
                        ? `已超过${threadReplyContent.length - MAX_MESSAGE_LENGTH}字`
                        : `${threadReplyContent.length}/${MAX_MESSAGE_LENGTH}`}
                    </span>
                  )}
                  <Button
                    size="sm"
                    disabled={(!threadReplyContent.trim() && threadPendingAttachments.length === 0) || sendingReply || threadPendingAttachments.some(a => a.status === "uploading") || threadReplyContent.length > MAX_MESSAGE_LENGTH}
                    onClick={handleSendReply}
                    className="h-7 px-3 rounded-lg text-xs"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========== 弹窗集合 ========== */}
      <CreateSectionDialog
        open={showCreateSection}
        onClose={() => setShowCreateSection(false)}
        teamId={teamId}
        userId={user?.id || ""}
        onCreated={loadData}
      />

      <RenameSectionDialog
        open={showRenameSection}
        onClose={() => {
          setShowRenameSection(false);
          setRenameTarget(null);
        }}
        section={renameTarget}
        onRenamed={loadData}
      />

      <CreateChannelDialog
        open={showCreateChannel}
        onClose={() => {
          setShowCreateChannel(false);
          setCreateChannelSectionId(null);
        }}
        teamId={teamId}
        userId={user?.id || ""}
        sectionId={createChannelSectionId}
        onCreated={loadData}
      />

      <AlertDialog open={showDeleteSection} onOpenChange={setShowDeleteSection}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除此分区?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-1">
              <span>删除分区，分区中的频道将被移回频道区下。</span>
              <span className="block text-muted-foreground text-xs">不用担心，分区下的频道不会被删除。</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteTarget(null)}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSection}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              确定
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 删除频道确认 */}
      <AlertDialog open={showDeleteChannel} onOpenChange={setShowDeleteChannel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除频道？</AlertDialogTitle>
            <AlertDialogDescription className="space-y-1">
              <span>确定要删除频道「{deleteChannelTarget?.name}」吗？</span>
              <span className="block text-muted-foreground text-xs">删除后频道内的消息将被清除，成员将被移出，此操作不可恢复。</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteChannelTarget(null)}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteChannel}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 频道详情弹窗 */}
      <ChannelDetailDialog
        open={showChannelDetail}
        onClose={() => setShowChannelDetail(false)}
        channel={currentChannel}
        onSaved={loadData}
        onEditName={() => {
          setShowChannelDetail(false);
          setShowEditChannelName(true);
        }}
        onEditTopic={() => {
          setShowChannelDetail(false);
          setShowEditChannelTopic(true);
        }}
        onLeaveChannel={() => {
          setShowChannelDetail(false);
          setShowLeaveChannel(true);
        }}
      />

      {/* AI助手右侧面板 */}
      <ChannelAiPanel
        open={showAiPanel}
        onOpenChange={setShowAiPanel}
        channelId={selectedChannelId || ""}
        teamId={teamId}
      />

      {/* 频道文件右侧面板 */}
      <ChannelFilesPanel
        open={showFilesPanel}
        onOpenChange={setShowFilesPanel}
        channelId={selectedChannelId || ""}
        teamId={teamId}
        userId={user?.id || ""}
      />

      {/* 编辑频道名称 */}
      <EditChannelNameDialog
        open={showEditChannelName}
        onClose={() => setShowEditChannelName(false)}
        channel={currentChannel}
        onSaved={() => {
          loadData();
          // 编辑名称后重新打开详情弹窗
          setShowChannelDetail(true);
        }}
      />

      {/* 编辑频道主题 */}
      <EditChannelTopicDialog
        open={showEditChannelTopic}
        onClose={() => setShowEditChannelTopic(false)}
        channel={currentChannel}
        onSaved={() => {
          loadData();
          setShowChannelDetail(true);
        }}
      />

      {/* 浏览频道弹窗 */}
      <BrowseChannelsDialog
        open={showBrowseChannels}
        onClose={() => setShowBrowseChannels(false)}
        sections={sections}
        userId={user?.id || ""}
        onJoinChannel={() => loadData()}
        browseMode={browseMode}
        onBrowseModeChange={setBrowseMode}
      />

      {/* 退出频道确认 */}
      <AlertDialog open={showLeaveChannel} onOpenChange={setShowLeaveChannel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>退出频道？</AlertDialogTitle>
            <AlertDialogDescription className="space-y-1">
              <span>确定要退出频道「{currentChannel?.name}」吗？</span>
              <span className="block text-muted-foreground text-xs">退出后将不再接收此频道的消息通知，但可以随时重新加入。</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={leaving}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleLeaveChannel}
              disabled={leaving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {leaving ? "退出中..." : "确认退出"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 删除消息确认 */}
      <AlertDialog open={showDeleteMessage} onOpenChange={setShowDeleteMessage}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除消息？</AlertDialogTitle>
            <AlertDialogDescription className="space-y-1">
              <span>确定要删除这条消息吗？</span>
              <span className="block text-muted-foreground text-xs">删除后其他成员将无法看到此消息。</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setDeleteMessageTarget(null); }} disabled={deletingMessage}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteMessage}
              disabled={deletingMessage}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingMessage ? "删除中..." : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 转发消息弹窗 */}
      <ForwardMessageDialog
        open={showForwardDialog}
        onOpenChange={setShowForwardDialog}
        message={forwardMessage}
        channels={sections.flatMap((s) => s.channels).map((ch) => ({ id: ch.id, name: ch.name, type: ch.type }))}
        teamMembers={teamMemberList}
        currentUserId={user?.id || ""}
        onForwardToChannel={handleForwardToChannel}
        onForwardToUser={handleForwardToUser}
      />
    </div>
  );
}
