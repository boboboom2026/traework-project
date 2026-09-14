"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Loader2 } from "lucide-react";

export default function LoginPage() {
    const [loginType, setLoginType] = useState<"sms" | "password">("sms");
    const [phone, setPhone] = useState("");
    const [code, setCode] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [countdown, setCountdown] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");

    const {
        login,
        loginWithPassword,
        sendCode
    } = useAuth();

    const router = useRouter();

    const handleSendCode = async () => {
        if (!phone || phone.length !== 11) {
            setError("请输入正确的手机号");
            return;
        }

        setError("");
        setIsLoading(true);

        try {
            const result = await sendCode(phone, "login");

            if (result.success) {
                if (result.code) {
                    setCode(result.code);
                }

                setCountdown(60);

                const timer = setInterval(() => {
                    setCountdown(prev => {
                        if (prev <= 1) {
                            clearInterval(timer);
                            return 0;
                        }

                        return prev - 1;
                    });
                }, 1000);
            } else {
                setError(result.error || "发送验证码失败");
                setCountdown(0);
            }
        } catch {
            setError("发送验证码失败");
            setCountdown(0);
        } finally {
            setIsLoading(false);
        }
    };

    const handleLogin = async () => {
        setError("");

        if (loginType === "sms") {
            if (!phone || !code) {
                setError("请填写完整信息");
                return;
            }
        } else {
            if (!phone || !password) {
                setError("请填写完整信息");
                return;
            }
        }

        setIsLoading(true);

        try {
            const result = loginType === "sms" ? await login(phone, code) : await loginWithPassword(phone, password);

            if (result.success) {
                if (result.hasAccount) {
                    if (result.teams && result.teams.length > 0) {
                        if (result.teams.length === 1) {
                            router.push("/");
                        } else {
                            const lastTeamId = localStorage.getItem("lastTeamId");
                            const hasValidLastTeam = lastTeamId && result.teams.some(t => t.id === lastTeamId);

                            if (hasValidLastTeam) {
                                router.push("/");
                            } else {
                                router.push("/onboarding");
                            }
                        }
                    } else {
                        router.push("/onboarding");
                    }
                } else {
                    router.push("/register");
                }
            } else {
                setError(result.error || "登录失败");
            }
        } catch {
            setError("登录失败，请重试");
        } finally {
            setIsLoading(false);
        }
    };

    const handleWechatLogin = () => {
        alert("微信登录功能开发中...");
    };

    return (
        <div
            className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-amber-50/30 px-4">
            <div className="w-full max-w-md">
                {}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center gap-3 mb-2">
                        <div
                            className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
                            <svg
                                viewBox="0 0 24 24"
                                className="w-7 h-7 text-primary-foreground"
                                fill="currentColor">
                                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                            </svg>
                        </div>
                        <span className="text-2xl font-bold text-foreground">AiTeams</span>
                    </div>
                    <p className="text-muted-foreground text-sm">企业协作平台，让工作更高效
                                  </p>
                </div>
                {}
                <div className="bg-card rounded-2xl shadow-lg border border-border/50 p-8">
                    {}
                    <Button
                        variant="outline"
                        className="w-full h-12 mb-6 border-green-500 text-green-600 hover:bg-green-50 hover:border-green-500"
                        onClick={handleWechatLogin}>
                        <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                            <path
                                d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 01.213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 00.167-.054l1.903-1.114a.864.864 0 01.717-.098 10.16 10.16 0 002.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 01-1.162 1.178A1.17 1.17 0 014.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 01-1.162 1.178 1.17 1.17 0 01-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 01.598.082l1.584.926a.272.272 0 00.14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 01-.023-.156.49.49 0 01.201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.269-.03-.406-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 01-.969.983.976.976 0 01-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 01-.969.983.976.976 0 01-.969-.983c0-.542.434-.982.969-.982z" />
                        </svg>使用微信登录
                                  </Button>
                    {}
                    <div className="relative mb-6">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-border" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-card px-2 text-muted-foreground">或</span>
                        </div>
                    </div>
                    {}
                    <div className="flex gap-2 mb-6">
                        <button
                            type="button"
                            onClick={() => setLoginType("sms")}
                            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${loginType === "sms" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>验证码登录
                                        </button>
                        <button
                            type="button"
                            onClick={() => setLoginType("password")}
                            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${loginType === "password" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>密码登录
                                        </button>
                    </div>
                    {}
                    <div className="space-y-4">
                        {}
                        <div className="space-y-2">
                            <Label htmlFor="phone">手机号</Label>
                            <Input
                                id="phone"
                                type="tel"
                                placeholder="请输入手机号"
                                value={phone}
                                onChange={e => setPhone(e.target.value)}
                                className="h-11"
                                maxLength={11} />
                        </div>
                        {}
                        {loginType === "sms" && <div className="space-y-2">
                            <Label htmlFor="code">验证码</Label>
                            <div className="flex gap-2">
                                <Input
                                    id="code"
                                    type="text"
                                    placeholder="请输入验证码"
                                    value={code}
                                    onChange={e => setCode(e.target.value)}
                                    className="h-11 flex-1"
                                    maxLength={6} />
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="h-11 px-4"
                                    onClick={handleSendCode}
                                    disabled={countdown > 0}>
                                    {countdown > 0 ? `${countdown}s` : "获取验证码"}
                                </Button>
                            </div>
                        </div>}
                        {}
                        {loginType === "password" && <div className="space-y-2">
                            <Label htmlFor="password">密码</Label>
                            <div className="relative">
                                <Input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    placeholder="请输入密码"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    className="h-11 pr-10" />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>}
                        {}
                        {error && <p className="text-sm text-destructive">{error}</p>}
                        {}
                        <Button className="w-full h-11 mt-2" onClick={handleLogin} disabled={isLoading}>
                            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "登录"}
                        </Button>
                        {}
                        <p className="text-center text-sm text-muted-foreground">还没有账户？{" "}
                            <Link href="/register" className="text-primary hover:underline font-medium">立即注册
                                              </Link>
                        </p>
                    </div>
                </div>
                {}
                <p className="text-center text-xs text-muted-foreground mt-6">登录即表示同意{" "}
                    <Link href="#" className="text-primary hover:underline">服务条款
                                  </Link>{" "}和{" "}
                    <Link href="#" className="text-primary hover:underline">隐私政策
                                  </Link>
                </p>
            </div>
        </div>
    );
}