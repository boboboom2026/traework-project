"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft,
  Globe,
  RefreshCw,
  Download,
  Search,
  Check,
  X,
  Key,
  Trash2,
  Settings,
} from "lucide-react";

interface Endpoint {
  path: string;
  method: string;
  operationId: string;
  summary: string;
  description: string;
  tags: string[];
  parameters: unknown[];
  toolDefinition: {
    name: string;
    description: string;
    action: string;
    tool_type: string;
    parameters: unknown;
    config: {
      url: string;
      method: string;
      headers: Record<string, string>;
      bodyTemplate: string;
    };
  };
}

interface ServiceRecord {
  id: string;
  name: string;
  description: string;
  endpoint_url: string;
  config: {
    auth_type?: string;
    credentials?: {
      app_id?: string;
      app_secret?: string;
    };
    openapi_url?: string;
    openapi_schema?: unknown;
  };
  status: string;
  created_at: string;
  tool_count?: number;
}

export default function ServiceDetailPage() {
  const { user } = useAuth();
  const params = useParams();
  const router = useRouter();
  const serviceId = params.id as string;

  const [service, setService] = useState<ServiceRecord | null>(null);
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [tagFilter, setTagFilter] = useState<string>("全部");
  const [showEdit, setShowEdit] = useState(false);
  const [showOpenapiDialog, setShowOpenapiDialog] = useState(false);
  const [openapiUrl, setOpenapiUrl] = useState("");
  const [openapiContent, setOpenapiContent] = useState("");
  const [importMode, setImportMode] = useState<"url" | "paste">("url");

  // 编辑表单
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editEndpointUrl, setEditEndpointUrl] = useState("");
  const [editAuthType, setEditAuthType] = useState("appid_secret");
  const [editAppId, setEditAppId] = useState("");
  const [editAppSecret, setEditAppSecret] = useState("");

  const loadService = useCallback(async () => {
    if (!user?.currentTeamId || !serviceId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/services?id=${serviceId}`);
      const data = await res.json();
      if (data.success && data.data) {
        setService(data.data);
        setEditName(data.data.name);
        setEditDescription(data.data.description || "");
        setEditEndpointUrl(data.data.endpoint_url || "");
        setEditAuthType(data.data.config?.auth_type || "appid_secret");
        setEditAppId(data.data.config?.credentials?.app_id || "");
        setEditAppSecret(data.data.config?.credentials?.app_secret || "");
        setOpenapiUrl(data.data.config?.openapi_url || "");
      }
    } catch (err) {
      console.error("加载服务详情失败:", err);
    } finally {
      setLoading(false);
    }
  }, [user?.currentTeamId, serviceId]);

  useEffect(() => {
    loadService();
  }, [loadService]);

  const handleImportOpenapi = async () => {
    if (!serviceId) return;
    setImporting(true);
    try {
      const res = await fetch("/api/services/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId,
          openapiUrl: importMode === "url" ? openapiUrl : undefined,
          openapiContent: importMode === "paste" ? openapiContent : undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setEndpoints(data.data.endpoints || []);
        setSelectedIds(new Set());
        setImportedCount(0);
        setShowOpenapiDialog(false);
        loadService();
      } else {
        alert(data.error || "导入失败");
      }
    } catch (err) {
      console.error("导入 OpenAPI 失败:", err);
      alert("导入失败");
    } finally {
      setImporting(false);
    }
  };

  const handleBatchImport = async () => {
    if (selectedIds.size === 0) return;
    setImporting(true);
    try {
      const selectedEndpoints = endpoints.filter((ep) =>
        selectedIds.has(ep.operationId)
      );
      const res = await fetch("/api/services/import", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId,
          endpoints: selectedEndpoints,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setImportedCount(data.data.total);
        loadService();
        // 标记已导入的端点
        setEndpoints((prev) =>
          prev.filter((ep) => !selectedIds.has(ep.operationId))
        );
        setSelectedIds(new Set());
      }
    } catch (err) {
      console.error("批量导入失败:", err);
    } finally {
      setImporting(false);
    }
  };

  const handleSaveService = async () => {
    if (!serviceId || !editName.trim()) return;
    try {
      const res = await fetch("/api/services", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: serviceId,
          name: editName,
          description: editDescription,
          endpointUrl: editEndpointUrl,
          config: {
            auth_type: editAuthType,
            credentials: {
              app_id: editAppId,
              app_secret: editAppSecret,
            },
            openapi_url: openapiUrl,
          },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowEdit(false);
        loadService();
      }
    } catch (err) {
      console.error("更新服务失败:", err);
    }
  };

  const toggleSelect = (operationId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(operationId)) {
        next.delete(operationId);
      } else {
        next.add(operationId);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === filteredEndpoints.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredEndpoints.map((e) => e.operationId)));
    }
  };

  const methodColors: Record<string, string> = {
    GET: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    POST: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    PUT: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    PATCH: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    DELETE: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  };

  const authTypeLabels: Record<string, string> = {
    appid_secret: "AppID + Secret",
    oauth2: "OAuth 2.0",
    api_key: "API Key",
    none: "无鉴权",
  };

  const allTags = Array.from(new Set(endpoints.flatMap((e) => e.tags || [])));
  const filteredEndpoints = endpoints.filter((ep) => {
    const matchesSearch =
      !searchTerm ||
      ep.summary?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ep.path.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ep.operationId.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTag = tagFilter === "全部" || (ep.tags || []).includes(tagFilter);
    return matchesSearch && matchesTag;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!service) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">服务不存在</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push("/members/services")}>
          返回列表
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* 返回按钮 */}
      <button
        onClick={() => router.push("/members/services")}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        返回服务列表
      </button>

      {/* 服务信息卡片 */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Globe className="w-6 h-6 text-primary" />
              <div>
                <CardTitle className="text-xl">{service.name}</CardTitle>
                {service.description && (
                  <CardDescription>{service.description}</CardDescription>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={service.status === "active" ? "default" : "secondary"}>
                {service.status === "active" ? "启用" : "停用"}
              </Badge>
              <Button variant="outline" size="sm" onClick={() => setShowEdit(true)}>
                <Settings className="w-4 h-4 mr-1" />
                编辑
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            {service.config?.auth_type && (
              <span className="flex items-center gap-1">
                <Key className="w-3.5 h-3.5" />
                {authTypeLabels[service.config.auth_type] || service.config.auth_type}
              </span>
            )}
            {service.endpoint_url && (
              <span className="flex items-center gap-1">
                <Globe className="w-3.5 h-3.5" />
                {service.endpoint_url}
              </span>
            )}
            <span>{service.tool_count ?? 0} 个工具</span>
          </div>
        </CardContent>
      </Card>

      {/* 工具导入区域 */}
      {endpoints.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Download className="w-10 h-10 text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground mb-1">还没有导入 OpenAPI 文档</p>
            <p className="text-sm text-muted-foreground/60 mb-4">
              导入 OpenAPI 3.x 文档，自动解析所有 API 端点并批量生成工具
            </p>
            <Dialog open={showOpenapiDialog} onOpenChange={setShowOpenapiDialog}>
              <DialogTrigger asChild>
                <Button onClick={() => setShowOpenapiDialog(true)}>
                  <Download className="w-4 h-4 mr-1.5" />
                  导入 OpenAPI 文档
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[520px]">
                <DialogHeader>
                  <DialogTitle>导入 OpenAPI 文档</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div className="flex gap-2">
                    <Button
                      variant={importMode === "url" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setImportMode("url")}
                    >
                      URL 导入
                    </Button>
                    <Button
                      variant={importMode === "paste" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setImportMode("paste")}
                    >
                      粘贴内容
                    </Button>
                  </div>
                  {importMode === "url" ? (
                    <div className="space-y-2">
                      <Label>OpenAPI 文档地址</Label>
                      <Input
                        placeholder="https://open.feishu.cn/openapi.json"
                        value={openapiUrl}
                        onChange={(e) => setOpenapiUrl(e.target.value)}
                      />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label>OpenAPI 文档内容（JSON/YAML）</Label>
                      <Textarea
                        placeholder='{"openapi": "3.0.0", ...}'
                        value={openapiContent}
                        onChange={(e) => setOpenapiContent(e.target.value)}
                        rows={10}
                        className="font-mono text-xs"
                      />
                    </div>
                  )}
                  <div className="flex justify-end gap-3">
                    <Button variant="outline" onClick={() => setShowOpenapiDialog(false)}>
                      取消
                    </Button>
                    <Button onClick={handleImportOpenapi} disabled={importing}>
                      {importing ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                          解析中...
                        </>
                      ) : (
                        "开始解析"
                      )}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* 工具栏 */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">
                共 {filteredEndpoints.length} 个端点
              </span>
              <span className="text-sm text-muted-foreground">
                已选 {selectedIds.size} 个
              </span>
              {importedCount > 0 && (
                <span className="text-sm text-green-600">
                  ✓ 已导入 {importedCount} 个工具
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowOpenapiDialog(true)}
              >
                <RefreshCw className="w-4 h-4 mr-1" />
                重新导入
              </Button>
              <Button
                size="sm"
                onClick={handleBatchImport}
                disabled={selectedIds.size === 0 || importing}
              >
                {importing ? (
                  <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Download className="w-4 h-4 mr-1" />
                )}
                导入选中的 {selectedIds.size} 个工具
              </Button>
            </div>
          </div>

          {/* 搜索和筛选 */}
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="搜索端点..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={tagFilter} onValueChange={setTagFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="全部">全部标签</SelectItem>
                {allTags.map((tag) => (
                  <SelectItem key={tag} value={tag}>
                    {tag}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleAll}
              className="text-xs"
            >
              {selectedIds.size === filteredEndpoints.length ? "取消全选" : "全选"}
            </Button>
          </div>

          {/* 端点列表 */}
          <Card>
            <ScrollArea className="max-h-[500px]">
              <div className="divide-y divide-border">
                {/* 表头 */}
                <div className="flex items-center gap-3 px-4 py-2 bg-muted/50 text-xs font-medium text-muted-foreground">
                  <Checkbox
                    checked={
                      filteredEndpoints.length > 0 &&
                      selectedIds.size === filteredEndpoints.length
                    }
                    onCheckedChange={toggleAll}
                  />
                  <div className="w-16">方法</div>
                  <div className="flex-1">路径</div>
                  <div className="flex-1">描述</div>
                  <div className="w-24 text-right">标签</div>
                </div>
                {filteredEndpoints.map((ep) => (
                  <div
                    key={ep.operationId}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors"
                  >
                    <Checkbox
                      checked={selectedIds.has(ep.operationId)}
                      onCheckedChange={() => toggleSelect(ep.operationId)}
                    />
                    <div className="w-16">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-mono font-medium ${
                          methodColors[ep.method] || "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {ep.method}
                      </span>
                    </div>
                    <div className="flex-1">
                      <code className="text-xs font-mono text-foreground">
                        {ep.path}
                      </code>
                    </div>
                    <div className="flex-1 text-sm text-muted-foreground truncate">
                      {ep.summary || ep.description || "-"}
                    </div>
                    <div className="w-24 text-right">
                      {(ep.tags || []).slice(0, 2).map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs ml-1">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </Card>
        </>
      )}

      {/* 编辑服务弹窗 */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>编辑服务</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>服务名称</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>描述</Label>
              <Textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>基础 URL</Label>
              <Input
                value={editEndpointUrl}
                onChange={(e) => setEditEndpointUrl(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>鉴权方式</Label>
              <Select value={editAuthType} onValueChange={setEditAuthType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="appid_secret">AppID + Secret</SelectItem>
                  <SelectItem value="oauth2">OAuth 2.0</SelectItem>
                  <SelectItem value="api_key">API Key</SelectItem>
                  <SelectItem value="none">无鉴权</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editAuthType === "appid_secret" && (
              <>
                <div className="space-y-2">
                  <Label>App ID</Label>
                  <Input value={editAppId} onChange={(e) => setEditAppId(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>App Secret</Label>
                  <Input
                    type="password"
                    value={editAppSecret}
                    onChange={(e) => setEditAppSecret(e.target.value)}
                  />
                </div>
              </>
            )}
            {editAuthType === "api_key" && (
              <div className="space-y-2">
                <Label>API Key</Label>
                <Input
                  type="password"
                  value={editAppSecret}
                  onChange={(e) => setEditAppSecret(e.target.value)}
                />
              </div>
            )}
            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setShowEdit(false)}>
                取消
              </Button>
              <Button onClick={handleSaveService}>保存</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}