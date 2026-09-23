"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Same per-device "last read" convention as hooks/useUnreadChat.ts, but not
// scoped to a userId — the Actus feed is public (no login required to view
// it, see app/api/posts/route.ts), so a single device-wide key is enough.
const LAST_READ_KEY = "couponsur_actus_lastread";

// Called by ActusPage the moment the feed is fetched while it's open —
// viewing the tab is the read action, same as group chat marking a room
// read on open.
export function markActusRead() {
  try { localStorage.setItem(LAST_READ_KEY, new Date().toISOString()); } catch { /* ignore */ }
}

function getLastRead(): string | null {
  try { return localStorage.getItem(LAST_READ_KEY); } catch { return null; }
}

const POLL_MS = 90000;
// See hooks/useUnreadChat.ts's identical constant — same reasoning: caps
// how often BottomTabBar's per-navigation refresh() call (fired on every
// pathname change, on top of the interval below) can actually hit the
// network.
const MIN_REFRESH_GAP_MS = 15000;

// Unread count for the Actus tab's badge — enabled is passed in so a
// viewer whose admin has the news feed switched off never fires a request
// that would just come back empty.
export function useUnreadPostsCount(enabled: boolean) {
  const [count, setCount] = useState(0);
  const lastFetchRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!enabled) { setCount(0); return; }
    const now = Date.now();
    if (now - lastFetchRef.current < MIN_REFRESH_GAP_MS) return;
    lastFetchRef.current = now;
    try {
      const since = getLastRead();
      const params = new URLSearchParams();
      if (since) params.set("since", since);
      const res = await fetch(`/api/posts/unread-count?${params.toString()}`);
      const data = await res.json();
      setCount(data?.success ? Number(data.data.count) || 0 : 0);
    } catch {
      setCount(0);
    }
  }, [enabled]);

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

  return { count, refresh };
}
