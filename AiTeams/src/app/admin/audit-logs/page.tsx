"use client";

import { useState, useEffect } from "react";
import { Search, Shield, Clock, User, Server, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AuditLog {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  performed_by: string;
  performed_by_name: string;
  details: string;
  ip_address: string;
  created_at: string;
}

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    loadLogs();
  }, [page, search, filter]);

  async function loadLogs() {
    setLoading(true);
    try {
      const token = localStorage.getItem("auth_token");
      const params = new URLSearchParams({ page: String(page), limit: "30" });
      if (search) params.set("search", search);
      if (filter) params.set("filter", filter);

      const res = await fetch(`/api/admin/audit-logs?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setLogs(data.data);
        setTotalPages(data.pagination.totalPages);
        setTotal(data.pagination.total);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function getActionIcon(action: string) {
    if (action.includes("create")) return <FileText className="w-4 h-4 text-green-500" />;
    if (action.includes("delete")) return <FileText className="w-4 h-4 text-red-500" />;
    if (action.includes("update") || action.includes("edit")) return <FileText className="w-4 h-4 text-blue-500" />;
    if (action.includes("ban") || action.includes("freeze")) return <Shield className="w-4 h-4 text-orange-500" />;
    if (action.includes("login")) return <User className="w-4 h-4 text-purple-500" />;
    return <Server className="w-4 h-4 text-muted-foreground" />;
  }

  function getActionBadge(action: string) {
    if (action.includes("create")) return <Badge variant="default" className="text-xs bg-green-500/10 text-green-600 border-green-500/20">创建</Badge>;
    if (action.includes("delete")) return <Badge variant="destructive" className="text-xs">删除</Badge>;
    if (action.includes("update") || action.includes("edit")) return <Badge variant="default" className="text-xs bg-blue-500/10 text-blue-600 border-blue-500/20">更新</Badge>;
    if (action.includes("ban") || action.includes("freeze")) return <Badge variant="secondary" className="text-xs bg-orange-500/10 text-orange-600 border-orange-500/20">封禁</Badge>;
    return <Badge variant="secondary" className="text-xs">{action}</Badge>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">审计日志</h1>
        <p className="text-sm text-muted-foreground mt-1">共 {total} 条操作记录</p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="搜索操作人/资源..."
            className="pl-8"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select value={filter} onValueChange={(v) => { setFilter(v); setPage(1); }}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="全部" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部</SelectItem>
            <SelectItem value="team">团队</SelectItem>
            <SelectItem value="user">用户</SelectItem>
            <SelectItem value="agent">智能体</SelectItem>
            <SelectItem value="login">登录</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">操作日志</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : logs.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground text-sm">暂无日志</p>
          ) : (
            <div className="space-y-1">
              {logs.map((log) => (
                <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="mt-0.5">{getActionIcon(log.action)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {getActionBadge(log.action)}
                      <span className="text-sm font-medium">{log.action}</span>
                      <span className="text-xs text-muted-foreground"> | {log.resource_type}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {log.performed_by_name} · {log.details}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(log.created_at).toLocaleString()}
                    </span>
                    {log.ip_address && (
                      <span className="text-xs text-muted-foreground/60">{log.ip_address}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-xs text-muted-foreground">第 {page} / {totalPages} 页</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>下一页</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}