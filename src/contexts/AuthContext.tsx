"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  is_superuser: boolean;
  is_staff: boolean;
  permissions: string[];
  assigned_locations: number[];
  groups_display: string[];
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  can: (perm: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check if already authenticated on mount
  useEffect(() => {
    apiFetch<AuthUser>("/auth/users/me/")
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    await apiFetch("/auth/cookie/login/", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    // After login, fetch the current user
    const me = await apiFetch<AuthUser>("/auth/users/me/");
    setUser(me);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch("/auth/cookie/logout/", { method: "POST" });
    } finally {
      setUser(null);
    }
  }, []);

  const can = useCallback(
    (perm: string) => {
      if (!user) return false;
      if (user.is_superuser) return true;
      return user.permissions.some(p => p === perm || p.endsWith(`.${perm}`));
    },
    [user],
  );

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, logout, can }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
