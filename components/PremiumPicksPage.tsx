"use client";
import { useState, useMemo, useEffect, useRef, useCallback, useId } from "react";
import Link from "next/link";
import { PiChartLineUpBold, PiCalendarBlankBold, PiCaretDownBold, PiFireFill, PiSparkleFill, PiCaretRightBold, PiCalendarXBold } from "react-icons/pi";
import { useAuth } from "@/context/AuthContext";
import { useAppSettings } from "@/hooks/useAppSettings";
import { OneXBetBanner } from "./OneXBetBanner";
import { CompoundBetBanner } from "./CompoundBanner";
import { SubscribeBanner } from "./SubscribeBanner";
import { Spinner, PageLoader } from "./LoadingSpinner";
import { trackEvent, generateEventId, getFbCookies } from "@/lib/pixelClient";
import { BOTTOM_SAFE_OFFSET } from "@/lib/layoutConstants";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Match {
  home: string;
  away: string;
  tip: string;
  odd: number;
  league?: string;
  confidence?: number;
  sources?: string[];
  kickoff?: string | null;
  outcome: "PENDING" | "WIN" | "LOSS" | "REFUNDED";
}

export type PickTier = "safe" | "value" | "bold" | null;

export interface Pick {
  _id: string;
  title: string;
  price: number;
  total_odds: number;
  match_date: string;
  league: string;
  outcome: "PENDING" | "WIN" | "LOSS" | "REFUNDED";
  is_published: boolean;
  is_automated?: boolean;
  tier?: PickTier;
  avg_confidence?: number | null;
  matches: Match[];
}

// ─── Tier config ──────────────────────────────────────────────────────────────
const TIER_META: Record<string, { label: string; desc: string }> = {
  safe: { label: "Safe", desc: "Cotes prudentes" },
  value: { label: "Value", desc: "Équilibre risque / rendement" },
  bold: { label: "Bold", desc: "Cotes élevées" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(d: string): string {
  if (!d) return "Date inconnue";
  const date = new Date(d.split("T")[0] + "T12:00:00");
  if (isNaN(date.getTime())) return d;
  return date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

function groupByDate(picks: Pick[]): Record<string, Pick[]> {
  const groups: Record<string, Pick[]> = {};
  picks.forEach((p) => {
    const key = p.match_date.split("T")[0];
    if (!groups[key]) groups[key] = [];
    groups[key].push(p);
  });
  return groups;
}

// ─── Week helpers ─────────────────────────────────────────────────────────────
// A "week" is Monday–Sunday, keyed by that Monday's date string — computed
// off the same UTC-calendar-date convention the rest of this file already
// uses for "today" and for grouping (`match_date.split("T")[0]`), so this
// doesn't introduce a local-time-vs-UTC mismatch alongside it.
function getWeekKey(dateStr: string): string {
  const d = new Date(dateStr.split("T")[0] + "T00:00:00Z");
  const day = d.getUTCDay(); // 0 = Sunday ... 6 = Saturday
  const diffToMonday = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - diffToMonday);
  return d.toISOString().split("T")[0];
}

function formatWeekRange(weekKey: string): string {
  const start = new Date(weekKey + "T00:00:00Z");
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const sameMonth = start.getUTCMonth() === end.getUTCMonth();
  const startLabel = start.toLocaleDateString("fr-FR", { day: "numeric", month: sameMonth ? undefined : "short" });
  const endLabel = end.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  return `${startLabel} – ${endLabel}`;
}

// The 7 calendar-day date strings (Monday..Sunday) that make up the week
// keyed by `weekKey` — lets a week's expanded view show every day, not
// just the ones that happen to have a pick, so a day with nothing posted
// reads as "empty" instead of silently not existing.
function getWeekDayKeys(weekKey: string): string[] {
  const start = new Date(weekKey + "T00:00:00Z");
  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    days.push(d.toISOString().split("T")[0]);
  }
  return days;
}

interface Tally { wins: number; losses: number; refunds: number; graded: number; winRate: number | null }

// Win rate excludes REFUNDED picks — a void isn't a loss.
function computeRecord(picks: Pick[]): Tally {
  const wins = picks.filter((p) => p.outcome === "WIN").length;
  const losses = picks.filter((p) => p.outcome === "LOSS").length;
  const refunds = picks.filter((p) => p.outcome === "REFUNDED").length;
  const graded = wins + losses;
  return { wins, losses, refunds, graded, winRate: graded > 0 ? Math.round((wins / graded) * 100) : null };
}

// ─── Countdown hook ───────────────────────────────────────────────────────────
function useCountdown(targetDate: string | null) {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    if (!targetDate) { setLabel(null); return; }
    const target = new Date(targetDate).getTime();
    const tick = () => {
      const diff = target - Date.now();
      if (diff <= 0) { setLabel(null); return; }
      const hrs = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      if (hrs >= 24) { setLabel(null); return; }
      setLabel(`${hrs}h ${mins.toString().padStart(2, "00")}m`);
    };
    tick();
    const interval = setInterval(tick, 60000);
    return () => clearInterval(interval);
  }, [targetDate]);
  return label;
}

// ─── Shared Styles ────────────────────────────────────────────────────────────
const S = {
  input: {
    background: "#1A1F26", border: "1px solid #2A3140", borderRadius: 8,
    padding: "12px 14px", width: "100%", color: "#E8EAF0", fontSize: 14,
    marginBottom: 10, outline: "none", fontFamily: "inherit",
  } as React.CSSProperties,
  btnGold: {
    display: "block", width: "100%", background: "#C9A84C", color: "#0A0C0F",
    border: "none", borderRadius: 10, padding: "15px",
    fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: 2,
    cursor: "pointer", marginBottom: 10,
  } as React.CSSProperties,
  btnGhost: {
    display: "block", width: "100%", background: "transparent", color: "#7A8399",
    border: "1px solid #2A3140", borderRadius: 10, padding: "12px",
    fontFamily: "inherit", fontSize: 13, cursor: "pointer",
  } as React.CSSProperties,
};

