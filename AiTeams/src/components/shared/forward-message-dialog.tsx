"use client";

import { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { UserAvatar } from "@/components/shared/user-avatar";
import { X, Hash, AtSign, Search, Send, Smile } from "lucide-react";
import { cn } from "@/lib/utils";

// 快捷表情列表
const QUICK_EMOJIS = [
  ["👍", "❤️", "😊", "😂", "🎉"],
  ["🤔", "👀", "🔥", "✅", "🙏"],
];

interface ChannelMessage {
  id: string;
  channelId: string;
  senderId: string;
  sender: {
    id: string;
    name: string;
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
    duration?: number;
    width?: number;
    height?: number;
    thumbnailUrl?: string;
    contentType?: string;
  }>;
  topicTags: string[];
  sourceChannelName: string | null;
  sourceChannelId: string | null;
  reactions: Array<{ emoji: string; count: number; userReacted: boolean; users: Array<{ id: string; name: string; avatar: string | null }> }>;
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
  createdAt: string;
}

interface ForwardTarget {
  type: "channel" | "user";
  id: string;
  name: string;
  avatar: string | null;
}

interface ForwardMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: ChannelMessage | null;
  channels: Array<{ id: string; name: string; type: string }>;
  teamMembers: Array<{ userId: string; name: string; avatar: string | null }>;
  currentUserId: string;
  onForwardToChannel: (channelId: string, content: string, forwardedFromId: string) => Promise<void>;
  onForwardToUser: (userId: string, content: string, originalMessage: ChannelMessage) => Promise<void>;
}

