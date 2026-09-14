"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Plus, Globe, RefreshCw, Settings, ExternalLink, Key, Trash2 } from "lucide-react";

interface ServiceRecord {
  id: string;
  name: string;
  description: string;
  endpoint_url: string;
  config: {
    auth_type?: string;
    openapi_url?: string;
    openapi_schema?: unknown;
  };
  status: string;
  created_at: string;
  tool_count?: number;
}

export default function ServicesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [services, setServices] = useState<ServiceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 表单状态
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formEndpointUrl, setFormEndpointUrl] = useState("");
  const [formAuthType, setFormAuthType] = useState("appid_secret");
  const [formAppId, setFormAppId] = useState("");
  const [formAppSecret, setFormAppSecret] = useState("");
  const [formOpenapiUrl, setFormOpenapiUrl] = useState("");

  const loadServices = useCallback(async () => {
    if (!user?.currentTeamId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/services");
      const data = await res.json();
      if (data.success) {
        setServices(data.data || []);
      }
    } catch (err) {
      console.error("加载服务列表失败:", err);
    } finally {
      setLoading(false);
    }
  }, [user?.currentTeamId]);

  useEffect(() => {
    loadServices();
  }, [loadServices]);

  const handleCreate = async () => {
    if (!formName.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName,
          description: formDescription,
          endpointUrl: formEndpointUrl,
          config: {
            auth_type: formAuthType,
            credentials: {
              app_id: formAppId,
              app_secret: formAppSecret,
            },
            openapi_url: formOpenapiUrl,
          },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowCreate(false);
        resetForm();
        loadServices();
        // 跳转到详情页导入工具
        if (data.data?.id && formOpenapiUrl) {
          router.push(`/members/services/${data.data.id}`);
        }
      }
    } catch (err) {
      console.error("创建服务失败:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除这个服务吗？关联的工具将保留但不再共享凭证。")) return;
    try {
      await fetch(`/api/services?id=${id}`, { method: "DELETE" });
      loadServices();
    } catch (err) {
      console.error("删除服务失败:", err);
    }
  };

  const resetForm = () => {
    setFormName("");
    setFormDescription("");
    setFormEndpointUrl("");
    setFormAuthType("appid_secret");
    setFormAppId("");
    setFormAppSecret("");
    setFormOpenapiUrl("");
  };

  const authTypeLabels: Record<string, string> = {
    appid_secret: "AppID + Secret",
    oauth2: "OAuth 2.0",
    api_key: "API Key",
    none: "无鉴权",
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">服务注册中心</h1>
          <p className="text-sm text-muted-foreground mt-1">
            注册外部服务，导入 OpenAPI 文档自动生成工具
          </p>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4 mr-1.5" />
              注册服务
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>注册外部服务</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>服务名称 *</Label>
                <Input
                  placeholder="如：飞书开放平台、企业ERP"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>描述</Label>
                <Textarea
                  placeholder="如：飞书开放平台 API，支持消息推送、用户管理、审批流程等"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label>基础 URL</Label>
                <Input
                  placeholder="如：https://open.feishu.cn/open-apis"
                  value={formEndpointUrl}
                  onChange={(e) => setFormEndpointUrl(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>鉴权方式</Label>
                <Select value={formAuthType} onValueChange={setFormAuthType}>
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
              {formAuthType === "appid_secret" && (
                <>
                  <div className="space-y-2">
                    <Label>App ID</Label>
                    <Input
                      placeholder="cli_xxxxxxxxxxxx"
                      value={formAppId}
                      onChange={(e) => setFormAppId(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>App Secret</Label>
                    <Input
                      type="password"
                      placeholder="••••••••••••••••"
                      value={formAppSecret}
                      onChange={(e) => setFormAppSecret(e.target.value)}
                    />
                  </div>
                </>
              )}
              {formAuthType === "api_key" && (
                <div className="space-y-2">
                  <Label>API Key</Label>
                  <Input
                    type="password"
                    placeholder="sk-xxxxxxxxxxxx"
                    value={formAppSecret}
                    onChange={(e) => setFormAppSecret(e.target.value)}
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label>OpenAPI 文档地址</Label>
                <Input
                  placeholder="https://open.feishu.cn/openapi.json"
                  value={formOpenapiUrl}
                  onChange={(e) => setFormOpenapiUrl(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  粘贴 OpenAPI 3.x 文档的 JSON/YAML 地址，用于自动解析工具
                </p>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <Button variant="outline" onClick={() => setShowCreate(false)}>
                  取消
                </Button>
                <Button onClick={handleCreate} disabled={submitting || !formName.trim()}>
                  {submitting ? "创建中..." : "保存并注册"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : services.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Globe className="w-12 h-12 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground mb-2">还没有注册任何外部服务</p>
            <p className="text-sm text-muted-foreground/60 mb-4">
              注册飞书、企业微信、ERP 等外部服务，导入 OpenAPI 文档自动生成工具
            </p>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4 mr-1.5" />
              注册第一个服务
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {services.map((svc) => (
            <Card
              key={svc.id}
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => router.push(`/members/services/${svc.id}`)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Globe className="w-5 h-5 text-primary" />
                    <CardTitle className="text-base">{svc.name}</CardTitle>
                  </div>
                  <Badge variant={svc.status === "active" ? "default" : "secondary"}>
                    {svc.status === "active" ? "启用" : "停用"}
                  </Badge>
                </div>
                {svc.description && (
                  <CardDescription className="line-clamp-2">{svc.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  {svc.config?.auth_type && (
                    <span className="flex items-center gap-1">
                      <Key className="w-3.5 h-3.5" />
                      {authTypeLabels[svc.config.auth_type] || svc.config.auth_type}
                    </span>
                  )}
                  <span>{svc.tool_count ?? 0} 个工具</span>
                  {svc.config?.openapi_url && (
                    <span className="flex items-center gap-1">
                      <ExternalLink className="w-3.5 h-3.5" />
                      OpenAPI
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/members/services/${svc.id}`);
                    }}
                  >
                    <Settings className="w-3.5 h-3.5 mr-1" />
                    管理工具
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(svc.id);
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1" />
                    删除
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}