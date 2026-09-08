"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { IconType } from "react-icons";
import {
  PiHouseSimple, PiHouseSimpleFill,
  PiMegaphone, PiMegaphoneFill,
  PiChatCircleDots, PiChatCircleDotsFill,
  PiSparkle, PiSparkleFill,
  PiClockCounterClockwise, PiClockCounterClockwiseFill,
} from "react-icons/pi";
import { useAuth } from "@/context/AuthContext";
import { useAppSettings } from "@/hooks/useAppSettings";
import { useUnreadChatCounts, formatBadgeCount } from "@/hooks/useUnreadChat";
import { BOTTOM_TAB_BAR_HEIGHT } from "@/lib/layoutConstants";

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
    ...(showPronostic ? [{ href: "/pronostic", label: "Pronostic IA", icon: PiSparkle, iconActive: PiSparkleFill, badge: pronosticUnseen, onNavigate: markPronosticSeen }] : []),
    { href: "/historique", label: "Historique", icon: PiClockCounterClockwise, iconActive: PiClockCounterClockwiseFill },
  ];

  return (
    <nav style={barStyle} aria-label="Navigation principale">
      {tabs.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        const Icon = active ? tab.iconActive : tab.icon;
        return (
          <Link key={tab.href} href={tab.href} onClick={tab.onNavigate} style={itemStyle(active)}>
            <span style={iconWrapStyle}>
              <Icon size={21} />
              {tab.badgeCount ? <span style={countBadgeStyle}>{tab.badgeCount}</span> : tab.badge && <span style={dotStyle} />}
            </span>
            <span style={{ fontSize: 10, fontWeight: active ? 700 : 500 }}>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

const barStyle: React.CSSProperties = {
  position: "fixed",
  bottom: 0,
  left: 0,
  right: 0,
  zIndex: 900,
  display: "flex",
  background: "#0A0C0F",
  borderTop: "1px solid #1F2937",
  height: BOTTOM_TAB_BAR_HEIGHT,
  paddingBottom: "env(safe-area-inset-bottom)",
};

const iconWrapStyle: React.CSSProperties = {
  position: "relative",
  display: "flex",
  lineHeight: 1,
};

const dotStyle: React.CSSProperties = {
  position: "absolute",
  top: -2,
  right: -6,
  width: 8,
  height: 8,
  borderRadius: "50%",
  background: "#EF4444",
  border: "1px solid #0A0C0F",
};

const countBadgeStyle: React.CSSProperties = {
  position: "absolute",
  top: -6,
  right: -10,
  minWidth: 16,
  height: 16,
  padding: "0 4px",
  borderRadius: 999,
  background: "#EF4444",
  border: "1px solid #0A0C0F",
  color: "#fff",
  fontSize: 9,
  fontWeight: 700,
  lineHeight: "14px",
  textAlign: "center",
  boxSizing: "border-box",
};

const itemStyle = (active: boolean): React.CSSProperties => ({
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 2,
  textDecoration: "none",
  color: active ? "#C9A84C" : "#7A8399",
  transition: "color 0.15s",
});
