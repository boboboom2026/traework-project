"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Megaphone, Send, History, Loader2, MessageSquare } from "lucide-react";
import { format } from "date-fns";

interface Notification {
  id: string;
  scope: string;
  type: string;
  title: string;
  content: string;
  link: string | null;
  createdAt: string;
}

export default function AdminNotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  // 表单
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [type, setType] = useState("system");
  const [link, setLink] = useState("");

  const limit = 10;

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(
        `/api/admin/notifications?limit=${limit}&page=${page}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const json = await res.json();
      if (json.success) {
        setNotifications(json.data.notifications);
        setTotal(json.data.total);
      }
    } catch (err) {
      console.error("获取通知列表失败:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, [page]);

  const handleSend = async () => {
    if (!title.trim()) {
      toast.error("请输入通知标题");
      return;
    }

    setSending(true);
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          content,
          type,
          link: link || null,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("系统通知已发送");
        setDialogOpen(false);
        setTitle("");
        setContent("");
        setType("system");
        setLink("");
        setPage(1);
        fetchNotifications();
      } else {
        toast.error(json.error || "发送失败");
      }
    } catch (err) {
      toast.error("发送失败，请稍后重试");
      console.error("发送通知失败:", err);
    } finally {
      setSending(false);
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">系统通知管理</h1>
          <p className="text-sm text-muted-foreground mt-1">
            发送和管理平台级系统通知，所有用户可见
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Send className="w-4 h-4 mr-2" />
              发送通知
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>发送系统通知</DialogTitle>
              <DialogDescription>
                发送一条平台级系统通知，所有用户将在通知中心收到此消息
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">通知类型</label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="system">系统公告</SelectItem>
                    <SelectItem value="maintenance">维护通知</SelectItem>
                    <SelectItem value="update">功能更新</SelectItem>
                    <SelectItem value="policy">政策变更</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  标题 <span className="text-destructive">*</span>
                </label>
                <Input
                  placeholder="通知标题"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={200}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">内容</label>
                <Textarea
                  placeholder="通知详细内容（支持 Markdown 格式）"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={5}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">链接（可选）</label>
                <Input
                  placeholder="点击通知后跳转的链接"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                取消
              </Button>
              <Button onClick={handleSend} disabled={sending}>
                {sending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    发送中...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    确认发送
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* 通知列表 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="w-4 h-4" />
            历史通知
          </CardTitle>
          <CardDescription>共 {total} 条平台系统通知</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Megaphone className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm">暂无系统通知</p>
              <p className="text-xs mt-1">点击右上角"发送通知"创建第一条通知</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">类型</TableHead>
                    <TableHead>标题</TableHead>
                    <TableHead className="max-w-[300px]">内容摘要</TableHead>
                    <TableHead className="w-[160px]">发送时间</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {notifications.map((n) => (
                    <TableRow key={n.id}>
                      <TableCell>
                        <Badge
                          variant={
                            n.type === "system"
                              ? "default"
                              : n.type === "maintenance"
                              ? "destructive"
                              : n.type === "update"
                              ? "secondary"
                              : "outline"
                          }
                          className="text-xs"
                        >
                          {n.type === "system"
                            ? "系统公告"
                            : n.type === "maintenance"
                            ? "维护通知"
                            : n.type === "update"
                            ? "功能更新"
                            : n.type === "policy"
                            ? "政策变更"
                            : n.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{n.title}</TableCell>
                      <TableCell className="text-sm text-muted-foreground truncate max-w-[300px]">
                        {n.content || "-"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(n.createdAt), "yyyy-MM-dd HH:mm")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* 分页 */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                  <p className="text-sm text-muted-foreground">
                    第 {page} / {totalPages} 页，共 {total} 条
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage(page - 1)}
                    >
                      上一页
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage(page + 1)}
                    >
                      下一页
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}