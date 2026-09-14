"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Loader2 } from "lucide-react";

interface TeamInfo {
  id: string;
  name: string;
  type: string;
  logo?: string;
  color?: string;
}

interface InviterInfo {
  id: string;
  name: string;
  avatar?: string;
}

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();
  const inviteCode = params.code as string;

  const [team, setTeam] = useState<TeamInfo | null>(null);
  const [inviter, setInviter] = useState<InviterInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isJoining, setIsJoining] = useState(false);

  // 登录相关状态
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [loginError, setLoginError] = useState("");

  // 注册相关状态
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [registerError, setRegisterError] = useState("");

  // 验证邀请链接
  useEffect(() => {
    const verifyInvite = async () => {
      try {
        const res = await fetch(`/api/teams/invite/verify?code=${inviteCode}`);
        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "邀请链接无效");
          return;
        }

        setTeam(data.team);
        setInviter(data.inviter);
      } catch {
        setError("验证邀请失败");
      } finally {
        setLoading(false);
      }
    };

    if (inviteCode) {
      verifyInvite();
    }
  }, [inviteCode]);

  // 发送验证码
  const handleSendCode = async () => {
    if (!phone) {
      setLoginError("请输入手机号");
      return;
    }

    setIsSendingCode(true);
    setLoginError("");

    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, type: "login" }),
      });

      const data = await res.json();

      if (!res.ok) {
        setLoginError(data.error || "发送验证码失败");
        return;
      }

      // 演示模式：自动填入验证码
      if (data.code) {
        setCode(data.code);
      }

      // 开始倒计时
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
    } catch {
      setLoginError("发送验证码失败");
    } finally {
      setIsSendingCode(false);
    }
  };

  // 手机号登录
  const handlePhoneLogin = async () => {
    if (!phone || !code) {
      setLoginError("请输入手机号和验证码");
      return;
    }

    setLoginError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });

      const data = await res.json();

      if (!res.ok) {
        setLoginError(data.error || "登录失败");
        return;
      }

      if (data.hasAccount) {
        // 已注册用户，直接加入团队
        await handleAcceptInvite(data.user.id);
      } else {
        // 新用户，进入注册模式
        setIsRegisterMode(true);
      }
    } catch {
      setLoginError("登录失败");
    }
  };

  // 注册并加入团队
  const handleRegister = async () => {
    if (!name) {
      setRegisterError("请输入名称");
      return;
    }

    if (!password || password.length < 6) {
      setRegisterError("密码至少6位");
      return;
    }

    if (password !== confirmPassword) {
      setRegisterError("两次密码不一致");
      return;
    }

    setRegisterError("");
    setIsJoining(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          name,
          password,
          inviteCode,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setRegisterError(data.error || "注册失败");
        return;
      }

      // 保存用户信息
      localStorage.setItem("user", JSON.stringify(data.user));
      localStorage.setItem("teams", JSON.stringify(data.teams));

      // 跳转到首页
      router.push("/");
    } catch {
      setRegisterError("注册失败");
    } finally {
      setIsJoining(false);
    }
  };

  // 接受邀请
  const handleAcceptInvite = async (uid: string) => {
    setIsJoining(true);

    try {
      const res = await fetch("/api/teams/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inviteCode,
          userId: uid,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "加入团队失败");
        return;
      }

      // 保存用户信息
      const userRes = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });
      const userData = await userRes.json();

      if (userData.success) {
        localStorage.setItem("user", JSON.stringify(userData.user));
        localStorage.setItem("teams", JSON.stringify(userData.teams));
      }

      // 跳转到首页
      router.push("/");
    } catch {
      setError("加入团队失败");
    } finally {
      setIsJoining(false);
    }
  };

  // 微信登录（模拟）
  const handleWechatLogin = () => {
    alert("微信登录功能开发中...");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-amber-50/30">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error && !team) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-amber-50/30 px-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-7 h-7 text-primary-foreground" fill="currentColor">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
              </div>
              <span className="text-2xl font-bold text-foreground">AiTeams</span>
            </div>
          </div>
          <div className="bg-card rounded-2xl shadow-lg border border-border/50 p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-destructive/10 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-8 h-8 text-destructive" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold mb-2">邀请链接无效</h2>
            <p className="text-sm text-muted-foreground mb-6">{error}</p>
            <Button onClick={() => router.push("/login")} className="w-full">
              返回登录
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-amber-50/30 px-4 py-8">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-7 h-7 text-primary-foreground" fill="currentColor">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <span className="text-2xl font-bold text-foreground">AiTeams</span>
          </div>
        </div>

        {/* 邀请卡片 */}
        <div className="bg-card rounded-2xl shadow-lg border border-border/50 p-8">
          {/* 邀请标题 */}
          <div className="text-center mb-6">
            <h1 className="text-xl font-semibold">
              邀请你加入{" "}
              <span className="text-primary">
                {team?.name}
              </span>
            </h1>
          </div>

          {/* 邀请人信息 */}
          {inviter && (
            <div className="flex items-center justify-center gap-3 mb-6">
              <UserAvatar avatarKey={inviter.avatar} name={inviter.name} className="w-10 h-10" fallbackClassName="text-sm font-medium" />
              <p className="text-sm text-muted-foreground">
                你的好友{inviter.name}已加入
              </p>
            </div>
          )}

          {isRegisterMode ? (
            /* 注册表单 */
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>名称</Label>
                <Input
                  placeholder="你的称呼"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label>登录密码</Label>
                <Input
                  type="password"
                  placeholder="密码至少6位"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label>确认密码</Label>
                <Input
                  type="password"
                  placeholder="再次确认密码"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="h-11"
                />
              </div>

              {registerError && (
                <p className="text-sm text-destructive">{registerError}</p>
              )}

              <Button
                onClick={handleRegister}
                disabled={isJoining}
                className="w-full h-11"
              >
                {isJoining ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    加入中...
                  </>
                ) : (
                  "注册并加入团队"
                )}
              </Button>

              <Button
                variant="ghost"
                onClick={() => {
                  setIsRegisterMode(false);
                  setRegisterError("");
                }}
                className="w-full"
              >
                返回
              </Button>
            </div>
          ) : (
            /* 登录表单 - 匹配设计图 */
            <div className="space-y-5">
              {/* 微信登录按钮 */}
              <Button
                variant="outline"
                className="w-full h-12 border-green-500 text-green-600 hover:bg-green-50 hover:border-green-500"
                onClick={handleWechatLogin}
              >
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 01.213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 00.167-.054l1.903-1.114a.864.864 0 01.717-.098 10.16 10.16 0 002.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 01-1.162 1.178A1.17 1.17 0 014.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 01-1.162 1.178 1.17 1.17 0 01-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 01.598.082l1.584.926a.272.272 0 00.14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 01-.023-.156.49.49 0 01.201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.269-.03-.406-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 01-.969.983.976.976 0 01-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 01-.969.983.976.976 0 01-.969-.983c0-.542.434-.982.969-.982z" />
                </svg>
                使用微信登录
              </Button>

              {/* 分隔线 */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-card px-3 text-muted-foreground">或</span>
                </div>
              </div>

              {/* 手机号登录 */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="invitePhone">手机号</Label>
                  <Input
                    id="invitePhone"
                    type="tel"
                    placeholder="你的手机号"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
                    className="h-11"
                    maxLength={11}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="inviteCode">验证码</Label>
                  <div className="flex gap-2">
                    <Input
                      id="inviteCode"
                      type="text"
                      placeholder="输入验证码"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      className="h-11 flex-1"
                      maxLength={6}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 px-4 shrink-0"
                      onClick={handleSendCode}
                      disabled={countdown > 0 || isSendingCode}
                    >
                      {countdown > 0 ? `${countdown}s` : isSendingCode ? "发送中..." : "获取验证码"}
                    </Button>
                  </div>
                </div>

                {loginError && (
                  <p className="text-sm text-destructive">{loginError}</p>
                )}

                <Button
                  onClick={handlePhoneLogin}
                  disabled={isJoining}
                  className="w-full h-11"
                >
                  {isJoining ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      加入中...
                    </>
                  ) : (
                    "使用手机号继续"
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* 服务协议 */}
        <p className="text-center text-xs text-muted-foreground mt-6">
          登录即表示同意{" "}
          <a href="#" className="text-primary hover:underline">服务条款</a>{" "}
          和{" "}
          <a href="#" className="text-primary hover:underline">隐私政策</a>
        </p>
      </div>
    </div>
  );
}
