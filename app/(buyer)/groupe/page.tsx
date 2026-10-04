"use client";

import { useEffect } from "react";
import Link from "next/link";
import { PiGlobeHemisphereWestFill, PiCrownSimpleFill, PiLockSimpleFill, PiCaretRightBold } from "react-icons/pi";
import { useAuth } from "@/context/AuthContext";
import { useAppSettings } from "@/hooks/useAppSettings";
import { useUnreadChatCounts, formatBadgeCount, type LatestMessage } from "@/hooks/useUnreadChat";
import { prefetchRoom } from "@/lib/groupChatCache";
import { BOTTOM_SAFE_OFFSET } from "@/lib/layoutConstants";

// The "Chat" tab's landing screen — a picker between the two rooms
// (components/GroupChatRoom, parameterized by `room`) rather than
// dropping straight into one. Chat Global is open to any logged-in user;
// Groupe Premium keeps its original admin/active-subscriber gate.
export default function ChatHubPage() {
  const { user, hasActiveSubscription } = useAuth();
  const settings = useAppSettings();

  const isPremiumEligible = !!user && (user.role === "ADMIN" || hasActiveSubscription());
  const globalOn = !!settings?.globalChatEnabled;
  const premiumOn = !!settings?.groupChatEnabled;

  const premiumEnterable = isPremiumEligible && premiumOn;
  const globalEnterable = !!user && globalOn;
  const { premium: premiumUnread, global: globalUnread, premiumLatest, globalLatest, refresh } = useUnreadChatCounts(
    premiumEnterable,
    globalEnterable
  );

  // The room list is where you see WHICH room has something new, so it keeps its
  // numbers fresh while you're on it (every 20s, and the moment you arrive)
  // instead of waiting for the slower background poll.
  useEffect(() => {
    refresh(true);
    const id = setInterval(() => { if (document.visibilityState === "visible") refresh(true); }, 20000);
    return () => clearInterval(id);
  }, [refresh]);

  // Warm each room's messages while the list is on screen, so tapping a room
  // opens it with content already there instead of a loading screen.
  const userId = user?._id;
  useEffect(() => {
    if (!userId) return;
    if (globalEnterable) prefetchRoom(userId, "global");
    if (premiumEnterable) prefetchRoom(userId, "premium");
  }, [userId, globalEnterable, premiumEnterable]);

  const warm = (room: "global" | "premium") => () => { if (userId) prefetchRoom(userId, room, 3000); };

  return (
    <main style={{ minHeight: "100vh", background: "#0A0C0F", padding: "20px 16px", paddingBottom: BOTTOM_SAFE_OFFSET }}>
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        <div style={titleStyle}>💬 Chat</div>

        <RoomCard
          href="/groupe/global"
          icon={<PiGlobeHemisphereWestFill size={22} />}
          label="Chat Global"
          description="Ouvert à tous les membres connectés."
          enterable={!!user && globalOn}
          lockedText={!user ? "Connectez-vous pour rejoindre" : "Temporairement indisponible"}
          unreadCount={globalUnread}
          latest={globalLatest}
          onWarm={warm("global")}
        />

        <RoomCard
          href="/groupe/premium"
          icon={<PiCrownSimpleFill size={22} />}
          label="Groupe Premium"
          description="Réservé aux abonnés actifs & à l'équipe."
          enterable={isPremiumEligible && premiumOn}
          lockedText={!user ? "Connectez-vous pour rejoindre" : !premiumOn ? "Temporairement indisponible" : "Réservé aux abonnés premium"}
          upsellHref={user && !isPremiumEligible ? "/profil" : undefined}
          unreadCount={premiumUnread}
          latest={premiumLatest}
          onWarm={warm("premium")}
        />
      </div>
    </main>
  );
}

// "12:40" today, "Hier", otherwise "dd/MM" - the usual chat-list time stamp.
function formatWhen(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (diffDays === 0) return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "Hier";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

function RoomCard({
  href, icon, label, description, enterable, lockedText, upsellHref, unreadCount, latest, onWarm,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  description: string;
  enterable: boolean;
  lockedText: string;
  upsellHref?: string;
  unreadCount?: number;
  latest?: LatestMessage | null;
  onWarm?: () => void;
}) {
  const badge = enterable ? formatBadgeCount(unreadCount ?? 0) : null;
  const hasUnread = !!badge;
  const preview = enterable && latest && latest.preview ? `${latest.mine ? "Vous" : latest.senderLabel} : ${latest.preview}` : null;

  const content = (
    <>
      <span style={iconWrapStyle}>
        {icon}
        {badge && <span style={unreadBadgeStyle}>{badge}</span>}
      </span>
      <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
          <div style={cardTitleStyle}>{label}</div>
          {enterable && latest && (
            <span style={{ fontSize: 10.5, color: hasUnread ? "#C9A84C" : "#7A8399", fontWeight: hasUnread ? 700 : 500, flexShrink: 0 }}>
              {formatWhen(latest.at)}
            </span>
          )}
        </div>
        <div style={{
          ...cardDescStyle,
          color: hasUnread ? "#E8EAF0" : "#7A8399", fontWeight: hasUnread ? 600 : 400,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {enterable ? (preview ?? description) : lockedText}
        </div>
      </div>
      {enterable ? <PiCaretRightBold size={16} color="#7A8399" /> : <PiLockSimpleFill size={15} color="#7A8399" />}
    </>
  );

  if (enterable) {
    return (
      <Link href={href} style={cardStyle} onPointerDown={onWarm} onMouseEnter={onWarm}>
        {content}
      </Link>
    );
  }
  if (upsellHref) {
    return <Link href={upsellHref} style={{ ...cardStyle, opacity: 0.75 }}>{content}</Link>;
  }
  return <div style={{ ...cardStyle, opacity: 0.6, cursor: "default" }}>{content}</div>;
}

const titleStyle: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: "#C9A84C", marginBottom: 18 };

const cardStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 14,
  background: "#111418", border: "1px solid #2A3140", borderRadius: 14,
  padding: "16px 18px", marginBottom: 12, textDecoration: "none",
  transition: "border-color 0.2s",
};

const iconWrapStyle: React.CSSProperties = {
  position: "relative",
  width: 44, height: 44, borderRadius: 12, flexShrink: 0,
  background: "rgba(201,168,76,0.1)", border: "1px solid rgba(201,168,76,0.25)",
  display: "flex", alignItems: "center", justifyContent: "center", color: "#C9A84C",
};

const unreadBadgeStyle: React.CSSProperties = {
  position: "absolute", top: -6, right: -6,
  minWidth: 18, height: 18, padding: "0 5px",
  borderRadius: 999, background: "#EF4444", border: "2px solid #0A0C0F",
  color: "#fff", fontSize: 10, fontWeight: 700, lineHeight: "14px",
  textAlign: "center", boxSizing: "border-box",
};

const cardTitleStyle: React.CSSProperties = { fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: 1, color: "#E8EAF0", marginBottom: 2 };

const cardDescStyle: React.CSSProperties = { fontSize: 11.5, color: "#7A8399", lineHeight: 1.4 };
