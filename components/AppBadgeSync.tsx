"use client";

import { useEffect } from "react";

// Mounted once, globally (see app/layout.tsx) — tells the service worker to
// clear the OS app-icon badge whenever the user actually looks at the app,
// not just when they tap a notification (see public/sw.js's "message"
// listener, which is the counterpart of this). Covers reopening from the
// home-screen icon or switching back to an already-open tab.
export default function AppBadgeSync() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const clearBadge = async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        registration.active?.postMessage({ type: "CLEAR_BADGE" });
      } catch {
        // No SW registered yet (e.g. push was never enabled) — nothing to clear.
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") clearBadge();
    };

    clearBadge();
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", clearBadge);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", clearBadge);
    };
  }, []);

  return null;
}
