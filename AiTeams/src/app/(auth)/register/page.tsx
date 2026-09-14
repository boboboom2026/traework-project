"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Eye, EyeOff, Loader2 } from "lucide-react";

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    phone: "",
    code: "",
    name: "",
    password: "",
    confirmPassword: "",
    teamName: "",
    industry: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState("");
  const { register, sendCode } = useAuth();
  const router = useRouter();

  // 发送验证码
  const handleSendCode = async () => {
    if (!formData.phone || formData.phone.length !== 11) {
      setError("请输入正确的手机号");
      return;
    }

    setIsSendingCode(true);
    setError("");

    try {
      const result = await sendCode(formData.phone, "register");
      
      if (result.success) {
        // 测试模式下自动填入验证码
        if (result.code) {
          setFormData((prev) => ({ ...prev, code: result.code! }));
        }
        
        setCountdown(60);
        const timer = setInterval(() => {
          setCountdown((prev) => {
            if (prev <= 1) {
              clearInterval(timer);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } else {
        setError(result.error || "发送验证码失败");
      }
    } catch {
      setError("发送验证码失败");
    } finally {
      setIsSendingCode(false);
    }
  };

  // 处理表单提交
  const handleSubmit = async () => {
    setError("");

    // 验证必填项
    if (!formData.phone || formData.phone.length !== 11) {
      setError("请输入正确的手机号");
      return;
    }
    if (!formData.code || formData.code.length !== 6) {
      setError("请输入6位验证码");
      return;
    }
    if (!formData.name.trim()) {
      setError("请输入您的姓名");
      return;
    }
    if (!formData.password) {
      setError("请输入密码");
      return;
    }
    if (formData.password.length < 6) {
      setError("密码长度至少6位");
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setError("两次密码输入不一致");
      return;
    }
    if (!agreeTerms) {
      setError("请同意服务条款");
      return;
    }

    setIsLoading(true);

    try {
      const result = await register({
        phone: formData.phone,
        name: formData.name,
        password: formData.password,
        confirmPassword: formData.confirmPassword,
        teamName: formData.teamName,
        industry: formData.industry,
      });

      if (result.success) {
        router.push("/onboarding");
      } else {
        setError(result.error || "注册失败");
      }
    } catch {
      setError("注册失败，请重试");
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
          <p className="text-muted-foreground text-sm">
            创建您的账户，开始协作之旅
          </p>
        </div>

        {/* 注册卡片 */}
        <div className="bg-card rounded-2xl shadow-lg border border-border/50 p-8">
          <h1 className="text-xl font-semibold text-foreground mb-6">
            创建账户
          </h1>

          {/* 表单 */}
          <div className="space-y-4">
            {/* 手机号 */}
            <div className="space-y-2">
              <Label htmlFor="phone">
                手机号 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="phone"
                type="tel"
                placeholder="请输入手机号"
                value={formData.phone}
                onChange={(e) =>
                  setFormData({ ...formData, phone: e.target.value.replace(/\D/g, "").slice(0, 11) })
                }
                className="h-11"
                maxLength={11}
              />
            </div>

            {/* 验证码 */}
            <div className="space-y-2">
              <Label htmlFor="code">
                验证码 <span className="text-destructive">*</span>
              </Label>
              <div className="flex gap-2">
                <Input
                  id="code"
                  type="text"
                  placeholder="请输入验证码"
                  value={formData.code}
                  onChange={(e) =>
                    setFormData({ ...formData, code: e.target.value.replace(/\D/g, "").slice(0, 6) })
                  }
                  className="h-11 flex-1"
                  maxLength={6}
                />
                <Button
                  variant="outline"
                  onClick={handleSendCode}
                  disabled={isSendingCode || countdown > 0}
                  className="h-11 px-4 shrink-0"
                >
                  {countdown > 0 ? `${countdown}s` : isSendingCode ? "发送中..." : "获取验证码"}
                </Button>
              </div>
            </div>

            {/* 姓名 */}
            <div className="space-y-2">
              <Label htmlFor="name">
                姓名 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                type="text"
                placeholder="请输入您的姓名"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                className="h-11"
              />
            </div>

            {/* 密码 */}
            <div className="space-y-2">
              <Label htmlFor="password">
                设置密码 <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="请设置登录密码（至少6位）"
                  value={formData.password}
                  onChange={(e) =>
                    setFormData({ ...formData, password: e.target.value })
                  }
                  className="h-11 pr-10"
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
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">
                确认密码 <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="请再次输入密码"
                  value={formData.confirmPassword}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      confirmPassword: e.target.value,
                    })
                  }
                  className="h-11 pr-10"
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

            {/* 团队名称（选填） */}
            <div className="space-y-2">
              <Label htmlFor="teamName">团队名称（选填）</Label>
              <Input
                id="teamName"
                type="text"
                placeholder="如果您是企业用户，请输入团队名称"
                value={formData.teamName}
                onChange={(e) =>
                  setFormData({ ...formData, teamName: e.target.value })
                }
                className="h-11"
              />
            </div>

            {/* 错误提示 */}
            {error && <p className="text-sm text-destructive">{error}</p>}

            {/* 服务条款 */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="terms"
                checked={agreeTerms}
                onCheckedChange={(checked) => setAgreeTerms(checked as boolean)}
              />
              <label htmlFor="terms" className="text-sm text-muted-foreground">
                我已阅读并同意{" "}
                <Link href="#" className="text-primary hover:underline">
                  服务条款
                </Link>{" "}
                和{" "}
                <Link href="#" className="text-primary hover:underline">
                  隐私政策
                </Link>
              </label>
            </div>

            {/* 提交按钮 */}
            <Button
              onClick={handleSubmit}
              disabled={isLoading}
              className="w-full h-11"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  注册中...
                </>
              ) : (
                "注册"
              )}
            </Button>

            {/* 登录链接 */}
            <p className="text-center text-sm text-muted-foreground">
              已有账户？{" "}
              <Link href="/login" className="text-primary hover:underline">
                立即登录
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