export function ForwardMessageDialog({
  open,
  onOpenChange,
  message,
  channels,
  teamMembers,
  currentUserId,
  onForwardToChannel,
  onForwardToUser,
}: ForwardMessageDialogProps) {
  const [inputValue, setInputValue] = useState("");
  const [selectedTarget, setSelectedTarget] = useState<ForwardTarget | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionType, setSuggestionType] = useState<"channel" | "user" | null>(null);
  const [suggestionSearch, setSuggestionSearch] = useState("");
  const [additionalText, setAdditionalText] = useState("");
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 重置状态
  useEffect(() => {
    if (open) {
      setInputValue("");
      setSelectedTarget(null);
      setShowSuggestions(false);
      setSuggestionType(null);
      setSuggestionSearch("");
      setAdditionalText("");
      setSending(false);
    }
  }, [open]);

  // 输入处理
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);

    // 检测 # 或 @ 触发
    if (value === "#") {
      setSuggestionType("channel");
      setSuggestionSearch("");
      setShowSuggestions(true);
    } else if (value === "@") {
      setSuggestionType("user");
      setSuggestionSearch("");
      setShowSuggestions(true);
    } else if (value.startsWith("#") && suggestionType === "channel") {
      setSuggestionSearch(value.slice(1));
    } else if (value.startsWith("@") && suggestionType === "user") {
      setSuggestionSearch(value.slice(1));
    } else {
      setShowSuggestions(false);
      setSuggestionType(null);
    }
  };

  // 选择频道
  const handleSelectChannel = (channel: { id: string; name: string }) => {
    setSelectedTarget({ type: "channel", id: channel.id, name: channel.name, avatar: null });
    setInputValue("");
    setShowSuggestions(false);
    setSuggestionType(null);
    // 聚焦到文本输入框
    setTimeout(() => textareaRef.current?.focus(), 100);
  };

  // 选择用户
  const handleSelectUser = (user: { userId: string; name: string; avatar: string | null }) => {
    setSelectedTarget({ type: "user", id: user.userId, name: user.name, avatar: user.avatar });
    setInputValue("");
    setShowSuggestions(false);
    setSuggestionType(null);
    setTimeout(() => textareaRef.current?.focus(), 100);
  };

  // 移除已选目标
  const handleRemoveTarget = () => {
    setSelectedTarget(null);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  // 过滤频道列表
  const filteredChannels = channels.filter((ch) =>
    ch.name.toLowerCase().includes(suggestionSearch.toLowerCase())
  );

  // 过滤用户列表（排除自己）
  const filteredUsers = teamMembers
    .filter((m) => m.userId !== currentUserId)
    .filter((m) => m.name.toLowerCase().includes(suggestionSearch.toLowerCase()));

  // 发送转发
  const handleForward = async () => {
    if (!selectedTarget || !message || sending) return;
    setSending(true);
    try {
      if (selectedTarget.type === "channel") {
        await onForwardToChannel(selectedTarget.id, additionalText, message.id);
      } else {
        await onForwardToUser(selectedTarget.id, additionalText, message);
      }
      onOpenChange(false);
    } catch {
      // 错误处理在调用方
    } finally {
      setSending(false);
    }
  };

  // 插入表情
  const handleEmojiInsert = (emoji: string) => {
    setAdditionalText((prev) => prev + emoji);
    textareaRef.current?.focus();
  };

  if (!message) return null;

  // 渲染原始消息预览
  const renderOriginalMessage = () => {
    const imageAttachments = message.attachments.filter((a) => a.type === "image" || a.type === "video");
    const fileAttachments = message.attachments.filter((a) => a.type === "file");
    const hasContent = message.content.trim().length > 0;

    return (
      <div className="rounded-lg bg-muted/20 border border-border/50 overflow-hidden mt-2">
        <div className="px-3 pt-2.5 pb-2">
          <div className="flex gap-2.5">
            <UserAvatar avatarKey={message.sender.avatar} name={message.sender.name} className="w-8 h-8 shrink-0" fallbackClassName="text-[10px]" />
            <div className="flex-1 min-w-0">
              <span className="font-medium text-[13px] leading-none">{message.sender.name}</span>
              {hasContent && (
                <p className="text-sm text-foreground/80 whitespace-pre-wrap break-words line-clamp-3 mt-1">
                  {message.content}
                </p>
              )}
              {imageAttachments.length > 0 && (
                <div className="flex gap-1 mt-1.5 flex-wrap">
                  {imageAttachments.slice(0, 4).map((att, idx) => (
                    <div key={idx} className="w-14 h-14 rounded-md overflow-hidden bg-muted relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={att.type === "video" ? (att.thumbnailUrl || att.url) : att.url} alt="" className="w-full h-full object-cover" />
                      {att.type === "video" && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-5 h-5 rounded-full bg-black/50 flex items-center justify-center">
                            <svg className="w-3 h-3 text-white fill-white" viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21" /></svg>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  {imageAttachments.length > 4 && (
                    <div className="w-14 h-14 rounded-md bg-muted flex items-center justify-center text-xs text-muted-foreground">
                      +{imageAttachments.length - 4}
                    </div>
                  )}
                </div>
              )}
              {fileAttachments.length > 0 && (
                <div className="flex gap-1.5 mt-1.5 flex-wrap">
                  {fileAttachments.slice(0, 2).map((att, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 px-2 py-1 rounded bg-muted/60 text-[11px] text-muted-foreground">
                      <span className="font-medium truncate max-w-[120px]">{att.name || "文件"}</span>
                    </div>
                  ))}
                  {fileAttachments.length > 2 && (
                    <span className="text-[11px] text-muted-foreground">+{fileAttachments.length - 2}个文件</span>
                  )}
                </div>
              )}
              <div className="flex items-center gap-1.5 mt-1.5">
                {message.sourceChannelName && (
                  <span className="text-[10px] text-muted-foreground">
                    来自 [{message.sourceChannelName}]
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] p-0 gap-0 overflow-hidden">
        {/* 头部 */}
        <DialogHeader className="px-5 pt-5 pb-0">
          <DialogTitle className="text-base font-semibold">转发消息</DialogTitle>
        </DialogHeader>

        {/* 目标选择区域 */}
        <div className="px-5 pt-3">
          {selectedTarget ? (
            <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 rounded-lg">
              {selectedTarget.type === "channel" ? (
                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                  <Hash className="w-3.5 h-3.5 text-primary" />
                </div>
              ) : (
                <UserAvatar avatarKey={selectedTarget.avatar} name={selectedTarget.name} className="w-7 h-7" fallbackClassName="text-[10px]" />
              )}
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium truncate block">
                  {selectedTarget.name}
                  {selectedTarget.type === "user" && selectedTarget.id === currentUserId && (
                    <span className="text-muted-foreground font-normal">（你）</span>
                  )}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {selectedTarget.type === "channel" ? "频道" : "私信"}
                </span>
              </div>
              <button
                type="button"
                onClick={handleRemoveTarget}
                className="shrink-0 w-5 h-5 rounded-full bg-muted-foreground/20 hover:bg-muted-foreground/40 flex items-center justify-center transition-colors"
              >
                <X className="w-3 h-3 text-foreground" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <div className="flex items-center gap-2 px-3 py-2.5 border rounded-lg focus-within:ring-1 focus-within:ring-primary focus-within:border-primary bg-background">
                <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={handleInputChange}
                  placeholder="输入 # 选择频道，输入 @ 选择成员"
                  className="flex-1 text-sm outline-none bg-transparent placeholder:text-muted-foreground"
                />
              </div>

              {/* 建议列表 */}
              {showSuggestions && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                  {suggestionType === "channel" && (
                    <>
                      <div className="px-3 py-2 text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                        <Hash className="w-3 h-3" /> 频道
                      </div>
                      {filteredChannels.length === 0 ? (
                        <div className="px-3 py-3 text-sm text-muted-foreground text-center">未找到频道</div>
                      ) : (
                        filteredChannels.map((ch) => (
                          <button
                            key={ch.id}
                            type="button"
                            onClick={() => handleSelectChannel(ch)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-accent/50 text-left transition-colors"
                          >
                            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                              <Hash className="w-3.5 h-3.5 text-primary" />
                            </div>
                            <span className="text-sm truncate">{ch.name}</span>
                            {ch.type === "private" && (
                              <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">私密</span>
                            )}
                          </button>
                        ))
                      )}
                    </>
                  )}
                  {suggestionType === "user" && (
                    <>
                      <div className="px-3 py-2 text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                        <AtSign className="w-3 h-3" /> 成员
                      </div>
                      {filteredUsers.length === 0 ? (
                        <div className="px-3 py-3 text-sm text-muted-foreground text-center">未找到成员</div>
                      ) : (
                        filteredUsers.map((m) => (
                          <button
                            key={m.userId}
                            type="button"
                            onClick={() => handleSelectUser(m)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-accent/50 text-left transition-colors"
                          >
                            <UserAvatar avatarKey={m.avatar} name={m.name} className="w-7 h-7" fallbackClassName="text-[10px]" />
                            <span className="text-sm truncate">{m.name}</span>
                          </button>
                        ))
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 输入区域 */}
        <div className="px-5 pt-3">
          <div className="border rounded-lg bg-background">
            {/* 工具栏 */}
            <div className="flex items-center gap-0.5 px-2 pt-2 pb-1 border-b">
              <Popover>
                <PopoverTrigger asChild>
                  <button type="button" className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-muted/80 transition-colors">
                    <Smile className="w-4 h-4 text-muted-foreground" />
                  </button>
                </PopoverTrigger>
                <PopoverContent side="top" align="start" sideOffset={4} className="w-auto p-2 rounded-xl shadow-md">
                  <div className="space-y-1">
                    {QUICK_EMOJIS.map((row, rowIdx) => (
                      <div key={rowIdx} className="flex gap-1">
                        {row.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => handleEmojiInsert(emoji)}
                            className="w-8 h-8 flex items-center justify-center rounded hover:bg-muted/80 text-base transition-colors"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            {/* 文本输入 */}
            <textarea
              ref={textareaRef}
              value={additionalText}
              onChange={(e) => setAdditionalText(e.target.value)}
              placeholder="如有需要，请添加一条消息。"
              rows={3}
              className="w-full px-3 py-2.5 text-sm outline-none resize-none bg-transparent placeholder:text-muted-foreground"
            />
          </div>
        </div>

        {/* 原始消息预览 */}
        <div className="px-5 pt-2">
          {renderOriginalMessage()}
        </div>

        {/* 底部操作栏 */}
        <div className="flex items-center justify-end px-5 py-4">
          <button
            type="button"
            onClick={handleForward}
            disabled={!selectedTarget || sending}
            className={cn(
              "inline-flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-medium transition-colors",
              selectedTarget && !sending
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
          >
            <Send className="w-3.5 h-3.5" />
            {sending ? "转发中..." : "转发"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
