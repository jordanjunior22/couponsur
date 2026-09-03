"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

interface Announcement {
  _id: string;
  title: string;
  body: string;
  type: "INFO" | "WARNING" | "SUCCESS";
  displayStyle: "BANNER" | "POPUP";
}

// Same key/format as components/AnnouncementBanner.tsx on purpose — one
// flat "seen it, never again" list shared by both display styles, keyed by
// announcement _id. A popup dismissed here can never re-show as a banner
// either (and vice versa), which is the right behavior: it's the same
// announcement, just presented differently.
const DISMISSED_KEY = "dismissed_announcements";

function readDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) || "[]");
  } catch {
    return [];
  }
}

const STYLES: Record<Announcement["type"], { accent: string; icon: string }> = {
  INFO: { accent: "#3B82F6", icon: "ℹ️" },
  WARNING: { accent: "#C9A84C", icon: "⚠️" },
  SUCCESS: { accent: "#22C55E", icon: "✅" },
};

// Blocking, centered — for something the admin needs every visitor to
// actually read, not just have quietly available in a dismissible strip
// (see AnnouncementBanner). Deliberately no dismiss-on-backdrop-click:
// only the explicit close button/"J'ai compris" counts, so it can't be
// missed by an accidental tap outside the card. Closing it is permanent
// for that visitor's browser — this exact announcement (same _id) never
// shows again, popup or banner, until the admin publishes a new one.
export default function AnnouncementPopup() {
  const pathname = usePathname();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setDismissed(readDismissed());
    setHydrated(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    let cancelled = false;
    const fetchAnnouncements = async () => {
      try {
        const res = await fetch("/api/announcements");
        const data = await res.json();
        if (!cancelled && data?.success) setAnnouncements(data.data || []);
      } catch {
        // Silent — tries again on the next poll.
      }
    };
    fetchAnnouncements();
    const interval = setInterval(fetchAnnouncements, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const active = announcements.find((a) => a.displayStyle === "POPUP" && !dismissed.includes(a._id));

  // Lock page scroll while the popup is up — reinforces that this is meant
  // to actually be read, not scrolled past.
  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [active]);

  const dismiss = (id: string) => {
    const next = [...dismissed, id];
    setDismissed(next);
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
  };

  if (!hydrated || pathname?.startsWith("/dashboard") || !active) return null;

  const s = STYLES[active.type] || STYLES.INFO;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="announcement-popup-title"
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 2000,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
        backdropFilter: "blur(4px)", fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <div style={{
        background: "#111418", border: `1px solid ${s.accent}40`, borderTop: `3px solid ${s.accent}`,
        borderRadius: 16, width: "100%", maxWidth: 440, padding: 24,
        boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
          <span style={{ fontSize: 22, flexShrink: 0, lineHeight: 1 }}>{s.icon}</span>
          <div id="announcement-popup-title" style={{ fontSize: 17, fontWeight: 700, color: "#E8EAF0", lineHeight: 1.4, paddingTop: 2 }}>
            {active.title}
          </div>
        </div>
        <div style={{ fontSize: 13, color: "#B8BFCC", lineHeight: 1.6, marginBottom: 20, whiteSpace: "pre-wrap" }}>
          {active.body}
        </div>
        <button
          onClick={() => dismiss(active._id)}
          style={{
            width: "100%", background: s.accent, color: "#0A0C0F", border: "none", borderRadius: 8,
            padding: "12px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            letterSpacing: "0.5px",
          }}
        >
          J&apos;ai compris
        </button>
      </div>
    </div>
  );
}
