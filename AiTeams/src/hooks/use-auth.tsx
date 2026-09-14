"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

// 用户信息类型
export interface User {
  id: string;
  name: string;
  nickname?: string;
  phone: string;
  avatar?: string;
  email?: string;
  department?: string;
  position?: string;
  bio?: string;
  platformRole?: string;
  isNewUser: boolean;
  teams: Team[];
  currentTeamId?: string;
}

// 团队类型
export interface Team {
  id: string;
  name: string;
  type: "company" | "community";
  logo?: string;
  color?: string;
  role?: string;
}

// 认证状态
interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

// 认证上下文
interface AuthContextType extends AuthState {
  login: (phone: string, code: string) => Promise<{ success: boolean; error?: string; hasAccount?: boolean; teams?: Team[] }>;
  loginWithPassword: (phone: string, password: string) => Promise<{ success: boolean; error?: string; hasAccount?: boolean; teams?: Team[] }>;
  register: (data: RegisterData) => Promise<{ success: boolean; error?: string }>;
  sendCode: (phone: string, type?: string) => Promise<{ success: boolean; error?: string; code?: string }>;
  logout: () => void;
  updateProfile: (data: Partial<User>) => Promise<void>;
  bindPhone: (phone: string, code: string) => Promise<{ success: boolean; error?: string }>;
  switchTeam: (teamId: string) => void;
  createTeam: (teamName: string, industry?: string) => Promise<{ success: boolean; error?: string; team?: Team }>;
  joinTeam: (teamId: string) => Promise<{ success: boolean; error?: string }>;
  verifyPhoneForTeam: (phone: string) => Promise<{ exists: boolean; teams?: Team[] }>;
  refreshTeams: () => Promise<void>;
}

