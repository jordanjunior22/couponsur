"use client";

import { createContext, useContext, useState, useEffect } from "react";

interface AuthUser {
  _id: string;
  phone: string;
  role: "USER" | "ADMIN";
  unlockedPickIds: string[];
  subscription?: {
    status: "NONE" | "ACTIVE" | "EXPIRED";
    plan: "MONTHLY";
    startedAt: string | null;
    expiresAt: string | null;
  };
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (phone: string, password: string) => Promise<void>;
  signup: (phone: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  unlockPick: (pickId: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  hasActiveSubscription: () => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = async () => {
    try {
      const res = await fetch("/api/auth/me", {
        credentials: "include",
      });
      const data = await res.json();
      setUser(data.user);
    } catch (error) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();
  }, []);

  const refreshUser = async () => {
    await fetchUser();
  };

  const login = async (phone: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "include",
      body: JSON.stringify({ phone, password }),
    });

    const data = await res.json();

    if (!data.success) {
      throw new Error(data.message);
    }

    setUser(data.user);
  };

  const logout = async () => {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });

    setUser(null);
  };

  const signup = async (phone: string, password: string) => {
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ phone, password }),
    });

    const data = await res.json();

    if (!data.success) {
      throw new Error(data.message);
    }

    setUser(data.user);
  };

  const unlockPick = async (pickId: string) => {
    if (!user) return;

    const res = await fetch("/api/picks/unlock", {
      method: "POST",
      credentials: "include",
      body: JSON.stringify({ pickId }),
    });

    const data = await res.json();

    if (!data.success) {
      throw new Error("Failed to unlock pick");
    }

    setUser(data.user);
  };

  // Client-side convenience check — the actual gating source of truth is
  // still whatever the server returns on /api/auth/me, this just saves
  // every component from re-deriving the "is it still active" date logic.
  const hasActiveSubscription = () => {
    if (!user?.subscription) return false;
    if (user.subscription.status !== "ACTIVE") return false;
    if (!user.subscription.expiresAt) return false;
    return new Date(user.subscription.expiresAt) > new Date();
  };

  return (
    <AuthContext.Provider value={{ user, loading, signup, login, logout, unlockPick, refreshUser, hasActiveSubscription }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};