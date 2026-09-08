"use client";

import { useEffect, useState } from "react";

export interface AppSettings {
  matchGeneratorEnabled: boolean;
  matchGeneratorAccess: "EVERYONE" | "PREMIUM";
  // Per-market override on top of matchGeneratorAccess (see
  // models/Settings.ts) — a market missing from this map falls back to
  // "PREMIUM", same most-restrictive-by-default posture as the server.
  matchGeneratorMarketAccess: Record<string, "EVERYONE" | "PREMIUM">;
  // Admin's availability toggle for the premium group chat. Existing
  // Settings docs created before this field existed come back with it
  // missing entirely — `!== false` treats that as "on", same fallback
  // the server itself uses.
  groupChatEnabled: boolean;
  // Same shape, for "Chat Global" (open to any logged-in user).
  globalChatEnabled: boolean;
  // Same shape again, for the "Actus" news feed tab.
  newsFeedEnabled: boolean;
}

const FALLBACK_SETTINGS: AppSettings = {
  matchGeneratorEnabled: false,
  matchGeneratorAccess: "PREMIUM",
  matchGeneratorMarketAccess: {},
  groupChatEnabled: false,
  globalChatEnabled: false,
  newsFeedEnabled: false,
};

// Shared between BottomTabBar (which tabs to show) and the Outils page
// (which access level gates the match generator itself) so both read
// /api/admin/settings through one implementation instead of two.
// Returns null while the first fetch is in flight.
export function useAppSettings(): AppSettings | null {
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/settings");
        const data = await res.json();
        if (cancelled) return;
        setSettings({
          matchGeneratorEnabled: !!data?.data?.matchGeneratorEnabled,
          matchGeneratorAccess: data?.data?.matchGeneratorAccess === "EVERYONE" ? "EVERYONE" : "PREMIUM",
          matchGeneratorMarketAccess:
            data?.data?.matchGeneratorMarketAccess && typeof data.data.matchGeneratorMarketAccess === "object"
              ? data.data.matchGeneratorMarketAccess
              : {},
          groupChatEnabled: data?.data?.groupChatEnabled !== false,
          globalChatEnabled: data?.data?.globalChatEnabled !== false,
          newsFeedEnabled: data?.data?.newsFeedEnabled !== false,
        });
      } catch {
        if (!cancelled) setSettings(FALLBACK_SETTINGS);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return settings;
}
