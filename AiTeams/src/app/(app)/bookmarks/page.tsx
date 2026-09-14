"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Bookmark, Hash, X, BookmarkCheck, Bot, MessageSquare,
  Loader2, Search, Link2, Image, FileText, Clock, Star,
  ChevronRight, Paperclip, Flame,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/shared/user-avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/use-auth";

// 收藏消息类型
interface BookmarkMessage {
  id: string;
  channelId: string;
  channelName: string | null;
  channelType: string | null;
  senderId: string;
  senderType?: string;
  sender: {
    id: string;
    name: string;
    nickname: string | null;
    avatar: string | null;
    department: string | null;
    position: string | null;
  };
  content: string;
  messageType: string;
  attachments: Array<{
    type: "image" | "video" | "file";
    url: string;
    name?: string;
    size?: number;
  }>;
  topicTags: string[];
  mentions: string[];
  forwardedFromId: string | null;
  reactions: Array<{ emoji: string; count: number; userIds: string[] }>;
  replyCount: number;
  createdAt: string;
  bookmarkedAt: string;
  bookmarkId: string;
}

// 分类类型
type BookmarkCategory = "all" | "recent" | "links" | "media" | "notes" | "files";

interface CategoryItem {
  id: BookmarkCategory;
  label: string;
  icon: ReactNode;
}

const categories: CategoryItem[] = [
  { id: "all", label: "全部收藏", icon: <Bookmark className="w-4 h-4" /> },
  { id: "recent", label: "最近使用", icon: <Clock className="w-4 h-4" /> },
  { id: "links", label: "链接", icon: <Link2 className="w-4 h-4" /> },
  { id: "media", label: "图片与视频", icon: <Image className="w-4 h-4" /> },
  { id: "notes", label: "笔记", icon: <FileText className="w-4 h-4" /> },
  { id: "files", label: "文件", icon: <Paperclip className="w-4 h-4" /> },
];

// 根据分类过滤收藏
function filterByCategory(msgs: BookmarkMessage[], category: BookmarkCategory): BookmarkMessage[] {
  switch (category) {
    case "all":
      return msgs;
    case "recent":
      return [...msgs].sort((a, b) => new Date(b.bookmarkedAt).getTime() - new Date(a.bookmarkedAt).getTime()).slice(0, 20);
    case "links":
      return msgs.filter(m => /https?:\/\/[^\s]+/.test(m.content));
    case "media":
      return msgs.filter(m => m.attachments?.some(a => a.type === "image" || a.type === "video"));
    case "notes":
      return msgs.filter(m => !m.attachments?.length && !/https?:\/\/[^\s]+/.test(m.content));
    case "files":
      return msgs.filter(m => m.attachments?.some(a => a.type === "file"));
    default:
      return msgs;
  }
}

// 搜索过滤
function searchFilter(msg: BookmarkMessage, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.toLowerCase();
  return (
    msg.content.toLowerCase().includes(q) ||
    msg.sender.name.toLowerCase().includes(q) ||
    (msg.channelName || "").toLowerCase().includes(q) ||
    msg.topicTags?.some(t => t.toLowerCase().includes(q))
  );
}

