"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Eye, EyeOff, Loader2 } from "lucide-react";

interface JoinTeamParams {
  teamName?: string;
  phone?: string;
}

export default function JoinTeamPage({ searchParams }: { searchParams: Promise<JoinTeamParams> }) {
  const [formData, setFormData] = useState({
    name: "",
    password: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [teamName, setTeamName] = useState("");

  const { register, login } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // 获取团队名称（从URL参数或localStorage）
    const getTeamName = async () => {
      const params = await searchParams;
      if (params?.teamName) {
        setTeamName(params.teamName);
      } else {
        const storedTeamName = localStorage.getItem("pending_join_team");
        if (storedTeamName) {
          setTeamName(storedTeamName);
        }
      }
    };
    getTeamName();
  }, [searchParams]);

  // 更新表单字段
  const updateFormData = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // 提交表单
  const handleSubmit = async () => {
    setError("");

    // 验证必填项
    if (!formData.name.trim()) {
      setError("请输入您的名称");
      return;
    }
    if (!formData.password) {
      setError("请输入登录密码");
      return;
    }
    if (formData.password.length < 6) {
      setError("密码由字母和数字组合，最少6位");
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setError("两次密码输入不一致");
      return;
    }
    if (!agreeTerms) {
      setError("请阅读并同意服务协议");
      return;
    }

    setIsLoading(true);

    try {
      // 注册账户
      const registerResult = await register({
        phone: localStorage.getItem("pending_join_phone") || "",
        name: formData.name,
        password: formData.password,
        confirmPassword: formData.confirmPassword,
      });

      if (registerResult.success) {
        // 获取存储的手机号进行登录
        const phone = localStorage.getItem("pending_join_phone") || "";
        const loginResult = await login(phone, formData.password);
        if (loginResult.success) {
          router.push("/");
        } else {
          router.push("/login");
        }
      } else {
        setError(registerResult.error || "创建账户失败");
      }
    } catch {
      setError("创建账户失败，请重试");
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

        {/* 加入团队卡片 */}
        <div className="bg-card rounded-2xl shadow-lg border border-border/50 p-8">
          {/* 标题 */}
          <div className="text-center mb-6">
            <h1 className="text-xl font-semibold text-foreground mb-1">
              {teamName ? (
                <>
                  加入 <span className="text-primary">{teamName}</span>
                </>
              ) : (
                "加入团队"
              )}
            </h1>
            <p className="text-sm text-muted-foreground">
              发现你第一次登录，为你创建账户
            </p>
          </div>

          {/* 名称 */}
          <div className="mb-4">
            <Label className="text-sm font-medium text-foreground mb-2 flex items-center">
              名称 <span className="text-destructive ml-1">*</span>
            </Label>
            <Input
              type="text"
              placeholder="你的称呼"
              value={formData.name}
              onChange={(e) => updateFormData("name", e.target.value)}
              className="w-full"
            />
          </div>

          {/* 登录密码 */}
          <div className="mb-4">
            <Label className="text-sm font-medium text-foreground mb-2 flex items-center">
              登录密码 <span className="text-destructive ml-1">*</span>
            </Label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="密码由字母和数字组合，最少6位"
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

          {/* 确认密码 */}
          <div className="mb-6">
            <Label className="text-sm font-medium text-foreground mb-2 flex items-center">
              确认密码 <span className="text-destructive ml-1">*</span>
            </Label>
            <div className="relative">
              <Input
                type={showConfirmPassword ? "text" : "password"}
                placeholder="再次确认密码"
                value={formData.confirmPassword}
                onChange={(e) => updateFormData("confirmPassword", e.target.value)}
                className="w-full pr-10"
                maxLength={16}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showConfirmPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
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
              "创建账户"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