// ─── Global Styles ────────────────────────────────────────────────────────────
const GlobalStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;600&display=swap');
    *, *::before, *::after { box-sizing: border-box; }
    body { background: #0A0C0F; color: #E8EAF0; font-family: 'DM Sans', sans-serif; margin: 0; }
    ::-webkit-scrollbar { display: none; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
    @keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes scaleIn { from { transform: scale(0.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }
  `}</style>
);

// ─── Icons ────────────────────────────────────────────────────────────────────
const IconCheck = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 12 12" fill="none">
    <path d="M2 6l3 3 5-5" stroke="#22C55E" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IconX = ({ color = "#EF4444", size = 12 }: { color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 12 12" fill="none">
    <path d="M3 3l6 6M9 3l-6 6" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);
const IconRefund = ({ color = "#3B82F6", size = 12 }: { color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 12 12" fill="none">
    <path d="M2.5 6a3.5 3.5 0 016-2.5M9.5 6a3.5 3.5 0 01-6 2.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <path d="M8.5 2.5v1.5H7M3.5 9.5V8H5" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IconLock = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
    <rect x="5" y="11" width="14" height="10" rx="2" stroke="#C9A84C" strokeWidth="1.5" />
    <path d="M8 11V7a4 4 0 018 0v4" stroke="#C9A84C" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);
const IconChevron = ({ open }: { open: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
    style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.3s" }}>
    <path d="M4 6l4 4 4-4" stroke="#C9A84C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IconPhone = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
    <rect x="5" y="2" width="14" height="20" rx="3" stroke="#C9A84C" strokeWidth="1.5" />
    <circle cx="12" cy="18" r="1" fill="#C9A84C" />
  </svg>
);
const IconSuccess = () => (
  <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
    <circle cx="24" cy="24" r="22" stroke="#22C55E" strokeWidth="2" />
    <path d="M14 24l7 7 13-13" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IconFail = () => (
  <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
    <circle cx="24" cy="24" r="22" stroke="#EF4444" strokeWidth="2" />
    <path d="M16 16l16 16M32 16l-16 16" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);

// ─── Win-rate progress ring ───────────────────────────────────────────────────
// Shared by the Hero's stat card and every WeekCalendar row so the "gold ring
// around a percentage" reads as one consistent motif across the page.
// Animates a displayed number toward `target` over `duration`ms (ease-out
// cubic) instead of snapping — used so the ring's percentage counts up
// whenever the buyer switches scope (Semaine/Global) or new data lands,
// rather than just flickering to a new value.
function useCountUp(target: number | null, duration = 700): number | null {
  const [display, setDisplay] = useState(target ?? 0);
  const displayRef = useRef(display);
  useEffect(() => { displayRef.current = display; }, [display]);

  useEffect(() => {
    if (target === null) return;
    const from = displayRef.current;
    if (from === target) return;
    let frame: number;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (target - from) * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // Deliberately only re-runs when the target changes — `from` is read
    // fresh from the ref at that moment, not tracked as a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return target === null ? null : display;
}

function WinRateRing({ rate, size = 64, stroke = 5 }: { rate: number | null; size?: number; stroke?: number }) {
  // Every ring on the page (Hero + one per WeekCalendar row) needs its own
  // gradient id — duplicate SVG ids are invalid even when the defs are
  // identical.
  const gradientId = `winRateGradient-${useId()}`;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const animated = useCountUp(rate);
  const pct = animated ?? 0;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#2A3140" strokeWidth={stroke} />
        {rate !== null && (
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke={`url(#${gradientId})`} strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c - (pct / 100) * c}
          />
        )}
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#E8C97A" />
            <stop offset="100%" stopColor="#C9A84C" />
          </linearGradient>
        </defs>
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Bebas Neue', sans-serif", fontSize: size * 0.3, color: "#C9A84C" }}>
        {rate !== null ? `${pct}%` : "—"}
      </div>
    </div>
  );
}

// ─── Outcome Badge ────────────────────────────────────────────────────────────
const OutcomeBadge = ({ outcome }: { outcome: "PENDING" | "WIN" | "LOSS" | "REFUNDED" }) => {
  const styles: Record<string, React.CSSProperties> = {
    WIN: { background: "rgba(34,197,94,0.12)", color: "#22C55E", border: "1px solid rgba(34,197,94,0.25)" },
    LOSS: { background: "rgba(239,68,68,0.12)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.25)" },
    PENDING: { background: "rgba(201,168,76,0.1)", color: "#C9A84C", border: "1px solid rgba(201,168,76,0.25)" },
    REFUNDED: { background: "rgba(59,130,246,0.1)", color: "#3B82F6", border: "1px solid rgba(59,130,246,0.25)" },
  };
  const labels = { WIN: "WIN", LOSS: "LOSS", PENDING: "LIVE", REFUNDED: "REMBOURSÉ" };
  return (
    <span style={{ ...styles[outcome], fontSize: 9, letterSpacing: "1.5px", textTransform: "uppercase", fontWeight: 700, padding: "4px 10px", borderRadius: 4, flexShrink: 0 }}>
      {labels[outcome]}
    </span>
  );
};

// A combo can win or lose overall while still having one leg voided (e.g.
// a Draw No Bet leg pushing on a draw) — pick.outcome alone doesn't
// surface that. This flags it separately so a buyer doesn't have to open
// the pick and scroll through every match to notice a leg was refunded.
const refundedLegCount = (pick: Pick) => pick.matches.filter((m) => m.outcome === "REFUNDED").length;

function PartialRefundChip({ count }: { count: number }) {
  return (
    <span style={{
      fontSize: 9, letterSpacing: "1px", textTransform: "uppercase", fontWeight: 700,
      color: "#3B82F6", background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.25)",
      padding: "4px 10px", borderRadius: 4, flexShrink: 0, whiteSpace: "nowrap",
      display: "inline-flex", alignItems: "center", gap: 4,
    }}>
      <IconRefund size={10} /> {count > 1 ? `${count} matchs remboursés` : "1 match remboursé"}
    </span>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────
function Hero({ picks }: { picks: Pick[] }) {
  const [scope, setScope] = useState<"week" | "all">("week");
  const [warnOpen, setWarnOpen] = useState(false);
  const publishedPicks = picks.filter((p) => p.is_published !== false);
  const today = new Date().toISOString().split("T")[0];
  const currentWeekKey = getWeekKey(today);

  const weekPicks = useMemo(
    () => publishedPicks.filter((p) => getWeekKey(p.match_date) === currentWeekKey),
    [publishedPicks, currentWeekKey]
  );
  const weekRecord = useMemo(() => computeRecord(weekPicks), [weekPicks]);
  const allRecord = useMemo(() => computeRecord(publishedPicks), [publishedPicks]);
  const active = scope === "week" ? weekRecord : allRecord;

  const todayCount = publishedPicks.filter((p) => p.match_date.split("T")[0] === today).length;

  // Current win streak — most recent graded picks first, counting
  // consecutive WINs until the first LOSS (refunds don't break it, they're
  // a void, not a result). Global by design — a streak spanning a week
  // boundary is still a streak.
  const streak = useMemo(() => {
    const gradedDesc = publishedPicks
      .filter((p) => p.outcome === "WIN" || p.outcome === "LOSS")
      .sort((a, b) => b.match_date.localeCompare(a.match_date));
    let count = 0;
    for (const p of gradedDesc) {
      if (p.outcome === "WIN") count++;
      else break;
    }
    return count;
  }, [publishedPicks]);

  // Last up to 6 weeks (including the current one) as a tiny trend strip —
  // reuses the same week grouping WeekCalendar uses, just capped short.
  const weekTrend = useMemo(() => {
    const groups: Record<string, Pick[]> = {};
    publishedPicks.forEach((p) => {
      const key = getWeekKey(p.match_date);
      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
    });
    return Object.keys(groups).sort().slice(-6).map((weekKey) => ({ weekKey, record: computeRecord(groups[weekKey]) }));
  }, [publishedPicks]);
  const gradedWeeksInTrend = weekTrend.filter((w) => w.record.graded > 0).length;

  return (
    <div style={heroBgStyle}>
    <div style={{ padding: "26px 16px 20px", maxWidth: 700, margin: "0 auto", textAlign: "center" }}>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(28px, 7vw, 40px)", color: "#E8EAF0", letterSpacing: 2, marginBottom: 6 }}>
        Pronostics Football Premium
      </div>
      <div style={{ fontSize: 13, color: "#7A8399", marginBottom: 14, lineHeight: 1.6 }}>
        Sélections quotidiennes à partir de 200 FCFA — Safe, Value et Bold pour chaque profil.
      </div>

      {/* Responsible-gambling notice — collapsed by default so it doesn't
          eat vertical space every visit; still one tap away, not removed. */}
      <button onClick={() => setWarnOpen((v) => !v)} style={warnChipStyle}>
        ⚠️ Jouez de manière responsable {warnOpen ? "▲" : "▾"}
      </button>
      {warnOpen && (
        <p style={warnTextStyle}>
          Pariez à vos propres risques : nos pronostics sont fournis à titre indicatif
          et ne garantissent aucun résultat. Ne misez que ce que vous pouvez vous
          permettre de perdre — nous déclinons toute responsabilité quant à vos pertes.
        </p>
      )}

      {/* ── Performance card — one compact row, collapses further when there's
          nothing graded yet instead of showing an empty ring ── */}
      <div style={perfCardStyle}>
        {streak >= 2 && (
          <div style={streakBadgeStyle}>
            <PiFireFill size={11} /> {streak} d&apos;affilée
          </div>
        )}
        <div style={perfHeaderStyle}>
          <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#7A8399", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 600 }}>
            <PiChartLineUpBold size={12} /> Performance
          </span>
          <div style={{ display: "flex", gap: 0, background: "#0A0C0F", borderRadius: 8, padding: 2 }}>
            <button onClick={() => setScope("week")} style={scope === "week" ? statTabActiveStyle : statTabInactiveStyle}>Semaine</button>
            <button onClick={() => setScope("all")} style={scope === "all" ? statTabActiveStyle : statTabInactiveStyle}>Global</button>
          </div>
        </div>

        {active.graded > 0 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 14 }}>
            <WinRateRing rate={active.winRate} size={54} stroke={5} />
            <div style={{ textAlign: "left", flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: "#E8EAF0" }}>
                <span style={{ color: "#22C55E", fontWeight: 700 }}>{active.wins} gagnés</span>
                {" · "}
                <span style={{ color: "#EF4444", fontWeight: 700 }}>{active.losses} perdus</span>
                {active.refunds > 0 && <> · <span style={{ color: "#3B82F6", fontWeight: 700 }}>{active.refunds} remb.</span></>}
              </div>
              {todayCount > 0 && (
                <div style={{ fontSize: 11, color: "#7A8399", marginTop: 3 }}>
                  <span style={{ color: "#C9A84C", fontWeight: 700 }}>{todayCount}</span> pick{todayCount > 1 ? "s" : ""} aujourd&apos;hui
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "#7A8399", textAlign: "left", marginTop: 10 }}>
            Aucun pick jugé {scope === "week" ? "cette semaine" : "pour l'instant"}.
            {todayCount > 0 && <> <span style={{ color: "#C9A84C", fontWeight: 700 }}>{todayCount}</span> aujourd&apos;hui.</>}
          </div>
        )}

        {/* Trend strip — win rate per week, last up to 6 weeks, current
            week picked out in full gold. Only worth showing once there's
            actually a trend to read. */}
        {gradedWeeksInTrend >= 2 && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #1F2937" }}>
            <div style={{ fontSize: 9, color: "#7A8399", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 8, textAlign: "left" }}>
              Tendance
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 28 }}>
              {weekTrend.map(({ weekKey, record }) => {
                const isCurrent = weekKey === currentWeekKey;
                const h = record.graded > 0 ? Math.max(4, (record.winRate! / 100) * 28) : 3;
                return (
                  <div
                    key={weekKey}
                    title={`${formatWeekRange(weekKey)} — ${record.graded > 0 ? `${record.winRate}%` : "aucun pick"}`}
                    style={{
                      flex: 1, height: h, borderRadius: 3,
                      background: record.graded === 0 ? "#2A3140" : isCurrent ? "linear-gradient(180deg, #E8C97A, #C9A84C)" : "rgba(201,168,76,0.35)",
                      transition: "height 0.5s cubic-bezier(0.32,0.72,0,1)",
                    }}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>

      <ScrollCue targetId="today-picks" />
    </div>
    </div>
  );
}

// Photo behind the Hero — dark from the very top (so the title/stat card
// text always reads cleanly over it) and ramping to fully opaque by the
// bottom edge, so it dissolves into the page's own #0A0C0F background
// underneath instead of ending in a visible hard seam.
const heroBgStyle: React.CSSProperties = {
  backgroundImage: "linear-gradient(to bottom, rgba(10,12,15,0.7) 0%, rgba(10,12,15,0.88) 55%, #0A0C0F 100%), url('/bg.jpeg')",
  backgroundSize: "cover, cover",
  backgroundPosition: "center 25%, center 25%",
  backgroundRepeat: "no-repeat, no-repeat",
};

// ─── Scroll cue ───────────────────────────────────────────────────────────────
// Replaces the old solid "Voir les pronostics du jour" button — a quiet,
// animated double-chevron "waterfall" instead of another CTA competing with
// the Hero for attention. Still a real button (keyboard/aria accessible,
// same smooth-scroll behavior), just skinned as a hint instead of a command.
function ScrollCue({ targetId }: { targetId: string }) {
  return (
    <button
      onClick={() => document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth" })}
      aria-label="Voir les pronostics du jour"
      style={scrollCueStyle}
    >
      <style>{`
        @keyframes scrollCueFall {
          0%   { opacity: 0; transform: translateY(-3px); }
          35%  { opacity: 1; transform: translateY(0); }
          70%  { opacity: 1; transform: translateY(1px); }
          100% { opacity: 0; transform: translateY(6px); }
        }
        .scroll-cue-chevron { animation: scrollCueFall 1.7s ease-in-out infinite; }
        .scroll-cue-chevron.d2 { animation-delay: 0.22s; }
        @media (prefers-reduced-motion: reduce) {
          .scroll-cue-chevron { animation: none; opacity: 0.6; }
        }
      `}</style>
      <span style={{ fontSize: 9, letterSpacing: "2.5px", textTransform: "uppercase", color: "#7A8399" }}>
        Voir les picks
      </span>
      <span style={{ display: "flex", flexDirection: "column", alignItems: "center", height: 22 }}>
        <svg className="scroll-cue-chevron" width="18" height="10" viewBox="0 0 18 10" fill="none">
          <path d="M2 2l7 6 7-6" stroke="#C9A84C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <svg className="scroll-cue-chevron d2" width="18" height="10" viewBox="0 0 18 10" fill="none" style={{ marginTop: -4 }}>
          <path d="M2 2l7 6 7-6" stroke="#C9A84C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity={0.6} />
        </svg>
      </span>
    </button>
  );
}

const scrollCueStyle: React.CSSProperties = {
  background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit",
  display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
  margin: "16px auto 0", padding: 6,
};

const warnChipStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6,
  background: "rgba(201,168,76,0.04)", border: "1px solid rgba(201,168,76,0.12)",
  borderRadius: 999, padding: "6px 14px", marginBottom: 14,
  fontSize: 11, color: "#7A8399", cursor: "pointer", fontFamily: "inherit",
};

const warnTextStyle: React.CSSProperties = {
  fontSize: 11, color: "#7A8399", lineHeight: 1.6, textAlign: "left",
  maxWidth: 480, margin: "-6px auto 14px", padding: "0 4px",
};

const perfCardStyle: React.CSSProperties = {
  position: "relative",
  background: "#111418", border: "1px solid #2A3140", borderRadius: 14,
  padding: "14px 18px", maxWidth: 420, margin: "0 auto",
};

const streakBadgeStyle: React.CSSProperties = {
  position: "absolute", top: -11, right: 16,
  display: "flex", alignItems: "center", gap: 4,
  background: "linear-gradient(135deg, #F97316, #EA580C)", color: "#fff",
  fontSize: 10, fontWeight: 700, letterSpacing: "0.3px",
  padding: "4px 10px", borderRadius: 999,
  boxShadow: "0 4px 14px rgba(234,88,12,0.4)",
  animation: "pulse 2.4s ease-in-out infinite",
};

const perfHeaderStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap",
};

const noMatchCardStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 14,
  background: "#111418", border: "1px solid #2A3140", borderRadius: 14,
  padding: "16px 18px", marginBottom: 20, textDecoration: "none",
  transition: "border-color 0.2s",
};

