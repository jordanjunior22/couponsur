"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import type { GroupRoom } from "@/models/GroupMessage";

function lastReadKey(userId: string, room: GroupRoom): string {
  return `groupchat_lastread:${userId}:${room}`;
}

// Called by GroupChatRoom the moment a room's messages are fetched while
// it's open — viewing the room is the read action, same as any chat app.
// Per-device (localStorage), same convention already used there for
// starred messages — there's no server-side read-receipt system, so this
// doesn't sync a "read" across a user's other devices.
export function markRoomRead(userId: string, room: GroupRoom) {
  try { localStorage.setItem(lastReadKey(userId, room), new Date().toISOString()); } catch { /* ignore */ }
}

function getLastRead(userId: string, room: GroupRoom): string | null {
  try { return localStorage.getItem(lastReadKey(userId, room)); } catch { return null; }
}

const POLL_MS = 45000;

// Unread counts for the two chat rooms — used by BottomTabBar (one summed
// badge on the Chat tab) and the /groupe room picker (one badge per
// room). Only ever queries a room the caller says is currently eligible +
// enabled, so an ineligible viewer never fires a request that would just
// 403.
export function useUnreadChatCounts(premiumEligible: boolean, globalEligible: boolean) {
  const { user } = useAuth();
  const [premium, setPremium] = useState(0);
  const [global, setGlobal] = useState(0);

  const refresh = useCallback(async () => {
    if (!user) { setPremium(0); setGlobal(0); return; }

    const fetchOne = async (room: GroupRoom): Promise<number> => {
      try {
        const since = getLastRead(user._id, room);
        const params = new URLSearchParams({ room });
        if (since) params.set("since", since);
        const res = await fetch(`/api/group-chat/unread-count?${params.toString()}`, { credentials: "include" });
        const data = await res.json();
        return data?.success ? Number(data.data.count) || 0 : 0;
      } catch {
        return 0;
      }
    };

    const [nextPremium, nextGlobal] = await Promise.all([
      premiumEligible ? fetchOne("premium") : Promise.resolve(0),
      globalEligible ? fetchOne("global") : Promise.resolve(0),
    ]);
    setPremium(nextPremium);
    setGlobal(nextGlobal);
  }, [user, premiumEligible, globalEligible]);

  useEffect(() => {
    refresh();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, POLL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [refresh]);

  return { premium, global, total: premium + global, refresh };
}

// Standard chat-badge formatting: exact digit up to 9, "9+" beyond that —
// keeps the badge a fixed, small size instead of growing with the number.
export function formatBadgeCount(n: number): string | null {
  if (n <= 0) return null;
  return n > 9 ? "9+" : String(n);
}
