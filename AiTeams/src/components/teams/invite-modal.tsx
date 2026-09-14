"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Copy, Check, Link2 } from "lucide-react";

interface InviteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  teamName: string;
}

export function InviteModal({ open, onOpenChange, teamId, teamName }: InviteModalProps) {
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  // 弹窗打开时自动生成链接
  useEffect(() => {
    if (open && !inviteUrl && !loading) {
      handleGenerateInvite();
    }
    // 关闭时重置状态
    if (!open) {
      setInviteUrl(null);
      setError("");
      setCopied(false);
      setLoading(false);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // 生成邀请链接
  const handleGenerateInvite = async () => {
    setLoading(true);
    setError("");
    setInviteUrl(null);

    try {
      // 获取当前用户
      const currentUser = JSON.parse(localStorage.getItem("user") || "{}");
      const userId = currentUser.id;

      if (!userId) {
        setError("请先登录");
        return;
      }

      if (!teamId) {
        setError("团队信息缺失，请刷新页面重试");
        return;
      }

      const res = await fetch("/api/teams/invite/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          inviterId: userId,
          maxUses: 100,
          expiresInDays: 30,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "生成邀请链接失败");
        return;
      }

      setInviteUrl(data.invite.invite_url);
    } catch {
      setError("生成邀请链接失败，请检查网络后重试");
    } finally {
      setLoading(false);
    }
  };

  // 复制链接
  const handleCopy = async () => {
    if (!inviteUrl) return;

    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement("textarea");
      textarea.value = inviteUrl;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>邀请新成员</DialogTitle>
          <DialogDescription className="sr-only">生成邀请链接邀请新成员加入团队</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <p className="text-sm text-muted-foreground">
            复制此邀请链接发送给好友，获邀的新成员可以通过此链接加入{teamName ? `「${teamName}」` : "团队"}
          </p>

          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">正在生成邀请链接...</span>
            </div>
          ) : inviteUrl ? (
            <div className="space-y-4">
              {/* 邀请链接文本框 */}
              <div className="relative">
                <div className="flex items-center rounded-lg border border-border bg-muted/30 px-4 py-3">
                  <Link2 className="w-4 h-4 text-muted-foreground mr-2 shrink-0" />
                  <span className="text-sm text-foreground break-all select-all flex-1">
                    {inviteUrl}
                  </span>
                </div>
              </div>

              {/* 复制按钮 */}
              <Button onClick={handleCopy} className="w-full h-10">
                {copied ? (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    已复制
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-2" />
                    复制邀请链接
                  </>
                )}
              </Button>
            </div>
          ) : !error ? (
            <div className="flex items-center justify-center py-4">
              <span className="text-sm text-muted-foreground">准备生成链接...</span>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