const noMatchIconStyle: React.CSSProperties = {
  width: 44, height: 44, borderRadius: 12, flexShrink: 0,
  background: "rgba(201,168,76,0.1)", border: "1px solid rgba(201,168,76,0.25)",
  display: "flex", alignItems: "center", justifyContent: "center", color: "#C9A84C",
};

const statTabActiveStyle: React.CSSProperties = {
  padding: "7px 16px", borderRadius: 7, border: "none", fontSize: 12, fontWeight: 700,
  cursor: "pointer", background: "#C9A84C", color: "#0A0C0F", fontFamily: "inherit", whiteSpace: "nowrap",
};

const statTabInactiveStyle: React.CSSProperties = {
  padding: "7px 16px", borderRadius: 7, border: "none", fontSize: 12, fontWeight: 500,
  cursor: "pointer", background: "transparent", color: "#7A8399", fontFamily: "inherit", whiteSpace: "nowrap",
};

// ─── Auth Gate ────────────────────────────────────────────────────────────────
function AuthGate({ onSuccess }: { onSuccess: () => void }) {
  const [tab, setTab] = useState<"login" | "signup">("login");
  const { login, signup } = useAuth();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setError("");
    if (!phone || !password) { setError("Veuillez remplir tous les champs."); return; }
    setLoading(true);
    try {
      if (tab === "login") {
        await login(phone, password);
      } else {
        await signup(phone, password);
        trackEvent("Lead", generateEventId("lead"), { content_name: "Inscription Premium Picks", currency: "XAF" });
      }
      onSuccess();
    } catch {
      setError(tab === "login" ? "Identifiants incorrects. Réessayez." : "Impossible de créer le compte. Réessayez.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ marginBottom: 8 }}><IconLock /></div>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: "#C9A84C", letterSpacing: 2, marginBottom: 6 }}>Connexion requise</div>
        <div style={{ fontSize: 12, color: "#7A8399" }}>Connectez-vous pour débloquer ce pick premium</div>
      </div>
      <div style={{ display: "flex", borderBottom: "1px solid #2A3140", marginBottom: 20 }}>
        {(["login", "signup"] as const).map((t) => (
          <button key={t} onClick={() => { setTab(t); setError(""); }} style={{
            flex: 1, padding: "10px", background: "transparent", border: "none",
            fontSize: 10, letterSpacing: "2px", textTransform: "uppercase", fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit",
            color: tab === t ? "#C9A84C" : "#7A8399",
            borderBottom: tab === t ? "2px solid #C9A84C" : "2px solid transparent",
            transition: "all 0.2s",
          }}>
            {t === "login" ? "Connexion" : "Inscription"}
          </button>
        ))}
      </div>
      <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Numéro de téléphone" type="tel" style={S.input} />
      <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mot de passe" type="password"
        onKeyDown={(e) => e.key === "Enter" && handleSubmit()} style={{ ...S.input, marginBottom: 16 }} />
      {error && (
        <div style={{ fontSize: 12, color: "#EF4444", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, padding: "10px 12px", marginBottom: 14 }}>
          {error}
        </div>
      )}
      <button onClick={handleSubmit} disabled={loading} style={{ ...S.btnGold, opacity: loading ? 0.7 : 1, cursor: loading ? "not-allowed" : "pointer" }}>
        {loading ? "Chargement…" : tab === "login" ? "Se connecter" : "Créer un compte"}
      </button>
      <div style={{ textAlign: "center", fontSize: 11, color: "#7A8399", marginTop: 4 }}>
        {tab === "login" ? "Pas encore de compte ? " : "Déjà inscrit ? "}
        <span onClick={() => setTab(tab === "login" ? "signup" : "login")} style={{ color: "#C9A84C", cursor: "pointer", textDecoration: "underline" }}>
          {tab === "login" ? "S'inscrire" : "Se connecter"}
        </span>
      </div>
    </div>
  );
}

// ─── MoMo Payment Flow ────────────────────────────────────────────────────────
type PayStep = "form" | "processing" | "pending" | "success" | "failed" | "expired";

const MomoLogo = ({ op }: { op: "mtn" | "orange" }) => (
  <div style={{
    width: 44, height: 44, borderRadius: 10,
    background: op === "mtn" ? "#FFCD00" : "#FF6600",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontWeight: 900, color: op === "mtn" ? "#E31B23" : "#fff",
    fontSize: 11, letterSpacing: 1, flexShrink: 0,
  }}>
    {op === "mtn" ? "MTN" : "ORG"}
  </div>
);

export function SubscribePayment({ onSuccess, onBack }: { onSuccess: () => void; onBack: () => void }) {
  const { user } = useAuth();
  const [step, setStep] = useState<PayStep>("form");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [operator, setOperator] = useState<"mtn" | "orange">("mtn");
  const [transId, setTransId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [pollCount, setPollCount] = useState(0);
  const [monthlyPrice, setMonthlyPrice] = useState<number | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const MAX_POLLS = 40;

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/settings");
        const data = await res.json();
        if (data?.success && data?.data?.subscriptionMonthlyPrice) {
          setMonthlyPrice(data.data.subscriptionMonthlyPrice);
        }
      } catch { /* fall through */ }
    })();
  }, []);

  const clearPolling = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }, []);

  useEffect(() => {
    if (step === "success") {
      trackEvent("Purchase", `sub-purchase-${transId}`, { content_name: "Abonnement Mensuel", value: monthlyPrice ?? undefined, currency: "XAF" });
    }
  }, [step, transId, monthlyPrice]);

  const handlePay = async () => {
    const cleaned = phone.replace(/\s/g, "");
    if (!cleaned || cleaned.length < 9) return;
    setErrorMsg("");
    try {
      setStep("processing");
      const { fbc, fbp } = getFbCookies();
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: cleaned, fbc, fbp, sourceUrl: typeof window !== "undefined" ? window.location.href : undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setErrorMsg(data.error || "Le paiement a échoué. Réessayez."); setStep("form"); return; }
      trackEvent("InitiateCheckout", generateEventId("sub-checkout"), { content_name: "Abonnement Mensuel", value: monthlyPrice ?? undefined, currency: "XAF" });
      setTransId(data.transId);
      setStep("pending");
    } catch {
      setErrorMsg("Erreur réseau. Vérifiez votre connexion et réessayez.");
      setStep("form");
    }
  };

  useEffect(() => {
    if (!transId || step !== "pending") return;
    setPollCount(0);
    intervalRef.current = setInterval(async () => {
      setPollCount((c) => {
        if (c >= MAX_POLLS) { clearPolling(); setStep("expired"); return c; }
        return c + 1;
      });
      try {
        const res = await fetch(`/api/payment/status?transId=${transId}`);
        const data = await res.json();
        if (!data?.status) return;
        if (data.status === "SUCCESSFUL") { clearPolling(); setStep("success"); }
        else if (data.status === "FAILED") { clearPolling(); setErrorMsg("Paiement refusé par l'opérateur."); setStep("failed"); }
        else if (data.status === "EXPIRED") { clearPolling(); setErrorMsg("La session de paiement a expiré."); setStep("expired"); }
      } catch { /* keep polling */ }
    }, 3000);
    return clearPolling;
  }, [transId, step, clearPolling]);

  const priceLabel = monthlyPrice != null ? `${monthlyPrice.toLocaleString("fr-FR")} FCFA` : "…";

  // What unlocking one pronostic a day would cost over the same 30-day
  // stretch the subscription covers — the comparison a buyer actually cares
  // about, not just a bare price tag. Computed against the live
  // subscriptionMonthlyPrice (admin-configurable), not a hardcoded saving,
  // so this stays honest if that price ever changes.
  const DAILY_UNLOCK_REFERENCE_PRICE = 250;
  const monthlyIfPayingDaily = DAILY_UNLOCK_REFERENCE_PRICE * 30;
  const savings = monthlyPrice != null ? monthlyIfPayingDaily - monthlyPrice : null;

  if (step === "processing") return (
    <div style={{ textAlign: "center", padding: "32px 16px" }}>
      <Spinner size={48} style={{ margin: "0 auto 20px" }} />
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color: "#C9A84C", letterSpacing: 2, marginBottom: 8 }}>Initialisation du paiement…</div>
      <div style={{ fontSize: 12, color: "#7A8399", lineHeight: 1.6 }}>Connexion à {operator === "mtn" ? "MTN MoMo" : "Orange Money"} en cours.<br />Veuillez patienter.</div>
    </div>
  );

  if (step === "pending") {
    const secondsLeft = Math.max(0, (MAX_POLLS - pollCount) * 3);
    const minutes = Math.floor(secondsLeft / 60);
    const seconds = secondsLeft % 60;
    return (
      <div style={{ textAlign: "center", padding: "24px 16px" }}>
        <div style={{ marginBottom: 20 }}><IconPhone /></div>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: "#C9A84C", letterSpacing: 2, marginBottom: 12 }}>Confirmez sur votre téléphone</div>
        <div style={{ fontSize: 13, color: "#E8EAF0", marginBottom: 8, lineHeight: 1.7 }}>
          Une notification a été envoyée au<br />
          <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "#C9A84C", fontWeight: 700 }}>+237 {phone}</span>
        </div>
        <div style={{ fontSize: 12, color: "#7A8399", marginBottom: 24, lineHeight: 1.6 }}>
          Confirmez le paiement de <strong style={{ color: "#E8EAF0" }}>{priceLabel}</strong> pour votre abonnement mensuel.
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 20 }}>
          {[0, 0.4, 0.8].map((delay) => (
            <div key={delay} style={{ width: 8, height: 8, borderRadius: "50%", background: "#C9A84C", animation: `pulse 1.2s ease-in-out ${delay}s infinite` }} />
          ))}
        </div>
        <div style={{ fontSize: 11, color: "#3A4455", marginBottom: 24 }}>Expiration dans {minutes}:{seconds.toString().padStart(2, "0")}</div>
        <button onClick={() => { clearPolling(); setStep("form"); setTransId(null); }} style={{ ...S.btnGhost, fontSize: 12 }}>Annuler</button>
      </div>
    );
  }

  if (step === "success") return (
    <div style={{ textAlign: "center", padding: "32px 16px", animation: "scaleIn 0.3s ease" }}>
      <div style={{ marginBottom: 20 }}><IconSuccess /></div>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, color: "#22C55E", letterSpacing: 2, marginBottom: 12 }}>Abonnement activé !</div>
      <div style={{ fontSize: 13, color: "#E8EAF0", marginBottom: 8, lineHeight: 1.7 }}>
        Votre paiement de <span style={{ color: "#22C55E", fontWeight: 700 }}>{priceLabel}</span> a été confirmé.
      </div>
      <div style={{ fontSize: 12, color: "#7A8399", marginBottom: 28, lineHeight: 1.6 }}>Vous avez maintenant accès à tous les picks pendant 30 jours.</div>
      <button onClick={onSuccess} style={S.btnGold}>Voir tous les picks →</button>
    </div>
  );

  if (step === "failed" || step === "expired") {
    const isExpired = step === "expired";
    return (
      <div style={{ textAlign: "center", padding: "32px 16px", animation: "scaleIn 0.3s ease" }}>
        <div style={{ marginBottom: 20 }}><IconFail /></div>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, color: "#EF4444", letterSpacing: 2, marginBottom: 12 }}>
          {isExpired ? "Session expirée" : "Paiement échoué"}
        </div>
        <div style={{ fontSize: 13, color: "#E8EAF0", marginBottom: 8, lineHeight: 1.7 }}>
          {errorMsg || (isExpired ? "La session a expiré avant la confirmation." : "Le paiement n'a pas pu être traité.")}
        </div>
        <button onClick={() => { setStep("form"); setTransId(null); setErrorMsg(""); }} style={S.btnGold}>Réessayer</button>
        <button onClick={onBack} style={S.btnGhost}>Annuler</button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ background: "rgba(201,168,76,0.05)", border: "1px solid rgba(201,168,76,0.15)", borderRadius: 10, padding: "12px 14px", marginBottom: 20 }}>
        <div style={{ fontSize: 13, color: "#E8EAF0", fontWeight: 600, marginBottom: 10 }}>Abonnement Mensuel</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, color: "#E8EAF0", lineHeight: 1.5 }}>
            <span style={{ marginTop: 2, flexShrink: 0 }}><IconCheck size={13} /></span>
            Accès illimité à tous les pronostics pendant 30 jours — plus besoin de débloquer un par un.
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, color: "#E8EAF0", lineHeight: 1.5 }}>
            <span style={{ marginTop: 2, flexShrink: 0 }}><IconCheck size={13} /></span>
            Accès complet à Pronostic IA — tous les marchés débloqués, sans restriction.
          </div>
        </div>

        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: "#C9A84C", marginBottom: savings && savings > 0 ? 10 : 0 }}>
          {priceLabel}<span style={{ fontSize: 12, color: "#7A8399", fontFamily: "'DM Sans', sans-serif" }}> / mois</span>
        </div>

        {savings != null && savings > 0 && (
          <div style={{ fontSize: 11.5, color: "#22C55E", background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 8, padding: "8px 10px", lineHeight: 1.5 }}>
            💰 Économisez <strong>{savings.toLocaleString("fr-FR")} FCFA</strong> par mois par rapport à débloquer un pronostic à {DAILY_UNLOCK_REFERENCE_PRICE} FCFA chaque jour ({monthlyIfPayingDaily.toLocaleString("fr-FR")} FCFA/mois).
          </div>
        )}
      </div>
      {errorMsg && <div style={{ fontSize: 12, color: "#EF4444", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, padding: "10px 12px", marginBottom: 14 }}>{errorMsg}</div>}
      <div style={{ fontSize: 9, letterSpacing: "2px", textTransform: "uppercase", color: "#7A8399", fontWeight: 600, marginBottom: 8 }}>Opérateur Mobile Money</div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        {(["mtn", "orange"] as const).map((op) => (
          <button key={op} onClick={() => setOperator(op)} style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 10, cursor: "pointer", background: operator === op ? "rgba(201,168,76,0.07)" : "#1A1F26", border: operator === op ? "1px solid #C9A84C" : "1px solid #2A3140", transition: "all 0.2s" }}>
            <MomoLogo op={op} />
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#E8EAF0" }}>{op === "mtn" ? "MTN MoMo" : "Orange Money"}</div>
              <div style={{ fontSize: 10, color: "#7A8399" }}>{op === "mtn" ? "6 / 7 / 8XX" : "6 / 9XX"}</div>
            </div>
            {operator === op && <div style={{ marginLeft: "auto", flexShrink: 0 }}><IconCheck size={14} /></div>}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 9, letterSpacing: "2px", textTransform: "uppercase", color: "#7A8399", fontWeight: 600, marginBottom: 8 }}>Numéro de téléphone</div>
      <div style={{ position: "relative", marginBottom: 20 }}>
        <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "#7A8399", fontWeight: 600, pointerEvents: "none" }}>+237</span>
        <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^0-9\s]/g, ""))} placeholder="6XX XXX XXX" maxLength={12} style={{ ...S.input, paddingLeft: 54, marginBottom: 0 }} />
      </div>
      <button onClick={handlePay} disabled={!phone || phone.replace(/\s/g, "").length < 9 || monthlyPrice == null}
        style={{ ...S.btnGold, opacity: (!phone || phone.replace(/\s/g, "").length < 9 || monthlyPrice == null) ? 0.45 : 1, cursor: (!phone || phone.replace(/\s/g, "").length < 9 || monthlyPrice == null) ? "not-allowed" : "pointer" }}>
        S&apos;abonner — {priceLabel}
      </button>
      <button onClick={onBack} style={S.btnGhost}>Annuler</button>
    </div>
  );
}

