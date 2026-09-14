"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Globe, Server, Wrench, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface PrebuiltAction {
  action: string;
  name: string;
  description: string;
  category: string;
  parameters: { name: string; type: string; label: string; required?: boolean; description?: string }[];
}

interface Tool {
  id: string;
  team_id: string;
  name: string;
  description: string;
  category: string;
  action: string;
  tool_type: string;
  config: { url?: string; method?: string; headers?: Record<string, string>; bodyTemplate?: string };
  parameters: { name: string; type: string; label: string; required?: boolean; description?: string }[];
  enabled: boolean;
  is_builtin: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface BuiltinTool extends PrebuiltAction {
  available: boolean;
}

export default function ToolsPage() {
  const { user } = useAuth();
  const teamId = user?.currentTeamId;
  const [tools, setTools] = useState<Tool[]>([]);
  const [prebuiltActions, setPrebuiltActions] = useState<BuiltinTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingTool, setEditingTool] = useState<Tool | null>(null);
  const [saving, setSaving] = useState(false);

  // 表单状态
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formMethod, setFormMethod] = useState("GET");
  const [formHeaders, setFormHeaders] = useState("");
  const [formBodyTemplate, setFormBodyTemplate] = useState("");
  const [formParameters, setFormParameters] = useState("");

  const loadTools = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tools?teamId=${teamId}`);
      if (!res.ok) throw new Error("加载失败");
      const data = await res.json();
      setTools(data.tools || []);
      // 标记预置动作为自动可用
      const actions = (data.builtinActions || []).map((a: PrebuiltAction) => ({
        ...a,
        available: true,
      }));
      setPrebuiltActions(actions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载工具失败");
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    loadTools();
  }, [loadTools]);

  const resetForm = () => {
    setFormName("");
    setFormDescription("");
    setFormUrl("");
    setFormMethod("GET");
    setFormHeaders("");
    setFormBodyTemplate("");
    setFormParameters("");
  };

  const handleCreate = async () => {
    if (!teamId || !formName || !formUrl) return;
    setSaving(true);
    try {
      let headers: Record<string, string> = {};
      try { headers = formHeaders ? JSON.parse(formHeaders) : {}; } catch { headers = {}; }

      let params: { name: string; type: string; label: string; required?: boolean; description?: string }[] = [];
      try { params = formParameters ? JSON.parse(formParameters) : []; } catch { params = []; }

      const res = await fetch("/api/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          name: formName,
          description: formDescription,
          tool_type: "http",
          config: {
            url: formUrl,
            method: formMethod,
            headers,
            bodyTemplate: formBodyTemplate,
          },
          parameters: params,
          createdBy: user?.id || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "创建失败");
      }

      resetForm();
      setShowCreateDialog(false);
      await loadTools();
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!editingTool || !formName || !formUrl) return;
    setSaving(true);
    try {
      let headers: Record<string, string> = {};
      try { headers = formHeaders ? JSON.parse(formHeaders) : {}; } catch { headers = {}; }

      let params: { name: string; type: string; label: string; required?: boolean; description?: string }[] = [];
      try { params = formParameters ? JSON.parse(formParameters) : []; } catch { params = []; }

      const res = await fetch("/api/tools", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingTool.id,
          name: formName,
          description: formDescription,
          tool_type: "http",
          config: {
            url: formUrl,
            method: formMethod,
            headers,
            bodyTemplate: formBodyTemplate,
          },
          parameters: params,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "更新失败");
      }

      setShowEditDialog(false);
      setEditingTool(null);
      resetForm();
      await loadTools();
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新失败");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (toolId: string) => {
    if (!confirm("确定要删除这个工具吗？")) return;
    try {
      const res = await fetch(`/api/tools?id=${toolId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("删除失败");
      await loadTools();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    }
  };

  const openEditDialog = (tool: Tool) => {
    setEditingTool(tool);
    setFormName(tool.name);
    setFormDescription(tool.description || "");
    setFormUrl(tool.config?.url || "");
    setFormMethod(tool.config?.method || "GET");
    setFormHeaders(JSON.stringify(tool.config?.headers || {}, null, 2));
    setFormBodyTemplate(tool.config?.bodyTemplate || "");
    setFormParameters(JSON.stringify(tool.parameters || [], null, 2));
    setShowEditDialog(true);
  };

  const openCreateDialog = () => {
    resetForm();
    setShowCreateDialog(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">工具管理</h1>
          <p className="text-sm text-muted-foreground mt-1">
            管理智能体可调用的工具。系统预置工具自动可用，无需额外配置。
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="w-4 h-4 mr-2" />
          新建工具
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 rounded-lg">
          <AlertCircle className="w-4 h-4" />
          {error}
          <Button variant="ghost" size="sm" onClick={() => setError(null)}>关闭</Button>
        </div>
      )}

      {/* 系统预置工具 */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Server className="w-4 h-4 text-primary" />
          系统预置工具（自动可用）
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {prebuiltActions.map((action) => (
            <Card key={action.action} className="bg-muted/30 border-dashed">
              <CardHeader className="p-3 pb-0">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">{action.name}</CardTitle>
                  <Badge variant="outline" className="text-xs text-green-600 border-green-300 bg-green-50">
                    自动可用
                  </Badge>
                </div>
                <CardDescription className="text-xs mt-1">{action.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>

      {/* 自定义工具 */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Wrench className="w-4 h-4 text-primary" />
          自定义工具
        </h2>
        {tools.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground bg-muted/20 rounded-lg border border-dashed">
            <Globe className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">暂无自定义工具</p>
            <p className="text-xs mt-1">创建 HTTP 工具来扩展智能体的能力</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={openCreateDialog}>
              <Plus className="w-4 h-4 mr-2" />
              新建工具
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {tools.map((tool) => (
              <Card key={tool.id}>
                <CardHeader className="p-3 pb-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-primary" />
                      <CardTitle className="text-sm font-medium">{tool.name}</CardTitle>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {tool.config?.method || "GET"}
                    </Badge>
                  </div>
                  <CardDescription className="text-xs mt-1 truncate">
                    {tool.description || tool.config?.url || "无描述"}
                  </CardDescription>
                  {tool.config?.url && (
                    <p className="text-xs text-muted-foreground mt-1 font-mono truncate">{tool.config.url}</p>
                  )}
                </CardHeader>
                <CardFooter className="p-2 pt-1 flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => openEditDialog(tool)}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(tool.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* 新建工具弹窗 */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>新建 HTTP 工具</DialogTitle>
            <DialogDescription>
              创建一个 HTTP 调用工具，智能体可以通过它调用外部 API。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>工具名称 *</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="例如：查询天气"
              />
            </div>
            <div className="space-y-2">
              <Label>工具描述</Label>
              <Textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="描述这个工具的作用，让智能体知道何时调用它"
                rows={2}
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1 space-y-2">
                <Label>请求地址 *</Label>
                <Input
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  placeholder="https://api.example.com/endpoint"
                />
              </div>
              <div className="w-28 space-y-2">
                <Label>请求方法</Label>
                <Select value={formMethod} onValueChange={setFormMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GET">GET</SelectItem>
                    <SelectItem value="POST">POST</SelectItem>
                    <SelectItem value="PUT">PUT</SelectItem>
                    <SelectItem value="DELETE">DELETE</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>请求头（JSON，可选）</Label>
              <Textarea
                value={formHeaders}
                onChange={(e) => setFormHeaders(e.target.value)}
                placeholder='{&#10;  "Authorization": "Bearer {token}",&#10;  "Content-Type": "application/json"&#10;}'
                rows={3}
                className="font-mono text-xs"
              />
            </div>
            {(formMethod === "POST" || formMethod === "PUT") && (
              <div className="space-y-2">
                <Label>请求体模板（可选）</Label>
                <Textarea
                  value={formBodyTemplate}
                  onChange={(e) => setFormBodyTemplate(e.target.value)}
                  placeholder='{&#10;  "city": "{city}",&#10;  "date": "{date}"&#10;}'
                  rows={3}
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  使用 <code className="bg-muted px-1 rounded">{`{变量名}`}</code> 引用参数
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label>参数定义（JSON，可选）</Label>
              <Textarea
                value={formParameters}
                onChange={(e) => setFormParameters(e.target.value)}
                placeholder='[{&#10;  "name": "city",&#10;  "type": "string",&#10;  "label": "城市名称",&#10;  "required": true,&#10;  "description": "要查询天气的城市"&#10;}]'
                rows={3}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                定义智能体需要提供的参数，在 URL/Header/Body 中用 <code className="bg-muted px-1 rounded">{`{变量名}`}</code> 引用
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>取消</Button>
            <Button onClick={handleCreate} disabled={saving || !formName || !formUrl}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑工具弹窗 */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>编辑工具</DialogTitle>
            <DialogDescription>修改 HTTP 工具的配置。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>工具名称 *</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>工具描述</Label>
              <Textarea value={formDescription} onChange={(e) => setFormDescription(e.target.value)} rows={2} />
            </div>
            <div className="flex gap-3">
              <div className="flex-1 space-y-2">
                <Label>请求地址 *</Label>
                <Input value={formUrl} onChange={(e) => setFormUrl(e.target.value)} />
              </div>
              <div className="w-28 space-y-2">
                <Label>请求方法</Label>
                <Select value={formMethod} onValueChange={setFormMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GET">GET</SelectItem>
                    <SelectItem value="POST">POST</SelectItem>
                    <SelectItem value="PUT">PUT</SelectItem>
                    <SelectItem value="DELETE">DELETE</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>请求头（JSON）</Label>
              <Textarea
                value={formHeaders}
                onChange={(e) => setFormHeaders(e.target.value)}
                rows={3}
                className="font-mono text-xs"
              />
            </div>
            {(formMethod === "POST" || formMethod === "PUT") && (
              <div className="space-y-2">
                <Label>请求体模板</Label>
                <Textarea
                  value={formBodyTemplate}
                  onChange={(e) => setFormBodyTemplate(e.target.value)}
                  rows={3}
                  className="font-mono text-xs"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>参数定义（JSON）</Label>
              <Textarea
                value={formParameters}
                onChange={(e) => setFormParameters(e.target.value)}
                rows={3}
                className="font-mono text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>取消</Button>
            <Button onClick={handleEdit} disabled={saving || !formName || !formUrl}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}