"use client";

import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";

const PING_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes

function sendPing() {
  fetch("/api/activity/ping", { method: "POST", credentials: "include" }).catch(() => {
    // Fire-and-forget — a missed ping just means a slightly stale "online
    // now" count, never worth surfacing to the visitor.
  });
}

// Mounted site-wide (see app/layout.tsx) next to PushNotificationPrompt/
// ChatWidget. No-ops entirely for logged-out visitors — this tracks
// registered users only (see app/api/activity/ping/route.ts). Powers the
// admin dashboard's Users → Activité view.
export default function ActivityPing() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    sendPing();
    const interval = setInterval(() => {
      // Skip while the tab is backgrounded — an idle background tab
      // shouldn't count toward "online now" or inflate the activity
      // pattern with hours nobody was actually looking at the site.
      if (document.visibilityState === "visible") sendPing();
    }, PING_INTERVAL_MS);

    // Covers "left an already-open tab in the background and came back" —
    // without this, returning to a stale tab waits up to PING_INTERVAL_MS
    // before it's reflected as "online" again.
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") sendPing();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [user]);

  return null;
}
