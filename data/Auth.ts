"use client";

import { useEffect, useState } from "react";
import { User } from "./User";

type AuthUser = User & {
  password: string;
};

const STORAGE_KEY = "premium_user";

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // ─── Load from localStorage ─────────────────────────────
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setUser(JSON.parse(stored));
      }
    } catch (err) {
      console.error("Failed to load user:", err);
    } finally {
      setHydrated(true);
    }
  }, []);

  // ─── Save to localStorage whenever user changes ────────
  useEffect(() => {
    if (!hydrated) return;

    if (user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [user, hydrated]);

  // 🔐 LOGIN
  const login = (phone: string, password: string) => {
    if (!phone || !password) return;

    const newUser: AuthUser = {
      id: "u1",
      phone,
      password,
      unlockedPickIds: [],
    };

    setUser(newUser);
  };

  // 🆕 SIGNUP
  const signup = (phone: string, password: string) => {
    if (!phone || !password) return;

    const newUser: AuthUser = {
      id: "u2",
      phone,
      password,
      unlockedPickIds: [],
    };

    setUser(newUser);
  };

  // 🚪 LOGOUT
  const logout = () => {
    setUser(null);
  };

  // 🔓 UNLOCK PICK
  const unlockPick = (pickId: string) => {
    if (!user) return;

    if (user.unlockedPickIds.includes(pickId)) return;

    const updatedUser = {
      ...user,
      unlockedPickIds: [...user.unlockedPickIds, pickId],
    };

    setUser(updatedUser);
  };

  return {
    user,
    login,
    signup,
    logout,
    unlockPick,
  };
}