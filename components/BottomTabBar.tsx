"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { IconType } from "react-icons";
import {
  PiHouseSimple, PiHouseSimpleFill,
  PiMegaphone, PiMegaphoneFill,
  PiChatCircleDots, PiChatCircleDotsFill,
  PiRobot, PiRobotFill,
  PiClockCounterClockwise, PiClockCounterClockwiseFill,
} from "react-icons/pi";
import { useAuth } from "@/context/AuthContext";
import { useAppSettings } from "@/hooks/useAppSettings";
import { useUnreadChatCounts, formatBadgeCount } from "@/hooks/useUnreadChat";

// Same localStorage key the old ToolsHub FAB used for its "Nouveau" pill —
// kept so a visitor who already dismissed it doesn't see it resurface here.
const SEEN_KEY = "couponsur_tools_seen_v1";
const MATCH_GENERATOR_TOOL_ID = "match-generator";

interface Tab {
  href: string;
  label: string;
  icon: IconType;
  iconActive: IconType;
  exact?: boolean; // "/" needs exact match, everything else is prefix-match
  badge?: boolean; // plain "new" dot (Pronostic IA)
  badgeCount?: string | null; // numbered unread badge (Chat)
  onNavigate?: () => void;
}

export function BottomTabBar() {
  const pathname = usePathname();
  const { user, hasActiveSubscription } = useAuth();
  const settings = useAppSettings();
  // Raw sync with the external store (localStorage) — read once on mount;
  // the derived "is it unseen" boolean below is computed in render instead
  // of being its own setState call, so there's exactly one state update to
  // reason about, not two racing to represent the same fact.
  const [seenIds, setSeenIds] = useState<string[] | null>(null);

  useEffect(() => {
    try {
      setSeenIds(JSON.parse(localStorage.getItem(SEEN_KEY) || "[]"));
    } catch { /* private browsing etc. — badge just never clears, harmless */ setSeenIds([]); }
  }, []);

  const pronosticUnseen = !!settings?.matchGeneratorEnabled && !!seenIds && !seenIds.includes(MATCH_GENERATOR_TOOL_ID);

  const markPronosticSeen = () => {
    try {
      const seen: string[] = JSON.parse(localStorage.getItem(SEEN_KEY) || "[]");
      if (!seen.includes(MATCH_GENERATOR_TOOL_ID)) {
        const next = [...seen, MATCH_GENERATOR_TOOL_ID];
        localStorage.setItem(SEEN_KEY, JSON.stringify(next));
        setSeenIds(next);
      }
    } catch { /* ignore */ }
  };

  // Unlike the old single premium-only room, the Chat tab now leads to a
  // picker with two rooms (Groupe Premium + Chat Global) — eligibility for
  // Premium specifically is decided *inside* that picker (same posture as
  // Historique/Profil: the tab itself doesn't gate on login or
  // subscription, only on whether admin has switched at least one of the
  // two rooms on at all).
  const showChat = !!settings && (settings.globalChatEnabled || settings.groupChatEnabled);
  const showPronostic = !!settings?.matchGeneratorEnabled;
  const showActus = !!settings?.newsFeedEnabled;

  // Same eligibility a viewer would actually pass server-side for each
  // room — only queried for unread counts when true, so an ineligible
  // viewer never fires a request that would just 403.
  const premiumEligible = !!user && (user.role === "ADMIN" || hasActiveSubscription()) && !!settings?.groupChatEnabled;
  const globalEligible = !!user && !!settings?.globalChatEnabled;
  const { total: unreadChatTotal, refresh: refreshUnread } = useUnreadChatCounts(premiumEligible, globalEligible);

  // Re-check the moment the viewer navigates anywhere — in particular,
  // leaving a chat room should clear its badge without waiting out the
  // hook's own poll interval.
  useEffect(() => { refreshUnread(); }, [pathname, refreshUnread]);

  // Order is deliberate, not alphabetical or "as features shipped" — it's
  // built around one goal: keep people coming back.
  //   1. Accueil — the anchor. Every tab bar needs a fixed "home", non-negotiable.
  //   2. Actus    — freshest content (new posts, shifting poll %, comments)
  //                 right after home, so "what's new" is the very next thing
  //                 a visitor sees. No badge mechanism of its own, so it
  //                 leans on early position instead to get noticed.
  //   3. Chat     — the single strongest return-visit driver an app can have
  //                 (real-time, unread badge) gets the bar's most reachable,
  //                 most-glanced-at slot: dead center.
  //   4. Pronostic IA — a fun, occasional tool; a single-shot action, not an
  //                 ongoing thread worth checking back on, so it sits after
  //                 the two "keep checking" features rather than competing
  //                 with them for attention.
  //   5. Historique — pure personal lookup, nothing new ever appears here on
  //                 its own. Least reason to pull someone back, so it takes
  //                 the last slot — reachable when wanted, never pushy.
  // Profil is gone entirely — the avatar in BuyerTopBar already opens it,
  // so this bar can spend its five slots on things worth returning for.
  const tabs: Tab[] = [
    { href: "/", label: "Accueil", icon: PiHouseSimple, iconActive: PiHouseSimpleFill, exact: true },
    ...(showActus ? [{ href: "/actus", label: "Actus", icon: PiMegaphone, iconActive: PiMegaphoneFill }] : []),
    ...(showChat ? [{ href: "/groupe", label: "Chat", icon: PiChatCircleDots, iconActive: PiChatCircleDotsFill, badgeCount: formatBadgeCount(unreadChatTotal) }] : []),
    // "Pronostic IA" — our branded name for the AI match-generation engine,
    // not a generic "Outils"/"AI Tools" label.
    ...(showPronostic ? [{ href: "/pronostic", label: "Pronostic IA", icon: PiRobot, iconActive: PiRobotFill, badge: pronosticUnseen, onNavigate: markPronosticSeen }] : []),
    { href: "/historique", label: "Historique", icon: PiClockCounterClockwise, iconActive: PiClockCounterClockwiseFill },
  ];

  // Inside an actual chat room (not the /groupe picker itself) the room
  // wants the full remaining viewport for messages + composer — the
  // floating bar would just sit on top of that, so it's hidden entirely
  // rather than left floating over the conversation. ChatRoomScreen
  // reclaims the height this frees up (see lib/layoutConstants.ts).
  const inChatRoom = pathname === "/groupe/premium" || pathname === "/groupe/global";
  if (inChatRoom) return null;

  // useAppSettings() returns null until its first fetch resolves — until
  // then we don't actually know which of Actus/Chat/Pronostic IA to show,
  // so rendering the real tab list would start at just Accueil+Historique
  // and then pop in extra tabs a moment later. A skeleton in the exact
  // same floating-pill shell reserves the final layout up front instead.
  if (!settings) return <TabBarSkeleton />;

  return (
    // Outer strip spans the full viewport width so the floating card below
    // can be centered in it, but the strip itself is transparent and
    // click-through everywhere except where the card actually sits — a
    // visitor scrolling near the very bottom edge never has their taps
    // swallowed by empty margin.
    <div style={outerStyle}>
      <nav style={barStyle} aria-label="Navigation principale">
        {tabs.map((tab) => {
          const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
          const Icon = active ? tab.iconActive : tab.icon;
          return (
            <Link key={tab.href} href={tab.href} onClick={tab.onNavigate} className="cb-tab-item" style={itemStyle}>
              <span style={iconWrapStyle}>
                <span style={circleStyle(active)} />
                <Icon size={19} color={active ? "#0A0C0F" : "#7A8399"} style={{ position: "relative", zIndex: 1, transition: "color 0.3s" }} />
                {tab.badgeCount ? (
                  <span style={countBadgeStyle}>{tab.badgeCount}</span>
                ) : tab.badge ? (
                  <span style={dotStyle} />
                ) : null}
              </span>
              <span style={labelStyle(active)}>{tab.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

// Placeholder shown in the exact same floating pill shell while
// useAppSettings() is still resolving (see the `!settings` branch above).
// Five slots — the maximum possible tab count — so the real bar never has
// to grow wider than this once it swaps in; it can only ever end up with
// the same or fewer real tabs.
function TabBarSkeleton() {
  return (
    <div style={outerStyle}>
      <nav style={barStyle} aria-hidden="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={itemStyle}>
            <span className="cs-skeleton" style={skeletonCircleStyle} />
            <span className="cs-skeleton" style={skeletonLabelStyle} />
          </div>
        ))}
      </nav>
    </div>
  );
}

const skeletonCircleStyle: React.CSSProperties = {
  width: 34, height: 34, borderRadius: "50%",
};

const skeletonLabelStyle: React.CSSProperties = {
  width: 26, height: 7, borderRadius: 3,
};

const outerStyle: React.CSSProperties = {
  position: "fixed",
  bottom: 0,
  left: 0,
  right: 0,
  zIndex: 900,
  display: "flex",
  justifyContent: "center",
  padding: "0 12px calc(14px + env(safe-area-inset-bottom))",
  pointerEvents: "none",
};

// Glass floating pill — frosted, edge-lit, lifted off the page with a soft
// shadow instead of the old edge-to-edge strip with a flat hairline top
// border. This is the piece that actually reads as "designed", not just
// "functional".
const barStyle: React.CSSProperties = {
  pointerEvents: "auto",
  display: "flex",
  alignItems: "stretch",
  width: "100%",
  maxWidth: 460,
  gap: 2,
  background: "linear-gradient(180deg, rgba(22,25,31,0.88), rgba(14,16,20,0.92))",
  backdropFilter: "blur(22px) saturate(160%)",
  WebkitBackdropFilter: "blur(22px) saturate(160%)",
  border: "1px solid rgba(255,255,255,0.07)",
  borderRadius: 26,
  padding: "7px 7px",
  boxShadow: "0 16px 40px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)",
};

const itemStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 3,
  textDecoration: "none",
  padding: "3px 2px",
  minWidth: 0,
};

// The active tab's icon sits on a solid gold circle that pops in with a
// slight overshoot — everything else (label position, size) stays fixed
// between states so switching tabs never shifts layout, just swaps one
// small filled disc in and out behind the icon.
const circleStyle = (active: boolean): React.CSSProperties => ({
  position: "absolute",
  top: "50%",
  left: "50%",
  width: 34,
  height: 34,
  borderRadius: "50%",
  background: "linear-gradient(135deg, #E8C97A, #C9A84C)",
  boxShadow: active ? "0 2px 12px rgba(201,168,76,0.45)" : "none",
  transform: active ? "translate(-50%, -50%) scale(1)" : "translate(-50%, -50%) scale(0)",
  opacity: active ? 1 : 0,
  transition: "all 0.38s cubic-bezier(0.34, 1.56, 0.64, 1)",
});

const iconWrapStyle: React.CSSProperties = {
  position: "relative",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 34,
  height: 34,
  lineHeight: 1,
};

const labelStyle = (active: boolean): React.CSSProperties => ({
  fontSize: 9.5,
  fontWeight: active ? 700 : 500,
  color: active ? "#E8C97A" : "#5B6478",
  letterSpacing: "0.1px",
  transition: "color 0.3s, font-weight 0.3s",
});

// Positioned relative to iconWrapStyle's full 34×34 box (which centers a
// ~19px glyph inside it, ~7.5px inset per side) rather than the glyph
// itself, so these numbers land at the glyph's visual top-right corner.
const dotStyle: React.CSSProperties = {
  position: "absolute",
  top: 2,
  right: -2,
  width: 7,
  height: 7,
  borderRadius: "50%",
  background: "#EF4444",
  border: "1.5px solid #14161A",
};

const countBadgeStyle: React.CSSProperties = {
  position: "absolute",
  top: 0,
  right: -3,
  minWidth: 15,
  height: 15,
  padding: "0 3.5px",
  borderRadius: 999,
  background: "linear-gradient(135deg, #FF6B6B, #EF4444)",
  border: "1.5px solid #14161A",
  color: "#fff",
  fontSize: 8.5,
  fontWeight: 800,
  lineHeight: "12px",
  textAlign: "center",
  boxSizing: "border-box",
  boxShadow: "0 0 0 0 rgba(239,68,68,0.5)",
  animation: "badgePulse 2s ease-out infinite",
};