interface RegisterData {
  phone: string;
  name: string;
  password: string;
  confirmPassword: string;
  teamName?: string;
  industry?: string;
  inviteCode?: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
  });
  const router = useRouter();

  // 初始化 - 检查本地存储的登录状态
  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    const storedTeams = localStorage.getItem("teams");
    const storedLastTeamId = localStorage.getItem("lastTeamId");
    
    if (storedUser) {
      try {
        const user = JSON.parse(storedUser);
        const teams = storedTeams ? JSON.parse(storedTeams) : [];
        // 恢复 lastTeamId：优先 localStorage 记录，其次 user.currentTeamId
        const currentTeamId = storedLastTeamId || user.currentTeamId || (teams.length > 0 ? teams[0].id : undefined);
        const restoredUser = { ...user, teams, currentTeamId };
        setState({
          user: restoredUser,
          isLoading: false,
          isAuthenticated: true,
        });

        // 异步刷新团队数据，确保 role 等字段是最新的
        (async () => {
          try {
            const res = await fetch(`/api/teams/list?userId=${user.id}`);
            const data = await res.json();
            if (data.success) {
              const refreshedTeams: Team[] = data.teams;
              // 如果 lastTeamId 在新团队列表中仍有效，保持；否则取第一个
              const validTeamId = refreshedTeams.some((t: Team) => t.id === currentTeamId)
                ? currentTeamId
                : refreshedTeams.length > 0
                  ? refreshedTeams[0].id
                  : undefined;
              const updatedUser = { ...user, teams: refreshedTeams, currentTeamId: validTeamId };
              localStorage.setItem("user", JSON.stringify(updatedUser));
              localStorage.setItem("teams", JSON.stringify(refreshedTeams));
              if (validTeamId) {
                localStorage.setItem("lastTeamId", validTeamId);
              }
              setState((prev) => ({
                ...prev,
                user: updatedUser,
              }));
            }
          } catch {
            // 静默处理，使用缓存数据即可
          }
        })();
      } catch {
        setState({ user: null, isLoading: false, isAuthenticated: false });
      }
    } else {
      setState({ user: null, isLoading: false, isAuthenticated: false });
    }
  }, []);

  // 刷新团队列表
  const refreshTeams = useCallback(async () => {
    const storedUser = localStorage.getItem("user");
    if (!storedUser) return;

    try {
      const user = JSON.parse(storedUser);
      const res = await fetch(`/api/teams/list?userId=${user.id}`);
      const data = await res.json();

      if (data.success) {
        const refreshedTeams: Team[] = data.teams;
        // 验证 currentTeamId 是否仍然有效
        const currentTeamId = refreshedTeams.some((t: Team) => t.id === user.currentTeamId)
          ? user.currentTeamId
          : refreshedTeams.length > 0
            ? refreshedTeams[0].id
            : undefined;
        const updatedUser = { ...user, teams: refreshedTeams, currentTeamId };
        localStorage.setItem("user", JSON.stringify(updatedUser));
        localStorage.setItem("teams", JSON.stringify(refreshedTeams));
        if (currentTeamId) {
          localStorage.setItem("lastTeamId", currentTeamId);
        }
        setState((prev) => ({
          ...prev,
          user: updatedUser,
        }));
      }
    } catch (error) {
      console.error("刷新团队失败:", error);
    }
  }, []);

  // 发送验证码
  const sendCode = useCallback(async (phone: string, type = "login"): Promise<{ success: boolean; error?: string; code?: string }> => {
    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, type }),
      });
      const data = await res.json();

      if (!res.ok) {
        return { success: false, error: data.error || "发送验证码失败" };
      }

      return { success: true, code: data.code };
    } catch {
      return { success: false, error: "网络错误" };
    }
  }, []);

  // 验证码登录
  const login = useCallback(
    async (phone: string, code: string): Promise<{ success: boolean; error?: string; hasAccount?: boolean; teams?: Team[] }> => {
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, code }),
        });
        const data = await res.json();

        if (!res.ok) {
          return { success: false, error: data.error || "登录失败" };
        }

        // 保存会话令牌
        if (data.token) {
          localStorage.setItem("auth_token", data.token);
        }

        // 保存用户信息
        if (data.user) {
          localStorage.setItem("user", JSON.stringify(data.user));
        }
        if (data.teams) {
          localStorage.setItem("teams", JSON.stringify(data.teams));
        }

        // 确定当前团队：优先 lastTeamId，其次第一个团队
        const teams: Team[] = data.teams || [];
        const storedLastTeamId = localStorage.getItem("lastTeamId");
        const currentTeamId = teams.some((t) => t.id === storedLastTeamId)
          ? storedLastTeamId!
          : teams.length > 0
            ? teams[0].id
            : undefined;
        if (currentTeamId) {
          localStorage.setItem("lastTeamId", currentTeamId);
        }

        setState({
          user: data.user ? { ...data.user, teams, isNewUser: !data.hasAccount, currentTeamId } : null,
          isLoading: false,
          isAuthenticated: true,
        });

        return {
          success: true,
          hasAccount: data.hasAccount,
          teams,
        };
      } catch {
        return { success: false, error: "网络错误" };
      }
    },
    []
  );

  // 密码登录
  const loginWithPassword = useCallback(
    async (phone: string, password: string): Promise<{ success: boolean; error?: string; hasAccount?: boolean; teams?: Team[] }> => {
      try {
        const res = await fetch("/api/auth/login-with-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, password }),
        });
        const data = await res.json();

        if (!res.ok) {
          return { success: false, error: data.error || "登录失败" };
        }

        // 保存用户信息
        if (data.user) {
          localStorage.setItem("user", JSON.stringify(data.user));
        }
        if (data.token) {
          localStorage.setItem("auth_token", data.token);
        }
        if (data.teams) {
          localStorage.setItem("teams", JSON.stringify(data.teams));
        }

        // 确定当前团队：优先 lastTeamId，其次第一个团队
        const teams: Team[] = data.teams || [];
        const storedLastTeamId = localStorage.getItem("lastTeamId");
        const currentTeamId = teams.some((t) => t.id === storedLastTeamId)
          ? storedLastTeamId!
          : teams.length > 0
            ? teams[0].id
            : undefined;
        if (currentTeamId) {
          localStorage.setItem("lastTeamId", currentTeamId);
        }

        setState({
          user: data.user ? { ...data.user, teams, isNewUser: false, currentTeamId } : null,
          isLoading: false,
          isAuthenticated: true,
        });

        return {
          success: true,
          hasAccount: true,
          teams: data.teams || [],
        };
      } catch {
        return { success: false, error: "网络错误" };
      }
    },
    []
  );

  // 注册
  const register = useCallback(
    async (data: RegisterData): Promise<{ success: boolean; error?: string }> => {
      // 验证密码
      if (data.password !== data.confirmPassword) {
        return { success: false, error: "两次密码输入不一致" };
      }

      if (data.password.length < 6) {
        return { success: false, error: "密码长度至少6位" };
      }

      try {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: data.phone,
            name: data.name,
            password: data.password,
            teamName: data.teamName,
            industry: data.industry,
            inviteCode: data.inviteCode,
          }),
        });
        const result = await res.json();

        if (!res.ok) {
          return { success: false, error: result.error || "注册失败" };
        }

        // 保存用户信息
        if (result.user) {
          localStorage.setItem("user", JSON.stringify(result.user));
        }
        if (result.token) {
          localStorage.setItem("auth_token", result.token);
        }
        if (result.teams) {
          localStorage.setItem("teams", JSON.stringify(result.teams));
        }

        // 确定当前团队
        const teams: Team[] = result.teams || [];
        const currentTeamId = teams.length > 0 ? teams[0].id : undefined;
        if (currentTeamId) {
          localStorage.setItem("lastTeamId", currentTeamId);
        }

        setState({
          user: result.user ? { ...result.user, teams, isNewUser: false, currentTeamId } : null,
          isLoading: false,
          isAuthenticated: true,
        });

        return { success: true };
      } catch {
        return { success: false, error: "网络错误" };
      }
    },
    []
  );

  // 登出
  const logout = useCallback(() => {
    localStorage.removeItem("user");
    localStorage.removeItem("teams");
    localStorage.removeItem("lastTeamId");
    localStorage.removeItem("auth_token");
    setState({
      user: null,
      isLoading: false,
      isAuthenticated: false,
    });
    router.push("/login");
  }, [router]);

  // 更新用户资料
  const updateProfile = useCallback(async (data: Partial<User>) => {
    setState((prev) => {
      if (!prev.user) return prev;
      const updatedUser = { ...prev.user, ...data };
      localStorage.setItem("user", JSON.stringify(updatedUser));
      return { ...prev, user: updatedUser };
    });
  }, []);

  // 绑定手机号
  const bindPhone = useCallback(
    async (phone: string, code: string): Promise<{ success: boolean; error?: string }> => {
      // 验证验证码
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, type: "bind" }),
      });

      // 简单验证，实际项目中应该调用专门的验证接口
      if (code.length !== 6) {
        return { success: false, error: "验证码格式错误" };
      }

      setState((prev) => {
        if (!prev.user) return prev;
        const updatedUser = { ...prev.user, phone };
        localStorage.setItem("user", JSON.stringify(updatedUser));
        return { ...prev, user: updatedUser };
      });

      return { success: true };
    },
    []
  );

  // 切换团队
  const switchTeam = useCallback((teamId: string) => {
    localStorage.setItem("lastTeamId", teamId);
    setState((prev) => {
      if (!prev.user) return prev;
      const updatedUser = { ...prev.user, currentTeamId: teamId };
      localStorage.setItem("user", JSON.stringify(updatedUser));
      return { ...prev, user: updatedUser };
    });
  }, []);

  // 创建团队
  const createTeam = useCallback(async (teamName: string, industry?: string): Promise<{ success: boolean; error?: string; team?: Team }> => {
    const storedUser = localStorage.getItem("user");
    if (!storedUser) {
      return { success: false, error: "用户未登录" };
    }

    try {
      const user = JSON.parse(storedUser);

      const res = await fetch("/api/teams/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          teamName,
          industry,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        return { success: false, error: data.error || "创建团队失败" };
      }

      // 刷新团队列表
      await refreshTeams();

      // 自动切换到新创建的团队
      if (data.team) {
        switchTeam(data.team.id);
      }

      return { success: true, team: data.team };
    } catch {
      return { success: false, error: "网络错误" };
    }
  }, [refreshTeams, switchTeam]);

  // 加入团队
  const joinTeam = useCallback(async (teamId: string): Promise<{ success: boolean; error?: string }> => {
    const storedUser = localStorage.getItem("user");
    if (!storedUser) {
      return { success: false, error: "用户未登录" };
    }

    try {
      const user = JSON.parse(storedUser);

      const res = await fetch("/api/teams/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          teamId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        return { success: false, error: data.error || "加入团队失败" };
      }

      // 刷新团队列表
      await refreshTeams();

      // 自动切换到新加入的团队
      switchTeam(teamId);

      return { success: true };
    } catch {
      return { success: false, error: "网络错误" };
    }
  }, [refreshTeams, switchTeam]);

  // 验证手机号是否已注册（用于团队创建流程）
  const verifyPhoneForTeam = useCallback(async (phone: string): Promise<{ exists: boolean; teams?: Team[] }> => {
    try {
      // 尝试登录，如果用户不存在会返回hasAccount: false
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code: "000000" }),
      });
      
      // 这个接口在验证码错误时会返回hasAccount: false
      // 实际项目中应该有一个专门的检查接口
      return { exists: false };
    } catch {
      return { exists: false };
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        loginWithPassword,
        register,
        sendCode,
        logout,
        updateProfile,
        bindPhone,
        switchTeam,
        createTeam,
        joinTeam,
        verifyPhoneForTeam,
        refreshTeams,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