export function MomoPayment({ pick, onSuccess, onBack }: { pick: Pick; onSuccess: () => void; onBack: () => void }) {
  const { user } = useAuth();
  const [step, setStep] = useState<PayStep>("form");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [operator, setOperator] = useState<"mtn" | "orange">("mtn");
  const [transId, setTransId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [pollCount, setPollCount] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const MAX_POLLS = 40;

  const clearPolling = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }, []);

  useEffect(() => {
    if (step === "success") {
      trackEvent("Purchase", `purchase-${transId}`, { content_name: pick.title, value: pick.price, currency: "XAF" });
    }
  }, [step, transId, pick.title, pick.price]);

  const handlePay = async () => {
    const cleaned = phone.replace(/\s/g, "");
    if (!cleaned || cleaned.length < 9) return;
    setErrorMsg("");
    try {
      setStep("processing");
      const { fbc, fbp } = getFbCookies();
      const res = await fetch("/api/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pickId: pick._id, phone: cleaned, fbc, fbp, sourceUrl: typeof window !== "undefined" ? window.location.href : undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setErrorMsg(data.error || "Le paiement a échoué. Réessayez."); setStep("form"); return; }
      trackEvent("InitiateCheckout", generateEventId("checkout"), { content_name: pick.title, value: pick.price, currency: "XAF" });
      setTransId(data.transId);
      setStep("pending");
    } catch {
      setErrorMsg("Erreur réseau. Vérifiez votre connexion et réessayez.");
      setStep("form");
    }
  };

  useEffect(() => {
    if (!transId || step !== "pending") return;
    setPollCount(0);
    intervalRef.current = setInterval(async () => {
      setPollCount((c) => {
        if (c >= MAX_POLLS) { clearPolling(); setStep("expired"); return c; }
        return c + 1;
      });
      try {
        const res = await fetch(`/api/payment/status?transId=${transId}`);
        const data = await res.json();
        if (!data?.status) return;
        if (data.status === "SUCCESSFUL") { clearPolling(); setStep("success"); }
        else if (data.status === "FAILED") { clearPolling(); setErrorMsg("Paiement refusé par l'opérateur."); setStep("failed"); }
        else if (data.status === "EXPIRED") { clearPolling(); setErrorMsg("La session de paiement a expiré."); setStep("expired"); }
      } catch { /* keep polling */ }
    }, 3000);
    return clearPolling;
  }, [transId, step, clearPolling]);

  const PickSummary = () => {
    const meta = pick.tier ? TIER_META[pick.tier] : null;
    return (
      <div style={{ background: "rgba(201,168,76,0.05)", border: "1px solid rgba(201,168,76,0.15)", borderRadius: 10, padding: "12px 14px", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
              <span style={{ fontSize: 9, letterSpacing: "2px", textTransform: "uppercase", color: "#7A8399" }}>{pick.league}</span>
              {meta && <span style={{ fontSize: 9, color: "#C9A84C", background: "rgba(201,168,76,0.08)", border: "1px solid rgba(201,168,76,0.25)", padding: "2px 7px", borderRadius: 3, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase" }}>{meta.label}</span>}
            </div>
            <div style={{ fontSize: 13, color: "#E8EAF0", fontWeight: 600, lineHeight: 1.3 }}>{pick.title}</div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: "#C9A84C", letterSpacing: 1 }}>x{pick.total_odds}</div>
            <div style={{ fontSize: 11, color: "#C9A84C", fontWeight: 600 }}>{pick.price.toLocaleString("fr-FR")} FCFA</div>
          </div>
        </div>
      </div>
    );
  };

  if (step === "processing") return (
    <div style={{ textAlign: "center", padding: "32px 16px" }}>
      <Spinner size={48} style={{ margin: "0 auto 20px" }} />
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color: "#C9A84C", letterSpacing: 2, marginBottom: 8 }}>Initialisation du paiement…</div>
      <div style={{ fontSize: 12, color: "#7A8399", lineHeight: 1.6 }}>Connexion à {operator === "mtn" ? "MTN MoMo" : "Orange Money"} en cours.<br />Veuillez patienter.</div>
    </div>
  );

  if (step === "pending") {
    const secondsLeft = Math.max(0, (MAX_POLLS - pollCount) * 3);
    const minutes = Math.floor(secondsLeft / 60);
    const seconds = secondsLeft % 60;
    return (
      <div style={{ textAlign: "center", padding: "24px 16px" }}>
        <div style={{ marginBottom: 20 }}><IconPhone /></div>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: "#C9A84C", letterSpacing: 2, marginBottom: 12 }}>Confirmez sur votre téléphone</div>
        <div style={{ fontSize: 13, color: "#E8EAF0", marginBottom: 8, lineHeight: 1.7 }}>
          Une notification a été envoyée au<br />
          <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "#C9A84C", fontWeight: 700 }}>+237 {phone}</span>
        </div>
        <div style={{ fontSize: 12, color: "#7A8399", marginBottom: 24, lineHeight: 1.6 }}>
          Ouvrez votre application {operator === "mtn" ? "MTN MoMo" : "Orange Money"} et confirmez le paiement de{" "}
          <strong style={{ color: "#E8EAF0" }}>{pick.price.toLocaleString("fr-FR")} FCFA</strong>.
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 20 }}>
          {[0, 0.4, 0.8].map((delay) => (
            <div key={delay} style={{ width: 8, height: 8, borderRadius: "50%", background: "#C9A84C", animation: `pulse 1.2s ease-in-out ${delay}s infinite` }} />
          ))}
        </div>
        <div style={{ fontSize: 11, color: "#3A4455", marginBottom: 24 }}>Expiration dans {minutes}:{seconds.toString().padStart(2, "0")}</div>
        <div style={{ background: "rgba(201,168,76,0.04)", border: "1px dashed rgba(201,168,76,0.2)", borderRadius: 8, padding: 12, marginBottom: 16, textAlign: "left" }}>
          <div style={{ fontSize: 11, color: "#7A8399", lineHeight: 1.7 }}>
            <div>① Ouvrez l&apos;app {operator === "mtn" ? "MTN MoMo" : "Orange Money"}</div>
            <div>② Acceptez la demande de paiement</div>
            <div>③ Entrez votre code PIN</div>
          </div>
        </div>
        <button onClick={() => { clearPolling(); setStep("form"); setTransId(null); }} style={{ ...S.btnGhost, fontSize: 12 }}>Annuler le paiement</button>
      </div>
    );
  }

  if (step === "success") return (
    <div style={{ textAlign: "center", padding: "32px 16px", animation: "scaleIn 0.3s ease" }}>
      <div style={{ marginBottom: 20 }}><IconSuccess /></div>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, color: "#22C55E", letterSpacing: 2, marginBottom: 12 }}>Paiement réussi !</div>
      <div style={{ fontSize: 13, color: "#E8EAF0", marginBottom: 8, lineHeight: 1.7 }}>
        Votre paiement de <span style={{ color: "#22C55E", fontWeight: 700 }}>{pick.price.toLocaleString("fr-FR")} FCFA</span> a été confirmé.
      </div>
      <div style={{ fontSize: 12, color: "#7A8399", marginBottom: 28, lineHeight: 1.6 }}>Le pick <strong style={{ color: "#E8EAF0" }}>{pick.title}</strong> est maintenant débloqué.</div>
      <button onClick={onSuccess} style={S.btnGold}>Voir le Pick →</button>
    </div>
  );

  if (step === "failed" || step === "expired") {
    const isExpired = step === "expired";
    return (
      <div style={{ textAlign: "center", padding: "32px 16px", animation: "scaleIn 0.3s ease" }}>
        <div style={{ marginBottom: 20 }}><IconFail /></div>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, color: "#EF4444", letterSpacing: 2, marginBottom: 12 }}>
          {isExpired ? "Session expirée" : "Paiement échoué"}
        </div>
        <div style={{ fontSize: 13, color: "#E8EAF0", marginBottom: 8, lineHeight: 1.7 }}>
          {errorMsg || (isExpired ? "La session a expiré avant la confirmation." : "Le paiement n'a pas pu être traité.")}
        </div>
        <div style={{ fontSize: 12, color: "#7A8399", marginBottom: 28, lineHeight: 1.6 }}>
          {isExpired ? "Relancez une nouvelle tentative si vous souhaitez débloquer ce pick." : "Vérifiez votre solde ou essayez avec un autre numéro."}
        </div>
        <div style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 8, padding: "10px 14px", marginBottom: 20, textAlign: "left" }}>
          <div style={{ fontSize: 11, color: "#7A8399", lineHeight: 1.7 }}>
            <div style={{ color: "#EF4444", fontWeight: 600, marginBottom: 4, fontSize: 10, letterSpacing: "1px", textTransform: "uppercase" }}>Causes possibles</div>
            <div>• Solde insuffisant</div><div>• Mauvais code PIN entré</div>
            <div>• Demande refusée ou ignorée</div><div>• Réseau mobile instable</div>
          </div>
        </div>
        <button onClick={() => { setStep("form"); setTransId(null); setErrorMsg(""); }} style={S.btnGold}>Réessayer</button>
        <button onClick={onBack} style={S.btnGhost}>Annuler</button>
      </div>
    );
  }

  return (
    <div>
      <PickSummary />
      {errorMsg && <div style={{ fontSize: 12, color: "#EF4444", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, padding: "10px 12px", marginBottom: 14 }}>{errorMsg}</div>}
      <div style={{ fontSize: 9, letterSpacing: "2px", textTransform: "uppercase", color: "#7A8399", fontWeight: 600, marginBottom: 8 }}>Opérateur Mobile Money</div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        {(["mtn", "orange"] as const).map((op) => (
          <button key={op} onClick={() => setOperator(op)} style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 10, cursor: "pointer", background: operator === op ? "rgba(201,168,76,0.07)" : "#1A1F26", border: operator === op ? "1px solid #C9A84C" : "1px solid #2A3140", transition: "all 0.2s" }}>
            <MomoLogo op={op} />
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#E8EAF0" }}>{op === "mtn" ? "MTN MoMo" : "Orange Money"}</div>
              <div style={{ fontSize: 10, color: "#7A8399" }}>{op === "mtn" ? "6 / 7 / 8XX" : "6 / 9XX"}</div>
            </div>
            {operator === op && <div style={{ marginLeft: "auto", flexShrink: 0 }}><IconCheck size={14} /></div>}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 9, letterSpacing: "2px", textTransform: "uppercase", color: "#7A8399", fontWeight: 600, marginBottom: 8 }}>Numéro de téléphone</div>
      <div style={{ position: "relative", marginBottom: 16 }}>
        <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "#7A8399", fontWeight: 600, pointerEvents: "none" }}>+237</span>
        <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^0-9\s]/g, ""))} placeholder="6XX XXX XXX" maxLength={12} style={{ ...S.input, paddingLeft: 54, marginBottom: 0 }} />
      </div>
      <div style={{ background: "rgba(201,168,76,0.04)", border: "1px dashed rgba(201,168,76,0.2)", borderRadius: 8, padding: 12, marginBottom: 20, display: "flex", gap: 10, alignItems: "flex-start" }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
          <circle cx="8" cy="8" r="7" stroke="#C9A84C" strokeWidth="1.2" />
          <path d="M8 7v4M8 5v1" stroke="#C9A84C" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <div style={{ fontSize: 11, color: "#7A8399", lineHeight: 1.6 }}>Vous recevrez une notification push sur votre téléphone pour confirmer le paiement. Assurez-vous que votre solde est suffisant.</div>
      </div>
      <button onClick={handlePay} disabled={!phone || phone.replace(/\s/g, "").length < 9}
        style={{ ...S.btnGold, opacity: !phone || phone.replace(/\s/g, "").length < 9 ? 0.45 : 1, cursor: !phone || phone.replace(/\s/g, "").length < 9 ? "not-allowed" : "pointer" }}>
        Payer {pick.price.toLocaleString("fr-FR")} FCFA
      </button>
      <button onClick={onBack} style={S.btnGhost}>Annuler</button>
    </div>
  );
}

