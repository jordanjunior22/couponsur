"use client";
import { useState, useMemo, useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import Link from "next/link";
import SoccerVitalImportModal from "@/components/SoccerVitalImportModal";
import DecimalInput from "@/components/DecimalInput";
import TypingIndicator from "@/components/TypingIndicator";

// ─── Types ─────────────────────────────────────────────────────────────────────
interface Match {
  _id?: string;
  home: string;
  away: string;
  tip: string;
  odd: number;
  league?: string;
  date?: string;
  kickoff?: string;
  outcome: "PENDING" | "WIN" | "LOSS" | "REFUNDED";
}

interface Pick {
  _id: string;
  title: string;
  price: number;
  total_odds: number;
  match_date: string;
  league: string;
  outcome: "PENDING" | "WIN" | "LOSS" | "REFUNDED";
  is_published: boolean;
  matches: Match[];
}

interface ApiUser {
  _id: string;
  phone: string;
  role: "USER" | "ADMIN";
  unlockedPickIds: string[];
  subscription?: {
    status: "NONE" | "ACTIVE" | "EXPIRED";
    plan: "MONTHLY";
    startedAt: string | null;
    expiresAt: string | null;
  };
  createdAt?: string;
  lastLoginAt?: string;
}

interface ApiTransaction {
  _id: string;
  pickId?: string | null;
  userId: { _id: string; phone: string; role: "USER" | "ADMIN" } | string | null;
  paymentType: "PICK" | "SUBSCRIPTION";
  phone: string;
  amount: number;
  fapshiTransId: string;
  status: "PENDING" | "SUCCESSFUL" | "FAILED" | "EXPIRED";
  createdAt: string;
  updatedAt: string;
}

interface ChatMessage {
  _id?: string;
  sender: "USER" | "ADMIN";
  text: string;
  createdAt: string;
  editedAt?: string | null;
}

interface Conversation {
  _id: string;
  user: string | null;
  phone: string;
  status: "OPEN" | "RESOLVED";
  messages: ChatMessage[];
  lastMessageAt: string;
  createdAt: string;
  userTypingAt?: string | null;
}

interface Announcement {
  _id: string;
  title: string;
  body: string;
  type: "INFO" | "WARNING" | "SUCCESS";
  displayStyle: "BANNER" | "POPUP";
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string;
}

const LEAGUES = [
  "Premier League", "Ligue 1", "La Liga", "Serie A",
  "Bundesliga", "UCL", "MLS", "Eredivisie", "Mix"
];

// Fallback used before /api/admin/settings responds (or if it ever fails) —
// mirrors the admin-managed tipOptions default in models/Settings.ts so the
// picker never comes up empty.
const DEFAULT_TIPS = ["1", "X", "2", "1X", "X2", "12", "BTTS", "O 2.5", "U 2.5", "O 1.5", "U 1.5", "DNB"];

// Kept in sync with MATCH_GENERATOR_MARKETS in models/Settings.ts and
// MARKET_LABELS in components/MatchGenerator.tsx.
const GENERATOR_MARKETS = [
  { code: "1X2", label: "Résultat (1X2)" },
  { code: "DC", label: "Double Chance" },
  { code: "BTTS", label: "BTTS" },
  { code: "OU15", label: "+1.5 buts" },
  { code: "OU25", label: "+2.5 buts" },
  { code: "OU35", label: "+3.5 buts" },
];

// ─── Icons ─────────────────────────────────────────────────────────────────────
const Icons = {
  dashboard: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <rect x="9" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <rect x="1" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <rect x="9" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  ),
  picks: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 4h12M2 8h8M2 12h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  users: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="6" cy="5" r="3" stroke="currentColor" strokeWidth="1.4" />
      <path d="M1 14c0-3 2-5 5-5s5 2 5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M12 7v4M10 9h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  revenue: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M1 12L5 7l3 3 3-4 3-2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  settings: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M3.5 12.5l1.4-1.4M11.1 4.9l1.4-1.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
  plus: () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  edit: () => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M9 2l2 2L4 11H2V9L9 2z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  trash: () => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M2 4h9M5 4V2.5h3V4M4 4l.5 7h4l.5-7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  close: () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  eye: () => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M1 6.5C2.5 3.5 4.5 2 6.5 2s4 1.5 5.5 4.5C10.5 9.5 8.5 11 6.5 11S2.5 9.5 1 6.5z" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="6.5" cy="6.5" r="1.5" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  ),
  eyeOff: () => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M2 2l9 9M5 4.5C5.5 3.5 6 3 6.5 3 8.5 3 10 4.5 11.5 6.5c-.5.7-1 1.3-1.6 1.8M1 6.5C2 4.8 3.5 3.5 5 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
  logout: () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M9 2h2.5A1.5 1.5 0 0113 3.5v7A1.5 1.5 0 0111.5 12H9M6 10l3-3-3-3M9 7H2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  menu: () => (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M2 4h14M2 9h14M2 14h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  shield: () => (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
      <path d="M20 4L6 10v10c0 8.284 5.88 16.02 14 18 8.12-1.98 14-9.716 14-18V10L20 4z" stroke="#C9A84C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 20l4 4 8-8" stroke="#C9A84C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  home: () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 6.5L7 2l5 4.5V12a1 1 0 01-1 1H3a1 1 0 01-1-1V6.5z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.5 13V8.5h3V13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  alert: () => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M6.5 4v3.2M6.5 9h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  messages: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M1.5 3.5h13v8a1 1 0 01-1 1H5l-3.5 3v-3h-1a1 1 0 01-1-1v-8z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  announcements: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M1.5 6.5v3a1 1 0 001 1h1.3l6.7 3V2.5l-6.7 3H2.5a1 1 0 00-1 1z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.5 10.5v2.3a1 1 0 001 1h.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M12.8 6a2.4 2.4 0 010 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  transactions: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M3.5 1.5h9v13l-2-1.3-1.5 1.3-1.5-1.3-1.5 1.3-1.5-1.3-1 .7V1.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M5.5 5h5M5.5 7.5h5M5.5 10h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
  chevronLeft: () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M9 2.5L4 7l5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  chevronRight: () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M5 2.5L10 7l-5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

// ─── Colors ────────────────────────────────────────────────────────────────────
const C = {
  dark: "#0A0C0F", dark2: "#111418", dark3: "#1A1F26", dark4: "#222830",
  border: "#2A3140", faint: "#3A4455", text: "#E8EAF0", muted: "#7A8399",
  gold: "#C9A84C", goldLight: "#E8C97A", goldDark: "#8A6A2A",
  green: "#22C55E", red: "#EF4444", blue: "#3B82F6",
};

// ─── Utilities ─────────────────────────────────────────────────────────────────
function genId() { return Math.random().toString(36).slice(2, 9); }

// Backend strips _id from matches before saving (see handleSave's payload
// mapping in PickFormModal), so any pick re-loaded for editing comes back
// with every match missing _id. If left undefined, toggle/delete logic
// that matches on mx._id === m._id would treat every match as the same
// match (they'd all share the value `undefined`) — causing a tick or
// delete on one row to silently apply to every row. Re-generate a fresh
// local id per match whenever a pick is loaded into the form.
function hydrateMatchIds(p: Pick): Pick {
  return {
    ...p,
    matches: p.matches.map((m) => ({ ...m, _id: m._id || genId() })),
  };
}

// A pick is "stale-pending" if it's still PENDING more than this many days
// past its match_date. Correlates with SoccerVital's results table being a
// rolling window (only ~20 recent results per league) — a match that
// hasn't graded within a few days has likely scrolled off that window
// entirely, meaning grade-picks will keep silently failing to find it
// forever rather than it just being "not played yet".
const STALE_PENDING_DAYS = 4;

function daysSinceMatch(matchDateStr: string): number {
  const matchDate = new Date(matchDateStr.split("T")[0] + "T12:00:00");
  const now = new Date();
  return Math.floor((now.getTime() - matchDate.getTime()) / (1000 * 60 * 60 * 24));
}

function isStalePending(pick: Pick): boolean {
  return pick.outcome === "PENDING" && daysSinceMatch(pick.match_date) > STALE_PENDING_DAYS;
}

function SubscriptionBadge({ subscription }: { subscription?: ApiUser["subscription"] }) {
  const isActive = subscription?.status === "ACTIVE" && subscription.expiresAt && new Date(subscription.expiresAt) > new Date();
  if (!isActive) {
    return <span style={{ fontSize: 9, color: C.muted, letterSpacing: "1px" }}>—</span>;
  }
  return (
    <span style={{ background: "rgba(201,168,76,0.1)", color: C.gold, border: "1px solid rgba(201,168,76,0.25)", fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 4, letterSpacing: "1px", textTransform: "uppercase", whiteSpace: "nowrap" }}>
      Abonné
    </span>
  );
}
function formatCFA(n: number) { return n.toLocaleString("fr-FR") + " FCFA"; }
// Left-accent color for a pick/match outcome — shared by every card/table
// row that marks its outcome with a colored border, so REFUNDED gets its
// own blue accent instead of silently falling back to gold (which would
// make it look identical to a still-PENDING row).
function outcomeAccent(outcome: "PENDING" | "WIN" | "LOSS" | "REFUNDED"): string {
  if (outcome === "WIN") return C.green;
  if (outcome === "LOSS") return C.red;
  if (outcome === "REFUNDED") return C.blue;
  return C.gold;
}
function formatDate(d: string) {
  if (!d) return "—";
  const dateOnly = d.split("T")[0];
  return new Date(dateOnly + "T12:00:00").toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ─── Reusable Components ───────────────────────────────────────────────────────
function Badge({ outcome }: { outcome: "PENDING" | "WIN" | "LOSS" | "REFUNDED" | "draft" | "live" }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    WIN: { bg: "rgba(34,197,94,0.12)", color: C.green, label: "WIN" },
    LOSS: { bg: "rgba(239,68,68,0.12)", color: C.red, label: "LOSS" },
    PENDING: { bg: "rgba(201,168,76,0.1)", color: C.gold, label: "EN COURS" },
    REFUNDED: { bg: "rgba(59,130,246,0.1)", color: C.blue, label: "REMBOURSÉ" },
    draft: { bg: "rgba(122,131,153,0.12)", color: C.muted, label: "BROUILLON" },
    live: { bg: "rgba(59,130,246,0.12)", color: C.blue, label: "PUBLIÉ" },
  };
  const s = map[outcome] || map["PENDING"];
  return (
    <span style={{
      background: s.bg, color: s.color, border: `1px solid ${s.color}40`,
      fontSize: 9, letterSpacing: "1.2px", fontWeight: 700,
      padding: "3px 8px", borderRadius: 4, textTransform: "uppercase", whiteSpace: "nowrap",
    }}>
      {s.label}
    </span>
  );
}

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: boolean }) {
  return (
    <div style={{
      background: accent ? "rgba(201,168,76,0.06)" : C.dark3,
      border: `1px solid ${accent ? C.goldDark : C.border}`,
      borderRadius: 12, padding: "18px 16px",
    }}>
      <div style={{ fontSize: 10, letterSpacing: "2px", color: C.muted, textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 30, letterSpacing: 1, color: accent ? C.gold : C.text, lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function Spinner({ size = 40 }: { size?: number }) {
  return (
    <div style={{
      width: size, height: size,
      border: `${size > 30 ? 4 : 3}px solid #2A3140`,
      borderTopColor: C.gold, borderRadius: "50%",
      animation: "spin 0.8s linear infinite",
    }} />
  );
}

// ─── Simple SVG line chart (no external chart library needed) ─────────────────
function LineChart({ data, height = 180, formatValue = formatCFA }: { data: { label: string; value: number }[]; height?: number; formatValue?: (n: number) => string }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (data.length === 0) {
    return <div style={{ padding: 24, textAlign: "center", color: C.muted, fontSize: 12 }}>Aucune donnée</div>;
  }
  const max = Math.max(...data.map((d) => d.value), 1);
  const width = 100;
  const padY = 10;
  const usableH = height - padY * 2;
  const stepX = data.length > 1 ? width / (data.length - 1) : 0;

  const points = data.map((d, i) => {
    const x = data.length > 1 ? i * stepX : width / 2;
    const y = padY + usableH - (d.value / max) * usableH;
    return { x, y, ...d };
  });

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaD = `${pathD} L ${points[points.length - 1].x} ${height - padY} L ${points[0].x} ${height - padY} Z`;

  const hovered = hoverIdx !== null ? points[hoverIdx] : null;
  const tooltipAlign = hoverIdx === 0 ? "left" : hoverIdx === points.length - 1 ? "right" : "center";

  return (
    <div style={{ padding: "16px" }}>
      {/* Sized 1:1 with the SVG's viewBox (width%→x%, height in px→y in px,
          since preserveAspectRatio is "none") so the tooltip can be placed
          directly from a point's raw x/y without extra conversion. */}
      <div style={{ position: "relative", width: "100%", height }}>
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height, overflow: "visible", display: "block" }} preserveAspectRatio="none">
          <path d={areaD} fill="url(#goldFade)" opacity={0.15} />
          <defs>
            <linearGradient id="goldFade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.gold} stopOpacity="0.5" />
              <stop offset="100%" stopColor={C.gold} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={pathD} fill="none" stroke={C.gold} strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
          {hovered && (
            <line x1={hovered.x} y1={padY} x2={hovered.x} y2={height - padY} stroke={C.border} strokeWidth="0.4" vectorEffect="non-scaling-stroke" />
          )}
          {points.map((p, i) => (
            <g
              key={i}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx((h) => (h === i ? null : h))}
              onClick={() => setHoverIdx((h) => (h === i ? null : i))}
              style={{ cursor: "pointer" }}
            >
              {/* Invisible, generously-sized hit target — the visible dot is tiny */}
              <circle cx={p.x} cy={p.y} r="3.5" fill="transparent" />
              <circle cx={p.x} cy={p.y} r={hoverIdx === i ? "1.4" : "0.8"} fill={C.gold} vectorEffect="non-scaling-stroke" />
            </g>
          ))}
        </svg>
        {hovered && (
          <div style={{
            position: "absolute",
            left: `${(hovered.x / width) * 100}%`,
            top: Math.max(0, hovered.y - 36),
            transform: tooltipAlign === "left" ? "translateX(0)" : tooltipAlign === "right" ? "translateX(-100%)" : "translateX(-50%)",
            background: C.dark4, border: `1px solid ${C.border}`, borderRadius: 6,
            padding: "5px 9px", whiteSpace: "nowrap", pointerEvents: "none",
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)", zIndex: 5,
          }}>
            <div style={{ color: C.muted, fontSize: 9 }}>{hovered.label}</div>
            <div style={{ color: C.gold, fontSize: 12, fontWeight: 700 }}>{formatValue(hovered.value)}</div>
          </div>
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
        {data.map((d, i) => (
          (data.length <= 8 || i % Math.ceil(data.length / 8) === 0) ? (
            <span key={i} style={{ fontSize: 9, color: C.muted }}>{d.label}</span>
          ) : <span key={i} />
        ))}
      </div>
    </div>
  );
}

// ─── Simple horizontal bar distribution chart ──────────────────────────────────
function OutcomeBarChart({ wins, losses, pending, refunded = 0 }: { wins: number; losses: number; pending: number; refunded?: number }) {
  const total = wins + losses + pending + refunded || 1;
  const rows = [
    { label: "Win", value: wins, color: C.green },
    { label: "Loss", value: losses, color: C.red },
    { label: "En cours", value: pending, color: C.gold },
    { label: "Remboursé", value: refunded, color: C.blue },
  ];
  return (
    <div style={{ padding: "16px" }}>
      {rows.map((r) => (
        <div key={r.label} style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: C.text }}>{r.label}</span>
            <span style={{ fontSize: 11, color: r.color, fontWeight: 700 }}>{r.value}</span>
          </div>
          <div style={{ background: C.dark4, borderRadius: 4, height: 8, overflow: "hidden" }}>
            <div style={{ height: "100%", borderRadius: 4, width: `${(r.value / total) * 100}%`, background: r.color, transition: "width 0.5s ease" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function PickFormModal({ pick, onSave, onClose, tipOptions }: { pick: Pick | null; onSave: (p: Pick) => void; onClose: () => void; tipOptions: string[] }) {
  const isNew = !pick;
  const defaultForm = (): Pick => ({
    _id: genId(), title: "", price: 2000, total_odds: 2.0,
    match_date: new Date().toISOString().split("T")[0],
    league: "Premier League", outcome: "PENDING", is_published: false, matches: [],
  });

  const [form, setForm] = useState<Pick>(pick ? hydrateMatchIds(pick) : defaultForm());
  useEffect(() => {
    setForm(pick ? hydrateMatchIds(pick) : defaultForm());
  }, [pick]);
  const [saving, setSaving] = useState(false);
  const [newMatch, setNewMatch] = useState({ home: "", away: "", tip: "1", odd: 1.8, kickoff: "" });

  const set = (key: keyof Pick, val: unknown) => setForm((f) => ({ ...f, [key]: val }));

  const TIPS = tipOptions.length > 0 ? tipOptions : DEFAULT_TIPS;

  const addMatch = () => {
    if (!newMatch.home.trim() || !newMatch.away.trim()) return;
    setForm((f) => ({
      ...f,
      matches: [...f.matches, {
        _id: genId(),
        home: newMatch.home.trim(),
        away: newMatch.away.trim(),
        tip: newMatch.tip,
        odd: newMatch.odd,
        kickoff: newMatch.kickoff || undefined,
        outcome: "PENDING",
        date: f.match_date,
      }],
    }));
    setNewMatch({ home: "", away: "", tip: "1", odd: 1.8, kickoff: "" });
  };

  // Auto-calculate total odds as the product of every selection's odd,
  // whenever the selections change (add/remove/edit) — mirrors the
  // auto-recalc already used in SoccerVitalImportModal. Skipped on the
  // very first render so simply opening an existing pick for editing
  // doesn't silently overwrite a total_odds the admin set on purpose
  // (e.g. a boosted combined price).
  const skipAutoCalc = useRef(true);
  useEffect(() => {
    if (skipAutoCalc.current) { skipAutoCalc.current = false; return; }
    if (form.matches.length === 0) return;
    const product = form.matches.reduce((acc, m) => acc * (Number(m.odd) > 0 ? Number(m.odd) : 1), 1);
    set("total_odds", Math.round(product * 100) / 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.matches]);
  const handleSave = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const method = isNew ? "POST" : "PUT";
      const url = isNew ? "/api/picks" : `/api/picks/${form._id}`;

      const payload = {
        ...form,
        matches: form.matches.map(({ _id, ...rest }) => rest),
      };

      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      onSave(data.pick || data.data || form);
    } catch {
      onSave(form);
    } finally {
      setSaving(false);
    }
  };
  const iStyle: React.CSSProperties = {
    background: C.dark4, border: `1px solid ${C.border}`, borderRadius: 8,
    color: C.text, fontSize: 13, padding: "10px 12px", width: "100%",
    fontFamily: "inherit", outline: "none",
  };
  const lStyle: React.CSSProperties = {
    fontSize: 10, letterSpacing: "1.5px", color: C.muted,
    textTransform: "uppercase", fontWeight: 600, display: "block", marginBottom: 6,
  };

  return (
    <div className="pf-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16, backdropFilter: "blur(4px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <style>{`
        .pf-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .pf-add-row { display: grid; grid-template-columns: 1.4fr 1.4fr 0.9fr 0.8fr 1fr auto; gap: 6px; margin-bottom: 8px; }
        .pf-match-row { display: flex; align-items: center; gap: 8px; background: ${C.dark4}; border-radius: 8px; padding: 10px 12px; margin-bottom: 6px; border: 1px solid ${C.border}; }
        .pf-match-controls { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
        .pf-match-controls select { width: auto; min-width: 60px; }
        .pf-match-controls .pf-odd-input { width: 60px; }
        .pf-match-controls input[type=time] { width: 88px; }
        .pf-icon-btn { width: 30px; height: 30px; }

        @media (max-width: 560px) {
          .pf-overlay { padding: 0 !important; align-items: flex-end !important; }
          .pf-modal { max-width: 100% !important; width: 100% !important; max-height: 94vh !important; border-radius: 16px 16px 0 0 !important; padding: 16px !important; }
          .pf-grid-2 { grid-template-columns: 1fr; gap: 10px; }
          .pf-add-row { grid-template-columns: 1fr 1fr; }
          .pf-add-row > input, .pf-add-row > select, .pf-add-row > .pf-decimal { width: 100% !important; }
          .pf-add-btn { grid-column: span 2; width: 100%; justify-content: center !important; padding: 12px !important; }
          .pf-match-controls select, .pf-match-controls .pf-odd-input, .pf-match-controls input[type=time] { flex: 1 1 80px; width: auto; }
          .pf-icon-btn { width: 36px !important; height: 36px !important; }
        }
      `}</style>
      <div className="pf-modal" style={{ background: C.dark2, border: `1px solid ${C.border}`, borderRadius: 16, width: "100%", maxWidth: 540, maxHeight: "92vh", overflowY: "auto", padding: 24 }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: "2px", color: C.gold, textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>
              {isNew ? "Nouveau Pick" : "Modifier"}
            </div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color: C.text, letterSpacing: 1 }}>
              {isNew ? "Créer un Pick" : form.title || "Sans titre"}
            </div>
          </div>
          <button onClick={onClose} style={{ background: C.dark4, border: `1px solid ${C.border}`, borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.muted, flexShrink: 0 }}>
            <Icons.close />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={lStyle}>Titre</label>
            <input style={iStyle} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Ex: PL Banker of the Week" />
          </div>
          <div className="pf-grid-2">
            <div>
              <label style={lStyle}>Ligue</label>
              <select style={{ ...iStyle, cursor: "pointer" }} value={form.league} onChange={(e) => set("league", e.target.value)}>
                {LEAGUES.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label style={lStyle}>Date</label>
              <input type="date" style={iStyle} value={form.match_date} onChange={(e) => set("match_date", e.target.value)} />
            </div>
          </div>
          <div className="pf-grid-2">
            <div>
              <label style={lStyle}>Prix (FCFA)</label>
              <input type="number" style={iStyle} value={form.price} onChange={(e) => set("price", Number(e.target.value))} />
            </div>
            <div>
              <label style={lStyle}>Cotes totales <span style={{ color: C.muted, textTransform: "none", fontWeight: 400, letterSpacing: 0 }}>(auto)</span></label>
              <DecimalInput style={iStyle} value={form.total_odds} onChange={(n) => set("total_odds", n)} />
            </div>
          </div>
          <div className="pf-grid-2">
            <div>
              <label style={lStyle}>Résultat</label>
              <select style={{ ...iStyle, cursor: "pointer" }} value={form.outcome} onChange={(e) => set("outcome", e.target.value as Pick["outcome"])}>
                <option value="PENDING">En cours</option>
                <option value="WIN">Win</option>
                <option value="LOSS">Loss</option>
                <option value="REFUNDED">Remboursé</option>
              </select>
            </div>
            <div>
              <label style={lStyle}>Statut</label>
              <button onClick={() => set("is_published", !form.is_published)} style={{ ...iStyle, cursor: "pointer", textAlign: "left", color: form.is_published ? C.green : C.muted, border: `1px solid ${form.is_published ? "rgba(34,197,94,0.4)" : C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 12, height: 12, borderRadius: "50%", background: form.is_published ? C.green : C.faint, flexShrink: 0 }} />
                {form.is_published ? "Publié" : "Brouillon"}
              </button>
            </div>
          </div>

          <div>
            <label style={lStyle}>Sélections ({form.matches.length})</label>

            <div className="pf-add-row">
              <input style={{ ...iStyle, fontSize: 12, padding: "8px 10px" }} value={newMatch.home}
                onChange={(e) => setNewMatch((m) => ({ ...m, home: e.target.value }))} placeholder="Domicile" />
              <input style={{ ...iStyle, fontSize: 12, padding: "8px 10px" }} value={newMatch.away}
                onChange={(e) => setNewMatch((m) => ({ ...m, away: e.target.value }))} placeholder="Extérieur"
                onKeyDown={(e) => e.key === "Enter" && addMatch()} />
              <select style={{ ...iStyle, fontSize: 12, padding: "8px 10px", cursor: "pointer" }} value={newMatch.tip}
                onChange={(e) => setNewMatch((m) => ({ ...m, tip: e.target.value }))}>
                {TIPS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <DecimalInput className="pf-decimal" style={{ ...iStyle, fontSize: 12, padding: "8px 10px" }} value={newMatch.odd}
                onChange={(n) => setNewMatch((m) => ({ ...m, odd: n }))} placeholder="Cote" />
              <input type="time" style={{ ...iStyle, fontSize: 12, padding: "8px 10px" }} value={newMatch.kickoff}
                onChange={(e) => setNewMatch((m) => ({ ...m, kickoff: e.target.value }))} title="Heure du coup d'envoi (optionnel)" />
              <button className="pf-add-btn" onClick={addMatch} style={{ background: C.gold, color: C.dark, border: "none", borderRadius: 8, padding: "8px 12px", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center" }}>
                <Icons.plus />
              </button>
            </div>

            {form.matches.map((m, idx) => {
              const toggleOutcome = () => {
                const cycle: Match["outcome"][] = ["PENDING", "WIN", "LOSS", "REFUNDED"];
                const next = cycle[(cycle.indexOf(m.outcome) + 1) % cycle.length];
                setForm((f) => ({
                  ...f,
                  matches: f.matches.map((mx, mxIdx) => mxIdx === idx ? { ...mx, outcome: next } : mx),
                }));
              };
              const updateMatch = (patch: Partial<Match>) => setForm((f) => ({
                ...f,
                matches: f.matches.map((mx, mxIdx) => mxIdx === idx ? { ...mx, ...patch } : mx),
              }));
              const tickColor = m.outcome === "WIN" ? C.green : m.outcome === "LOSS" ? C.red : m.outcome === "REFUNDED" ? C.blue : C.faint;
              const tickLabel = m.outcome === "WIN" ? "✓" : m.outcome === "LOSS" ? "✗" : m.outcome === "REFUNDED" ? "↺" : "·";
              return (
                <div key={m._id ?? idx} className="pf-match-row">
                  <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: C.text }}>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {m.home} vs {m.away}
                      {m.kickoff && <span style={{ color: C.muted }}> · {m.kickoff}</span>}
                    </div>
                    <div className="pf-match-controls">
                      <select style={{ ...iStyle, fontSize: 11, padding: "5px 6px", cursor: "pointer" }} value={m.tip}
                        onChange={(e) => updateMatch({ tip: e.target.value })}>
                        {TIPS.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <span style={{ color: C.muted }}>@</span>
                      <DecimalInput className="pf-odd-input" style={{ ...iStyle, fontSize: 11, padding: "5px 6px" }} value={m.odd}
                        onChange={(n) => updateMatch({ odd: n })} />
                      <input type="time" style={{ ...iStyle, fontSize: 11, padding: "5px 6px" }} value={m.kickoff ?? ""}
                        onChange={(e) => updateMatch({ kickoff: e.target.value || undefined })} title="Heure du coup d'envoi (optionnel)" />
                    </div>
                  </div>
                  <button
                    onClick={toggleOutcome}
                    title={`Résultat: ${m.outcome} — cliquer pour changer`}
                    className="pf-icon-btn"
                    style={{
                      borderRadius: 6, border: `1.5px solid ${tickColor}`,
                      background: m.outcome === "PENDING" ? "transparent" : `${tickColor}22`,
                      color: tickColor, fontSize: 14, fontWeight: 700, cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                      transition: "all 0.15s",
                    }}
                  >
                    {tickLabel}
                  </button>
                  <button onClick={() => setForm((f) => ({ ...f, matches: f.matches.filter((_, mxIdx) => mxIdx !== idx) }))} className="pf-icon-btn" style={{ background: "none", border: "none", cursor: "pointer", color: C.red, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icons.close />
                  </button>
                </div>
              );
            })}
            {form.matches.length === 0 && (
              <div style={{ fontSize: 12, color: C.muted, padding: "8px 0", textAlign: "center" }}>Aucune sélection.</div>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, paddingTop: 6 }}>
            <button onClick={onClose} style={{ flex: 1, background: C.dark4, border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, padding: "12px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              Annuler
            </button>
            <button onClick={handleSave} disabled={saving || !form.title.trim()} style={{ flex: 2, background: saving ? C.goldDark : C.gold, border: "none", color: C.dark, borderRadius: 8, padding: "12px", fontSize: 12, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit", letterSpacing: "1px", opacity: !form.title.trim() ? 0.5 : 1 }}>
              {saving ? "Enregistrement…" : isNew ? "Créer le Pick" : "Enregistrer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── User Detail Modal ──────────────────────────────────────────────────────────
function UserDetailModal({ user, picks, subPrice, onClose, onActivated }: { user: ApiUser; picks: Pick[]; subPrice: number | null; onClose: () => void; onActivated: (updated: ApiUser) => void }) {
  const unlockedPicks = picks.filter((p) => user.unlockedPickIds.includes(p._id));
  const pickRevenue = unlockedPicks.reduce((sum, p) => sum + p.price, 0);
  const isActiveSubscriber = user.subscription?.status === "ACTIVE" && user.subscription.expiresAt && new Date(user.subscription.expiresAt) > new Date();
  const subRevenue = isActiveSubscriber && subPrice != null ? subPrice : 0;
  const revenue = pickRevenue + subRevenue;

  const [activating, setActivating] = useState(false);
  const [activateMsg, setActivateMsg] = useState<string | null>(null);

  // ─── Password reset (stand-in for "forgot password") ────────────────
  // No email/SMS in this system, so a user can't self-serve a reset —
  // support verifies them informally (chat) and an admin resets the
  // password on this SAME account here. Nothing to sync: the account,
  // its subscription and unlocked picks never move.
  const [resetOpen, setResetOpen] = useState(false);
  const [resetCustom, setResetCustom] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // ─── Phone number change (support action — new SIM, or a typo at signup) ──
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const handleChangePhone = async () => {
    setPhoneSaving(true);
    setPhoneError(null);
    try {
      const res = await fetch(`/api/admin/users/${user._id}/change-phone`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPhone }),
      });
      const data = await res.json();
      if (data?.success) {
        onActivated(data.data); // generic "user was updated" callback — see its wiring below
        setNewPhone("");
        setPhoneOpen(false);
      } else {
        setPhoneError(data.message || "Échec du changement de numéro.");
      }
    } catch {
      setPhoneError("Erreur réseau lors du changement de numéro.");
    } finally {
      setPhoneSaving(false);
    }
  };

  const handleResetPassword = async () => {
    setResetting(true);
    setResetError(null);
    try {
      const res = await fetch(`/api/admin/users/${user._id}/reset-password`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(resetCustom.trim() ? { newPassword: resetCustom.trim() } : {}),
      });
      const data = await res.json();
      if (data?.success) {
        setRevealedPassword(data.newPassword || resetCustom.trim());
        setResetCustom("");
        setResetOpen(false);
      } else {
        setResetError(data.message || "Échec de la réinitialisation.");
      }
    } catch {
      setResetError("Erreur réseau lors de la réinitialisation.");
    } finally {
      setResetting(false);
    }
  };

  const handleCopyPassword = async () => {
    if (!revealedPassword) return;
    try {
      await navigator.clipboard.writeText(revealedPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable — the value is still shown to copy manually */ }
  };

  const handleActivate = async () => {
    if (!confirm(`Activer manuellement l'abonnement de ${user.phone} pour 30 jours ?\n\nÀ utiliser seulement si ce client a réellement payé mais n'a pas été débloqué (privilégiez d'abord "Réconcilier les paiements" dans l'onglet Revenus s'il existe un paiement correspondant).`)) return;
    setActivating(true);
    setActivateMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${user._id}/activate-subscription`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 30 }),
      });
      const data = await res.json();
      if (data?.success) {
        onActivated(data.data);
        setActivateMsg("Abonnement activé avec succès.");
      } else {
        setActivateMsg(data.message || "Échec de l'activation.");
      }
    } catch {
      setActivateMsg("Erreur réseau lors de l'activation.");
    } finally {
      setActivating(false);
      setTimeout(() => setActivateMsg(null), 4000);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16, backdropFilter: "blur(4px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ background: C.dark2, border: `1px solid ${C.border}`, borderRadius: 16, width: "100%", maxWidth: 460, maxHeight: "88vh", overflowY: "auto", padding: 24 }}>
        {isActiveSubscriber && (
          <div style={{ background: "rgba(201,168,76,0.06)", border: "1px solid rgba(201,168,76,0.2)", borderRadius: 8, padding: "10px 12px", marginBottom: 16, fontSize: 12, color: C.gold }}>
            Abonné mensuel — actif jusqu'au {new Date(user.subscription!.expiresAt!).toLocaleDateString("fr-FR")}
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: "2px", color: C.muted, textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>
              {user.role === "ADMIN" ? "Administrateur" : "Utilisateur"}
            </div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, color: C.text }}>{user.phone}</div>
          </div>
          <button onClick={onClose} style={{ background: C.dark4, border: `1px solid ${C.border}`, borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.muted }}>
            <Icons.close />
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
          {[
            { val: unlockedPicks.length, label: "Picks", color: C.gold },
            { val: unlockedPicks.filter((p) => p.outcome === "WIN").length, label: "Wins", color: C.green },
            { val: `${Math.round(revenue / 1000)}K`, label: "FCFA", color: C.gold },
          ].map(({ val, label, color }) => (
            <div key={label} style={{ background: C.dark3, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 8px", textAlign: "center" }}>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color }}>{val}</div>
              <div style={{ fontSize: 9, color: C.muted, letterSpacing: "1px", textTransform: "uppercase", marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>

        {subRevenue > 0 && (
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 16 }}>
            Répartition: <span style={{ color: C.gold }}>{formatCFA(pickRevenue)}</span> picks · <span style={{ color: C.gold }}>{formatCFA(subRevenue)}</span> abonnement
          </div>
        )}

        {user.role !== "ADMIN" && (
          <div style={{ marginBottom: 20 }}>
            <button
              onClick={handleActivate}
              disabled={activating}
              style={{
                width: "100%", background: "none", border: `1px solid ${isActiveSubscriber ? C.border : "rgba(201,168,76,0.4)"}`,
                color: isActiveSubscriber ? C.muted : C.gold, borderRadius: 8, padding: "10px 12px",
                fontSize: 12, fontWeight: 600, cursor: activating ? "not-allowed" : "pointer",
                fontFamily: "inherit", opacity: activating ? 0.6 : 1,
              }}
              title="Réservé au support : accorde l'abonnement sans paiement correspondant retrouvé"
            >
              {activating ? "Activation…" : isActiveSubscriber ? "Prolonger l'abonnement de 30 jours (manuel)" : "Activer l'abonnement manuellement (30 jours)"}
            </button>
            {activateMsg && (
              <div style={{ fontSize: 11, color: activateMsg.includes("succès") ? C.green : C.red, marginTop: 6, textAlign: "center" }}>
                {activateMsg}
              </div>
            )}
          </div>
        )}

        {/* Password reset — stand-in for "forgot password" */}
        <div style={{ marginBottom: 20 }}>
          {revealedPassword ? (
            <div style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ fontSize: 11, color: C.green, marginBottom: 6 }}>
                Nouveau mot de passe — transmets-le au client, il ne sera plus affiché ensuite :
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <code style={{ flex: 1, background: C.dark4, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 10px", fontSize: 13, color: C.text, fontFamily: "monospace", letterSpacing: "0.5px", wordBreak: "break-all" }}>
                  {revealedPassword}
                </code>
                <button onClick={handleCopyPassword} style={{ background: C.dark4, border: `1px solid ${C.border}`, color: copied ? C.green : C.muted, borderRadius: 6, padding: "6px 10px", fontSize: 11, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
                  {copied ? "Copié ✓" : "Copier"}
                </button>
              </div>
              <button onClick={() => setRevealedPassword(null)} style={{ background: "none", border: "none", color: C.muted, fontSize: 11, cursor: "pointer", fontFamily: "inherit", marginTop: 8, padding: 0, textDecoration: "underline" }}>
                J&apos;ai transmis le mot de passe
              </button>
            </div>
          ) : resetOpen ? (
            <div style={{ background: C.dark3, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 8, lineHeight: 1.5 }}>
                Laisse vide pour générer un mot de passe aléatoire, ou définis-en un toi-même.
              </div>
              <input
                value={resetCustom}
                onChange={(e) => setResetCustom(e.target.value)}
                placeholder="Mot de passe personnalisé (optionnel)"
                style={{ width: "100%", background: C.dark4, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 12, padding: "8px 10px", fontFamily: "inherit", outline: "none", marginBottom: 8, boxSizing: "border-box" }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => { setResetOpen(false); setResetCustom(""); setResetError(null); }} style={{ flex: 1, background: C.dark4, border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, padding: "8px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
                  Annuler
                </button>
                <button onClick={handleResetPassword} disabled={resetting} style={{ flex: 1, background: C.gold, border: "none", color: C.dark, borderRadius: 6, padding: "8px", fontSize: 11, fontWeight: 700, cursor: resetting ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: resetting ? 0.6 : 1 }}>
                  {resetting ? "…" : "Confirmer"}
                </button>
              </div>
              {resetError && <div style={{ fontSize: 11, color: C.red, marginTop: 6 }}>{resetError}</div>}
            </div>
          ) : (
            <button
              onClick={() => setResetOpen(true)}
              style={{ width: "100%", background: "none", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, padding: "10px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
              title="Aucun email/SMS dans ce système — vérifie l'identité du client via le chat avant de réinitialiser"
            >
              Réinitialiser le mot de passe
            </button>
          )}
        </div>

        {/* Phone number change — support action, same _id so subscription/picks/payments are untouched */}
        {user.role !== "ADMIN" && (
          <div style={{ marginBottom: 20 }}>
            {phoneOpen ? (
              <div style={{ background: C.dark3, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 8, lineHeight: 1.5 }}>
                  Nouveau numéro de téléphone camerounais (format : 6XX XXX XXX).
                </div>
                <input
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="6XX XXX XXX"
                  style={{ width: "100%", background: C.dark4, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 12, padding: "8px 10px", fontFamily: "inherit", outline: "none", marginBottom: 8, boxSizing: "border-box" }}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => { setPhoneOpen(false); setNewPhone(""); setPhoneError(null); }} style={{ flex: 1, background: C.dark4, border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, padding: "8px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
                    Annuler
                  </button>
                  <button onClick={handleChangePhone} disabled={phoneSaving || !newPhone.trim()} style={{ flex: 1, background: C.gold, border: "none", color: C.dark, borderRadius: 6, padding: "8px", fontSize: 11, fontWeight: 700, cursor: (phoneSaving || !newPhone.trim()) ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: (phoneSaving || !newPhone.trim()) ? 0.6 : 1 }}>
                    {phoneSaving ? "…" : "Confirmer"}
                  </button>
                </div>
                {phoneError && <div style={{ fontSize: 11, color: C.red, marginTop: 6 }}>{phoneError}</div>}
              </div>
            ) : (
              <button
                onClick={() => setPhoneOpen(true)}
                style={{ width: "100%", background: "none", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, padding: "10px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                title="Vérifie l'identité du client via le chat avant de changer son numéro"
              >
                Changer le numéro de téléphone
              </button>
            )}
          </div>
        )}

        <div style={{ fontSize: 10, letterSpacing: "2px", color: C.muted, textTransform: "uppercase", fontWeight: 600, marginBottom: 10 }}>
          Picks débloqués
        </div>
        {unlockedPicks.length === 0 ? (
          <div style={{ fontSize: 12, color: C.muted, textAlign: "center", padding: "16px 0" }}>Aucun pick débloqué</div>
        ) : unlockedPicks.map((p) => (
          <div key={p._id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: C.dark4, borderRadius: 8, marginBottom: 6, border: `1px solid ${C.border}`, gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, color: C.text, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.title}</div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{p.league} · {formatDate(p.match_date)}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <span style={{ fontSize: 11, color: C.gold, fontFamily: "monospace" }}>{formatCFA(p.price)}</span>
              <Badge outcome={p.outcome} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Pick Action Buttons ───────────────────────────────────────────────────────
function PickActions({ pick, onEdit, onDelete, onToggle }: { pick: Pick; onEdit: () => void; onDelete: () => void; onToggle: () => void }) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      <button onClick={onToggle} title={pick.is_published ? "Dépublier" : "Publier"} style={{ background: C.dark4, border: `1px solid ${C.border}`, borderRadius: 6, color: pick.is_published ? C.green : C.muted, width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
        {pick.is_published ? <Icons.eye /> : <Icons.eyeOff />}
      </button>
      <button onClick={onEdit} style={{ background: C.dark4, border: `1px solid ${C.border}`, borderRadius: 6, color: C.muted, width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
        <Icons.edit />
      </button>
      <button onClick={onDelete} style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 6, color: C.red, width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
        <Icons.trash />
      </button>
    </div>
  );
}

// ─── Picks Tab ──────────────────────────────────────────────────────────────────
function PicksTab({ picks, setPicks }: { picks: Pick[]; setPicks: React.Dispatch<React.SetStateAction<Pick[]>> }) {
  const [showForm, setShowForm] = useState(false);
  const [editPick, setEditPick] = useState<Pick | null>(null);
  const [search, setSearch] = useState("");
  const [filterOutcome, setFilterOutcome] = useState("ALL");
  // Admin-manageable tip/market options (1, X, 2, 1X, …) — see Paramètres
  // › Gestion des pronostics. Falls back to DEFAULT_TIPS until this loads.
  const [tipOptions, setTipOptions] = useState<string[]>(DEFAULT_TIPS);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/settings", { credentials: "include" });
        const data = await res.json();
        if (!cancelled && Array.isArray(data?.data?.tipOptions) && data.data.tipOptions.length > 0) {
          setTipOptions(data.data.tipOptions);
        }
      } catch (e) { console.error("Tip options fetch:", e); }
    })();
    return () => { cancelled = true; };
  }, []);
  const [filterLeague, setFilterLeague] = useState("ALL");
  const [showImport, setShowImport] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const filtered = useMemo(() => picks.filter((p) => {
    const s = search.toLowerCase();
    return (
      (p.title.toLowerCase().includes(s) || p.league.toLowerCase().includes(s)) &&
      (filterOutcome === "ALL" || p.outcome === filterOutcome) &&
      (filterLeague === "ALL" || p.league === filterLeague)
    );
  }), [picks, search, filterOutcome, filterLeague]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  // A new search/filter always jumps back to page 1 — staying on, say,
  // page 3 of the old result set would otherwise often land on an empty
  // page. Clamping on totalPages separately (below) catches the other
  // case: the list itself shrinking (a delete) past the current page.
  useEffect(() => { setPage(1); }, [search, filterOutcome, filterLeague]);
  useEffect(() => { setPage((p) => Math.min(p, totalPages)); }, [totalPages]);

  const stalePicks = useMemo(() => picks.filter(isStalePending), [picks]);

  useEffect(() => {
    setSelected((prev) => {
      const validIds = new Set(picks.map((p) => p._id));
      const next = new Set([...prev].filter((id) => validIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [picks]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Scoped to the current page, not the whole filtered set — selections
  // made on other pages are preserved (bulk-delete still acts on every
  // id in `selected`, across pages) rather than silently dropped.
  const allPageSelected = paged.length > 0 && paged.every((p) => selected.has(p._id));

  const togglePageSelectAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        paged.forEach((p) => next.delete(p._id));
      } else {
        paged.forEach((p) => next.add(p._id));
      }
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  const handleSave = (p: Pick) => {
    setPicks((prev) => {
      const idx = prev.findIndex((x) => x._id === p._id);
      if (idx >= 0) { const next = [...prev]; next[idx] = p; return next; }
      return [p, ...prev];
    });
    setShowForm(false);
    setEditPick(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer ce pick ?")) return;
    try { await fetch(`/api/picks/${id}`, { method: "DELETE", credentials: "include" }); } catch { /* optimistic */ }
    setPicks((prev) => prev.filter((p) => p._id !== id));
    setSelected((prev) => { const next = new Set(prev); next.delete(id); return next; });
  };

  const handleBulkDelete = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (!confirm(`Supprimer ${ids.length} pick${ids.length > 1 ? "s" : ""} ? Cette action est irréversible.`)) return;

    setBulkDeleting(true);
    try {
      await Promise.all(
        ids.map((id) =>
          fetch(`/api/picks/${id}`, { method: "DELETE", credentials: "include" }).catch(() => null)
        )
      );
    } finally {
      setPicks((prev) => prev.filter((p) => !ids.includes(p._id)));
      setSelected(new Set());
      setBulkDeleting(false);
    }
  };

  const togglePublish = async (id: string) => {
    const pick = picks.find((p) => p._id === id);
    if (!pick) return;
    const updated = { ...pick, is_published: !pick.is_published };
    try {
      await fetch(`/api/picks/${id}`, { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updated) });
    } catch { /* optimistic */ }
    setPicks((prev) => prev.map((p) => p._id === id ? updated : p));
  };

  const iStyle: React.CSSProperties = { background: C.dark4, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 12, padding: "8px 12px", fontFamily: "inherit", outline: "none" };

  return (
    <div>
      {stalePicks.length > 0 && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.25)",
          borderRadius: 10, padding: "10px 14px", marginBottom: 14, flexWrap: "wrap",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.red, fontSize: 12 }}>
            <Icons.alert />
            <span>
              {stalePicks.length} pick{stalePicks.length > 1 ? "s" : ""} en attente depuis plus de {STALE_PENDING_DAYS} jours — probablement introuvable(s) automatiquement, à graduer manuellement.
            </span>
          </div>
          <button
            onClick={() => { setFilterOutcome("PENDING"); setSearch(""); }}
            style={{ background: C.dark4, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: "6px 12px", fontSize: 11, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
          >
            Voir les picks en attente
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <input style={{ ...iStyle, flex: 1, minWidth: 140 }} placeholder="Rechercher…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select style={{ ...iStyle, cursor: "pointer" }} value={filterOutcome} onChange={(e) => setFilterOutcome(e.target.value)}>
          <option value="ALL">Tous résultats</option>
          <option value="WIN">Win</option>
          <option value="LOSS">Loss</option>
          <option value="PENDING">En cours</option>
          <option value="REFUNDED">Remboursé</option>
        </select>
        <select style={{ ...iStyle, cursor: "pointer" }} value={filterLeague} onChange={(e) => setFilterLeague(e.target.value)}>
          <option value="ALL">Toutes ligues</option>
          {LEAGUES.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <button onClick={() => { setEditPick(null); setShowForm(true); }}
          style={{ background: C.gold, color: C.dark, border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
          <Icons.plus /> Nouveau Pick
        </button>
        <button
          onClick={() => setShowImport(true)}
          style={{ background: C.dark4, border: `1px solid ${C.border}`, color: C.gold, borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}
        >
          ⚽ SoccerVital
        </button>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.25)",
          borderRadius: 10, padding: "10px 14px", marginBottom: 14, flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 12, color: C.text }}>
            {selected.size} pick{selected.size > 1 ? "s" : ""} sélectionné{selected.size > 1 ? "s" : ""}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={clearSelection} style={{ background: C.dark4, border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, padding: "6px 12px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
              Annuler
            </button>
            <button onClick={handleBulkDelete} disabled={bulkDeleting} style={{
              background: C.red, border: "none", color: "#fff", borderRadius: 6,
              padding: "6px 14px", fontSize: 11, fontWeight: 700, cursor: bulkDeleting ? "not-allowed" : "pointer",
              fontFamily: "inherit", opacity: bulkDeleting ? 0.6 : 1,
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <Icons.trash /> {bulkDeleting ? "Suppression…" : `Supprimer (${selected.size})`}
            </button>
          </div>
        </div>
      )}

      {/* Desktop table */}
      <div className="admin-table-desktop">
        <div style={{ background: C.dark3, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "28px 2fr 1fr 1fr 1fr 1fr auto", padding: "10px 16px", borderBottom: `1px solid ${C.border}`, fontSize: 9, letterSpacing: "2px", color: C.muted, textTransform: "uppercase", fontWeight: 600, alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={allPageSelected}
              onChange={togglePageSelectAll}
              style={{ cursor: "pointer", width: 14, height: 14 }}
            />
            <span>Titre</span><span>Ligue</span><span>Date</span><span>Cotes / Prix</span><span>Statut</span><span>Actions</span>
          </div>
          {filtered.length === 0 && <div style={{ padding: "32px", textAlign: "center", color: C.muted, fontSize: 13 }}>Aucun pick trouvé.</div>}
          {paged.map((p, i) => {
            const isSelected = selected.has(p._id);
            return (
              <div key={p._id}
                style={{ display: "grid", gridTemplateColumns: "28px 2fr 1fr 1fr 1fr 1fr auto", padding: "12px 16px", alignItems: "center", gap: 8, borderBottom: i < paged.length - 1 ? `1px solid ${C.border}` : "none", borderLeft: `3px solid ${outcomeAccent(p.outcome)}`, background: isSelected ? "rgba(201,168,76,0.05)" : "transparent", transition: "background 0.15s" }}
                onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = C.dark4; }}
                onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelect(p._id)}
                  style={{ cursor: "pointer", width: 14, height: 14 }}
                />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{p.title}</div>
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{p.matches.length} sélection{p.matches.length !== 1 ? "s" : ""}</div>
                </div>
                <div style={{ fontSize: 11, color: C.muted }}>{p.league}</div>
                <div style={{ fontSize: 11, color: C.muted }}>{formatDate(p.match_date)}</div>
                <div>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: C.gold }}>x{p.total_odds}</div>
                  <div style={{ fontSize: 10, color: C.muted }}>{formatCFA(p.price)}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <Badge outcome={p.outcome} />
                    {isStalePending(p) && (
                      <span title={`En attente depuis ${daysSinceMatch(p.match_date)} jours`} style={{ color: C.red, display: "flex", alignItems: "center" }}>
                        <Icons.alert />
                      </span>
                    )}
                  </div>
                  <Badge outcome={p.is_published ? "live" : "draft"} />
                </div>
                <PickActions pick={p} onEdit={() => { setEditPick(p); setShowForm(true); }} onDelete={() => handleDelete(p._id)} onToggle={() => togglePublish(p._id)} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile cards */}
      <div className="admin-cards-mobile">
        {filtered.length === 0 && <div style={{ textAlign: "center", color: C.muted, fontSize: 13, padding: "32px 0" }}>Aucun pick trouvé.</div>}
        {paged.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, padding: "0 2px" }}>
            <input type="checkbox" checked={allPageSelected} onChange={togglePageSelectAll} style={{ cursor: "pointer", width: 14, height: 14 }} />
            <span style={{ fontSize: 11, color: C.muted }}>Tout sélectionner (page)</span>
          </div>
        )}
        {paged.map((p) => {
          const isSelected = selected.has(p._id);
          return (
            <div key={p._id} style={{
              background: isSelected ? "rgba(201,168,76,0.05)" : C.dark3,
              borderTop: `1px solid ${isSelected ? C.goldDark : C.border}`,
              borderRight: `1px solid ${isSelected ? C.goldDark : C.border}`,
              borderBottom: `1px solid ${isSelected ? C.goldDark : C.border}`,
              borderLeft: `3px solid ${outcomeAccent(p.outcome)}`,
              borderRadius: 10, padding: 14, marginBottom: 10,
            }}>              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, gap: 8 }}>
                <div style={{ display: "flex", gap: 10, minWidth: 0 }}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(p._id)}
                    style={{ cursor: "pointer", width: 14, height: 14, marginTop: 3, flexShrink: 0 }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 3 }}>{p.title}</div>
                    <div style={{ fontSize: 10, color: C.muted }}>{p.league} · {formatDate(p.match_date)}</div>
                  </div>
                </div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color: C.gold, flexShrink: 0 }}>x{p.total_odds}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <Badge outcome={p.outcome} />
                  {isStalePending(p) && (
                    <span title={`En attente depuis ${daysSinceMatch(p.match_date)} jours`} style={{ color: C.red, display: "flex", alignItems: "center" }}>
                      <Icons.alert />
                    </span>
                  )}
                  <Badge outcome={p.is_published ? "live" : "draft"} />
                </div>
                <PickActions pick={p} onEdit={() => { setEditPick(p); setShowForm(true); }} onDelete={() => handleDelete(p._id)} onToggle={() => togglePublish(p._id)} />
              </div>
            </div>
          );
        })}
      </div>

      <Pagination page={page} totalPages={totalPages} total={filtered.length} onChange={setPage} />

      {(showForm || editPick) && (
        <PickFormModal pick={editPick} onSave={handleSave} onClose={() => { setShowForm(false); setEditPick(null); }} tipOptions={tipOptions} />
      )}
      {showImport && (
        <SoccerVitalImportModal
          tipOptions={tipOptions}
          onClose={() => setShowImport(false)}
          onPickCreated={(pick) => {
            const normalized = {
              ...pick,
              matches: pick.matches.map((m) => ({ ...m, _id: Math.random().toString(36).slice(2, 9) })),
            };
            setPicks((prev) => [normalized as Pick, ...prev]);
            setShowImport(false);
          }}
        />
      )}
    </div>
  );
}

// ─── Users Tab ──────────────────────────────────────────────────────────────────
function UsersTab({ users, setUsers, usersLoading, picks }: { users: ApiUser[]; setUsers: React.Dispatch<React.SetStateAction<ApiUser[]>>; usersLoading: boolean; picks: Pick[] }) {
  const [selectedUser, setSelectedUser] = useState<ApiUser | null>(null);
  const [search, setSearch] = useState("");
  const [subPrice, setSubPrice] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/settings", { credentials: "include" });
        const data = await res.json();
        if (data?.success) setSubPrice(data.data.subscriptionMonthlyPrice);
      } catch { /* falls back to pick-only revenue below */ }
    })();
  }, []);

  const filtered = useMemo(() =>
    users.filter((u) => u.phone.includes(search) || u.role.toLowerCase().includes(search.toLowerCase())),
    [users, search]
  );

  if (usersLoading) {
    return <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}><Spinner /></div>;
  }

  const isActiveSubscriber = (u: ApiUser) =>
    u.subscription?.status === "ACTIVE" && u.subscription.expiresAt && new Date(u.subscription.expiresAt) > new Date();

  const UserRow = ({ u }: { u: ApiUser }) => {
    const unlocked = picks.filter((p) => u.unlockedPickIds.includes(p._id));
    const wins = unlocked.filter((p) => p.outcome === "WIN").length;
    const pickRev = unlocked.reduce((s, p) => s + p.price, 0);
    const subscribed = isActiveSubscriber(u);
    const subRev = subscribed && subPrice != null ? subPrice : 0;
    const rev = pickRev + subRev;
    const avatar = (
      <div style={{ width: 34, height: 34, borderRadius: "50%", background: u.role === "ADMIN" ? "rgba(201,168,76,0.15)" : "rgba(59,130,246,0.1)", border: `1px solid ${u.role === "ADMIN" ? C.goldDark : "#1d4ed8"}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Bebas Neue', sans-serif", fontSize: 13, color: u.role === "ADMIN" ? C.gold : C.blue, flexShrink: 0 }}>
        {u.phone.slice(-2)}
      </div>
    );
    const roleBadge = (
      <span style={{ fontSize: 9, letterSpacing: "1px", fontWeight: 700, padding: "2px 7px", borderRadius: 3, textTransform: "uppercase", background: u.role === "ADMIN" ? "rgba(201,168,76,0.1)" : "rgba(59,130,246,0.1)", color: u.role === "ADMIN" ? C.gold : C.blue }}>
        {u.role}
      </span>
    );
    return { unlocked, wins, rev, pickRev, subRev, avatar, roleBadge };
  };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <input style={{ background: C.dark4, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 12, padding: "8px 12px", fontFamily: "inherit", outline: "none", width: "100%", maxWidth: 300 }}
          placeholder="Rechercher par numéro ou rôle…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="admin-table-desktop">
        <div style={{ background: C.dark3, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.5fr 0.8fr 0.8fr 1fr 1fr 1fr 1fr auto", padding: "10px 16px", borderBottom: `1px solid ${C.border}`, fontSize: 9, letterSpacing: "2px", color: C.muted, textTransform: "uppercase", fontWeight: 600 }}>
            <span>Téléphone</span><span>Rôle</span><span>Abonnement</span><span>Picks</span><span>Wins</span><span>Dépensé</span><span>Dernière conn.</span><span>Détails</span>
          </div>
          {filtered.length === 0 && <div style={{ padding: "32px", textAlign: "center", color: C.muted, fontSize: 13 }}>Aucun utilisateur.</div>}
          {filtered.map((u, i) => {
            const { unlocked, wins, rev, avatar, roleBadge } = UserRow({ u });
            return (
              <div key={u._id}
                style={{ display: "grid", gridTemplateColumns: "1.5fr 0.8fr 0.8fr 1fr 1fr 1fr 1fr auto", padding: "12px 16px", alignItems: "center", borderBottom: i < filtered.length - 1 ? `1px solid ${C.border}` : "none", cursor: "pointer", transition: "background 0.15s" }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = C.dark4)}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
                onClick={() => setSelectedUser(u)}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>{avatar}<div style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{u.phone}</div></div>
                <div>{roleBadge}</div>
                <div><SubscriptionBadge subscription={u.subscription} /></div>
                <div><span style={{ background: "rgba(201,168,76,0.1)", color: C.gold, border: "1px solid rgba(201,168,76,0.2)", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4 }}>{unlocked.length} picks</span></div>
                <div style={{ fontSize: 12, color: C.green, fontWeight: 600 }}>{wins} wins</div>
                <div style={{ fontSize: 12, color: C.text }}>{formatCFA(rev)}</div>
                <div style={{ fontSize: 11, color: C.muted }}>
                  {u.lastLoginAt
                    ? new Date(u.lastLoginAt).toLocaleDateString("fr-FR", {
                      day: "numeric", month: "short",
                      hour: "2-digit", minute: "2-digit",
                    })
                    : "—"}
                </div>
                <button style={{ background: C.dark4, border: `1px solid ${C.border}`, borderRadius: 6, color: C.muted, padding: "5px 10px", fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}>Voir →</button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="admin-cards-mobile">
        {filtered.length === 0 && <div style={{ textAlign: "center", color: C.muted, fontSize: 13, padding: "32px 0" }}>Aucun utilisateur.</div>}
        {filtered.map((u) => {
          const { unlocked, wins, rev, avatar, roleBadge } = UserRow({ u });
          return (
            <div key={u._id} onClick={() => setSelectedUser(u)} style={{ background: C.dark3, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14, marginBottom: 10, cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {avatar}
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 3 }}>{u.phone}</div>
                    {roleBadge}
                    <SubscriptionBadge subscription={u.subscription} />
                  </div>
                </div>
                <div style={{ fontSize: 13, color: C.gold, fontWeight: 700 }}>{formatCFA(rev)}</div>
              </div>
              <div style={{ display: "flex", gap: 14, fontSize: 11, color: C.muted, flexWrap: "wrap" }}>
                <span>{unlocked.length} picks débloqués</span>
                <span style={{ color: C.green }}>{wins} wins</span>
                <span>
                  {u.lastLoginAt
                    ? `🕐 ${new Date(u.lastLoginAt).toLocaleDateString("fr-FR", {
                      day: "numeric", month: "short",
                      hour: "2-digit", minute: "2-digit",
                    })}`
                    : "Jamais connecté"}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {selectedUser && (
        <UserDetailModal
          user={selectedUser}
          picks={picks}
          subPrice={subPrice}
          onClose={() => setSelectedUser(null)}
          onActivated={(updated) => {
            setUsers((prev) => prev.map((x) => (x._id === updated._id ? updated : x)));
            setSelectedUser(updated);
          }}
        />
      )}
    </div>
  );
}

// ─── Revenue Tab ───────────────────────────────────────────────────────────────
function RevenueTab({ picks, users }: { picks: Pick[]; users: ApiUser[] }) {
  const today = new Date().toISOString().split("T")[0];
  const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
  const [dateFrom, setDateFrom] = useState(thirtyAgo);
  const [dateTo, setDateTo] = useState(today);
  const [subPrice, setSubPrice] = useState<number | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] = useState<{
    checked: number; fulfilled: number; stillPending: number; failedOrExpired: number; errors: number; truncated: boolean;
  } | null>(null);
  const [reconcileError, setReconcileError] = useState<string | null>(null);

  // Search + pagination for the "Revenus par Pick" list below — it grows
  // one row per pick over time, unlike the small per-league breakdown next
  // to it, so it's the one that needs both. Client-side since picks/users
  // are already fully loaded in the parent (no dedicated API call here).
  const [pickSearch, setPickSearch] = useState("");
  const [pickSort, setPickSort] = useState<"revenue" | "date">("revenue");
  const [pickPage, setPickPage] = useState(1);
  const PICK_PAGE_SIZE = 10;

  const handleReconcile = async () => {
    setReconciling(true);
    setReconcileError(null);
    setReconcileResult(null);
    try {
      const res = await fetch("/api/admin/payments/reconcile", { method: "POST", credentials: "include" });
      const data = await res.json();
      if (data?.success) {
        setReconcileResult(data.data);
      } else {
        setReconcileError(data.message || "Échec de la réconciliation.");
      }
    } catch {
      setReconcileError("Erreur réseau lors de la réconciliation.");
    } finally {
      setReconciling(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/settings", { credentials: "include" });
        const data = await res.json();
        if (data?.success) setSubPrice(data.data.subscriptionMonthlyPrice);
      } catch { /* fall back to pick-only revenue */ }
    })();
  }, []);

  // match_date comes back from the API as a full ISO datetime (e.g.
  // "2025-09-01T00:00:00.000Z"), while dateFrom/dateTo are bare
  // "YYYY-MM-DD" strings from the date inputs. Comparing them directly
  // works for the lower bound (any same-day timestamp sorts >= the bare
  // date) but silently breaks the upper bound: "2025-09-01" is a string
  // prefix of "2025-09-01T00:00:00.000Z" and therefore sorts *before* it,
  // so a pick dated exactly on dateTo (typically "today") always fails
  // the <= check and drops out of the range — which is why today's/live
  // data was going missing. Strip the time before comparing, same as
  // subscriptionRevenue/newSubscribersInRange already do below.
  const filteredPicks = useMemo(() =>
    picks.filter((p) => {
      const d = p.match_date.split("T")[0];
      return d >= dateFrom && d <= dateTo;
    }),
    [picks, dateFrom, dateTo]
  );

  const pickRevenue = useMemo(() =>
    users.reduce((t, u) => t + u.unlockedPickIds.reduce((s, pid) => { const p = filteredPicks.find((pk) => pk._id === pid); return s + (p ? p.price : 0); }, 0), 0),
    [users, filteredPicks]
  );

  const subscriptionRevenue = useMemo(() => {
    if (subPrice == null) return 0;
    return users.filter((u) => {
      if (!u.subscription?.startedAt) return false;
      const started = u.subscription.startedAt.split("T")[0];
      return started >= dateFrom && started <= dateTo;
    }).length * subPrice;
  }, [users, dateFrom, dateTo, subPrice]);

  const totalRevenue = pickRevenue + subscriptionRevenue;

  const totalUnlocks = useMemo(() =>
    users.reduce((t, u) => t + u.unlockedPickIds.filter((pid) => filteredPicks.find((p) => p._id === pid)).length, 0),
    [users, filteredPicks]
  );

  const newSubscribersInRange = useMemo(() =>
    users.filter((u) => {
      if (!u.subscription?.startedAt) return false;
      const started = u.subscription.startedAt.split("T")[0];
      return started >= dateFrom && started <= dateTo;
    }).length,
    [users, dateFrom, dateTo]
  );

  const perPickRevenue = useMemo(() =>
    filteredPicks.map((p) => {
      const unlocks = users.filter((u) => u.unlockedPickIds.includes(p._id)).length;
      return { pick: p, unlocks, revenue: unlocks * p.price };
    }).sort((a, b) =>
      pickSort === "date" ? b.pick.match_date.localeCompare(a.pick.match_date) : b.revenue - a.revenue
    ),
    [filteredPicks, users, pickSort]
  );

  const byLeague = useMemo(() => {
    const map: Record<string, number> = {};
    perPickRevenue.forEach(({ pick, revenue }) => { map[pick.league] = (map[pick.league] || 0) + revenue; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [perPickRevenue]);

  const filteredPickRevenue = useMemo(() => {
    const s = pickSearch.trim().toLowerCase();
    if (!s) return perPickRevenue;
    return perPickRevenue.filter(({ pick }) => pick.title.toLowerCase().includes(s) || pick.league.toLowerCase().includes(s));
  }, [perPickRevenue, pickSearch]);

  const pickTotalPages = Math.max(1, Math.ceil(filteredPickRevenue.length / PICK_PAGE_SIZE));
  const pagedPickRevenue = useMemo(() => {
    const start = (pickPage - 1) * PICK_PAGE_SIZE;
    return filteredPickRevenue.slice(start, start + PICK_PAGE_SIZE);
  }, [filteredPickRevenue, pickPage]);

  // Any change upstream (search text, or the date range reshaping the
  // underlying list) can leave pickPage past the new last page — reset to
  // page 1 rather than render an empty page.
  useEffect(() => { setPickPage(1); }, [pickSearch, pickSort, dateFrom, dateTo]);

  const maxRev = byLeague[0]?.[1] || 1;
  // Win rate excludes REFUNDED picks — a void isn't a loss, so it shouldn't
  // count against the rate (matches the same fix in OverviewTab).
  const decided = filteredPicks.filter((p) => p.outcome === "WIN" || p.outcome === "LOSS");
  const winRate = decided.length > 0 ? Math.round((decided.filter((p) => p.outcome === "WIN").length / decided.length) * 100) : 0;

  const dailyRevenue = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of filteredPicks) {
      const day = p.match_date.split("T")[0];
      const unlocks = users.filter((u) => u.unlockedPickIds.includes(p._id)).length;
      map.set(day, (map.get(day) || 0) + unlocks * p.price);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, value]) => ({
        label: new Date(day + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" }),
        value,
      }));
  }, [filteredPicks, users]);

  const iStyle: React.CSSProperties = { background: C.dark4, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 12, padding: "8px 12px", fontFamily: "inherit", outline: "none" };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 22, background: C.dark3, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, color: C.muted, letterSpacing: "1.5px", textTransform: "uppercase", fontWeight: 600 }}>Période</span>
        <input type="date" style={iStyle} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <span style={{ color: C.muted, fontSize: 12 }}>→</span>
        <input type="date" style={iStyle} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        {[{ label: "7J", days: 7 }, { label: "30J", days: 30 }, { label: "90J", days: 90 }].map(({ label, days }) => (
          <button key={label} onClick={() => { setDateTo(today); setDateFrom(new Date(Date.now() - days * 86400000).toISOString().split("T")[0]); }}
            style={{ background: C.dark4, border: `1px solid ${C.border}`, borderRadius: 6, color: C.muted, fontSize: 10, letterSpacing: "1px", fontWeight: 600, padding: "6px 10px", cursor: "pointer", fontFamily: "inherit" }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 12 }}>
        <StatCard label="Revenu Total" value={totalRevenue >= 1000 ? `${(totalRevenue / 1000).toFixed(0)}K` : totalRevenue} sub={formatCFA(totalRevenue)} accent />
        <StatCard label="Débloquages" value={totalUnlocks} sub={`${filteredPicks.length} picks`} />
        <StatCard label="Nouveaux Abonnés" value={newSubscribersInRange} sub={formatCFA(subscriptionRevenue)} />
        <StatCard label="Win Rate" value={`${winRate}%`} sub={`${filteredPicks.filter((p) => p.outcome === "WIN").length} victoires`} />
        <StatCard label="Prix Moyen" value={filteredPicks.length > 0 ? `${Math.round(filteredPicks.reduce((s, p) => s + p.price, 0) / filteredPicks.length / 100) * 100}` : "0"} sub="FCFA / pick" />
      </div>

      <div style={{ fontSize: 11, color: C.muted, marginBottom: 22 }}>
        Répartition: <span style={{ color: C.gold }}>{formatCFA(pickRevenue)}</span> picks · <span style={{ color: C.gold }}>{formatCFA(subscriptionRevenue)}</span> abonnements
      </div>

      <div style={{ background: C.dark3, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: "2px", color: C.gold, textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>
              Paiements
            </div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: C.text, letterSpacing: 1 }}>
              Réconcilier les paiements
            </div>
          </div>
          <button
            onClick={handleReconcile}
            disabled={reconciling}
            style={{
              background: reconciling ? C.goldDark : C.gold, border: "none", color: C.dark,
              borderRadius: 8, padding: "10px 20px", fontSize: 12, fontWeight: 700,
              cursor: reconciling ? "not-allowed" : "pointer", fontFamily: "inherit",
              letterSpacing: "0.5px", whiteSpace: "nowrap",
            }}
          >
            {reconciling ? "Vérification…" : "Réconcilier maintenant"}
          </button>
        </div>
        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6, marginBottom: reconcileResult || reconcileError ? 14 : 0 }}>
          Si un paiement a été confirmé par l&apos;opérateur mais que la notification (webhook) ne nous est jamais parvenue, l&apos;abonnement ou le pick reste bloqué en attente — c&apos;est ce qui peut expliquer un client qui a payé mais n&apos;a pas accès. Ce bouton revérifie chaque paiement encore en attente directement auprès de l&apos;opérateur et active automatiquement ceux qui ont réellement été payés.
        </div>

        {reconcileError && (
          <div style={{ fontSize: 12, padding: "10px 12px", borderRadius: 6, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: C.red }}>
            {reconcileError}
          </div>
        )}

        {reconcileResult && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8, marginBottom: reconcileResult.fulfilled > 0 ? 10 : 0 }}>
              {[
                { label: "Vérifiés", val: reconcileResult.checked, color: C.text },
                { label: "Activés", val: reconcileResult.fulfilled, color: C.green },
                { label: "Toujours en attente", val: reconcileResult.stillPending, color: C.gold },
                { label: "Échoués/expirés", val: reconcileResult.failedOrExpired, color: C.red },
              ].map(({ label, val, color }) => (
                <div key={label} style={{ background: C.dark4, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 8px", textAlign: "center" }}>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color }}>{val}</div>
                  <div style={{ fontSize: 9, color: C.muted, letterSpacing: "0.5px", textTransform: "uppercase", marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>
            {reconcileResult.fulfilled > 0 && (
              <div style={{ fontSize: 12, color: C.green }}>
                ✅ {reconcileResult.fulfilled} client{reconcileResult.fulfilled > 1 ? "s" : ""} qui avai{reconcileResult.fulfilled > 1 ? "ent" : "t"} payé sans être activé{reconcileResult.fulfilled > 1 ? "s" : ""} vien{reconcileResult.fulfilled > 1 ? "nent" : "t"} d&apos;être débloqué{reconcileResult.fulfilled > 1 ? "s" : ""}.
              </div>
            )}
            {reconcileResult.fulfilled === 0 && reconcileResult.checked > 0 && (
              <div style={{ fontSize: 12, color: C.muted }}>Aucun paiement bloqué trouvé — tout est déjà à jour.</div>
            )}
            {reconcileResult.checked === 0 && (
              <div style={{ fontSize: 12, color: C.muted }}>Aucun paiement en attente à vérifier.</div>
            )}
            {reconcileResult.truncated && (
              <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>Plus de 200 paiements en attente — relancez pour continuer.</div>
            )}
          </div>
        )}
      </div>

      <div style={{ background: C.dark3, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, fontSize: 10, letterSpacing: "2px", color: C.muted, textTransform: "uppercase", fontWeight: 600 }}>Revenu par jour (picks)</div>
        <LineChart data={dailyRevenue} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        <div style={{ background: C.dark3, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, letterSpacing: "2px", color: C.muted, textTransform: "uppercase", fontWeight: 600 }}>Revenus par Pick</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                style={{ ...iStyle, padding: "6px 10px", fontSize: 11, width: 180 }}
                placeholder="Rechercher un pick…"
                value={pickSearch}
                onChange={(e) => setPickSearch(e.target.value)}
              />
              <select
                style={{ ...iStyle, padding: "6px 10px", fontSize: 11, cursor: "pointer" }}
                value={pickSort}
                onChange={(e) => setPickSort(e.target.value as "revenue" | "date")}
              >
                <option value="revenue">Trier par revenu</option>
                <option value="date">Trier par date</option>
              </select>
            </div>
          </div>
          {filteredPickRevenue.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: C.muted, fontSize: 12 }}>
              {pickSearch ? "Aucun résultat pour cette recherche." : "Aucune donnée"}
            </div>
          ) : (
            <>
              {pagedPickRevenue.map(({ pick, unlocks, revenue }, i) => (
                <div key={pick._id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: i < pagedPickRevenue.length - 1 ? `1px solid ${C.border}` : "none", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: C.text, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{pick.title}</div>
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{unlocks} débloquage{unlocks !== 1 ? "s" : ""}</div>
                  </div>
                  <div style={{ fontSize: 13, color: C.gold, fontWeight: 700, flexShrink: 0 }}>{formatCFA(revenue)}</div>
                </div>
              ))}
              <div style={{ padding: "0 16px" }}>
                <Pagination page={pickPage} totalPages={pickTotalPages} total={filteredPickRevenue.length} onChange={setPickPage} />
              </div>
            </>
          )}
        </div>

        <div style={{ background: C.dark3, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, fontSize: 10, letterSpacing: "2px", color: C.muted, textTransform: "uppercase", fontWeight: 600 }}>Revenus par Ligue</div>
          <div style={{ padding: "12px 16px" }}>
            {byLeague.length === 0 ? <div style={{ textAlign: "center", color: C.muted, fontSize: 12, padding: "12px 0" }}>Aucune donnée</div> :
              byLeague.map(([league, rev]) => (
                <div key={league} style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ fontSize: 12, color: C.text }}>{league}</span>
                    <span style={{ fontSize: 11, color: C.gold }}>{formatCFA(rev)}</span>
                  </div>
                  <div style={{ background: C.dark4, borderRadius: 4, height: 5, overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 4, width: `${Math.round((rev / maxRev) * 100)}%`, background: `linear-gradient(90deg, ${C.gold}, ${C.goldLight})`, transition: "width 0.5s ease" }} />
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Pagination Controls ────────────────────────────────────────────────────────
function Pagination({ page, totalPages, total, onChange }: { page: number; totalPages: number; total: number; onChange: (p: number) => void }) {
  if (total === 0) return null;
  const btnStyle = (disabled: boolean): React.CSSProperties => ({
    background: C.dark4, border: `1px solid ${C.border}`, borderRadius: 6,
    color: disabled ? C.faint : C.text, width: 30, height: 30,
    display: "flex", alignItems: "center", justifyContent: "center",
    cursor: disabled ? "not-allowed" : "pointer", flexShrink: 0,
  });
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "14px 4px" }}>
      <span style={{ fontSize: 11, color: C.muted }}>
        {total.toLocaleString("fr-FR")} résultat{total !== 1 ? "s" : ""} · page {page} / {totalPages}
      </span>
      <div style={{ display: "flex", gap: 6 }}>
        <button style={btnStyle(page <= 1)} disabled={page <= 1} onClick={() => onChange(page - 1)} title="Page précédente">
          <Icons.chevronLeft />
        </button>
        <button style={btnStyle(page >= totalPages)} disabled={page >= totalPages} onClick={() => onChange(page + 1)} title="Page suivante">
          <Icons.chevronRight />
        </button>
      </div>
    </div>
  );
}

// ─── Transactions Tab ───────────────────────────────────────────────────────────
// Lists raw Payment records straight from the DB (not the derived revenue
// numbers in the Revenue tab) so support can search/paginate every
// transaction tied to a user — by phone, Fapshi transaction id, status or
// type — without pulling the whole collection into the browser.
function TransactionsTab() {
  const [transactions, setTransactions] = useState<ApiTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [paymentType, setPaymentType] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });

  // Debounce free-text search so every keystroke doesn't fire a request.
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Any filter change resets back to page 1 — a stale page number past
  // the new result set's end would otherwise render an empty page.
  useEffect(() => { setPage(1); }, [status, paymentType, dateFrom, dateTo]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const params = new URLSearchParams({ page: String(page), limit: String(limit) });
        if (search) params.set("search", search);
        if (status !== "ALL") params.set("status", status);
        if (paymentType !== "ALL") params.set("paymentType", paymentType);
        if (dateFrom) params.set("dateFrom", dateFrom);
        if (dateTo) params.set("dateTo", dateTo);

        const res = await fetch(`/api/admin/transactions?${params.toString()}`, { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        if (data?.success) {
          setTransactions(data.data || []);
          setPagination({ total: data.pagination?.total ?? 0, totalPages: data.pagination?.totalPages ?? 1 });
        } else {
          setError(data?.message || "Échec du chargement des transactions.");
        }
      } catch (e) {
        console.error("Transactions fetch:", e);
        if (!cancelled) setError("Erreur réseau lors du chargement des transactions.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [page, limit, search, status, paymentType, dateFrom, dateTo]);

  const iStyle: React.CSSProperties = { background: C.dark4, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 12, padding: "8px 12px", fontFamily: "inherit", outline: "none" };

  const statusColor = (s: ApiTransaction["status"]) =>
    s === "SUCCESSFUL" ? C.green : s === "PENDING" ? C.gold : C.red;
  const statusLabel = (s: ApiTransaction["status"]) =>
    s === "SUCCESSFUL" ? "Réussi" : s === "PENDING" ? "En attente" : s === "FAILED" ? "Échoué" : "Expiré";

  const StatusBadge = ({ s }: { s: ApiTransaction["status"] }) => (
    <span style={{ background: `${statusColor(s)}1F`, color: statusColor(s), border: `1px solid ${statusColor(s)}40`, fontSize: 9, fontWeight: 700, padding: "3px 8px", borderRadius: 4, letterSpacing: "1px", textTransform: "uppercase", whiteSpace: "nowrap" }}>
      {statusLabel(s)}
    </span>
  );

  const formatDateTime = (d: string) =>
    new Date(d).toLocaleString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const userPhone = (t: ApiTransaction) =>
    (typeof t.userId === "object" && t.userId?.phone) || t.phone;

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <input
          style={{ ...iStyle, flex: 1, minWidth: 200 }}
          placeholder="Rechercher par téléphone, ID transaction ou ID utilisateur…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <select style={{ ...iStyle, cursor: "pointer" }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="ALL">Tous statuts</option>
          <option value="SUCCESSFUL">Réussi</option>
          <option value="PENDING">En attente</option>
          <option value="FAILED">Échoué</option>
          <option value="EXPIRED">Expiré</option>
        </select>
        <select style={{ ...iStyle, cursor: "pointer" }} value={paymentType} onChange={(e) => setPaymentType(e.target.value)}>
          <option value="ALL">Tous types</option>
          <option value="PICK">Pick</option>
          <option value="SUBSCRIPTION">Abonnement</option>
        </select>
        <input type="date" style={iStyle} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title="Du" />
        <span style={{ color: C.muted, fontSize: 12 }}>→</span>
        <input type="date" style={iStyle} value={dateTo} onChange={(e) => setDateTo(e.target.value)} title="Au" />
      </div>

      {error && (
        <div style={{ fontSize: 12, padding: "10px 12px", borderRadius: 6, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: C.red, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}><Spinner /></div>
      ) : (
        <>
          <div className="admin-table-desktop">
            <div style={{ background: C.dark3, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 0.9fr 0.9fr 1fr 1.3fr", padding: "10px 16px", borderBottom: `1px solid ${C.border}`, fontSize: 9, letterSpacing: "2px", color: C.muted, textTransform: "uppercase", fontWeight: 600 }}>
                <span>Utilisateur</span><span>ID Transaction</span><span>Type</span><span>Montant</span><span>Statut</span><span>Date</span>
              </div>
              {transactions.length === 0 && <div style={{ padding: "32px", textAlign: "center", color: C.muted, fontSize: 13 }}>Aucune transaction.</div>}
              {transactions.map((t, i) => (
                <div key={t._id}
                  style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 0.9fr 0.9fr 1fr 1.3fr", padding: "12px 16px", alignItems: "center", borderBottom: i < transactions.length - 1 ? `1px solid ${C.border}` : "none" }}>
                  <div style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{userPhone(t)}</div>
                  <div style={{ fontSize: 11, color: C.muted, fontFamily: "'JetBrains Mono', monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={t.fapshiTransId}>{t.fapshiTransId}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>{t.paymentType === "SUBSCRIPTION" ? "Abonnement" : "Pick"}</div>
                  <div style={{ fontSize: 12, color: C.gold, fontWeight: 600 }}>{formatCFA(t.amount)}</div>
                  <div><StatusBadge s={t.status} /></div>
                  <div style={{ fontSize: 11, color: C.muted }}>{formatDateTime(t.createdAt)}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="admin-cards-mobile">
            {transactions.length === 0 && <div style={{ textAlign: "center", color: C.muted, fontSize: 13, padding: "32px 0" }}>Aucune transaction.</div>}
            {transactions.map((t) => (
              <div key={t._id} style={{ background: C.dark3, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14, marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{userPhone(t)}</div>
                  <StatusBadge s={t.status} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.muted, marginBottom: 4 }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{t.fapshiTransId}</span>
                  <span style={{ color: C.gold, fontWeight: 700 }}>{formatCFA(t.amount)}</span>
                </div>
                <div style={{ display: "flex", gap: 10, fontSize: 11, color: C.muted, flexWrap: "wrap" }}>
                  <span>{t.paymentType === "SUBSCRIPTION" ? "Abonnement" : "Pick"}</span>
                  <span>{formatDateTime(t.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>

          <Pagination page={page} totalPages={pagination.totalPages} total={pagination.total} onChange={setPage} />
        </>
      )}
    </div>
  );
}

// ─── Overview Tab ───────────────────────────────────────────────────────────────
function OverviewTab({ picks, users }: { picks: Pick[]; users: ApiUser[] }) {
  // Win rate is computed over decided (WIN/LOSS) picks only — a REFUNDED
  // pick was voided, not lost, so it shouldn't drag the rate down.
  const decided = picks.filter((p) => p.outcome === "WIN" || p.outcome === "LOSS");
  const wins = decided.filter((p) => p.outcome === "WIN").length;
  const losses = decided.filter((p) => p.outcome === "LOSS").length;
  const pendingCount = picks.filter((p) => p.outcome === "PENDING").length;
  const refundedCount = picks.filter((p) => p.outcome === "REFUNDED").length;
  const winRate = decided.length > 0 ? Math.round((wins / decided.length) * 100) : 0;

  const pickRevenue = users.reduce((sum, u) =>
    sum + u.unlockedPickIds.reduce((s, pid) => { const p = picks.find((pk) => pk._id === pid); return s + (p ? p.price : 0); }, 0), 0
  );

  const activeSubscribers = users.filter((u) =>
    u.subscription?.status === "ACTIVE" && u.subscription.expiresAt && new Date(u.subscription.expiresAt) > new Date()
  );

  const [subPrice, setSubPrice] = useState<number | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/settings", { credentials: "include" });
        const data = await res.json();
        if (data?.success) setSubPrice(data.data.subscriptionMonthlyPrice);
      } catch { /* revenue falls back to pick-only if this fails */ }
    })();
  }, []);

  const subscriptionRevenue = subPrice != null ? activeSubscribers.length * subPrice : 0;
  const totalRevenue = pickRevenue + subscriptionRevenue;

  const activeUsers = users.filter((u) => u.unlockedPickIds.length > 0).length;
  const recentPicks = [...picks].sort((a, b) => b.match_date.localeCompare(a.match_date)).slice(0, 5);
  const topUsers = [...users]
    .map((u) => ({ u, rev: u.unlockedPickIds.reduce((s, pid) => { const p = picks.find((pk) => pk._id === pid); return s + (p ? p.price : 0); }, 0) }))
    .sort((a, b) => b.rev - a.rev).slice(0, 5);

  const revenueTrend = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of picks) {
      const day = p.match_date.split("T")[0];
      const unlocks = users.filter((u) => u.unlockedPickIds.includes(p._id)).length;
      if (unlocks === 0) continue;
      map.set(day, (map.get(day) || 0) + unlocks * p.price);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-14)
      .map(([day, value]) => ({
        label: new Date(day + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" }),
        value,
      }));
  }, [picks, users]);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 24 }}>
        <StatCard label="Revenu Total" value={`${Math.round(totalRevenue / 1000)}K`} sub={`${formatCFA(pickRevenue)} picks + ${formatCFA(subscriptionRevenue)} abonnements`} accent />
        <StatCard label="Utilisateurs" value={users.length} sub={`${activeUsers} actifs`} />
        <StatCard label="Picks Totaux" value={picks.length} sub={`${picks.filter((p) => p.is_published).length} publiés`} />
        <StatCard label="Win Rate" value={`${winRate}%`} sub={`${wins}W / ${losses}L`} />
        <StatCard label="Abonnés Actifs" value={activeSubscribers.length} sub={`sur ${users.length} utilisateurs`} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 16 }}>
        <div style={{ background: C.dark3, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, fontSize: 10, letterSpacing: "2px", color: C.muted, textTransform: "uppercase", fontWeight: 600 }}>Revenu (14 derniers jours)</div>
          <LineChart data={revenueTrend} height={160} />
        </div>
        <div style={{ background: C.dark3, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, fontSize: 10, letterSpacing: "2px", color: C.muted, textTransform: "uppercase", fontWeight: 600 }}>Répartition des résultats</div>
          <OutcomeBarChart wins={wins} losses={losses} pending={pendingCount} refunded={refundedCount} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        <div style={{ background: C.dark3, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, fontSize: 10, letterSpacing: "2px", color: C.muted, textTransform: "uppercase", fontWeight: 600 }}>Activité Récente</div>
          {recentPicks.length === 0 && <div style={{ padding: "20px", textAlign: "center", color: C.muted, fontSize: 12 }}>Aucun pick</div>}
          {recentPicks.map((p, i) => {
            const unlocks = users.filter((u) => u.unlockedPickIds.includes(p._id)).length;
            const pickRevenue = unlocks * p.price;
            return (
              <div key={p._id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 16px", borderBottom: i < recentPicks.length - 1 ? `1px solid ${C.border}` : "none", borderLeft: `3px solid ${outcomeAccent(p.outcome)}`, gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: C.text, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.title}</div>
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{p.league} · {formatDate(p.match_date)} · {unlocks} débloquage{unlocks !== 1 ? "s" : ""}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, color: C.gold, lineHeight: 1 }}>x{p.total_odds}</div>
                    <div style={{ fontSize: 10, color: pickRevenue > 0 ? C.gold : C.muted, marginTop: 2, whiteSpace: "nowrap" }}>{formatCFA(pickRevenue)}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {p.outcome === "PENDING" && <span className="live-dot" title="En cours" />}
                    <Badge outcome={p.outcome} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ background: C.dark3, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, fontSize: 10, letterSpacing: "2px", color: C.muted, textTransform: "uppercase", fontWeight: 600 }}>Top Utilisateurs</div>
          {topUsers.length === 0 && <div style={{ padding: "20px", textAlign: "center", color: C.muted, fontSize: 12 }}>Aucun utilisateur</div>}
          {topUsers.map(({ u, rev }, i) => (
            <div key={u._id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 16px", borderBottom: i < topUsers.length - 1 ? `1px solid ${C.border}` : "none" }}>
              <div style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(201,168,76,0.12)", border: `1px solid ${C.goldDark}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Bebas Neue', sans-serif", fontSize: 12, color: C.gold, flexShrink: 0 }}>
                {i + 1}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: C.text, fontWeight: 500 }}>{u.phone}</div>
                <div style={{ fontSize: 10, color: C.muted }}>{u.unlockedPickIds.length} picks</div>
              </div>
              <div style={{ fontSize: 12, color: C.gold, fontWeight: 700, flexShrink: 0 }}>{formatCFA(rev)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SettingsTab() {
  const [price, setPrice] = useState<number | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // ── Tips manager (admin-editable list of selectable tip/market labels) ──
  const [tipOptions, setTipOptions] = useState<string[]>(DEFAULT_TIPS);
  const [newTip, setNewTip] = useState("");
  const [tipSaving, setTipSaving] = useState(false);
  const [tipSaveMsg, setTipSaveMsg] = useState<string | null>(null);

  // ── Match generator (ephemeral, AI-assisted, not saved to DB) ───────────
  const [genEnabled, setGenEnabled] = useState(false);
  const [genAccess, setGenAccess] = useState<"EVERYONE" | "PREMIUM">("PREMIUM");
  const [genCount, setGenCount] = useState(3);
  const [genSaving, setGenSaving] = useState(false);
  const [genSaveMsg, setGenSaveMsg] = useState<string | null>(null);
  // Per-market override on top of genAccess — a market missing here falls
  // back to "PREMIUM" everywhere it's read (see models/Settings.ts).
  const [genMarketAccess, setGenMarketAccess] = useState<Record<string, "EVERYONE" | "PREMIUM">>({});
  const [genMarketSaving, setGenMarketSaving] = useState<string | null>(null); // which market code is mid-save, if any

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/settings", { credentials: "include" });
        const data = await res.json();
        if (data?.success) {
          setPrice(data.data.subscriptionMonthlyPrice);
          setInputValue(String(data.data.subscriptionMonthlyPrice));
          if (Array.isArray(data.data.tipOptions) && data.data.tipOptions.length > 0) {
            setTipOptions(data.data.tipOptions);
          }
          if (typeof data.data.matchGeneratorEnabled === "boolean") {
            setGenEnabled(data.data.matchGeneratorEnabled);
          }
          if (data.data.matchGeneratorAccess === "EVERYONE" || data.data.matchGeneratorAccess === "PREMIUM") {
            setGenAccess(data.data.matchGeneratorAccess);
          }
          if (typeof data.data.matchGeneratorMatchCount === "number") {
            setGenCount(data.data.matchGeneratorMatchCount);
          }
          if (data.data.matchGeneratorMarketAccess && typeof data.data.matchGeneratorMarketAccess === "object") {
            setGenMarketAccess(data.data.matchGeneratorMarketAccess);
          }
        }
      } catch (e) {
        console.error("Settings fetch:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    const num = Number(inputValue);
    if (!num || num <= 0) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionMonthlyPrice: num }),
      });
      const data = await res.json();
      if (data?.success) {
        setPrice(data.data.subscriptionMonthlyPrice);
        setSaveMsg("Enregistré avec succès.");
      } else {
        setSaveMsg(data.message || "Erreur lors de l'enregistrement.");
      }
    } catch {
      setSaveMsg("Erreur réseau lors de l'enregistrement.");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 3000);
    }
  };

  const saveTipOptions = async (next: string[]) => {
    setTipSaving(true);
    setTipSaveMsg(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipOptions: next }),
      });
      const data = await res.json();
      if (data?.success) {
        setTipOptions(data.data.tipOptions);
        setTipSaveMsg("Enregistré avec succès.");
      } else {
        setTipSaveMsg(data.message || "Erreur lors de l'enregistrement.");
      }
    } catch {
      setTipSaveMsg("Erreur réseau lors de l'enregistrement.");
    } finally {
      setTipSaving(false);
      setTimeout(() => setTipSaveMsg(null), 3000);
    }
  };

  const addTip = () => {
    const t = newTip.trim();
    if (!t || tipOptions.includes(t)) return;
    saveTipOptions([...tipOptions, t]);
    setNewTip("");
  };

  const removeTip = (t: string) => {
    if (tipOptions.length <= 1) return; // keep at least one option selectable
    saveTipOptions(tipOptions.filter((x) => x !== t));
  };

  const saveGeneratorSettings = async (next: { enabled?: boolean; access?: "EVERYONE" | "PREMIUM"; count?: number }) => {
    setGenSaving(true);
    setGenSaveMsg(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchGeneratorEnabled: next.enabled ?? genEnabled,
          matchGeneratorAccess: next.access ?? genAccess,
          matchGeneratorMatchCount: next.count ?? genCount,
        }),
      });
      const data = await res.json();
      if (data?.success) {
        setGenEnabled(data.data.matchGeneratorEnabled);
        setGenAccess(data.data.matchGeneratorAccess);
        setGenCount(data.data.matchGeneratorMatchCount);
        setGenSaveMsg("Enregistré avec succès.");
      } else {
        setGenSaveMsg(data.message || "Erreur lors de l'enregistrement.");
      }
    } catch {
      setGenSaveMsg("Erreur réseau lors de l'enregistrement.");
    } finally {
      setGenSaving(false);
      setTimeout(() => setGenSaveMsg(null), 3000);
    }
  };

  const saveMarketAccess = async (market: string, value: "EVERYONE" | "PREMIUM") => {
    setGenMarketSaving(market);
    setGenSaveMsg(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchGeneratorMarketAccess: { [market]: value } }),
      });
      const data = await res.json();
      if (data?.success) {
        setGenMarketAccess(data.data.matchGeneratorMarketAccess || {});
        setGenSaveMsg("Enregistré avec succès.");
      } else {
        setGenSaveMsg(data.message || "Erreur lors de l'enregistrement.");
      }
    } catch {
      setGenSaveMsg("Erreur réseau lors de l'enregistrement.");
    } finally {
      setGenMarketSaving(null);
      setTimeout(() => setGenSaveMsg(null), 3000);
    }
  };

  const iStyle: React.CSSProperties = {
    background: C.dark4, border: `1px solid ${C.border}`, borderRadius: 8,
    color: C.text, fontSize: 14, padding: "10px 12px", width: "100%",
    fontFamily: "inherit", outline: "none",
  };

  if (loading) {
    return <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}><Spinner /></div>;
  }

  return (
    <div style={{ maxWidth: 480, display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ background: C.dark3, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
        <div style={{ fontSize: 10, letterSpacing: "2px", color: C.gold, textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>
          Abonnement
        </div>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color: C.text, letterSpacing: 1, marginBottom: 16 }}>
          Prix mensuel
        </div>

        <label style={{ fontSize: 10, letterSpacing: "1.5px", color: C.muted, textTransform: "uppercase", fontWeight: 600, display: "block", marginBottom: 6 }}>
          Montant (FCFA)
        </label>
        <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
          <input
            type="number"
            min={1}
            step={100}
            style={iStyle}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
          />
          <button
            onClick={handleSave}
            disabled={saving || !inputValue || Number(inputValue) <= 0 || Number(inputValue) === price}
            style={{
              background: saving ? C.goldDark : C.gold, border: "none", color: C.dark,
              borderRadius: 8, padding: "0 20px", fontSize: 12, fontWeight: 700,
              cursor: (saving || !inputValue || Number(inputValue) <= 0) ? "not-allowed" : "pointer",
              fontFamily: "inherit", letterSpacing: "0.5px", whiteSpace: "nowrap",
              opacity: (saving || !inputValue || Number(inputValue) <= 0 || Number(inputValue) === price) ? 0.5 : 1,
            }}
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>

        {price != null && (
          <div style={{ fontSize: 11, color: C.muted, marginBottom: saveMsg ? 10 : 0 }}>
            Prix actuel affiché aux utilisateurs : <span style={{ color: C.gold, fontWeight: 600 }}>{price.toLocaleString("fr-FR")} FCFA / mois</span>
          </div>
        )}

        {saveMsg && (
          <div style={{
            fontSize: 12, padding: "8px 12px", borderRadius: 6, marginTop: 4,
            background: saveMsg.includes("succès") ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
            border: `1px solid ${saveMsg.includes("succès") ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}`,
            color: saveMsg.includes("succès") ? C.green : C.red,
          }}>
            {saveMsg}
          </div>
        )}
      </div>

      <div style={{ background: C.dark3, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
        <div style={{ fontSize: 10, letterSpacing: "2px", color: C.gold, textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>
          Pronostics
        </div>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color: C.text, letterSpacing: 1, marginBottom: 4 }}>
          Gestion des pronostics
        </div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 16, lineHeight: 1.5 }}>
          Options proposées (1, X, 2, 1X…) lors de l'ajout d'une sélection à un pick. Les picks déjà créés ne sont pas affectés.
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
          {tipOptions.map((t) => (
            <span key={t} style={{
              display: "flex", alignItems: "center", gap: 6,
              background: C.dark4, border: `1px solid ${C.border}`, borderRadius: 6,
              padding: "5px 6px 5px 10px", fontSize: 12, color: C.text, fontWeight: 600,
            }}>
              {t}
              <button
                onClick={() => removeTip(t)}
                disabled={tipSaving || tipOptions.length <= 1}
                title={tipOptions.length <= 1 ? "Au moins une option est requise" : "Retirer"}
                style={{ background: "none", border: "none", cursor: tipOptions.length <= 1 ? "not-allowed" : "pointer", color: C.muted, padding: 0, display: "flex", opacity: tipOptions.length <= 1 ? 0.4 : 1 }}
              >
                <Icons.close />
              </button>
            </span>
          ))}
        </div>

        <label style={{ fontSize: 10, letterSpacing: "1.5px", color: C.muted, textTransform: "uppercase", fontWeight: 600, display: "block", marginBottom: 6 }}>
          Ajouter une option
        </label>
        <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
          <input
            style={iStyle}
            value={newTip}
            onChange={(e) => setNewTip(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTip()}
            placeholder="Ex: BTTS, O 3.5, HT 1…"
          />
          <button
            onClick={addTip}
            disabled={tipSaving || !newTip.trim() || tipOptions.includes(newTip.trim())}
            style={{
              background: tipSaving ? C.goldDark : C.gold, border: "none", color: C.dark,
              borderRadius: 8, padding: "0 20px", fontSize: 12, fontWeight: 700,
              cursor: (tipSaving || !newTip.trim()) ? "not-allowed" : "pointer",
              fontFamily: "inherit", letterSpacing: "0.5px", whiteSpace: "nowrap",
              opacity: (tipSaving || !newTip.trim() || tipOptions.includes(newTip.trim())) ? 0.5 : 1,
            }}
          >
            {tipSaving ? "…" : "Ajouter"}
          </button>
        </div>

        {tipSaveMsg && (
          <div style={{
            fontSize: 12, padding: "8px 12px", borderRadius: 6, marginTop: 4,
            background: tipSaveMsg.includes("succès") ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
            border: `1px solid ${tipSaveMsg.includes("succès") ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}`,
            color: tipSaveMsg.includes("succès") ? C.green : C.red,
          }}>
            {tipSaveMsg}
          </div>
        )}
      </div>

      <div style={{ background: C.dark3, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
        <div style={{ fontSize: 10, letterSpacing: "2px", color: C.gold, textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>
          Fonctionnalité
        </div>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color: C.text, letterSpacing: 1, marginBottom: 4 }}>
          Générateur de matchs (IA)
        </div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 16, lineHeight: 1.5 }}>
          Permet aux utilisateurs de générer eux-mêmes une combinaison via le moteur de pronostics, à titre indicatif — rien n&apos;est enregistré en base ni vendu.
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <label style={{ fontSize: 10, letterSpacing: "1.5px", color: C.muted, textTransform: "uppercase", fontWeight: 600 }}>
            Activer la fonctionnalité
          </label>
          <button
            onClick={() => { setGenEnabled(!genEnabled); saveGeneratorSettings({ enabled: !genEnabled }); }}
            disabled={genSaving}
            style={{
              width: 44, height: 24, borderRadius: 12, position: "relative", cursor: genSaving ? "not-allowed" : "pointer",
              background: genEnabled ? C.gold : C.dark4, border: `1px solid ${genEnabled ? C.gold : C.border}`,
              transition: "background 0.15s", flexShrink: 0, padding: 0,
            }}
          >
            <span style={{
              position: "absolute", top: 2, left: genEnabled ? 22 : 2, width: 18, height: 18, borderRadius: "50%",
              background: genEnabled ? C.dark : C.muted, transition: "left 0.15s",
            }} />
          </button>
        </div>

        <label style={{ fontSize: 10, letterSpacing: "1.5px", color: C.muted, textTransform: "uppercase", fontWeight: 600, display: "block", marginBottom: 6 }}>
          Qui y a accès
        </label>
        <select
          style={{ ...iStyle, cursor: genSaving ? "not-allowed" : "pointer" }}
          value={genAccess}
          disabled={genSaving}
          onChange={(e) => { const v = e.target.value as "EVERYONE" | "PREMIUM"; setGenAccess(v); saveGeneratorSettings({ access: v }); }}
        >
          <option value="PREMIUM">Abonnés premium uniquement</option>
          <option value="EVERYONE">Tous les utilisateurs connectés</option>
        </select>
        <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5, margin: "6px 0 16px" }}>
          Ce réglage définit qui peut ouvrir l&apos;outil. Utilise la liste ci-dessous pour réserver des marchés spécifiques (BTTS, Over/Under…) aux abonnés premium même quand l&apos;outil est ouvert à tous.
        </div>

        <label style={{ fontSize: 10, letterSpacing: "1.5px", color: C.muted, textTransform: "uppercase", fontWeight: 600, display: "block", marginBottom: 6 }}>
          Accès par marché
        </label>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
          {GENERATOR_MARKETS.map(({ code, label }) => {
            const value = genMarketAccess[code] ?? "PREMIUM";
            const saving = genMarketSaving === code;
            return (
              <div key={code} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: C.dark4, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px" }}>
                <span style={{ fontSize: 12, color: C.text, fontWeight: 600 }}>{label}</span>
                <select
                  style={{ ...iStyle, width: "auto", padding: "4px 8px", fontSize: 11, cursor: saving ? "not-allowed" : "pointer" }}
                  value={value}
                  disabled={saving}
                  onChange={(e) => saveMarketAccess(code, e.target.value as "EVERYONE" | "PREMIUM")}
                >
                  <option value="PREMIUM">Premium uniquement</option>
                  <option value="EVERYONE">Tous les utilisateurs</option>
                </select>
              </div>
            );
          })}
        </div>

        <label style={{ fontSize: 10, letterSpacing: "1.5px", color: C.muted, textTransform: "uppercase", fontWeight: 600, display: "block", marginBottom: 6 }}>
          Nombre de matchs générés
        </label>
        <select
          style={{ ...iStyle, cursor: genSaving ? "not-allowed" : "pointer" }}
          value={genCount}
          disabled={genSaving}
          onChange={(e) => { const v = Number(e.target.value); setGenCount(v); saveGeneratorSettings({ count: v }); }}
        >
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>{n} match{n > 1 ? "s" : ""}</option>
          ))}
        </select>

        {genSaveMsg && (
          <div style={{
            fontSize: 12, padding: "8px 12px", borderRadius: 6, marginTop: 12,
            background: genSaveMsg.includes("succès") ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
            border: `1px solid ${genSaveMsg.includes("succès") ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}`,
            color: genSaveMsg.includes("succès") ? C.green : C.red,
          }}>
            {genSaveMsg}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Conversation Thread Modal ─────────────────────────────────────────────────
// How long a typing ping stays "fresh" before the indicator hides itself
// again, and the minimum gap between pings the reply box sends — mirrors
// the same constants in ChatWidget.tsx.
const TYPING_TTL_MS = 6000;
const TYPING_PING_THROTTLE_MS = 2000;

function ConversationModal({ conversation, subscription, onClose, onUpdate }: { conversation: Conversation; subscription?: ApiUser["subscription"]; onClose: () => void; onUpdate: (c: Conversation) => void }) {
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [busyMessageId, setBusyMessageId] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const lastTypingPingRef = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [conversation.messages.length]);

  // Faster-than-the-list poll while a thread is open, so a new visitor
  // message and the typing indicator both show up promptly — the
  // Messages tab's own list refresh (in the parent) only runs every 15s,
  // which would otherwise make "typing…" feel stuck. Mirrors the same
  // open-state poll bump ChatWidget.tsx does for the visitor side.
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    let cancelled = false;
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/admin/conversations/${conversation._id}`, { credentials: "include" });
        const data = await res.json();
        if (!cancelled && data?.success) onUpdate(data.data);
      } catch { /* try again on the next tick */ }
    }, 3000);
    return () => { cancelled = true; clearInterval(id); clearInterval(poll); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation._id]);

  const isUserTyping = useMemo(() => {
    if (!conversation.userTypingAt) return false;
    return nowTick - new Date(conversation.userTypingAt).getTime() < TYPING_TTL_MS;
  }, [conversation.userTypingAt, nowTick]);

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = reply.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/admin/conversations/${conversation._id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (data?.success) {
        onUpdate(data.data);
        setReply("");
      }
    } catch { /* keep draft on failure */ }
    finally { setSending(false); }
  };

  const handleReplyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setReply(value);
    if (!value.trim()) return;
    const now = Date.now();
    if (now - lastTypingPingRef.current < TYPING_PING_THROTTLE_MS) return;
    lastTypingPingRef.current = now;
    fetch(`/api/admin/conversations/${conversation._id}/typing`, { method: "POST", credentials: "include" })
      .catch(() => { /* best-effort — a missed ping just means a slightly late indicator */ });
  };

  const startEdit = (m: ChatMessage) => {
    if (!m._id) return;
    setEditingId(m._id);
    setEditText(m.text);
  };
  const cancelEdit = () => { setEditingId(null); setEditText(""); };

  const saveEdit = async (id: string) => {
    const text = editText.trim();
    if (!text) return;
    setBusyMessageId(id);
    try {
      const res = await fetch(`/api/admin/conversations/${conversation._id}/messages/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (data?.success) onUpdate(data.data);
    } catch { /* leave editing open so the admin can retry */ return; }
    finally { setBusyMessageId(null); }
    setEditingId(null);
    setEditText("");
  };

  const deleteMessage = async (id: string) => {
    if (!confirm("Supprimer ce message ?")) return;
    setBusyMessageId(id);
    try {
      const res = await fetch(`/api/admin/conversations/${conversation._id}/messages/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json();
      if (data?.success) onUpdate(data.data);
    } catch { /* message just stays if the request failed */ }
    finally { setBusyMessageId(null); }
  };

  const toggleStatus = async () => {
    const nextStatus = conversation.status === "OPEN" ? "RESOLVED" : "OPEN";
    setTogglingStatus(true);
    try {
      const res = await fetch(`/api/admin/conversations/${conversation._id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (data?.success) onUpdate(data.data);
    } catch { /* leave as-is on failure */ }
    finally { setTogglingStatus(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16, backdropFilter: "blur(4px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ background: C.dark2, border: `1px solid ${C.border}`, borderRadius: 16, width: "100%", maxWidth: 480, height: "min(80vh, 620px)", display: "flex", flexDirection: "column", overflow: "hidden" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: C.text, letterSpacing: 1 }}>{conversation.phone}</div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
              <span>{conversation.user ? "Compte lié" : "Visiteur non connecté"}</span>
              {conversation.user && <SubscriptionBadge subscription={subscription} />}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={toggleStatus} disabled={togglingStatus} style={{
              background: conversation.status === "OPEN" ? C.gold : C.dark4, color: conversation.status === "OPEN" ? C.dark : C.text,
              border: `1px solid ${conversation.status === "OPEN" ? C.gold : C.border}`, borderRadius: 6, padding: "6px 12px",
              fontSize: 11, fontWeight: 700, cursor: togglingStatus ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: togglingStatus ? 0.6 : 1, whiteSpace: "nowrap",
            }}>
              {conversation.status === "OPEN" ? "Marquer résolu" : "Rouvrir"}
            </button>
            <button onClick={onClose} style={{ background: C.dark4, border: `1px solid ${C.border}`, borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.muted, flexShrink: 0 }}>
              <Icons.close />
            </button>
          </div>
        </div>

        <div ref={listRef} style={{ flex: 1, overflowY: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
          {conversation.messages.length === 0 ? (
            <div style={{ margin: "auto", color: C.muted, fontSize: 12 }}>Aucun message pour l’instant.</div>
          ) : (
            conversation.messages.map((m, i) => {
              const isOwn = m.sender === "ADMIN";
              const isEditing = isOwn && editingId === m._id;
              const isBusy = busyMessageId === m._id;
              return (
                <div key={m._id || i} style={{
                  alignSelf: isOwn ? "flex-end" : "flex-start",
                  maxWidth: "78%",
                  background: isOwn ? C.gold : C.dark4,
                  color: isOwn ? C.dark : C.text,
                  border: isOwn ? "none" : `1px solid ${C.border}`,
                  borderRadius: 12,
                  borderBottomRightRadius: isOwn ? 3 : 12,
                  borderBottomLeftRadius: m.sender === "USER" ? 3 : 12,
                  padding: "9px 12px",
                  fontSize: 13,
                  lineHeight: 1.5,
                  opacity: isBusy ? 0.6 : 1,
                }}>
                  {isEditing ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <textarea
                        autoFocus
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        maxLength={2000}
                        rows={2}
                        style={{
                          background: "rgba(0,0,0,0.08)", border: "none", borderRadius: 6,
                          color: C.dark, fontSize: 13, fontFamily: "inherit", padding: "6px 8px",
                          resize: "none", outline: "none", minWidth: 200,
                        }}
                      />
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <button type="button" onClick={cancelEdit} style={{ background: "transparent", border: "none", color: C.dark, opacity: 0.7, fontSize: 11, cursor: "pointer", fontFamily: "inherit", padding: "2px 6px" }}>
                          Annuler
                        </button>
                        <button type="button" onClick={() => saveEdit(m._id!)} disabled={!editText.trim() || isBusy} style={{ background: C.dark, color: C.gold, border: "none", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", padding: "4px 10px", opacity: !editText.trim() || isBusy ? 0.5 : 1 }}>
                          OK
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.text}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
                        <span style={{ fontSize: 9, opacity: 0.6 }}>
                          {new Date(m.createdAt).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                          {m.editedAt ? " · modifié" : ""}
                        </span>
                        {isOwn && m._id && (
                          <span style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
                            <button type="button" onClick={() => startEdit(m)} disabled={isBusy} title="Modifier" style={{ background: "none", border: "none", padding: 0, cursor: isBusy ? "not-allowed" : "pointer", opacity: 0.65, color: C.dark, display: "flex" }}>
                              <Icons.edit />
                            </button>
                            <button type="button" onClick={() => deleteMessage(m._id!)} disabled={isBusy} title="Supprimer" style={{ background: "none", border: "none", padding: 0, cursor: isBusy ? "not-allowed" : "pointer", opacity: 0.65, color: C.dark, display: "flex" }}>
                              <Icons.trash />
                            </button>
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })
          )}
          {isUserTyping && (
            <TypingIndicator align="left" bubbleColor={C.dark4} borderColor={C.border} dotColor={C.muted} />
          )}
        </div>

        <form onSubmit={handleReply} style={{ display: "flex", gap: 8, padding: 14, borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
          <input
            value={reply}
            onChange={handleReplyChange}
            placeholder="Répondre…"
            maxLength={2000}
            style={{ flex: 1, background: C.dark4, border: `1px solid ${C.border}`, borderRadius: 20, color: C.text, fontSize: 13, padding: "10px 14px", outline: "none", fontFamily: "inherit", minWidth: 0 }}
          />
          <button
            type="submit"
            disabled={!reply.trim() || sending}
            style={{ background: C.gold, color: C.dark, border: "none", borderRadius: 20, padding: "0 18px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: (!reply.trim() || sending) ? 0.5 : 1, whiteSpace: "nowrap" }}
          >
            {sending ? "…" : "Envoyer"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Messages Tab ───────────────────────────────────────────────────────────────
function MessagesTab({ conversations, setConversations, loading, users }: { conversations: Conversation[]; setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>; loading: boolean; users: ApiUser[] }) {
  const [filterStatus, setFilterStatus] = useState<"ALL" | "OPEN" | "RESOLVED">("ALL");
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Conversations only store the linked account's id — cross-reference the
  // already-loaded users list to know if that account is a paying/premium
  // subscriber (same "active subscription" definition as the Users tab).
  const usersById = useMemo(() => new Map(users.map((u) => [u._id, u])), [users]);

  const filtered = useMemo(
    () => conversations.filter((c) => filterStatus === "ALL" || c.status === filterStatus),
    [conversations, filterStatus]
  );

  const openCount = conversations.filter((c) => c.status === "OPEN").length;
  const selected = conversations.find((c) => c._id === openId) || null;
  const selectedUser = selected?.user ? usersById.get(selected.user) : undefined;

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer cette conversation ?")) return;
    setBusyId(id);
    try { await fetch(`/api/admin/conversations/${id}`, { method: "DELETE", credentials: "include" }); } catch { /* optimistic */ }
    setConversations((prev) => prev.filter((x) => x._id !== id));
    setBusyId(null);
  };

  const handleUpdate = (updated: Conversation) => {
    setConversations((prev) => prev.map((x) => (x._id === updated._id ? updated : x)));
  };

  const iStyle: React.CSSProperties = { background: C.dark4, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 12, padding: "8px 12px", fontFamily: "inherit", outline: "none" };

  if (loading) {
    return <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}><Spinner /></div>;
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <select style={{ ...iStyle, cursor: "pointer" }} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}>
          <option value="ALL">Toutes les conversations</option>
          <option value="OPEN">Ouvertes</option>
          <option value="RESOLVED">Résolues</option>
        </select>
        {openCount > 0 && (
          <span style={{ fontSize: 11, color: C.gold, background: "rgba(201,168,76,0.1)", border: `1px solid ${C.goldDark}`, padding: "4px 10px", borderRadius: 6 }}>
            {openCount} en attente
          </span>
        )}
      </div>

      {filtered.length === 0 ? (
        <div style={{ padding: "48px 0", textAlign: "center", color: C.muted, fontSize: 13 }}>Aucune conversation.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((c) => {
            const last = c.messages[c.messages.length - 1];
            const awaitingReply = c.status === "OPEN" && last?.sender === "USER";
            const linkedUser = c.user ? usersById.get(c.user) : undefined;
            return (
              <div key={c._id} onClick={() => setOpenId(c._id)} style={{
                background: C.dark3, border: `1px solid ${C.border}`, borderLeft: `3px solid ${awaitingReply ? C.gold : c.status === "OPEN" ? C.blue : C.green}`,
                borderRadius: 10, padding: "14px 16px", cursor: "pointer", transition: "background 0.15s",
              }}
                onMouseEnter={(e) => (e.currentTarget.style.background = C.dark4)}
                onMouseLeave={(e) => (e.currentTarget.style.background = C.dark3)}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 6, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text, fontFamily: "monospace" }}>{c.phone}</div>
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                      {new Date(c.lastMessageAt).toLocaleString("fr-FR")}
                      {c.user && <span> · compte lié</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    {awaitingReply && (
                      <span style={{ fontSize: 9, color: C.gold, background: "rgba(201,168,76,0.1)", border: `1px solid ${C.goldDark}`, padding: "2px 7px", borderRadius: 4, fontWeight: 700, letterSpacing: "0.5px" }}>
                        À RÉPONDRE
                      </span>
                    )}
                    {c.user && <SubscriptionBadge subscription={linkedUser?.subscription} />}
                    <Badge outcome={c.status === "OPEN" ? "draft" : "live"} />
                  </div>
                </div>
                {last && (
                  <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 10 }}>
                    {last.sender === "ADMIN" ? "Vous: " : ""}{last.text}
                  </p>
                )}
                <div style={{ display: "flex", gap: 8 }} onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => handleDelete(c._id)}
                    disabled={busyId === c._id}
                    style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 6, color: C.red, padding: "5px 10px", fontSize: 11, cursor: busyId === c._id ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <Icons.trash /> Supprimer
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selected && (
        <ConversationModal conversation={selected} subscription={selectedUser?.subscription} onClose={() => setOpenId(null)} onUpdate={handleUpdate} />
      )}
    </div>
  );
}

// ─── Announcement Form Modal ────────────────────────────────────────────────────
function AnnouncementFormModal({ announcement, onSave, onClose }: { announcement: Announcement | null; onSave: (a: Announcement) => void; onClose: () => void }) {
  const isNew = !announcement;
  const [title, setTitle] = useState(announcement?.title ?? "");
  const [body, setBody] = useState(announcement?.body ?? "");
  const [type, setType] = useState<Announcement["type"]>(announcement?.type ?? "INFO");
  const [displayStyle, setDisplayStyle] = useState<Announcement["displayStyle"]>(announcement?.displayStyle ?? "BANNER");
  const [expiresAt, setExpiresAt] = useState(announcement?.expiresAt ? announcement.expiresAt.split("T")[0] : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!title.trim() || !body.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        title: title.trim(),
        body: body.trim(),
        type,
        displayStyle,
        expiresAt: expiresAt || null,
      };
      const res = await fetch(
        isNew ? "/api/admin/announcements" : `/api/admin/announcements/${announcement!._id}`,
        {
          method: isNew ? "POST" : "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Échec de l'enregistrement");
      onSave(data.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  const iStyle: React.CSSProperties = {
    background: C.dark4, border: `1px solid ${C.border}`, borderRadius: 8,
    color: C.text, fontSize: 13, padding: "10px 12px", width: "100%",
    fontFamily: "inherit", outline: "none",
  };
  const lStyle: React.CSSProperties = {
    fontSize: 10, letterSpacing: "1.5px", color: C.muted,
    textTransform: "uppercase", fontWeight: 600, display: "block", marginBottom: 6,
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16, backdropFilter: "blur(4px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ background: C.dark2, border: `1px solid ${C.border}`, borderRadius: 16, width: "100%", maxWidth: 480, maxHeight: "92vh", overflowY: "auto", padding: 24 }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color: C.text, letterSpacing: 1 }}>
            {isNew ? "Nouvelle annonce" : "Modifier l'annonce"}
          </div>
          <button onClick={onClose} style={{ background: C.dark4, border: `1px solid ${C.border}`, borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.muted }}>
            <Icons.close />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={lStyle}>Titre</label>
            <input style={iStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Maintenance ce soir" maxLength={120} />
          </div>
          <div>
            <label style={lStyle}>Message</label>
            <textarea style={{ ...iStyle, resize: "vertical", minHeight: 90, fontFamily: "inherit" }} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Détails de l'annonce…" maxLength={2000} />
          </div>
          <div>
            <label style={lStyle}>Affichage</label>
            <select style={{ ...iStyle, cursor: "pointer" }} value={displayStyle} onChange={(e) => setDisplayStyle(e.target.value as Announcement["displayStyle"])}>
              <option value="BANNER">Bannière (bandeau discret en haut du site)</option>
              <option value="POPUP">Popup (s&apos;affiche au chargement, impossible à manquer)</option>
            </select>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>
              {displayStyle === "POPUP"
                ? "À utiliser pour les infos importantes que tout le monde doit voir (ex: pas de paris aujourd'hui). Se ferme définitivement une fois fermée par le visiteur."
                : "Bandeau discret, fermable, en haut du site — pour les infos moins urgentes."}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={lStyle}>Type</label>
              <select style={{ ...iStyle, cursor: "pointer" }} value={type} onChange={(e) => setType(e.target.value as Announcement["type"])}>
                <option value="INFO">Info</option>
                <option value="WARNING">Avertissement</option>
                <option value="SUCCESS">Succès</option>
              </select>
            </div>
            <div>
              <label style={lStyle}>Expire le (optionnel)</label>
              <input type="date" style={iStyle} value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </div>
          </div>

          {error && (
            <div style={{ fontSize: 12, padding: "8px 12px", borderRadius: 6, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: C.red }}>
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, paddingTop: 6 }}>
            <button onClick={onClose} style={{ flex: 1, background: C.dark4, border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, padding: "12px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              Annuler
            </button>
            <button onClick={handleSave} disabled={saving || !title.trim() || !body.trim()} style={{ flex: 2, background: saving ? C.goldDark : C.gold, border: "none", color: C.dark, borderRadius: 8, padding: "12px", fontSize: 12, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit", letterSpacing: "1px", opacity: (!title.trim() || !body.trim()) ? 0.5 : 1 }}>
              {saving ? "Enregistrement…" : isNew ? "Publier" : "Enregistrer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Announcements Tab ──────────────────────────────────────────────────────────
const ANNOUNCEMENT_TYPE_LABEL: Record<Announcement["type"], { label: string; color: string }> = {
  INFO: { label: "INFO", color: C.blue },
  WARNING: { label: "AVERTISSEMENT", color: C.gold },
  SUCCESS: { label: "SUCCÈS", color: C.green },
};

function AnnouncementsTab({ announcements, setAnnouncements, loading }: { announcements: Announcement[]; setAnnouncements: React.Dispatch<React.SetStateAction<Announcement[]>>; loading: boolean }) {
  const [showForm, setShowForm] = useState(false);
  const [editAnnouncement, setEditAnnouncement] = useState<Announcement | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const isExpired = (a: Announcement) => !!a.expiresAt && new Date(a.expiresAt) < new Date();

  const handleSave = (a: Announcement) => {
    setAnnouncements((prev) => {
      const idx = prev.findIndex((x) => x._id === a._id);
      if (idx >= 0) { const next = [...prev]; next[idx] = a; return next; }
      return [a, ...prev];
    });
    setShowForm(false);
    setEditAnnouncement(null);
  };

  const toggleActive = async (a: Announcement) => {
    setBusyId(a._id);
    try {
      const res = await fetch(`/api/admin/announcements/${a._id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !a.isActive }),
      });
      const data = await res.json();
      if (data?.success) {
        setAnnouncements((prev) => prev.map((x) => (x._id === a._id ? data.data : x)));
      }
    } catch { /* leave as-is on failure */ }
    finally { setBusyId(null); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer cette annonce ?")) return;
    setBusyId(id);
    try { await fetch(`/api/admin/announcements/${id}`, { method: "DELETE", credentials: "include" }); } catch { /* optimistic */ }
    setAnnouncements((prev) => prev.filter((x) => x._id !== id));
    setBusyId(null);
  };

  if (loading) {
    return <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}><Spinner /></div>;
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <button onClick={() => { setEditAnnouncement(null); setShowForm(true); }}
          style={{ background: C.gold, color: C.dark, border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
          <Icons.plus /> Nouvelle annonce
        </button>
      </div>

      {announcements.length === 0 ? (
        <div style={{ padding: "48px 0", textAlign: "center", color: C.muted, fontSize: 13 }}>Aucune annonce.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {announcements.map((a) => {
            const expired = isExpired(a);
            const tLabel = ANNOUNCEMENT_TYPE_LABEL[a.type] || ANNOUNCEMENT_TYPE_LABEL.INFO;
            const live = a.isActive && !expired;
            return (
              <div key={a._id} style={{
                background: C.dark3, border: `1px solid ${C.border}`, borderLeft: `3px solid ${live ? tLabel.color : C.faint}`,
                borderRadius: 10, padding: "14px 16px", opacity: live ? 1 : 0.65,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 6, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{a.title}</div>
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                      {new Date(a.createdAt).toLocaleDateString("fr-FR")}
                      {a.expiresAt && <span> · {expired ? "expirée le" : "expire le"} {new Date(a.expiresAt).toLocaleDateString("fr-FR")}</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    {a.displayStyle === "POPUP" && (
                      <span style={{ fontSize: 9, color: C.text, background: C.dark4, border: `1px solid ${C.border}`, padding: "2px 7px", borderRadius: 4, fontWeight: 700, letterSpacing: "0.5px" }}>
                        🪟 POPUP
                      </span>
                    )}
                    <span style={{ fontSize: 9, color: tLabel.color, background: `${tLabel.color}1A`, border: `1px solid ${tLabel.color}40`, padding: "2px 7px", borderRadius: 4, fontWeight: 700, letterSpacing: "0.5px" }}>
                      {tLabel.label}
                    </span>
                    <Badge outcome={live ? "live" : "draft"} />
                  </div>
                </div>
                <p style={{ fontSize: 13, color: C.text, lineHeight: 1.6, whiteSpace: "pre-wrap", marginBottom: 12 }}>{a.body}</p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => toggleActive(a)}
                    disabled={busyId === a._id}
                    style={{ background: C.dark4, border: `1px solid ${C.border}`, borderRadius: 6, color: a.isActive ? C.green : C.muted, padding: "6px 12px", fontSize: 11, fontWeight: 700, cursor: busyId === a._id ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: busyId === a._id ? 0.6 : 1 }}
                  >
                    {a.isActive ? "Désactiver" : "Activer"}
                  </button>
                  <button onClick={() => { setEditAnnouncement(a); setShowForm(true); }} style={{ background: C.dark4, border: `1px solid ${C.border}`, borderRadius: 6, color: C.muted, padding: "6px 12px", fontSize: 11, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}>
                    <Icons.edit /> Modifier
                  </button>
                  <button
                    onClick={() => handleDelete(a._id)}
                    disabled={busyId === a._id}
                    style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 6, color: C.red, padding: "6px 12px", fontSize: 11, cursor: busyId === a._id ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <Icons.trash /> Supprimer
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(showForm || editAnnouncement) && (
        <AnnouncementFormModal announcement={editAnnouncement} onSave={handleSave} onClose={() => { setShowForm(false); setEditAnnouncement(null); }} />
      )}
    </div>
  );
}

// ─── Access Denied ─────────────────────────────────────────────────────────────
function AccessDenied() {
  const router = useRouter();
  return (
    <div style={{ minHeight: "100vh", background: C.dark, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16, padding: 24, textAlign: "center" }}>
      <Icons.shield />
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: C.gold, letterSpacing: 2 }}>Accès Refusé</div>
      <div style={{ fontSize: 13, color: C.muted, maxWidth: 300, lineHeight: 1.6 }}>
        Cette page est réservée aux administrateurs.
      </div>
      <button onClick={() => router.push("/")} style={{ background: C.gold, color: C.dark, border: "none", borderRadius: 8, padding: "10px 24px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", letterSpacing: "1px", marginTop: 8 }}>
        Retour à l&apos;accueil
      </button>
    </div>
  );
}

// ─── Main Admin Dashboard ───────────────────────────────────────────────────────
type Tab = "overview" | "picks" | "users" | "revenue" | "transactions" | "messages" | "announcements" | "settings";

export default function AdminDashboard() {
  const { user, loading: authLoading, logout } = useAuth();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [picksLoading, setPicksLoading] = useState(true);
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(true);

  useEffect(() => {
    if (!user || user.role !== "ADMIN") return;
    let cancelled = false;
    (async () => {
      try {
        setPicksLoading(true);
        const res = await fetch("/api/picks", { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        const resolved: Pick[] = Array.isArray(data) ? data
          : Array.isArray(data?.picks) ? data.picks
            : Array.isArray(data?.data) ? data.data : [];
        setPicks(resolved);
      } catch (e) { console.error("Picks fetch:", e); }
      finally { if (!cancelled) setPicksLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    if (!user || user.role !== "ADMIN") return;
    let cancelled = false;
    (async () => {
      try {
        setUsersLoading(true);
        const res = await fetch("/api/users", { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        const resolved: ApiUser[] = Array.isArray(data) ? data
          : Array.isArray(data?.users) ? data.users
            : Array.isArray(data?.data) ? data.data : [];
        setUsers(resolved);
      } catch (e) { console.error("Users fetch:", e); }
      finally { if (!cancelled) setUsersLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    if (!user || user.role !== "ADMIN") return;
    let cancelled = false;

    const fetchConversations = async (showSpinner: boolean) => {
      try {
        if (showSpinner) setConversationsLoading(true);
        const res = await fetch("/api/admin/conversations", { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        const resolved: Conversation[] = Array.isArray(data?.data) ? data.data : [];
        setConversations(resolved);
      } catch (e) { console.error("Conversations fetch:", e); }
      finally { if (!cancelled && showSpinner) setConversationsLoading(false); }
    };

    fetchConversations(true);
    // Light polling so new visitor messages show up (and the sidebar
    // badge updates) without the admin needing to switch tabs and back.
    const interval = setInterval(() => fetchConversations(false), 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [user]);

  useEffect(() => {
    if (!user || user.role !== "ADMIN") return;
    let cancelled = false;
    (async () => {
      try {
        setAnnouncementsLoading(true);
        const res = await fetch("/api/admin/announcements", { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        const resolved: Announcement[] = Array.isArray(data?.data) ? data.data : [];
        setAnnouncements(resolved);
      } catch (e) { console.error("Announcements fetch:", e); }
      finally { if (!cancelled) setAnnouncementsLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [user]);

  if (authLoading) {
    return (
      <>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap');
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { background: #0A0C0F; font-family: 'DM Sans', sans-serif; }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
        <div style={{ minHeight: "100vh", background: C.dark, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
          <Spinner size={44} />
          <div style={{ fontSize: 10, letterSpacing: "3px", color: C.muted, textTransform: "uppercase" }}>Vérification…</div>
        </div>
      </>
    );
  }

  if (!user || user.role !== "ADMIN") {
    return (
      <>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap');
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { background: #0A0C0F; font-family: 'DM Sans', sans-serif; }
        `}</style>
        <AccessDenied />
      </>
    );
  }

  const handleLogout = async () => {
    await logout();
    router.push("/");
  };

  // Only count conversations actually awaiting a reply, not every open
  // one — a thread the admin already answered but the user hasn't
  // replied to yet shouldn't nag the sidebar badge.
  const awaitingReplyCount = conversations.filter(
    (c) => c.status === "OPEN" && c.messages[c.messages.length - 1]?.sender === "USER"
  ).length;

  const tabs: { id: Tab; label: string; icon: React.FC; badge?: number }[] = [
    { id: "overview", label: "Dashboard", icon: Icons.dashboard },
    { id: "picks", label: "Picks", icon: Icons.picks },
    { id: "users", label: "Utilisateurs", icon: Icons.users },
    { id: "revenue", label: "Revenus", icon: Icons.revenue },
    { id: "transactions", label: "Transactions", icon: Icons.transactions },
    { id: "messages", label: "Messages", icon: Icons.messages, badge: awaitingReplyCount || undefined },
    { id: "announcements", label: "Annonces", icon: Icons.announcements },
    { id: "settings", label: "Paramètres", icon: Icons.settings },
  ];

  const NavItems = () => (
    <>
      {tabs.map((t) => (
        <button key={t.id} onClick={() => { setTab(t.id); setSidebarOpen(false); }}
          style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px", borderRadius: 8, border: "none", cursor: "pointer", background: tab === t.id ? "rgba(201,168,76,0.1)" : "transparent", color: tab === t.id ? C.gold : C.muted, fontSize: 13, fontWeight: tab === t.id ? 600 : 400, fontFamily: "inherit", marginBottom: 2, textAlign: "left", borderLeft: tab === t.id ? `2px solid ${C.gold}` : "2px solid transparent", transition: "all 0.15s" }}>
          <t.icon />{t.label}
          {!!t.badge && (
            <span style={{ marginLeft: "auto", background: C.gold, color: C.dark, fontSize: 10, fontWeight: 700, borderRadius: 10, padding: "1px 7px", lineHeight: "16px" }}>
              {t.badge}
            </span>
          )}
        </button>
      ))}
    </>
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0A0C0F; color: #E8EAF0; font-family: 'DM Sans', sans-serif; }
        input, select, button { font-family: 'DM Sans', sans-serif; }
        input[type=date]::-webkit-calendar-picker-indicator { filter: invert(0.5); cursor: pointer; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-thumb { background: #2A3140; border-radius: 2px; }
        select option { background: #1A1F26; color: #E8EAF0; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes livePulseRing {
          0%   { box-shadow: 0 0 0 0 rgba(201,168,76,0.55); }
          70%  { box-shadow: 0 0 0 7px rgba(201,168,76,0); }
          100% { box-shadow: 0 0 0 0 rgba(201,168,76,0); }
        }
        @keyframes livePulseDot { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
        .live-dot {
          width: 6px; height: 6px; border-radius: 50%; background: #C9A84C; flex-shrink: 0;
          animation: livePulseRing 1.6s ease-out infinite, livePulseDot 1.6s ease-in-out infinite;
        }

        .admin-sidebar { display: flex; }
        .admin-hamburger { display: none; }
        .admin-table-desktop { display: block; }
        .admin-cards-mobile { display: none; }

        @media (max-width: 768px) {
          .admin-sidebar { display: none; }
          .admin-hamburger { display: flex !important; }
          .admin-table-desktop { display: none; }
          .admin-cards-mobile { display: block; }
        }
      `}</style>

      <div style={{ minHeight: "100vh", background: C.dark, display: "flex" }}>

        <aside className="admin-sidebar" style={{ width: 210, flexShrink: 0, background: C.dark2, borderRight: `1px solid ${C.border}`, flexDirection: "column", position: "sticky", top: 0, height: "100vh" }}>
          <div style={{ padding: "22px 18px 18px", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 11, letterSpacing: "4px", color: C.gold, textTransform: "uppercase", marginBottom: 3 }}>Coupon Sûr</div>
            <div style={{ fontSize: 10, color: C.muted, letterSpacing: "1px" }}>Administration</div>
          </div>
          <nav style={{ padding: "10px 8px", flex: 1 }}><NavItems /></nav>
          <div style={{ padding: "14px 8px", borderTop: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 4 }}>
            <Link href="/" target="_blank" style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px", borderRadius: 8, background: "transparent", color: C.gold, fontSize: 12, fontFamily: "inherit", textDecoration: "none" }}>
              <Icons.home />Voir le site (live)
            </Link>
            <button onClick={handleLogout} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px", borderRadius: 8, border: "none", cursor: "pointer", background: "transparent", color: C.muted, fontSize: 12, fontFamily: "inherit" }}>
              <Icons.logout />Déconnexion
            </button>
          </div>
        </aside>

        {sidebarOpen && (
          <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", animation: "fadeIn 0.2s ease" }}>
            <div style={{ width: 230, background: C.dark2, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", height: "100vh" }}>
              <div style={{ padding: "18px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 11, letterSpacing: "4px", color: C.gold }}>Coupon Sûr</div>
                  <div style={{ fontSize: 10, color: C.muted }}>Administration</div>
                </div>
                <button onClick={() => setSidebarOpen(false)} style={{ background: C.dark4, border: `1px solid ${C.border}`, borderRadius: "50%", width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.muted }}>
                  <Icons.close />
                </button>
              </div>
              <nav style={{ padding: "10px 8px", flex: 1 }}><NavItems /></nav>
              <div style={{ padding: "14px 8px", borderTop: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 4 }}>
                <Link href="/" target="_blank" style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px", borderRadius: 8, background: "transparent", color: C.gold, fontSize: 12, fontFamily: "inherit", textDecoration: "none" }}>
                  <Icons.home />Voir le site (live)
                </Link>
                <button onClick={handleLogout} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px", borderRadius: 8, border: "none", cursor: "pointer", background: "transparent", color: C.muted, fontSize: 12, fontFamily: "inherit" }}>
                  <Icons.logout />Déconnexion
                </button>
              </div>
            </div>
            <div style={{ flex: 1, background: "rgba(0,0,0,0.65)" }} onClick={() => setSidebarOpen(false)} />
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>

          <header style={{ background: C.dark2, borderBottom: `1px solid ${C.border}`, padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button className="admin-hamburger" onClick={() => setSidebarOpen(true)} style={{ background: C.dark4, border: `1px solid ${C.border}`, borderRadius: 8, width: 34, height: 34, alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.muted, flexShrink: 0 }}>
                <Icons.menu />
              </button>
              <div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: C.text, letterSpacing: 1 }}>
                  {tabs.find((t) => t.id === tab)?.label}
                </div>
                <div style={{ fontSize: 10, color: C.muted, letterSpacing: "1px" }}>
                  {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Link href="/" target="_blank" className="admin-hamburger" style={{ background: C.dark4, border: `1px solid ${C.border}`, borderRadius: 8, width: 34, height: 34, alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.gold, flexShrink: 0, textDecoration: "none" }}>
                <Icons.home />
              </Link>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 12, color: C.text, fontWeight: 500 }}>{user.phone}</div>
                <div style={{ fontSize: 9, color: C.gold, letterSpacing: "1.5px", textTransform: "uppercase" }}>Admin</div>
              </div>
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(201,168,76,0.12)", border: `1px solid ${C.goldDark}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Bebas Neue', sans-serif", fontSize: 14, color: C.gold, flexShrink: 0 }}>
                {user.phone.slice(-2)}
              </div>
            </div>
          </header>

          <main style={{ flex: 1, padding: "20px 16px", overflowY: "auto" }}>
            {picksLoading ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}><Spinner /></div>
            ) : (
              <>
                {tab === "overview" && <OverviewTab picks={picks} users={users} />}
                {tab === "picks" && <PicksTab picks={picks} setPicks={setPicks} />}
                {tab === "users" && <UsersTab users={users} setUsers={setUsers} usersLoading={usersLoading} picks={picks} />}
                {tab === "revenue" && <RevenueTab picks={picks} users={users} />}
                {tab === "transactions" && <TransactionsTab />}
                {tab === "messages" && <MessagesTab conversations={conversations} setConversations={setConversations} loading={conversationsLoading} users={users} />}
                {tab === "announcements" && <AnnouncementsTab announcements={announcements} setAnnouncements={setAnnouncements} loading={announcementsLoading} />}
                {tab === "settings" && <SettingsTab />}
              </>
            )}
          </main>
        </div>
      </div>
    </>
  );
}