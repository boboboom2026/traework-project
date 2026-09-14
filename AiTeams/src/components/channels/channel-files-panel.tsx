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
import {
  FolderOpen,
  FileText,
  File as FileIcon,
  Image as ImageIcon,
  Video,
  Upload,
  Download,
  Trash2,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ChannelFile {
  id: string;
  channelId: string;
  teamId: string;
  uploaderId: string;
  uploaderType: string;
  messageId: string | null;
  name: string;
  fileKey: string;
  fileSize: number;
  mimeType: string | null;
  fileType: "image" | "video" | "file";
  source: "upload" | "agent";
  createdAt: string;
  url: string;
  uploaderName: string;
  uploaderAvatar: string | null;
}

interface ChannelFilesPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channelId: string;
  teamId: string;
  userId: string;
}

const TYPE_TABS = [
  { key: "all", label: "全部" },
  { key: "image", label: "图片" },
  { key: "video", label: "视频" },
  { key: "file", label: "文档" },
] as const;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60 * 1000) return "刚刚";
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)} 小时前`;
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function getFileIcon(fileType: ChannelFile["fileType"]) {
  if (fileType === "image") return ImageIcon;
  if (fileType === "video") return Video;
  return FileText;
}

export function ChannelFilesPanel({ open, onOpenChange, channelId, teamId, userId }: ChannelFilesPanelProps) {
  const [files, setFiles] = useState<ChannelFile[]>([]);
  const [activeType, setActiveType] = useState<"all" | "image" | "video" | "file">("all");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadFiles = useCallback(async () => {
    if (!channelId || !userId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/channels/files?channelId=${channelId}&userId=${userId}&type=${activeType}`
      );
      const data = await res.json();
      if (data.success) {
        setFiles(data.files || []);
      } else {
        toast.error(data.error || "加载文件失败");
      }
    } catch {
      toast.error("加载文件失败，请重试");
    } finally {
      setLoading(false);
    }
  }, [channelId, userId, activeType]);

  useEffect(() => {
    if (open) {
      loadFiles();
    }
  }, [open, loadFiles, activeType]);

  const handleUpload = useCallback(async (file: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("channelId", channelId);
      formData.append("teamId", teamId);
      formData.append("userId", userId);

      const res = await fetch("/api/channels/files", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        toast.success("文件已上传到频道文件");
        setActiveType("all");
        await loadFiles();
      } else {
        toast.error(data.error || "上传失败");
      }
    } catch {
      toast.error("上传失败，请重试");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [channelId, teamId, userId, loadFiles]);

  const handleDownload = useCallback(async (file: ChannelFile) => {
    if (!file.url) {
      toast.error("文件链接不可用");
      return;
    }
    try {
      const response = await fetch(file.url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = file.name;
      link.click();
      window.URL.revokeObjectURL(blobUrl);
    } catch {
      toast.error("下载失败，请重试");
    }
  }, []);

  const handleDelete = useCallback(async (file: ChannelFile) => {
    try {
      const res = await fetch(
        `/api/channels/files?fileId=${file.id}&userId=${userId}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (data.success) {
        toast.success("文件已删除");
        await loadFiles();
      } else {
        toast.error(data.error || "删除失败");
      }
    } catch {
      toast.error("删除失败，请重试");
    }
  }, [userId, loadFiles]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[420px] sm:max-w-[420px] p-0 flex flex-col">
        {/* 头部 */}
        <SheetHeader className="px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5 pr-6">
            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <FolderOpen className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-sm text-left">频道文件</SheetTitle>
              <p className="text-[11px] text-muted-foreground">存储在本频道的所有共享文件</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
              上传
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
              }}
            />
          </div>

          {/* 类型 Tab */}
          <div className="flex gap-1 mt-3">
            {TYPE_TABS.map((tab) => (
              <Button
                key={tab.key}
                variant={activeType === tab.key ? "secondary" : "ghost"}
                size="sm"
                className={cn("h-6 px-2.5 text-xs", activeType === tab.key && "bg-accent")}
                onClick={() => setActiveType(tab.key)}
              >
                {tab.label}
              </Button>
            ))}
          </div>
        </SheetHeader>

        {/* 文件列表 */}
        <div className="flex-1 overflow-hidden min-h-0">
          <ScrollArea className="h-full">
            {loading ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : files.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-6 py-16">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                  <FolderOpen className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground">暂无文件</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-[280px]">
                  上传文件到频道，或频道内发送的附件都会自动归档到这里
                </p>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {files.map((file) => {
                  const Icon = getFileIcon(file.fileType);
                  const isImage = file.fileType === "image";
                  return (
                    <div
                      key={file.id}
                      className="group flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-accent/60 transition-colors"
                    >
                      {isImage && file.url ? (
                        <img
                          src={file.url}
                          alt={file.name}
                          className="w-10 h-10 rounded-md object-cover border border-border shrink-0"
                        />
                      ) : (
                        <div className={cn(
                          "w-10 h-10 rounded-md flex items-center justify-center shrink-0",
                          file.fileType === "image" && "bg-primary/10 text-primary",
                          file.fileType === "video" && "bg-amber-500/10 text-amber-500",
                          file.fileType === "file" && "bg-muted text-muted-foreground"
                        )}>
                          <Icon className="w-5 h-5" />
                        </div>
                      )}

                      <button
                        className="flex-1 min-w-0 text-left"
                        onClick={() => isImage ? handleDownload(file) : handleDownload(file)}
                        title="点击下载"
                      >
                        <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {file.uploaderName} · {formatSize(file.fileSize)} · {formatTime(file.createdAt)}
                          {file.source === "agent" && (
                            <span className="ml-1.5 text-primary/80">智能体生成</span>
                          )}
                        </p>
                      </button>

                      {file.uploaderId === userId && file.uploaderType === "user" ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive shrink-0"
                          onClick={() => handleDelete(file)}
                          title="删除文件"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}