// ─── Pick Card ────────────────────────────────────────────────────────────────
const borderColors = { WIN: "#22C55E", LOSS: "#EF4444", PENDING: "#C9A84C", REFUNDED: "#3B82F6" };

function PickCard({ pick, onSelect }: { pick: Pick; onSelect: (p: Pick) => void }) {
  const { user, hasActiveSubscription } = useAuth();
  const isPending = pick.outcome === "PENDING";
  const isSubscribed = hasActiveSubscription();
  const isUnlocked = isSubscribed || user?.unlockedPickIds?.includes(pick._id);
  const tierMeta = pick.tier ? TIER_META[pick.tier] : null;
  const countdown = useCountdown(isPending ? pick.match_date : null);
  // Only meaningful when the combo itself isn't already REFUNDED (every
  // leg voided) — that case is already fully conveyed by OutcomeBadge.
  const refundedLegs = pick.outcome !== "REFUNDED" ? refundedLegCount(pick) : 0;

  return (
    <div
      onClick={() => onSelect(pick)}
      style={{ background: "#1A1F26", border: "1px solid #2A3140", borderLeft: `3px solid ${borderColors[pick.outcome]}`, borderRadius: 12, marginBottom: 10, overflow: "hidden", cursor: "pointer", transition: "border-color 0.2s" }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.borderColor = "#3A4455")}
      onMouseLeave={(e) => { const el = e.currentTarget as HTMLDivElement; el.style.border = "1px solid #2A3140"; el.style.borderLeft = `3px solid ${borderColors[pick.outcome]}`; }}
    >
      {tierMeta && (
        <div style={{ background: "rgba(201,168,76,0.06)", borderBottom: "1px solid #2A3140", padding: "6px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 9, letterSpacing: "2px", textTransform: "uppercase", color: "#C9A84C", fontWeight: 700 }}>Combo {tierMeta.label}</span>
          <span style={{ fontSize: 9, color: "#7A8399" }}>{tierMeta.desc}</span>
        </div>
      )}
      <div style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 9, letterSpacing: "1.5px", textTransform: "uppercase", fontWeight: 600, background: "#222830", border: "1px solid #2A3140", color: "#7A8399", padding: "3px 8px", borderRadius: 4, whiteSpace: "nowrap" }}>
            {pick.league}
          </span>
          {countdown && isPending && !isUnlocked && (
            <span style={{ fontSize: 9, letterSpacing: "1px", fontWeight: 700, color: "#EF4444", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", padding: "3px 8px", borderRadius: 4, whiteSpace: "nowrap" }}>
              Coup d&apos;envoi dans {countdown}
            </span>
          )}
          {refundedLegs > 0 && <PartialRefundChip count={refundedLegs} />}
          <OutcomeBadge outcome={pick.outcome} />
        </div>
        <div style={{ fontSize: "clamp(13px, 3.5vw, 15px)", fontWeight: 600, color: "#E8EAF0", lineHeight: 1.4, marginBottom: 10, wordBreak: "break-word" }}>
          {pick.title}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid #2A3140", paddingTop: 12, gap: 8, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
            <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(20px, 6vw, 26px)", color: "#C9A84C", letterSpacing: 1 }}>x{pick.total_odds}</span>
            <span style={{ fontSize: 9, color: "#7A8399", textTransform: "uppercase", letterSpacing: "1px" }}>cotes</span>
          </div>
          <span style={{ fontSize: 11, color: "#7A8399", whiteSpace: "nowrap" }}>
            {pick.matches.length} match{pick.matches.length > 1 ? "es" : ""}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); onSelect(pick); }}
            style={{
              fontSize: 10, letterSpacing: "1.5px", textTransform: "uppercase", fontWeight: 700,
              padding: "8px 12px", borderRadius: 6, border: "none", cursor: "pointer",
              fontFamily: "inherit", transition: "all 0.15s", whiteSpace: "nowrap", flexShrink: 0,
              ...(isPending && !isUnlocked
                ? { background: "#C9A84C", color: "#0A0C0F" }
                : { background: "#222830", color: "#E8EAF0", border: "1px solid #2A3140" }),
            }}
          >
            {isPending && !isUnlocked ? `Débloquer — ${pick.price.toLocaleString("fr-FR")} FCFA` : "Voir détails"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Date Section ─────────────────────────────────────────────────────────────
function DateSection({ date, picks, onSelect }: { date: string; picks: Pick[]; onSelect: (p: Pick) => void }) {
  const sorted = [...picks].sort((a, b) => {
    const tierOrder: Record<string, number> = { safe: 0, value: 1, bold: 2 };
    const ta = tierOrder[a.tier ?? ""] ?? 3;
    const tb = tierOrder[b.tier ?? ""] ?? 3;
    if (ta !== tb) return ta - tb;
    return b.total_odds - a.total_odds;
  });
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 10, letterSpacing: "2px", textTransform: "uppercase", color: "#7A8399", fontWeight: 500, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 4, height: 4, background: "#C9A84C", borderRadius: "50%", flexShrink: 0, display: "inline-block" }} />
        {formatDate(date)}
      </div>
      {sorted.map((p) => <PickCard key={p._id} pick={p} onSelect={onSelect} />)}
    </div>
  );
}

