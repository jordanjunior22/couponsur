"use client";
import { useState, useMemo, useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import Link from "next/link";
import SoccerVitalImportModal from "@/components/SoccerVitalImportModal";

// ─── Types ─────────────────────────────────────────────────────────────────────
interface Match {
  _id?: string;
  home: string;
  away: string;
  tip: string;
  odd: number;
  league?: string;
  date?: string;
  outcome: "PENDING" | "WIN" | "LOSS";
}

interface Pick {
  _id: string;
  title: string;
  price: number;
  total_odds: number;
  match_date: string;
  league: string;
  outcome: "PENDING" | "WIN" | "LOSS";
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

interface ChatMessage {
  _id?: string;
  sender: "USER" | "ADMIN";
  text: string;
  createdAt: string;
}

interface Conversation {
  _id: string;
  user: string | null;
  phone: string;
  status: "OPEN" | "RESOLVED";
  messages: ChatMessage[];
  lastMessageAt: string;
  createdAt: string;
}

interface Announcement {
  _id: string;
  title: string;
  body: string;
  type: "INFO" | "WARNING" | "SUCCESS";
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string;
}

const LEAGUES = [
  "Premier League", "Ligue 1", "La Liga", "Serie A",
  "Bundesliga", "UCL", "MLS", "Eredivisie", "Mix"
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
function Badge({ outcome }: { outcome: "PENDING" | "WIN" | "LOSS" | "draft" | "live" }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    WIN: { bg: "rgba(34,197,94,0.12)", color: C.green, label: "WIN" },
    LOSS: { bg: "rgba(239,68,68,0.12)", color: C.red, label: "LOSS" },
    PENDING: { bg: "rgba(201,168,76,0.1)", color: C.gold, label: "EN COURS" },
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
function LineChart({ data, height = 180 }: { data: { label: string; value: number }[]; height?: number }) {
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

  return (
    <div style={{ padding: "16px" }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height, overflow: "visible" }} preserveAspectRatio="none">
        <path d={areaD} fill="url(#goldFade)" opacity={0.15} />
        <defs>
          <linearGradient id="goldFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.gold} stopOpacity="0.5" />
            <stop offset="100%" stopColor={C.gold} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={pathD} fill="none" stroke={C.gold} strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="0.8" fill={C.gold} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
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
function OutcomeBarChart({ wins, losses, pending }: { wins: number; losses: number; pending: number }) {
  const total = wins + losses + pending || 1;
  const rows = [
    { label: "Win", value: wins, color: C.green },
    { label: "Loss", value: losses, color: C.red },
    { label: "En cours", value: pending, color: C.gold },
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

function PickFormModal({ pick, onSave, onClose }: { pick: Pick | null; onSave: (p: Pick) => void; onClose: () => void }) {
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
  const [newMatch, setNewMatch] = useState({ home: "", away: "", tip: "1", odd: 1.8 });

  const set = (key: keyof Pick, val: unknown) => setForm((f) => ({ ...f, [key]: val }));

  const TIPS = ["1", "X", "2", "1X", "X2", "12", "BTTS", "O 2.5", "U 2.5", "DNB"];

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
        outcome: "PENDING",
        date: f.match_date,
      }],
    }));
    setNewMatch({ home: "", away: "", tip: "1", odd: 1.8 });
  };
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
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16, backdropFilter: "blur(4px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ background: C.dark2, border: `1px solid ${C.border}`, borderRadius: 16, width: "100%", maxWidth: 540, maxHeight: "92vh", overflowY: "auto", padding: 24 }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: "2px", color: C.gold, textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>
              {isNew ? "Nouveau Pick" : "Modifier"}
            </div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color: C.text, letterSpacing: 1 }}>
              {isNew ? "Créer un Pick" : form.title || "Sans titre"}
            </div>
          </div>
          <button onClick={onClose} style={{ background: C.dark4, border: `1px solid ${C.border}`, borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.muted }}>
            <Icons.close />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={lStyle}>Titre</label>
            <input style={iStyle} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Ex: PL Banker of the Week" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={lStyle}>Prix (FCFA)</label>
              <input type="number" style={iStyle} value={form.price} onChange={(e) => set("price", Number(e.target.value))} />
            </div>
            <div>
              <label style={lStyle}>Cotes totales</label>
              <input type="number" step="0.1" style={iStyle} value={form.total_odds} onChange={(e) => set("total_odds", Number(e.target.value))} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={lStyle}>Résultat</label>
              <select style={{ ...iStyle, cursor: "pointer" }} value={form.outcome} onChange={(e) => set("outcome", e.target.value as Pick["outcome"])}>
                <option value="PENDING">En cours</option>
                <option value="WIN">Win</option>
                <option value="LOSS">Loss</option>
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

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto auto auto", gap: 6, marginBottom: 8 }}>
              <input style={{ ...iStyle, fontSize: 12, padding: "8px 10px" }} value={newMatch.home}
                onChange={(e) => setNewMatch((m) => ({ ...m, home: e.target.value }))} placeholder="Domicile" />
              <input style={{ ...iStyle, fontSize: 12, padding: "8px 10px" }} value={newMatch.away}
                onChange={(e) => setNewMatch((m) => ({ ...m, away: e.target.value }))} placeholder="Extérieur"
                onKeyDown={(e) => e.key === "Enter" && addMatch()} />
              <select style={{ ...iStyle, fontSize: 12, padding: "8px 10px", cursor: "pointer", width: "auto" }} value={newMatch.tip}
                onChange={(e) => setNewMatch((m) => ({ ...m, tip: e.target.value }))}>
                {TIPS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <input type="number" step="0.01" style={{ ...iStyle, fontSize: 12, padding: "8px 10px", width: 70 }} value={newMatch.odd}
                onChange={(e) => setNewMatch((m) => ({ ...m, odd: Number(e.target.value) }))} placeholder="Cote" />
              <button onClick={addMatch} style={{ background: C.gold, color: C.dark, border: "none", borderRadius: 8, padding: "8px 12px", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center" }}>
                <Icons.plus />
              </button>
            </div>

            {form.matches.map((m, idx) => {
              const toggleOutcome = () => {
                const next: Match["outcome"] = m.outcome === "PENDING" ? "WIN" : m.outcome === "WIN" ? "LOSS" : "PENDING";
                setForm((f) => ({
                  ...f,
                  matches: f.matches.map((mx, mxIdx) => mxIdx === idx ? { ...mx, outcome: next } : mx),
                }));
              };
              const tickColor = m.outcome === "WIN" ? C.green : m.outcome === "LOSS" ? C.red : C.faint;
              const tickLabel = m.outcome === "WIN" ? "✓" : m.outcome === "LOSS" ? "✗" : "·";
              return (
                <div key={m._id ?? idx} style={{ display: "flex", alignItems: "center", gap: 8, background: C.dark4, borderRadius: 8, padding: "8px 12px", marginBottom: 6, border: `1px solid ${C.border}` }}>
                  <div style={{ flex: 1, fontSize: 12, color: C.text }}>
                    {m.home} vs {m.away} — <span style={{ color: C.gold, fontWeight: 700 }}>{m.tip}</span>
                    <span style={{ color: C.muted }}> @ {m.odd}</span>
                  </div>
                  <button
                    onClick={toggleOutcome}
                    title={`Résultat: ${m.outcome} — cliquer pour changer`}
                    style={{
                      width: 26, height: 26, borderRadius: 6, border: `1.5px solid ${tickColor}`,
                      background: m.outcome === "PENDING" ? "transparent" : `${tickColor}22`,
                      color: tickColor, fontSize: 14, fontWeight: 700, cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                      transition: "all 0.15s",
                    }}
                  >
                    {tickLabel}
                  </button>
                  <button onClick={() => setForm((f) => ({ ...f, matches: f.matches.filter((_, mxIdx) => mxIdx !== idx) }))} style={{ background: "none", border: "none", cursor: "pointer", color: C.red, padding: 2 }}>
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
function UserDetailModal({ user, picks, subPrice, onClose }: { user: ApiUser; picks: Pick[]; subPrice: number | null; onClose: () => void }) {
  const unlockedPicks = picks.filter((p) => user.unlockedPickIds.includes(p._id));
  const pickRevenue = unlockedPicks.reduce((sum, p) => sum + p.price, 0);
  const isActiveSubscriber = user.subscription?.status === "ACTIVE" && user.subscription.expiresAt && new Date(user.subscription.expiresAt) > new Date();
  const subRevenue = isActiveSubscriber && subPrice != null ? subPrice : 0;
  const revenue = pickRevenue + subRevenue;

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
  const [filterLeague, setFilterLeague] = useState("ALL");
  const [showImport, setShowImport] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const filtered = useMemo(() => picks.filter((p) => {
    const s = search.toLowerCase();
    return (
      (p.title.toLowerCase().includes(s) || p.league.toLowerCase().includes(s)) &&
      (filterOutcome === "ALL" || p.outcome === filterOutcome) &&
      (filterLeague === "ALL" || p.league === filterLeague)
    );
  }), [picks, search, filterOutcome, filterLeague]);

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

  const allFilteredSelected = filtered.length > 0 && filtered.every((p) => selected.has(p._id));

  const toggleSelectAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filtered.forEach((p) => next.delete(p._id));
      } else {
        filtered.forEach((p) => next.add(p._id));
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
              checked={allFilteredSelected}
              onChange={toggleSelectAll}
              style={{ cursor: "pointer", width: 14, height: 14 }}
            />
            <span>Titre</span><span>Ligue</span><span>Date</span><span>Cotes / Prix</span><span>Statut</span><span>Actions</span>
          </div>
          {filtered.length === 0 && <div style={{ padding: "32px", textAlign: "center", color: C.muted, fontSize: 13 }}>Aucun pick trouvé.</div>}
          {filtered.map((p, i) => {
            const isSelected = selected.has(p._id);
            return (
              <div key={p._id}
                style={{ display: "grid", gridTemplateColumns: "28px 2fr 1fr 1fr 1fr 1fr auto", padding: "12px 16px", alignItems: "center", gap: 8, borderBottom: i < filtered.length - 1 ? `1px solid ${C.border}` : "none", borderLeft: `3px solid ${p.outcome === "WIN" ? C.green : p.outcome === "LOSS" ? C.red : C.gold}`, background: isSelected ? "rgba(201,168,76,0.05)" : "transparent", transition: "background 0.15s" }}
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
        {filtered.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, padding: "0 2px" }}>
            <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAll} style={{ cursor: "pointer", width: 14, height: 14 }} />
            <span style={{ fontSize: 11, color: C.muted }}>Tout sélectionner</span>
          </div>
        )}
        {filtered.map((p) => {
          const isSelected = selected.has(p._id);
          return (
            <div key={p._id} style={{
              background: isSelected ? "rgba(201,168,76,0.05)" : C.dark3,
              borderTop: `1px solid ${isSelected ? C.goldDark : C.border}`,
              borderRight: `1px solid ${isSelected ? C.goldDark : C.border}`,
              borderBottom: `1px solid ${isSelected ? C.goldDark : C.border}`,
              borderLeft: `3px solid ${p.outcome === "WIN" ? C.green : p.outcome === "LOSS" ? C.red : C.gold}`,
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

      {(showForm || editPick) && (
        <PickFormModal pick={editPick} onSave={handleSave} onClose={() => { setShowForm(false); setEditPick(null); }} />
      )}
      {showImport && (
        <SoccerVitalImportModal
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
function UsersTab({ users, usersLoading, picks }: { users: ApiUser[]; usersLoading: boolean; picks: Pick[] }) {
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

      {selectedUser && <UserDetailModal user={selectedUser} picks={picks} subPrice={subPrice} onClose={() => setSelectedUser(null)} />}
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

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/settings", { credentials: "include" });
        const data = await res.json();
        if (data?.success) setSubPrice(data.data.subscriptionMonthlyPrice);
      } catch { /* fall back to pick-only revenue */ }
    })();
  }, []);

  const filteredPicks = useMemo(() =>
    picks.filter((p) => p.match_date >= dateFrom && p.match_date <= dateTo),
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
    }).sort((a, b) => b.revenue - a.revenue),
    [filteredPicks, users]
  );

  const byLeague = useMemo(() => {
    const map: Record<string, number> = {};
    perPickRevenue.forEach(({ pick, revenue }) => { map[pick.league] = (map[pick.league] || 0) + revenue; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [perPickRevenue]);

  const maxRev = byLeague[0]?.[1] || 1;
  const finished = filteredPicks.filter((p) => p.outcome !== "PENDING");
  const winRate = finished.length > 0 ? Math.round((filteredPicks.filter((p) => p.outcome === "WIN").length / finished.length) * 100) : 0;

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

      <div style={{ background: C.dark3, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, fontSize: 10, letterSpacing: "2px", color: C.muted, textTransform: "uppercase", fontWeight: 600 }}>Revenu par jour (picks)</div>
        <LineChart data={dailyRevenue} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        <div style={{ background: C.dark3, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, fontSize: 10, letterSpacing: "2px", color: C.muted, textTransform: "uppercase", fontWeight: 600 }}>Revenus par Pick</div>
          {perPickRevenue.length === 0 ? <div style={{ padding: 24, textAlign: "center", color: C.muted, fontSize: 12 }}>Aucune donnée</div> :
            perPickRevenue.map(({ pick, unlocks, revenue }, i) => (
              <div key={pick._id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: i < perPickRevenue.length - 1 ? `1px solid ${C.border}` : "none", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: C.text, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{pick.title}</div>
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{unlocks} débloquage{unlocks !== 1 ? "s" : ""}</div>
                </div>
                <div style={{ fontSize: 13, color: C.gold, fontWeight: 700, flexShrink: 0 }}>{formatCFA(revenue)}</div>
              </div>
            ))}
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

// ─── Overview Tab ───────────────────────────────────────────────────────────────
function OverviewTab({ picks, users }: { picks: Pick[]; users: ApiUser[] }) {
  const finished = picks.filter((p) => p.outcome !== "PENDING");
  const wins = finished.filter((p) => p.outcome === "WIN").length;
  const losses = finished.filter((p) => p.outcome === "LOSS").length;
  const pendingCount = picks.filter((p) => p.outcome === "PENDING").length;
  const winRate = finished.length > 0 ? Math.round((wins / finished.length) * 100) : 0;

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
        <StatCard label="Win Rate" value={`${winRate}%`} sub={`${wins}W / ${finished.length - wins}L`} />
        <StatCard label="Abonnés Actifs" value={activeSubscribers.length} sub={`sur ${users.length} utilisateurs`} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 16 }}>
        <div style={{ background: C.dark3, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, fontSize: 10, letterSpacing: "2px", color: C.muted, textTransform: "uppercase", fontWeight: 600 }}>Revenu (14 derniers jours)</div>
          <LineChart data={revenueTrend} height={160} />
        </div>
        <div style={{ background: C.dark3, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, fontSize: 10, letterSpacing: "2px", color: C.muted, textTransform: "uppercase", fontWeight: 600 }}>Répartition des résultats</div>
          <OutcomeBarChart wins={wins} losses={losses} pending={pendingCount} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        <div style={{ background: C.dark3, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, fontSize: 10, letterSpacing: "2px", color: C.muted, textTransform: "uppercase", fontWeight: 600 }}>Activité Récente</div>
          {recentPicks.length === 0 && <div style={{ padding: "20px", textAlign: "center", color: C.muted, fontSize: 12 }}>Aucun pick</div>}
          {recentPicks.map((p, i) => (
            <div key={p._id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 16px", borderBottom: i < recentPicks.length - 1 ? `1px solid ${C.border}` : "none", borderLeft: `3px solid ${p.outcome === "WIN" ? C.green : p.outcome === "LOSS" ? C.red : C.gold}`, gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, color: C.text, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.title}</div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{p.league} · {formatDate(p.match_date)}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, color: C.gold }}>x{p.total_odds}</span>
                <Badge outcome={p.outcome} />
              </div>
            </div>
          ))}
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

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/settings", { credentials: "include" });
        const data = await res.json();
        if (data?.success) {
          setPrice(data.data.subscriptionMonthlyPrice);
          setInputValue(String(data.data.subscriptionMonthlyPrice));
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

  const iStyle: React.CSSProperties = {
    background: C.dark4, border: `1px solid ${C.border}`, borderRadius: 8,
    color: C.text, fontSize: 14, padding: "10px 12px", width: "100%",
    fontFamily: "inherit", outline: "none",
  };

  if (loading) {
    return <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}><Spinner /></div>;
  }

  return (
    <div style={{ maxWidth: 480 }}>
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
    </div>
  );
}

// ─── Conversation Thread Modal ─────────────────────────────────────────────────
function ConversationModal({ conversation, onClose, onUpdate }: { conversation: Conversation; onClose: () => void; onUpdate: (c: Conversation) => void }) {
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [conversation.messages.length]);

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
            <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{conversation.user ? "Compte lié" : "Visiteur non connecté"}</div>
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
            conversation.messages.map((m, i) => (
              <div key={m._id || i} style={{
                alignSelf: m.sender === "ADMIN" ? "flex-end" : "flex-start",
                maxWidth: "78%",
                background: m.sender === "ADMIN" ? C.gold : C.dark4,
                color: m.sender === "ADMIN" ? C.dark : C.text,
                border: m.sender === "ADMIN" ? "none" : `1px solid ${C.border}`,
                borderRadius: 12,
                borderBottomRightRadius: m.sender === "ADMIN" ? 3 : 12,
                borderBottomLeftRadius: m.sender === "USER" ? 3 : 12,
                padding: "9px 12px",
                fontSize: 13,
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}>
                {m.text}
                <div style={{ fontSize: 9, marginTop: 3, opacity: 0.6 }}>
                  {new Date(m.createdAt).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            ))
          )}
        </div>

        <form onSubmit={handleReply} style={{ display: "flex", gap: 8, padding: 14, borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
          <input
            value={reply}
            onChange={(e) => setReply(e.target.value)}
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
function MessagesTab({ conversations, setConversations, loading }: { conversations: Conversation[]; setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>; loading: boolean }) {
  const [filterStatus, setFilterStatus] = useState<"ALL" | "OPEN" | "RESOLVED">("ALL");
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(
    () => conversations.filter((c) => filterStatus === "ALL" || c.status === filterStatus),
    [conversations, filterStatus]
  );

  const openCount = conversations.filter((c) => c.status === "OPEN").length;
  const selected = conversations.find((c) => c._id === openId) || null;

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
        <ConversationModal conversation={selected} onClose={() => setOpenId(null)} onUpdate={handleUpdate} />
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
type Tab = "overview" | "picks" | "users" | "revenue" | "messages" | "announcements" | "settings";

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
                {tab === "users" && <UsersTab users={users} usersLoading={usersLoading} picks={picks} />}
                {tab === "revenue" && <RevenueTab picks={picks} users={users} />}
                {tab === "messages" && <MessagesTab conversations={conversations} setConversations={setConversations} loading={conversationsLoading} />}
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