"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

interface Announcement {
  _id: string;
  title: string;
  body: string;
  type: "INFO" | "WARNING" | "SUCCESS";
}

const DISMISSED_KEY = "dismissed_announcements";

function readDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) || "[]");
  } catch {
    return [];
  }
}

const STYLES: Record<Announcement["type"], { bg: string; border: string; icon: string }> = {
  INFO: { bg: "rgba(59,130,246,0.08)", border: "#3B82F6", icon: "ℹ️" },
  WARNING: { bg: "rgba(201,168,76,0.08)", border: "#C9A84C", icon: "⚠️" },
  SUCCESS: { bg: "rgba(34,197,94,0.08)", border: "#22C55E", icon: "✅" },
};

export default function AnnouncementBanner() {
  const pathname = usePathname();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // One-time read of localStorage after mount — deliberately in an effect
  // (not a lazy useState initializer) so the first client render matches
  // the server-rendered HTML and avoids a hydration mismatch.
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
        // Silent — just tries again on the next tick.
      }
    };
    fetchAnnouncements();
    const interval = setInterval(fetchAnnouncements, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const active = announcements.find((a) => !dismissed.includes(a._id));

  const dismiss = (id: string) => {
    const next = [...dismissed, id];
    setDismissed(next);
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
  };

  if (!hydrated || pathname?.startsWith("/dashboard") || !active) return null;

  const s = STYLES[active.type] || STYLES.INFO;

  return (
    <div style={{ background: s.bg, borderBottom: `1px solid ${s.border}40`, fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{
        maxWidth: 1000, margin: "0 auto", padding: "10px 16px",
        display: "flex", alignItems: "flex-start", gap: 12, borderLeft: `3px solid ${s.border}`,
      }}>
        <span style={{ fontSize: 15, flexShrink: 0, lineHeight: "20px" }}>{s.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#E8EAF0", marginBottom: 2 }}>{active.title}</div>
          <div style={{ fontSize: 12, color: "#7A8399", lineHeight: 1.5 }}>{active.body}</div>
        </div>
        <button
          onClick={() => dismiss(active._id)}
          aria-label="Fermer l’annonce"
          style={{
            background: "transparent", border: "none", cursor: "pointer", color: "#7A8399",
            fontSize: 16, lineHeight: 1, padding: 4, flexShrink: 0,
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}
