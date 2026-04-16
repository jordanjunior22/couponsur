"use client";

import { createContext, useContext, useState, useEffect } from "react";

interface AuthUser {
  _id: string;
  phone: string;
  role: "USER" | "ADMIN";
  unlockedPickIds: string[];
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (phone: string, password: string) => Promise<void>;
  signup: (phone: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  unlockPick: (pickId: string) => Promise<void>;

}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // 🔥 THIS is what syncs cookie → frontend
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch("/api/auth/me");
        const data = await res.json();

        setUser(data.user);
      } catch (error) {
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, []);

  // ─── Login ────────────────────────────────────────────
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

    setUser(data.user); // ✅ sync immediately
  };

  // ─── Logout ───────────────────────────────────────────
  const logout = async () => {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include", // ✅ ensure cookie sent
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

    setUser(data.user); // ✅ auto-login after signup
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

  setUser(data.user); // ✅ sync with backend
};
  return (
    <AuthContext.Provider value={{ user, loading, signup, login, logout,unlockPick }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};