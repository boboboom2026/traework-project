"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Search, Pencil, Trash2, Check, X, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface Model {
  id: string;
  name: string;
  provider: string;
  description: string | null;
  supports_multimodal: boolean;
  is_active: boolean;
  is_builtin: boolean;
  created_at: string;
}

export default function AdminSettingsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editDialog, setEditDialog] = useState(false);
  const [editingModel, setEditingModel] = useState<Model | null>(null);
  const [saving, setSaving] = useState(false);

  const getAuthHeaders = () => {
    const headers: Record<string, string> = {};
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("auth_token");
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  };

  const fetchModels = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/models", { headers: getAuthHeaders() });
      const json = await res.json();
      if (json.success) {
        setModels(json.data);
      }
    } catch (e) {
      toast.error("加载模型列表失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/admin/login");
      return;
    }
    fetchModels();
  }, [authLoading, user]);

  const filteredModels = models.filter(
    (m) =>
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.provider.toLowerCase().includes(search.toLowerCase()) ||
      m.id.toLowerCase().includes(search.toLowerCase())
  );

  const handleSave = async (formData: FormData) => {
    setSaving(true);
    try {
      const body: Record<string, any> = {
        name: formData.get("name"),
        provider: formData.get("provider"),
        description: formData.get("description"),
        supportsMultimodal: formData.get("supportsMultimodal") === "true",
        isActive: formData.get("isActive") === "true",
      };

      if (editingModel) {
        const res = await fetch(`/api/admin/models?id=${editingModel.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (json.success) {
          toast.success("模型已更新");
        } else {
          toast.error(json.error || "更新失败");
        }
      } else {
        body.id = formData.get("id");
        const res = await fetch("/api/admin/models", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (json.success) {
          toast.success("模型已添加");
        } else {
          toast.error(json.error || "添加失败");
        }
      }
      setEditDialog(false);
      setEditingModel(null);
      fetchModels();
    } catch (e) {
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (model: Model) => {
    if (model.is_builtin) {
      toast.error("预置模型不可删除，可禁用");
      return;
    }
    if (!confirm(`确定删除模型 "${model.name}"？`)) return;
    try {
      const res = await fetch(`/api/admin/models?id=${model.id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("模型已删除");
        fetchModels();
      } else {
        toast.error(json.error || "删除失败");
      }
    } catch (e) {
      toast.error("删除失败");
    }
  };

  const handleToggleActive = async (model: Model) => {
    try {
      const res = await fetch(`/api/admin/models?id=${model.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ isActive: !model.is_active }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(model.is_active ? "模型已禁用" : "模型已启用");
        fetchModels();
      }
    } catch (e) {
      toast.error("状态更新失败");
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const providers = [...new Set(models.map((m) => m.provider))].sort();

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">模型管理</h1>
          <p className="text-sm text-muted-foreground mt-1">
            管理平台支持的所有 LLM 模型，新增或编辑后的模型可在智能体对话中选用
          </p>
        </div>
        <Button onClick={() => { setEditingModel(null); setEditDialog(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          添加模型
        </Button>
      </div>

      {/* 搜索栏 */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="搜索模型名称、提供商、ID..."
          className="pl-10"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">模型总数</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{models.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">已启用</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{models.filter((m) => m.is_active).length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">提供商</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{providers.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* 模型列表 */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>模型名称</TableHead>
                <TableHead>提供商</TableHead>
                <TableHead>模型 ID</TableHead>
                <TableHead>多模态</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredModels.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    暂无数据
                  </TableCell>
                </TableRow>
              ) : (
                filteredModels.map((model) => (
                  <TableRow key={model.id}>
                    <TableCell className="font-medium">{model.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{model.provider}</Badge>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-2 py-1 rounded">{model.id}</code>
                    </TableCell>
                    <TableCell>
                      {model.supports_multimodal ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <X className="h-4 w-4 text-muted-foreground" />
                      )}
                    </TableCell>
                    <TableCell>
                      {model.is_builtin ? (
                        <Badge className="bg-blue-500">预置</Badge>
                      ) : (
                        <Badge variant="secondary">自定义</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={model.is_active}
                        onCheckedChange={() => handleToggleActive(model)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => { setEditingModel(model); setEditDialog(true); }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {!model.is_builtin && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(model)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 编辑/新增弹窗 */}
      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingModel ? "编辑模型" : "添加模型"}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSave(new FormData(e.currentTarget));
            }}
          >
            <div className="space-y-4 py-4">
              {!editingModel && (
                <div className="space-y-2">
                  <Label>模型 ID *</Label>
                  <Input
                    name="id"
                    required
                    placeholder="如：my-custom-model-v1"
                    disabled={false}
                  />
                  <p className="text-xs text-muted-foreground">SDK 调用时使用的模型标识符，创建后不可修改</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>模型名称 *</Label>
                  <Input
                    name="name"
                    required
                    placeholder="如：My Custom Model"
                    defaultValue={editingModel?.name || ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label>提供商 *</Label>
                  <Input
                    name="provider"
                    required
                    placeholder="如：OpenAI、Anthropic"
                    defaultValue={editingModel?.provider || ""}
                    list="providers-list"
                  />
                  <datalist id="providers-list">
                    {providers.map((p) => (
                      <option key={p} value={p} />
                    ))}
                  </datalist>
                </div>
              </div>
              <div className="space-y-2">
                <Label>描述</Label>
                <Textarea
                  name="description"
                  placeholder="模型的用途和特点"
                  defaultValue={editingModel?.description || ""}
                  rows={3}
                />
              </div>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Switch
                    name="supportsMultimodal"
                    defaultChecked={editingModel?.supports_multimodal || false}
                    value="true"
                    onCheckedChange={(checked) => {
                      const input = document.querySelector<HTMLInputElement>('input[name="supportsMultimodal"]');
                      if (input) input.value = checked ? "true" : "false";
                    }}
                  />
                  <Label>支持多模态</Label>
                </div>
                {editingModel && (
                  <div className="flex items-center gap-2">
                    <Switch
                      name="isActive"
                      defaultChecked={editingModel?.is_active ?? true}
                      value="true"
                      onCheckedChange={(checked) => {
                        const input = document.querySelector<HTMLInputElement>('input[name="isActive"]');
                        if (input) input.value = checked ? "true" : "false";
                      }}
                    />
                    <Label>启用</Label>
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setEditDialog(false)}>
                取消
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {editingModel ? "保存" : "添加"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}