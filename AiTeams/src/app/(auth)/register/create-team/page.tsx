"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export default function CreateTeamPage() {
  const [step, setStep] = useState<"phone" | "profile">("profile");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [teamName, setTeamName] = useState("");
  const [industry, setIndustry] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");

  const router = useRouter();
  const { sendCode, createTeam, user } = useAuth();

  // 如果用户已登录，跳过手机验证步骤
  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      setStep("profile");
    } else {
      setStep("phone");
    }
  }, []);

  // 发送验证码
  const handleSendCode = async () => {
    if (!phone || phone.length !== 11) {
      setError("请输入正确的手机号");
      return;
    }

    setIsSending(true);
    setError("");

    try {
      const result = await sendCode(phone, "register");
      
      if (result.success) {
        if (result.code) {
          setCode(result.code);
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
      setIsSending(false);
    }
  };

  // 验证手机号后进入下一步
  const handleVerifyPhone = async () => {
    if (!phone || phone.length !== 11) {
      setError("请输入正确的手机号");
      return;
    }
    if (!code || code.length !== 6) {
      setError("请输入6位验证码");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      // 调用注册接口验证手机号（不创建团队）
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          name: "temp",
          password: "temp123",
        }),
      });
      const data = await res.json();

      if (res.ok || data.error === "该手机号已注册") {
        // 手机号已注册，需要登录
        router.push("/login");
      } else {
        // 可以继续创建团队
        setStep("profile");
      }
    } catch {
      setError("验证失败，请重试");
    } finally {
      setIsLoading(false);
    }
  };

  // 创建团队
  const handleCreateTeam = async () => {
    if (!teamName.trim()) {
      setError("请输入团队名称");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const result = await createTeam(teamName, industry);

      if (result.success) {
        // 刷新团队列表
        const userRes = await fetch(`/api/teams/list?userId=${user?.id || localStorage.getItem("user")}`);
        const userData = await userRes.json();
        if (userData.success) {
          localStorage.setItem("teams", JSON.stringify(userData.teams));
        }
        
        router.push("/");
      } else {
        setError(result.error || "创建团队失败");
      }
    } catch {
      setError("创建团队失败，请重试");
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

        {/* 创建团队卡片 */}
        <div className="bg-card rounded-2xl shadow-lg border border-border/50 p-8">
          <h1 className="text-xl font-semibold text-foreground mb-6">
            {step === "phone" ? "验证手机号" : "创建团队"}
          </h1>

          {step === "phone" ? (
            <>
              {/* 手机号 */}
              <div className="mb-4">
                <Label className="text-sm font-medium text-foreground mb-2 block">
                  手机号
                </Label>
                <div className="flex gap-2">
                  <div className="w-20 flex items-center justify-center border border-input bg-background rounded-lg text-sm text-muted-foreground">
                    +86
                  </div>
                  <Input
                    type="tel"
                    placeholder="请输入手机号"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
                    className="flex-1 h-11"
                    maxLength={11}
                  />
                </div>
              </div>

              {/* 验证码 */}
              <div className="mb-6">
                <Label className="text-sm font-medium text-foreground mb-2 block">
                  验证码
                </Label>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder="请输入验证码"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="flex-1 h-11"
                    maxLength={6}
                  />
                  <Button
                    variant="outline"
                    onClick={handleSendCode}
                    disabled={isSending || countdown > 0}
                    className="shrink-0 px-4 h-11"
                  >
                    {countdown > 0 ? `${countdown}s` : isSending ? "发送中..." : "获取验证码"}
                  </Button>
                </div>
              </div>

              {/* 错误提示 */}
              {error && (
                <p className="text-sm text-destructive mb-4">{error}</p>
              )}

              {/* 下一步按钮 */}
              <Button
                onClick={handleVerifyPhone}
                disabled={isLoading}
                className="w-full h-11"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    验证中...
                  </>
                ) : (
                  "下一步"
                )}
              </Button>

              {/* 返回登录 */}
              <p className="text-center text-sm text-muted-foreground mt-4">
                已有账号？{" "}
                <Link href="/login" className="text-primary hover:underline">
                  立即登录
                </Link>
              </p>
            </>
          ) : (
            <>
              {/* 团队名称 */}
              <div className="mb-4">
                <Label className="text-sm font-medium text-foreground mb-2 block">
                  团队名称 <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="text"
                  placeholder="请输入团队名称"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  className="h-11"
                />
              </div>

              {/* 行业 */}
              <div className="mb-6">
                <Label className="text-sm font-medium text-foreground mb-2 block">
                  行业（选填）
                </Label>
                <select
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  className="w-full h-11 px-3 border border-input bg-background rounded-lg text-sm"
                >
                  <option value="">请选择行业</option>
                  <option value="tech">科技/互联网</option>
                  <option value="finance">金融</option>
                  <option value="education">教育</option>
                  <option value="healthcare">医疗健康</option>
                  <option value="retail">零售/电商</option>
                  <option value="manufacturing">制造业</option>
                  <option value="media">媒体/广告</option>
                  <option value="consulting">咨询/专业服务</option>
                  <option value="other">其他</option>
                </select>
              </div>

              {/* 错误提示 */}
              {error && (
                <p className="text-sm text-destructive mb-4">{error}</p>
              )}

              {/* 创建按钮 */}
              <Button
                onClick={handleCreateTeam}
                disabled={isLoading}
                className="w-full h-11"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    创建中...
                  </>
                ) : (
                  "创建团队"
                )}
              </Button>

              {/* 返回上一步 */}
              <button
                onClick={() => setStep("phone")}
                className="w-full text-center text-sm text-muted-foreground mt-4 hover:text-foreground"
              >
                上一步
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