// A day inside a week's breakdown that has no pick at all — rendered
// instead of just silently skipping the day, so a week with 2 picks reads
// as "2 posted, 5 quiet days" rather than looking like it only ever had 2
// days. Deliberately quiet/desaturated (dashed border, muted icon) so it
// never competes visually with an actual pick card next to it.
function BlankDateRow({ date }: { date: string }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 10, letterSpacing: "2px", textTransform: "uppercase", color: "#4A5568", fontWeight: 500, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 4, height: 4, background: "#3A4455", borderRadius: "50%", flexShrink: 0, display: "inline-block" }} />
        {formatDate(date)}
      </div>
      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: "12px 14px",
        border: "1px dashed #2A3140", borderRadius: 10, color: "#4A5568", fontSize: 12,
      }}>
        <PiCalendarXBold size={15} />
        Aucun pronostic publié ce jour-là
      </div>
    </div>
  );
}

// Today's slot in Picks Récents when nothing's been posted yet — same
// date-heading shape as BlankDateRow, but the box underneath is the actual
// Pronostic IA nudge (gold, clickable) instead of a muted "nothing here"
// notice, since today — unlike a past blank day — is still actionable.
function TodayNudgeRow({ date }: { date: string }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 10, letterSpacing: "2px", textTransform: "uppercase", color: "#C9A84C", fontWeight: 500, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 4, height: 4, background: "#C9A84C", borderRadius: "50%", flexShrink: 0, display: "inline-block" }} />
        {formatDate(date)}
      </div>
      <Link href="/pronostic" style={{ ...noMatchCardStyle, marginBottom: 0 }}>
        <span style={noMatchIconStyle}><PiSparkleFill size={22} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 17, letterSpacing: 1, color: "#E8EAF0", marginBottom: 3 }}>
            Pronostics pas encore disponibles
          </div>
          <div style={{ fontSize: 11.5, color: "#7A8399", lineHeight: 1.4 }}>
            Envie de parier quand même ? Essaie notre générateur Pronostic IA.
          </div>
        </div>
        <PiCaretRightBold size={16} color="#7A8399" style={{ flexShrink: 0 }} />
      </Link>
    </div>
  );
}

const WEEKS_PAGE_SIZE = 4;