export default function BookmarksPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [activeCategory, setActiveCategory] = useState<BookmarkCategory>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [bookmarkMessages, setBookmarkMessages] = useState<BookmarkMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedBookmark, setSelectedBookmark] = useState<BookmarkMessage | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // 加载收藏
  const loadBookmarks = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const teamId = localStorage.getItem("lastTeamId") || "";
      const params = new URLSearchParams({ userId: user.id });
      if (teamId) params.set("teamId", teamId);
      const res = await fetch(`/api/channels/bookmarks?${params}`);
      if (!res.ok) {
        setError("加载失败，请稍后重试");
        setBookmarkMessages([]);
        return;
      }
      const data = await res.json();
      if (data.success) {
        setBookmarkMessages(data.messages || []);
        setHasMore(!!data.nextCursor);
      } else {
        setError(data.error || "加载失败");
        setBookmarkMessages([]);
      }
    } catch {
      setError("网络错误，请稍后重试");
      setBookmarkMessages([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadBookmarks();
  }, [loadBookmarks]);

  // 取消收藏
  const handleRemoveBookmark = async (messageId: string) => {
    if (!user?.id) return;
    try {
      const res = await fetch(`/api/channels/bookmarks?messageId=${messageId}&userId=${user.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        setBookmarkMessages(prev => prev.filter(m => m.id !== messageId));
        if (selectedBookmark?.id === messageId) {
          setSelectedBookmark(null);
        }
      }
    } catch {
      console.error("取消收藏失败");
    }
  };

  // 跳转到频道
  const handleNavigateToChannel = (channelId: string) => {
    router.push(`/channels?channelId=${channelId}`);
  };

  // 过滤后的收藏列表
  const filteredMessages = filterByCategory(bookmarkMessages, activeCategory)
    .filter(m => searchFilter(m, searchQuery));

  // 各分类计数
  const categoryCounts = categories.map(cat => ({
    ...cat,
    count: filterByCategory(bookmarkMessages, cat.id).length,
  }));

  return (
    <div className="h-full flex">
      {/* 左侧分类栏 */}
      <div className="w-64 border-r border-border flex flex-col bg-card shrink-0">
        <div className="px-4 py-3 border-b border-border shrink-0">
          <h2 className="font-semibold text-base flex items-center gap-2">
            <Bookmark className="w-4 h-4" />
            收藏
          </h2>
        </div>

        {/* 搜索框 */}
        <div className="px-3 pt-3 pb-1 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="搜索收藏..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-xs bg-muted/50 border-0"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* 分类列表 */}
        <div className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {categoryCounts.map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                setActiveCategory(cat.id);
                setSelectedBookmark(null);
              }}
              className={cn(
                "relative w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg transition-colors",
                activeCategory === cat.id
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {cat.icon}
              <span className="flex-1 text-left">{cat.label}</span>
              <span className={cn(
                "text-xs tabular-nums",
                activeCategory === cat.id ? "text-primary/70" : "text-muted-foreground/50"
              )}>
                {cat.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 flex min-w-0 min-h-0">
        {/* 中间：收藏列表 */}
        <div className={cn(
          "flex flex-col min-w-0 min-h-0 border-r border-border",
          selectedBookmark ? "w-[420px] shrink-0" : "flex-1"
        )}>
          {/* 标题栏 */}
          <div className="h-12 border-b border-border flex items-center justify-between px-5 shrink-0">
            <h1 className="font-semibold text-base flex items-center gap-2">
              {categories.find(c => c.id === activeCategory)?.icon}
              {categories.find(c => c.id === activeCategory)?.label}
            </h1>
            <span className="text-xs text-muted-foreground">
              {filteredMessages.length} 条收藏
            </span>
          </div>

          {/* 收藏列表 */}
          <ScrollArea className="flex-1 min-h-0">
            {loading ? (
              <div className="flex items-center justify-center h-48 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
                <span className="text-sm text-destructive">{error}</span>
                <Button variant="outline" size="sm" onClick={loadBookmarks}>
                  重试
                </Button>
              </div>
            ) : filteredMessages.length === 0 ? (
              <EmptyState icon={<Bookmark className="w-12 h-12" />} text="暂无收藏" />
            ) : (
              <div className="divide-y divide-border/50">
                {filteredMessages.map((msg) => (
                  <BookmarkCard
                    key={msg.id}
                    message={msg}
                    isSelected={selectedBookmark?.id === msg.id}
                    onSelect={(m) => setSelectedBookmark(m)}
                    onRemove={handleRemoveBookmark}
                    onNavigateToChannel={handleNavigateToChannel}
                  />
                ))}
                {/* 加载更多 */}
                {hasMore && (
                  <div className="flex items-center justify-center py-3">
                    <button
                      type="button"
                      onClick={() => {/* load more */}}
                      disabled={loadingMore}
                      className="text-xs text-primary hover:underline disabled:opacity-50 flex items-center gap-1"
                    >
                      {loadingMore ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          加载中...
                        </>
                      ) : (
                        "加载更多"
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* 右侧：消息详情 */}
        {selectedBookmark && (
          <div className="flex-1 min-w-0 flex flex-col bg-muted/30 overflow-hidden">
            {/* 面板标题 */}
            <div className="h-12 border-b border-border/60 flex items-center justify-between px-4 shrink-0 bg-background">
              <span className="font-medium text-sm">消息详情</span>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => setSelectedBookmark(null)}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* 消息内容 */}
            <ScrollArea className="flex-1 min-h-0 px-4 py-3">
              <div className="space-y-4">
                {/* 发送者信息 */}
                <div className="flex items-center gap-2.5">
                  {selectedBookmark.senderType === "agent" ? (
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Bot className="w-4 h-4 text-primary" />
                    </div>
                  ) : (
                    <UserAvatar
                      avatarKey={selectedBookmark.sender.avatar}
                      name={selectedBookmark.sender.name}
                      className="w-8 h-8"
                    />
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium">
                        {selectedBookmark.sender.nickname || selectedBookmark.sender.name}
                      </span>
                      {selectedBookmark.senderType === "agent" && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-medium">AI</span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">{formatTime(selectedBookmark.createdAt)}</span>
                  </div>
                </div>

                {/* 消息内容 */}
                <div className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                  {renderRichContent(selectedBookmark.content)}
                </div>

                {/* 附件 */}
                {selectedBookmark.attachments && selectedBookmark.attachments.length > 0 && (
                  <div className="space-y-2">
                    {selectedBookmark.attachments.map((att, idx) => (
                      att.type === "image" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={idx} src={att.url} alt="" className="max-w-full rounded-lg max-h-[300px] object-contain border border-border/60" />
                      ) : (
                        <div key={idx} className="flex items-center gap-2 p-2 bg-background rounded-lg border border-border/60">
                          <Paperclip className="w-4 h-4 text-muted-foreground shrink-0" />
                          <span className="text-sm truncate">{att.name || "附件"}</span>
                        </div>
                      )
                    ))}
                  </div>
                )}

                {/* 来源信息 */}
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-2 border-t border-border/50">
                  <Hash className="w-3.5 h-3.5" />
                  来自 {selectedBookmark.channelName || "未知频道"}
                </div>

                {/* 跳转按钮 */}
                <Button
                  variant="outline"
                  className="w-full gap-1.5"
                  onClick={() => {
                    if (selectedBookmark.channelId) router.push(`/channels?channelId=${selectedBookmark.channelId}`);
                  }}
                >
                  <MessageSquare className="w-4 h-4" />
                  在频道中查看
                </Button>
              </div>
            </ScrollArea>
          </div>
        )}
      </div>
    </div>
  );
}

/** 收藏消息卡片 */
function BookmarkCard({
  message: msg,
  isSelected,
  onSelect,
  onRemove,
  onNavigateToChannel,
}: {
  message: BookmarkMessage;
  isSelected: boolean;
  onSelect: (msg: BookmarkMessage) => void;
  onRemove: (messageId: string) => void;
  onNavigateToChannel: (channelId: string) => void;
}) {
  const imageAttachments = msg.attachments.filter(a => a.type === "image");
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  // 附件类型标签
  const hasLinks = /https?:\/\/[^\s]+/.test(msg.content);
  const hasFiles = msg.attachments?.some(a => a.type === "file");
  const hasMedia = msg.attachments?.some(a => a.type === "image" || a.type === "video");

  return (
    <div
      className={cn(
        "px-5 py-3.5 cursor-pointer transition-colors group",
        isSelected ? "bg-primary/8 border-l-2 border-l-primary" : "hover:bg-muted/30 border-l-2 border-l-transparent"
      )}
      onClick={() => onSelect(msg)}
    >
      {/* 顶部：来源频道 + 类型标签 + 时间 + 取消收藏 */}
      <div className="flex items-center gap-1.5 mb-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNavigateToChannel(msg.channelId);
          }}
          className="text-[12px] text-primary font-medium hover:underline inline-flex items-center gap-0.5"
        >
          <Hash className="w-3 h-3" />
          {msg.channelName || "未知频道"}
        </button>
        {hasLinks && (
          <span className="text-[10px] px-1 py-0.5 rounded bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 font-medium">链接</span>
        )}
        {hasMedia && (
          <span className="text-[10px] px-1 py-0.5 rounded bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400 font-medium">媒体</span>
        )}
        {hasFiles && (
          <span className="text-[10px] px-1 py-0.5 rounded bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400 font-medium">文件</span>
        )}
        <span className="text-[11px] text-muted-foreground/60 ml-auto">
          {formatTime(msg.createdAt)}
        </span>
        {/* 取消收藏按钮 */}
        {showConfirmDelete ? (
          <div className="flex items-center gap-1 ml-1" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => { onRemove(msg.id); setShowConfirmDelete(false); }}
              className="text-[11px] text-destructive hover:underline"
            >
              确认
            </button>
            <button
              type="button"
              onClick={() => setShowConfirmDelete(false)}
              className="text-[11px] text-muted-foreground hover:underline"
            >
              取消
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setShowConfirmDelete(true); }}
            className="ml-1 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
            title="取消收藏"
          >
            <BookmarkCheck className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* 消息头部：头像 + 用户名 */}
      <div className="flex gap-2.5">
        {msg.senderType === "agent" ? (
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Bot className="w-4.5 h-4.5 text-primary" />
          </div>
        ) : (
          <UserAvatar avatarKey={msg.sender.avatar} name={msg.sender.name} className="w-9 h-9 shrink-0" fallbackClassName="text-xs" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{msg.sender.name}</span>
            {msg.senderType === "agent" && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                <Bot className="w-2.5 h-2.5" />智能体
              </span>
            )}
            {msg.sender.nickname && (
              <span className="text-xs text-muted-foreground">({msg.sender.nickname})</span>
            )}
          </div>

          {/* 消息内容 */}
          {msg.content && (
            <div className="mt-1 text-sm text-foreground/80 whitespace-pre-wrap break-words line-clamp-4 leading-relaxed">
              {renderRichContent(msg.content)}
            </div>
          )}

          {/* 图片预览 */}
          {imageAttachments.length > 0 && (
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {imageAttachments.slice(0, 3).map((att, idx) => (
                <div key={idx} className="w-20 h-20 rounded-lg overflow-hidden bg-muted border border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={att.url} alt="" className="w-full h-full object-cover" />
                </div>
              ))}
              {imageAttachments.length > 3 && (
                <div className="w-20 h-20 rounded-lg bg-muted border border-border flex items-center justify-center text-xs text-muted-foreground">
                  +{imageAttachments.length - 3}
                </div>
              )}
            </div>
          )}

          {/* 话题标签 */}
          {msg.topicTags && msg.topicTags.length > 0 && (
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {msg.topicTags.map((tag) => (
                <span key={tag} className="text-[11px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {/* 反应 */}
          {msg.reactions && msg.reactions.length > 0 && (
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {msg.reactions.map((reaction) => (
                <span key={reaction.emoji} className="text-[11px] px-1.5 py-0.5 rounded-full bg-muted/60 text-foreground/70 flex items-center gap-1">
                  {reaction.emoji} {reaction.count}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** 空状态组件 */
function EmptyState({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
      <div className="mb-3 opacity-40">{icon}</div>
      <p className="text-sm">{text}</p>
    </div>
  );
}

/** 时间格式化 */
function formatTime(dateStr: string): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin}分钟前`;
  if (diffHour < 24) return `${diffHour}小时前`;
  if (diffDay < 7) return `${diffDay}天前`;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  if (year === now.getFullYear()) return `${month}/${day}`;
  return `${year}/${month}/${day}`;
}

/** 渲染富文本内容（高亮链接和话题标签） */
function renderRichContent(text: string): ReactNode[] {
  if (!text) return [];
  const parts = text.split(/(https?:\/\/[^\s]+|#[\w\u4e00-\u9fff-]+)/g);
  return parts.map((part, i) => {
    if (part.startsWith("http")) {
      return (
        <a key={i} href={part} target="_blank" rel="noopener noreferrer"
          className="text-primary underline hover:text-primary/80"
          onClick={(e) => e.stopPropagation()}>
          {part}
        </a>
      );
    }
    if (part.startsWith("#")) {
      return (
        <span key={i} className="text-primary font-medium">{part}</span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}