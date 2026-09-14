"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Eye, EyeOff, Loader2, ArrowLeft } from "lucide-react";

export default function CreateTeamProfilePage() {
  const [formData, setFormData] = useState({
    name: "",
    password: "",
    teamName: "",
    industry: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [phone, setPhone] = useState("");

  const { createTeam } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // 获取上一步存储的手机号
    const storedPhone = localStorage.getItem("create_team_phone");
    if (storedPhone) {
      setPhone(storedPhone);
    } else {
      // 如果没有手机号，返回上一步
      router.push("/register/create-team");
    }
  }, [router]);

  // 更新表单字段
  const updateFormData = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // 提交表单
  const handleSubmit = async () => {
    setError("");

    // 验证必填项
    if (!formData.name.trim()) {
      setError("请输入您的全名");
      return;
    }
    if (!formData.password) {
      setError("请输入密码");
      return;
    }
    if (formData.password.length < 6 || formData.password.length > 16) {
      setError("密码长度需为6-16位");
      return;
    }
    if (!formData.teamName.trim()) {
      setError("请输入团队名称");
      return;
    }
    if (!agreeTerms) {
      setError("请阅读并同意服务协议");
      return;
    }

    setIsLoading(true);

    try {
      // 创建团队
      const createResult = await createTeam(formData.teamName, formData.industry);

      if (createResult.success) {
        // 创建成功，跳转到首页
        router.push("/");
      } else {
        setError(createResult.error || "创建失败");
      }
    } catch {
      setError("创建失败，请重试");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-amber-50/30 px-4 py-8">
      <div className="w-full max-w-md">
        {/* Logo 区域 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
              <svg
                viewBox="0 0 24 24"
                className="w-7 h-7 text-primary-foreground"
                fill="currentColor"
              >
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <span className="text-2xl font-bold text-foreground">AiTeams</span>
          </div>
        </div>

        {/* 返回按钮 */}
        <div className="mb-4">
          <button
            onClick={() => router.push("/register/create-team")}
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            返回
          </button>
        </div>

        {/* 创建团队卡片 */}
        <div className="bg-card rounded-2xl shadow-lg border border-border/50 p-8">
          <h1 className="text-xl font-semibold text-foreground mb-6">
            创建团队
          </h1>

          {/* 你的全名 */}
          <div className="mb-4">
            <Label className="text-sm font-medium text-foreground mb-2 flex items-center">
              你的全名 <span className="text-destructive ml-1">*</span>
            </Label>
            <Input
              type="text"
              placeholder="你的全名"
              value={formData.name}
              onChange={(e) => updateFormData("name", e.target.value)}
              className="w-full"
            />
          </div>

          {/* 密码 */}
          <div className="mb-4">
            <Label className="text-sm font-medium text-foreground mb-2 flex items-center">
              密码 <span className="text-destructive ml-1">*</span>
            </Label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="设置6-16位登录密码，区分大小写"
                value={formData.password}
                onChange={(e) => updateFormData("password", e.target.value)}
                className="w-full pr-10"
                maxLength={16}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* 团队名称 */}
          <div className="mb-4">
            <Label className="text-sm font-medium text-foreground mb-2 flex items-center">
              团队名称 <span className="text-destructive ml-1">*</span>
            </Label>
            <Input
              type="text"
              placeholder="你的公司或团队的名称"
              value={formData.teamName}
              onChange={(e) => updateFormData("teamName", e.target.value)}
              className="w-full"
            />
          </div>

          {/* 所属行业 */}
          <div className="mb-6">
            <Label className="text-sm font-medium text-foreground mb-2 block">
              所属行业
            </Label>
            <Input
              type="text"
              placeholder="所属行业"
              value={formData.industry}
              onChange={(e) => updateFormData("industry", e.target.value)}
              className="w-full"
            />
          </div>

          {/* 错误提示 */}
          {error && (
            <p className="text-sm text-destructive mb-4">{error}</p>
          )}

          {/* 协议勾选 */}
          <div className="flex items-start gap-2 mb-6">
            <Checkbox
              id="terms"
              checked={agreeTerms}
              onCheckedChange={(checked) => setAgreeTerms(checked as boolean)}
              className="mt-0.5"
            />
            <label
              htmlFor="terms"
              className="text-sm text-muted-foreground leading-tight cursor-pointer"
            >
              我已阅读并同意{" "}
              <Link
                href="/terms"
                className="text-primary hover:underline"
              >
                《AiTeams服务协议》
              </Link>
            </label>
          </div>

          {/* 提交按钮 */}
          <Button
            onClick={handleSubmit}
            disabled={isLoading}
            className="w-full h-12"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                创建中...
              </>
            ) : (
              "进入AiTeams"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