// ─── Week Calendar ────────────────────────────────────────────────────────────
// Everything before the current week, one row per week, newest first —
// replaces the old 30-day pagination + history-accordion split with a
// single browsable list. Collapsed by default; only one week open at a
// time, same accordion mechanics the old history toggle used. Paginated
// 4 weeks at a time so a long-running site doesn't dump its whole history
// on the page at once.
function WeekCalendar({ picks, onSelect }: { picks: Pick[]; onSelect: (p: Pick) => void }) {
  const [openWeekKey, setOpenWeekKey] = useState<string | null>(null);
  const [visibleWeeks, setVisibleWeeks] = useState(WEEKS_PAGE_SIZE);

  const weeks = useMemo(() => {
    const groups: Record<string, Pick[]> = {};
    picks.forEach((p) => {
      const key = getWeekKey(p.match_date);
      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
    });
    return Object.keys(groups)
      .sort()
      .reverse()
      .map((weekKey) => ({ weekKey, picks: groups[weekKey], record: computeRecord(groups[weekKey]) }));
  }, [picks]);

  // Reset back to the first page whenever the underlying pick list changes
  // identity — i.e. the buyer picked a different filter upstream.
  useEffect(() => { setVisibleWeeks(WEEKS_PAGE_SIZE); }, [picks]);

  if (weeks.length === 0) return null;

  const visible = weeks.slice(0, visibleWeeks);
  const hasMore = visibleWeeks < weeks.length;
  const remaining = Math.min(WEEKS_PAGE_SIZE, weeks.length - visibleWeeks);

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9, letterSpacing: "3px", color: "#7A8399", textTransform: "uppercase", fontWeight: 600, whiteSpace: "nowrap" }}>
          <PiCalendarBlankBold size={12} /> Semaines précédentes
        </span>
        <div style={{ flex: 1, height: 1, background: "#2A3140" }} />
      </div>

      <div style={{ position: "relative" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {visible.map(({ weekKey, picks: weekPicks, record }) => {
          const open = openWeekKey === weekKey;
          const grouped = groupByDate(weekPicks);
          return (
            <div key={weekKey} style={{ border: "1px solid #2A3140", borderRadius: 12, background: "#1A1F26", overflow: "hidden" }}>
              <button
                onClick={() => setOpenWeekKey(open ? null : weekKey)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 14, padding: "14px 16px",
                  background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                }}
              >
                <WinRateRing rate={record.winRate} size={44} stroke={4} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#E8EAF0", marginBottom: 4 }}>
                    Semaine du {formatWeekRange(weekKey)}
                  </div>
                  {/* Form strip — one dot per graded/refunded pick, oldest to newest */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {[...weekPicks]
                      .sort((a, b) => a.match_date.localeCompare(b.match_date))
                      .map((p) => (
                        <span
                          key={p._id}
                          title={p.outcome}
                          style={{
                            width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
                            background: p.outcome === "WIN" ? "#22C55E" : p.outcome === "LOSS" ? "#EF4444" : p.outcome === "REFUNDED" ? "#3B82F6" : "#3A4455",
                          }}
                        />
                      ))}
                  </div>
                </div>

                <div style={{ fontSize: 11, color: "#7A8399", flexShrink: 0, whiteSpace: "nowrap" }}>
                  {record.graded > 0 ? `${record.wins}G · ${record.losses}P` : `${weekPicks.length} pick${weekPicks.length > 1 ? "s" : ""}`}
                </div>

                <IconChevron open={open} />
              </button>

              {open && (
                <div style={{ padding: "0 16px 16px", animation: "fadeIn 0.2s ease" }}>
                  {/* Every day of the week, not just the ones with a pick —
                      a quiet day still shows, just as a blank-date row. */}
                  {getWeekDayKeys(weekKey).reverse().map((date) => (
                    grouped[date]
                      ? <DateSection key={date} date={date} picks={grouped[date]} onSelect={onSelect} />
                      : <BlankDateRow key={date} date={date} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {hasMore && (
        <>
          {/* Fade the last visible week out toward the page background,
              hinting there's more beneath it, instead of a hard stop. */}
          <div style={weekFadeStyle} />
          <div style={{ display: "flex", justifyContent: "center", marginTop: -14, position: "relative" }}>
            <button
              onClick={() => setVisibleWeeks((c) => c + WEEKS_PAGE_SIZE)}
              style={loadMoreWeeksStyle}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#C9A84C"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 8px 24px rgba(201,168,76,0.15)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#2A3140"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "none"; }}
            >
              <WeekLoadDial progress={visible.length / weeks.length} />
              <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.3 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#E8EAF0" }}>
                  Encore {remaining} semaine{remaining > 1 ? "s" : ""}
                </span>
                <span style={{ fontSize: 10, color: "#7A8399" }}>
                  {visible.length} / {weeks.length} affichées
                </span>
              </span>
            </button>
          </div>
        </>
      )}
      </div>
    </div>
  );
}

// A tiny "reveal progress" dial — deliberately not the WinRateRing (that
// motif means win rate specifically); same gold-gradient stroke language,
// but the fill here tracks how much of the week history is on screen, and
// a chevron sits in the center instead of a percentage.
function WeekLoadDial({ progress }: { progress: number }) {
  const size = 34, stroke = 3, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return (
    <span style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#2A3140" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="url(#weekLoadGradient)" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - progress)}
          style={{ transition: "stroke-dashoffset 0.4s ease" }}
        />
        <defs>
          <linearGradient id="weekLoadGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#E8C97A" />
            <stop offset="100%" stopColor="#C9A84C" />
          </linearGradient>
        </defs>
      </svg>
      <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#C9A84C" }}>
        <PiCaretDownBold size={13} />
      </span>
    </span>
  );
}

const weekFadeStyle: React.CSSProperties = {
  height: 40, marginTop: -40, position: "relative",
  background: "linear-gradient(to bottom, rgba(10,12,15,0), #0A0C0F)",
  pointerEvents: "none",
};

const loadMoreWeeksStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 12,
  background: "#111418", border: "1px solid #2A3140", borderRadius: 999,
  padding: "8px 20px 8px 8px", cursor: "pointer", fontFamily: "inherit",
  transition: "transform 0.2s ease, border-color 0.2s, box-shadow 0.2s",
};

// ─── Locked Predictions ───────────────────────────────────────────────────────
function LockedPredictions({ pick, onUnlock }: { pick: Pick; onUnlock: () => void }) {
  return (
    <div style={{ position: "relative" }}>
      {pick.matches.map((m, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0", borderBottom: "1px solid #2A3140", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: "#E8EAF0", lineHeight: 1.4 }}>
            {m.home} vs {m.away}
            {m.kickoff && <span style={{ color: "#7A8399", fontSize: 12 }}> · {m.kickoff}</span>}
            <span style={{ color: "#7A8399" }}> | </span>
            <span style={{ display: "inline-block", filter: "blur(4px)", userSelect: "none", color: "#C9A84C", fontWeight: 700 }}>{m.tip}</span>
          </div>
          <div style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(201,168,76,0.1)", flexShrink: 0 }} />
        </div>
      ))}
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "linear-gradient(to bottom, rgba(17,20,24,0) 0%, rgba(17,20,24,0.85) 35%, rgba(17,20,24,0.97) 100%)", gap: 12, padding: "20px 16px" }}>
        <div style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(201,168,76,0.1)", border: "1px solid rgba(201,168,76,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <IconLock />
        </div>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: "#C9A84C", letterSpacing: 2, textAlign: "center" }}>Pronostics verrouillés</div>
        <div style={{ fontSize: 12, color: "#7A8399", textAlign: "center", lineHeight: 1.5, maxWidth: 240 }}>
          Vous voyez déjà les {pick.matches.length} match{pick.matches.length > 1 ? "s" : ""} — débloquez pour révéler les pronostics et cotes.
        </div>
        <button onClick={onUnlock} style={{ ...S.btnGold, width: "auto", padding: "12px 28px", fontSize: 14, marginBottom: 0, letterSpacing: 1.5 }}>
          Débloquer — {pick.price.toLocaleString("fr-FR")} FCFA
        </button>
      </div>
    </div>
  );
}

// ─── Prediction Row ───────────────────────────────────────────────────────────
function PredictionRow({ match }: { match: Match }) {
  return (
    <div style={{ padding: "14px 0", borderBottom: "1px solid #2A3140" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: "#E8EAF0", lineHeight: 1.4 }}>
          {match.home} vs {match.away}
          {match.kickoff && <span style={{ color: "#7A8399", fontSize: 12 }}> · {match.kickoff}</span>}
          <span style={{ color: "#7A8399" }}> | </span>
          <span style={{ color: "#C9A84C", fontWeight: 700 }}>{match.tip}</span>
          {match.odd != null && (
            <><span style={{ color: "#7A8399" }}> | </span><span style={{ color: "#7A8399" }}>{match.odd}</span></>
          )}
        </div>
        <div style={{ width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: match.outcome === "WIN" ? "rgba(34,197,94,0.12)" : match.outcome === "LOSS" ? "rgba(239,68,68,0.12)" : match.outcome === "REFUNDED" ? "rgba(59,130,246,0.12)" : "rgba(201,168,76,0.1)" }}>
          {match.outcome === "WIN" && <IconCheck />}
          {match.outcome === "LOSS" && <IconX />}
          {match.outcome === "REFUNDED" && <IconRefund />}
          {match.outcome === "PENDING" && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#C9A84C" }} />}
        </div>
      </div>
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────
type ModalView = "detail" | "auth" | "payment";

function Modal({ pick, onClose }: { pick: Pick; onClose: () => void }) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const { user, refreshUser, hasActiveSubscription } = useAuth();
  const isPending = pick.outcome === "PENDING";
  const isSubscribed = hasActiveSubscription();
  const isAlreadyUnlocked = isSubscribed || (user?.unlockedPickIds?.includes(pick._id) ?? false);

  useEffect(() => {
    trackEvent("ViewContent", generateEventId("view"), { content_name: pick.title, content_type: "product", value: pick.price, currency: "XAF" });
  }, [pick._id]);

  const getInitialView = (): ModalView => {
    if (!isPending) return "detail";
    if (isAlreadyUnlocked) return "detail";
    if (!user) return "auth";
    return "payment";
  };

  const [view, setView] = useState<ModalView>(getInitialView);
  useEffect(() => { if (view === "auth" && user) setView("payment"); }, [user, view]);
  useEffect(() => { if (view === "detail" && isPending && !isAlreadyUnlocked) setView(user ? "payment" : "auth"); }, [view, isPending, isAlreadyUnlocked, user]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const handlePaymentSuccess = async () => { await refreshUser(); setView("detail"); };
  const canViewPredictions = !isPending || isAlreadyUnlocked;

  return (
    <div ref={overlayRef} onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 1200, backdropFilter: "blur(4px)" }}>
      <div style={{ background: "#111418", border: "1px solid #2A3140", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 600, padding: "24px 20px 40px", position: "relative", maxHeight: "90vh", overflowY: "auto", animation: "slideUp 0.3s cubic-bezier(0.32,0.72,0,1)" }}>
        <div style={{ width: 40, height: 4, background: "#3A4455", borderRadius: 2, margin: "0 auto 20px" }} />
        <button onClick={onClose} style={{ position: "absolute", top: 16, right: 16, width: 30, height: 30, background: "#222830", border: "1px solid #2A3140", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#7A8399", fontSize: 14 }}>✕</button>
        {view === "detail" && (
          <>
            <div style={{ fontSize: 9, letterSpacing: "2px", textTransform: "uppercase", color: "#7A8399", marginBottom: 6 }}>{pick.league}</div>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, lineHeight: 1.3, color: "#E8EAF0" }}>{pick.title}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, paddingBottom: 20, borderBottom: "1px solid #2A3140" }}>
              <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 36, color: "#C9A84C" }}>x{pick.total_odds}</span>
              <div>
                <div style={{ fontSize: 10, color: "#7A8399", letterSpacing: "1.5px", textTransform: "uppercase" }}>Cotes totales</div>
                <div style={{ fontSize: 11, color: "#7A8399", marginTop: 2 }}>{pick.matches.length} sélection{pick.matches.length > 1 ? "s" : ""}</div>
              </div>
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                {pick.outcome !== "REFUNDED" && refundedLegCount(pick) > 0 && (
                  <PartialRefundChip count={refundedLegCount(pick)} />
                )}
                <OutcomeBadge outcome={pick.outcome} />
              </div>
            </div>
            {canViewPredictions
              ? <div>{pick.matches.map((m, i) => <PredictionRow key={i} match={m} />)}</div>
              : <LockedPredictions pick={pick} onUnlock={() => setView(user ? "payment" : "auth")} />
            }
          </>
        )}
        {view === "auth" && <AuthGate onSuccess={() => setView("payment")} />}
        {view === "payment" && <MomoPayment pick={pick} onSuccess={handlePaymentSuccess} onBack={onClose} />}
      </div>
    </div>
  );
}

// ─── Filter Bar ───────────────────────────────────────────────────────────────
type FilterType = "ALL" | "safe" | "value" | "bold" | string;

function FilterBar({ active, onChange, picks }: { active: FilterType; onChange: (l: FilterType) => void; picks: Pick[] }) {
  const hasTiers = picks.some((p) => p.tier);
  const leagues = useMemo(() => Array.from(new Set(picks.map((p) => p.league))), [picks]);
  const filters: { id: FilterType; label: string }[] = [
    { id: "ALL", label: "Tous" },
    ...(hasTiers ? [{ id: "safe", label: "Safe" }, { id: "value", label: "Value" }, { id: "bold", label: "Bold" }] : []),
    ...leagues.map((l) => ({ id: l, label: l })),
  ];
  return (
    <div style={{ background: "#111418", borderBottom: "1px solid #2A3140", padding: "0 16px", display: "flex", gap: 0, overflowX: "auto", scrollbarWidth: "none", position: "sticky", top: 0, zIndex: 20 }}>
      {filters.map((f) => (
        <button key={f.id} onClick={() => onChange(f.id)} style={{
          padding: "14px 16px", fontSize: 10, letterSpacing: "2px", textTransform: "uppercase",
          fontWeight: 600, color: active === f.id ? "#C9A84C" : "#7A8399",
          border: "none", background: "transparent", cursor: "pointer",
          borderBottom: active === f.id ? "2px solid #C9A84C" : "2px solid transparent",
          whiteSpace: "nowrap", fontFamily: "inherit", transition: "all 0.2s", flexShrink: 0,
        }}>
          {f.label}
        </button>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PremiumPicksPage() {
  const [activeFilter, setActiveFilter] = useState<FilterType>("ALL");
  const [selectedPick, setSelectedPick] = useState<Pick | null>(null);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSubscribe, setShowSubscribe] = useState(false);
  const [newPicksBanner, setNewPicksBanner] = useState<number | null>(null);
  const { user, hasActiveSubscription, refreshUser } = useAuth();
  const settings = useAppSettings();

  // Kept outside React state so the polling/focus refresh below can diff
  // "what we already had" vs "what just came back" without re-subscribing
  // effects every time `picks` changes.
  const picksRef = useRef<Pick[]>([]);
  const isMountedRef = useRef(true);
  const bannerTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const fetchPicks = useCallback(async (showSpinner: boolean) => {
    try {
      if (showSpinner) { setLoading(true); setError(null); }
      const res = await fetch("/api/picks");
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const data = await res.json();
      if (!isMountedRef.current) return;
      let resolved: Pick[] = [];
      if (Array.isArray(data)) resolved = data;
      else if (Array.isArray(data?.picks)) resolved = data.picks;
      else if (Array.isArray(data?.data)) resolved = data.data;
      const published = resolved.filter((p) => p.is_published !== false);

      // Background refreshes (polling / tab refocus) are otherwise silent —
      // surface a small "new picks" nudge when the list actually grew, so
      // visitors notice without needing to hit reload themselves.
      if (!showSpinner && picksRef.current.length > 0) {
        const previousIds = new Set(picksRef.current.map((p) => p._id));
        const newCount = published.filter((p) => !previousIds.has(p._id)).length;
        if (newCount > 0) {
          setNewPicksBanner(newCount);
          clearTimeout(bannerTimeoutRef.current);
          bannerTimeoutRef.current = setTimeout(() => setNewPicksBanner(null), 6000);
        }
      }

      picksRef.current = published;
      setPicks(published);
    } catch (err) {
      // A background refresh failing is not worth interrupting the visitor
      // over — they still have the last good list. Only surface an error
      // for the initial load.
      if (showSpinner && isMountedRef.current) {
        setError(err instanceof Error ? err.message : "Erreur inconnue");
        setPicks([]);
      }
    } finally {
      if (showSpinner && isMountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    fetchPicks(true);

    // Real-time-ish updates without a websocket/SSE backend: a light
    // interval poll (same pattern as the admin dashboard's conversation
    // polling) plus an immediate refresh whenever the visitor comes back
    // to this tab — covers the common "left it open, missed the new pick"
    // case as well as "posted a pick, buyer's tab updates on its own".
    const interval = setInterval(() => fetchPicks(false), 60000);
    const onFocusOrVisible = () => {
      if (document.visibilityState === "visible") fetchPicks(false);
    };
    document.addEventListener("visibilitychange", onFocusOrVisible);
    window.addEventListener("focus", onFocusOrVisible);

    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
      clearTimeout(bannerTimeoutRef.current);
      document.removeEventListener("visibilitychange", onFocusOrVisible);
      window.removeEventListener("focus", onFocusOrVisible);
    };
  }, [fetchPicks]);

  const filtered = useMemo(() => {
    if (activeFilter === "ALL") return picks;
    if (["safe", "value", "bold"].includes(activeFilter)) return picks.filter((p) => p.tier === activeFilter);
    return picks.filter((p) => p.league === activeFilter);
  }, [picks, activeFilter]);

  // ── Today / this-week / past-weeks split ────────────────────────────────────
  const today = new Date().toISOString().split("T")[0];
  const currentWeekKey = getWeekKey(today);

  const todayPicks = useMemo(
    () => filtered.filter((p) => p.match_date.split("T")[0] === today),
    [filtered, today]
  );

  // Rest of the current week (not today, same ISO week) — shown in full
  // under "Picks Récents", no pagination.
  const currentWeekRest = useMemo(
    () =>
      filtered
        .filter((p) => p.match_date.split("T")[0] !== today && getWeekKey(p.match_date) === currentWeekKey)
        .sort((a, b) => b.match_date.localeCompare(a.match_date)),
    [filtered, today, currentWeekKey]
  );

  // Everything before this week — browsable week-by-week in WeekCalendar.
  const pastWeeksPicks = useMemo(
    () => filtered.filter((p) => getWeekKey(p.match_date) !== currentWeekKey),
    [filtered, currentWeekKey]
  );

  const groupedToday = useMemo(() => groupByDate(todayPicks), [todayPicks]);
  const groupedWeekRest = useMemo(() => groupByDate(currentWeekRest), [currentWeekRest]);

  // Every day "Picks Récents" should show, newest first: any day with a
  // pick (past or pre-published future date this week), plus every past
  // day of the current week even with nothing posted (rendered as a blank
  // date instead of just vanishing) — never a future day with nothing yet,
  // since that day just hasn't happened. "Today" is always excluded, it
  // has its own section above.
  const weekRestDays = useMemo(() => {
    const days = new Set<string>(Object.keys(groupedWeekRest));
    getWeekDayKeys(currentWeekKey).forEach((d) => { if (d < today) days.add(d); });
    return Array.from(days).sort().reverse();
  }, [groupedWeekRest, currentWeekKey, today]);

  // Today has no dedicated "Picks du jour" section when it's empty — the
  // Pronostic IA nudge takes that slot instead, at the top of Picks
  // Récents (today being the most recent date), rather than floating as
  // its own block between two sections.
  const showTodayNudge = todayPicks.length === 0 && !!settings?.matchGeneratorEnabled;
  // ───────────────────────────────────────────────────────────────────────────

  if (loading) return (
    <>
      <GlobalStyles />
      <PageLoader label="Chargement des picks…" />
    </>
  );

  if (error) return (
    <>
      <GlobalStyles />
      <div style={{ height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#0A0C0F", gap: 16, padding: 24 }}>
        <div style={{ fontSize: 10, letterSpacing: "2px", color: "#EF4444", textTransform: "uppercase", textAlign: "center" }}>Impossible de charger les picks</div>
        <div style={{ fontSize: 12, color: "#7A8399", textAlign: "center", maxWidth: 300 }}>{error}</div>
        <button onClick={() => window.location.reload()} style={{ background: "#C9A84C", color: "#0A0C0F", border: "none", borderRadius: 8, padding: "10px 24px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", letterSpacing: "1px" }}>
          Réessayer
        </button>
      </div>
    </>
  );

  return (
    <>
      <GlobalStyles />
      {newPicksBanner !== null && (
        <div
          role="status"
          onClick={() => {
            setNewPicksBanner(null);
            document.getElementById("today-picks")?.scrollIntoView({ behavior: "smooth" });
          }}
          style={{
            position: "fixed", top: 14, left: "50%", transform: "translateX(-50%)", zIndex: 60,
            background: "linear-gradient(135deg, #C9A84C, #E8C97A)", color: "#0A0C0F",
            borderRadius: 999, padding: "10px 18px", fontSize: 12, fontWeight: 700,
            display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
            boxShadow: "0 8px 24px rgba(201,168,76,0.35)", animation: "fadeIn 0.25s ease",
            letterSpacing: "0.3px", whiteSpace: "nowrap",
          }}
        >
          🔥 {newPicksBanner} nouveau{newPicksBanner > 1 ? "x" : ""} pick{newPicksBanner > 1 ? "s" : ""} disponible{newPicksBanner > 1 ? "s" : ""}
        </div>
      )}
      <main style={{ minHeight: "100vh", background: "#0A0C0F", paddingBottom: `max(80px, ${BOTTOM_SAFE_OFFSET})` }}>
        <Hero picks={picks} />
        <FilterBar active={activeFilter} onChange={setActiveFilter} picks={picks} />
        <OneXBetBanner />
        {/* ── Subscription banner ── */}
        <SubscribeBanner
          isLoggedIn={!!user}
          isSubscribed={!!user && hasActiveSubscription()}
          subscriptionStatus={user?.subscription?.status}
          expiresAt={user?.subscription?.expiresAt}
          onSubscribe={() => setShowSubscribe(true)}
        />

        {/* ── Main picks section ── */}
        <section id="today-picks" style={{ padding: "24px 16px", maxWidth: 700, margin: "0 auto" }}>

          {user && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, padding: "10px 14px", background: "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.15)", borderRadius: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22C55E", flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: "#22C55E", letterSpacing: "0.5px" }}>Connecté en tant que {user.phone}</span>
            </div>
          )}

          {picks.length === 0 && (
            <div style={{ textAlign: "center", padding: "60px 0", color: "#7A8399" }}>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: 2, marginBottom: 8 }}>Aucun pick disponible</div>
              <div style={{ fontSize: 12 }}>Revenez bientôt pour les prochains pronostics.</div>
            </div>
          )}

          {/* ── TODAY — always fully shown ── */}
          {todayPicks.length > 0 && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                <span style={{ fontSize: 9, letterSpacing: "3px", color: "#C9A84C", textTransform: "uppercase", fontWeight: 700, whiteSpace: "nowrap" }}>
                  Picks du jour
                </span>
                <div style={{ flex: 1, height: 1, background: "#2A3140" }} />
                <span style={{ fontSize: 10, color: "#C9A84C", whiteSpace: "nowrap", fontWeight: 600 }}>
                  {todayPicks.length} pick{todayPicks.length > 1 ? "s" : ""}
                </span>
              </div>
              {Object.keys(groupedToday).sort().reverse().map((date) => (
                <DateSection key={date} date={date} picks={groupedToday[date]} onSelect={setSelectedPick} />
              ))}
            </>
          )}

          {/* ── PICKS RÉCENTS — rest of the current week, every day shown ── */}
          {(weekRestDays.length > 0 || showTodayNudge) && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: todayPicks.length > 0 ? 12 : 0, marginBottom: 20 }}>
                <span style={{ fontSize: 9, letterSpacing: "3px", color: "#7A8399", textTransform: "uppercase", fontWeight: 600, whiteSpace: "nowrap" }}>
                  Picks Récents
                </span>
                <div style={{ flex: 1, height: 1, background: "#2A3140" }} />
                <span style={{ fontSize: 10, color: "#7A8399", whiteSpace: "nowrap" }}>
                  {currentWeekRest.length} pick{currentWeekRest.length > 1 ? "s" : ""}
                </span>
              </div>

              {/* Today, first — most recent date — only when it's empty
                  (picks show via the "Picks du jour" section above instead). */}
              {showTodayNudge && <TodayNudgeRow date={today} />}

              {weekRestDays.map((date) => (
                groupedWeekRest[date]
                  ? <DateSection key={date} date={date} picks={groupedWeekRest[date]} onSelect={setSelectedPick} />
                  : <BlankDateRow key={date} date={date} />
              ))}
            </>
          )}

          {/* ── WEEK CALENDAR — everything before this week ── */}
          <WeekCalendar picks={pastWeeksPicks} onSelect={setSelectedPick} />
        </section>
        <CompoundBetBanner />

        {selectedPick && <Modal pick={selectedPick} onClose={() => setSelectedPick(null)} />}

        {showSubscribe && (
          <div onClick={(e) => e.target === e.currentTarget && setShowSubscribe(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 1200, backdropFilter: "blur(4px)" }}>
            <div style={{ background: "#111418", border: "1px solid #2A3140", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 600, padding: "24px 20px 40px", position: "relative", maxHeight: "90vh", overflowY: "auto", animation: "slideUp 0.3s cubic-bezier(0.32,0.72,0,1)" }}>
              <div style={{ width: 40, height: 4, background: "#3A4455", borderRadius: 2, margin: "0 auto 20px" }} />
              <button onClick={() => setShowSubscribe(false)} style={{ position: "absolute", top: 16, right: 16, width: 30, height: 30, background: "#222830", border: "1px solid #2A3140", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#7A8399", fontSize: 14 }}>✕</button>
              <SubscribePayment onSuccess={async () => { await refreshUser(); setShowSubscribe(false); }} onBack={() => setShowSubscribe(false)} />
            </div>
          </div>
        )}
      </main>
    </>
  );
}