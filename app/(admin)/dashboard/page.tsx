"use client";
import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";

// ─── Types ─────────────────────────────────────────────────────────────────────
interface Match {
  _id: string;
  prediction: string;
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
  createdAt?: string;
}

const LEAGUES = [
  "Premier League", "Ligue 1", "La Liga", "Serie A",
  "Bundesliga", "UCL", "MLS", "Eredivisie",
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
function formatCFA(n: number) { return n.toLocaleString("fr-FR") + " FCFA"; }
function formatDate(d: string) {
  if (!d) return "—";
  // Strip to YYYY-MM-DD whether input is a full ISO string or date-only
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

// ─── Pick Form Modal ────────────────────────────────────────────────────────────
function PickFormModal({ pick, onSave, onClose }: { pick: Pick | null; onSave: (p: Pick) => void; onClose: () => void }) {
  const isNew = !pick;
  const [form, setForm] = useState<Pick>(pick || {
    _id: genId(), title: "", price: 2000, total_odds: 2.0,
    match_date: new Date().toISOString().split("T")[0],
    league: "Premier League", outcome: "PENDING", is_published: false, matches: [],
  });
  const [saving, setSaving] = useState(false);
  const [newMatch, setNewMatch] = useState("");

  const set = (key: keyof Pick, val: unknown) => setForm((f) => ({ ...f, [key]: val }));

  const addMatch = () => {
    if (!newMatch.trim()) return;
    setForm((f) => ({ ...f, matches: [...f.matches, { _id: genId(), prediction: newMatch.trim(), outcome: "PENDING" }] }));
    setNewMatch("");
  };

const handleSave = async () => {
  if (!form.title.trim()) return;
  setSaving(true);
  try {
    const method = isNew ? "POST" : "PUT";
    const url = isNew ? "/api/picks" : `/api/picks/${form._id}`;

    // Strip frontend-generated _id from matches before saving
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
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input style={{ ...iStyle, flex: 1 }} value={newMatch} onChange={(e) => setNewMatch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addMatch()} placeholder="Ex: PSG vs Lyon — BTTS: Yes" />
              <button onClick={addMatch} style={{ background: C.gold, color: C.dark, border: "none", borderRadius: 8, padding: "10px 14px", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center" }}>
                <Icons.plus />
              </button>
            </div>
            {form.matches.map((m) => (
              <div key={m._id} style={{ display: "flex", alignItems: "center", gap: 8, background: C.dark4, borderRadius: 8, padding: "8px 12px", marginBottom: 6, border: `1px solid ${C.border}` }}>
                <div style={{ flex: 1, fontSize: 12, color: C.text }}>{m.prediction}</div>
                <select value={m.outcome}
                  onChange={(e) => setForm((f) => ({ ...f, matches: f.matches.map((mx) => mx._id === m._id ? { ...mx, outcome: e.target.value as Match["outcome"] } : mx) }))}
                  style={{ background: C.dark3, border: `1px solid ${C.border}`, color: C.muted, fontSize: 10, borderRadius: 4, padding: "3px 6px", fontFamily: "inherit", cursor: "pointer" }}>
                  <option value="PENDING">Pending</option>
                  <option value="WIN">Win</option>
                  <option value="LOSS">Loss</option>
                </select>
                <button onClick={() => setForm((f) => ({ ...f, matches: f.matches.filter((mx) => mx._id !== m._id) }))} style={{ background: "none", border: "none", cursor: "pointer", color: C.red, padding: 2 }}>
                  <Icons.close />
                </button>
              </div>
            ))}
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
function UserDetailModal({ user, picks, onClose }: { user: ApiUser; picks: Pick[]; onClose: () => void }) {
  const unlockedPicks = picks.filter((p) => user.unlockedPickIds.includes(p._id));
  const revenue = unlockedPicks.reduce((sum, p) => sum + p.price, 0);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16, backdropFilter: "blur(4px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ background: C.dark2, border: `1px solid ${C.border}`, borderRadius: 16, width: "100%", maxWidth: 460, maxHeight: "88vh", overflowY: "auto", padding: 24 }}>
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

  const filtered = useMemo(() => picks.filter((p) => {
    const s = search.toLowerCase();
    return (
      (p.title.toLowerCase().includes(s) || p.league.toLowerCase().includes(s)) &&
      (filterOutcome === "ALL" || p.outcome === filterOutcome) &&
      (filterLeague === "ALL" || p.league === filterLeague)
    );
  }), [picks, search, filterOutcome, filterLeague]);

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
      </div>

      {/* Desktop table */}
      <div className="admin-table-desktop">
        <div style={{ background: C.dark3, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr auto", padding: "10px 16px", borderBottom: `1px solid ${C.border}`, fontSize: 9, letterSpacing: "2px", color: C.muted, textTransform: "uppercase", fontWeight: 600 }}>
            <span>Titre</span><span>Ligue</span><span>Date</span><span>Cotes / Prix</span><span>Statut</span><span>Actions</span>
          </div>
          {filtered.length === 0 && <div style={{ padding: "32px", textAlign: "center", color: C.muted, fontSize: 13 }}>Aucun pick trouvé.</div>}
          {filtered.map((p, i) => (
            <div key={p._id}
              style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr auto", padding: "12px 16px", alignItems: "center", gap: 8, borderBottom: i < filtered.length - 1 ? `1px solid ${C.border}` : "none", borderLeft: `3px solid ${p.outcome === "WIN" ? C.green : p.outcome === "LOSS" ? C.red : C.gold}`, transition: "background 0.15s" }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = C.dark4)}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}>
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
                <Badge outcome={p.outcome} />
                <Badge outcome={p.is_published ? "live" : "draft"} />
              </div>
              <PickActions pick={p} onEdit={() => { setEditPick(p); setShowForm(true); }} onDelete={() => handleDelete(p._id)} onToggle={() => togglePublish(p._id)} />
            </div>
          ))}
        </div>
      </div>

      {/* Mobile cards */}
      <div className="admin-cards-mobile">
        {filtered.length === 0 && <div style={{ textAlign: "center", color: C.muted, fontSize: 13, padding: "32px 0" }}>Aucun pick trouvé.</div>}
        {filtered.map((p) => (
          <div key={p._id} style={{ background: C.dark3, border: `1px solid ${C.border}`, borderLeft: `3px solid ${p.outcome === "WIN" ? C.green : p.outcome === "LOSS" ? C.red : C.gold}`, borderRadius: 10, padding: 14, marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 3 }}>{p.title}</div>
                <div style={{ fontSize: 10, color: C.muted }}>{p.league} · {formatDate(p.match_date)}</div>
              </div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color: C.gold, flexShrink: 0 }}>x{p.total_odds}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 6 }}>
                <Badge outcome={p.outcome} />
                <Badge outcome={p.is_published ? "live" : "draft"} />
              </div>
              <PickActions pick={p} onEdit={() => { setEditPick(p); setShowForm(true); }} onDelete={() => handleDelete(p._id)} onToggle={() => togglePublish(p._id)} />
            </div>
          </div>
        ))}
      </div>

      {(showForm || editPick) && (
        <PickFormModal pick={editPick} onSave={handleSave} onClose={() => { setShowForm(false); setEditPick(null); }} />
      )}
    </div>
  );
}

// ─── Users Tab ──────────────────────────────────────────────────────────────────
function UsersTab({ users, usersLoading, picks }: { users: ApiUser[]; usersLoading: boolean; picks: Pick[] }) {
  const [selectedUser, setSelectedUser] = useState<ApiUser | null>(null);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() =>
    users.filter((u) => u.phone.includes(search) || u.role.toLowerCase().includes(search.toLowerCase())),
    [users, search]
  );

  if (usersLoading) {
    return <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}><Spinner /></div>;
  }

  const UserRow = ({ u }: { u: ApiUser }) => {
    const unlocked = picks.filter((p) => u.unlockedPickIds.includes(p._id));
    const wins = unlocked.filter((p) => p.outcome === "WIN").length;
    const rev = unlocked.reduce((s, p) => s + p.price, 0);
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
    return { unlocked, wins, rev, avatar, roleBadge };
  };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <input style={{ background: C.dark4, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 12, padding: "8px 12px", fontFamily: "inherit", outline: "none", width: "100%", maxWidth: 300 }}
          placeholder="Rechercher par numéro ou rôle…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {/* Desktop table */}
      <div className="admin-table-desktop">
        <div style={{ background: C.dark3, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.5fr 0.8fr 1fr 1fr 1fr auto", padding: "10px 16px", borderBottom: `1px solid ${C.border}`, fontSize: 9, letterSpacing: "2px", color: C.muted, textTransform: "uppercase", fontWeight: 600 }}>
            <span>Téléphone</span><span>Rôle</span><span>Picks</span><span>Wins</span><span>Dépensé</span><span>Détails</span>
          </div>
          {filtered.length === 0 && <div style={{ padding: "32px", textAlign: "center", color: C.muted, fontSize: 13 }}>Aucun utilisateur.</div>}
          {filtered.map((u, i) => {
            const { unlocked, wins, rev, avatar, roleBadge } = UserRow({ u });
            return (
              <div key={u._id}
                style={{ display: "grid", gridTemplateColumns: "1.5fr 0.8fr 1fr 1fr 1fr auto", padding: "12px 16px", alignItems: "center", borderBottom: i < filtered.length - 1 ? `1px solid ${C.border}` : "none", cursor: "pointer", transition: "background 0.15s" }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = C.dark4)}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
                onClick={() => setSelectedUser(u)}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>{avatar}<div style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{u.phone}</div></div>
                <div>{roleBadge}</div>
                <div><span style={{ background: "rgba(201,168,76,0.1)", color: C.gold, border: "1px solid rgba(201,168,76,0.2)", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4 }}>{unlocked.length} picks</span></div>
                <div style={{ fontSize: 12, color: C.green, fontWeight: 600 }}>{wins} wins</div>
                <div style={{ fontSize: 12, color: C.text }}>{formatCFA(rev)}</div>
                <button style={{ background: C.dark4, border: `1px solid ${C.border}`, borderRadius: 6, color: C.muted, padding: "5px 10px", fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}>Voir →</button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile cards */}
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
                  </div>
                </div>
                <div style={{ fontSize: 13, color: C.gold, fontWeight: 700 }}>{formatCFA(rev)}</div>
              </div>
              <div style={{ display: "flex", gap: 14, fontSize: 11, color: C.muted }}>
                <span>{unlocked.length} picks débloqués</span>
                <span style={{ color: C.green }}>{wins} wins</span>
              </div>
            </div>
          );
        })}
      </div>

      {selectedUser && <UserDetailModal user={selectedUser} picks={picks} onClose={() => setSelectedUser(null)} />}
    </div>
  );
}

// ─── Revenue Tab ───────────────────────────────────────────────────────────────
function RevenueTab({ picks, users }: { picks: Pick[]; users: ApiUser[] }) {
  const today = new Date().toISOString().split("T")[0];
  const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
  const [dateFrom, setDateFrom] = useState(thirtyAgo);
  const [dateTo, setDateTo] = useState(today);

  const filteredPicks = useMemo(() =>
    picks.filter((p) => p.match_date >= dateFrom && p.match_date <= dateTo),
    [picks, dateFrom, dateTo]
  );

  const totalRevenue = useMemo(() =>
    users.reduce((t, u) => t + u.unlockedPickIds.reduce((s, pid) => { const p = filteredPicks.find((pk) => pk._id === pid); return s + (p ? p.price : 0); }, 0), 0),
    [users, filteredPicks]
  );

  const totalUnlocks = useMemo(() =>
    users.reduce((t, u) => t + u.unlockedPickIds.filter((pid) => filteredPicks.find((p) => p._id === pid)).length, 0),
    [users, filteredPicks]
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

  const iStyle: React.CSSProperties = { background: C.dark4, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 12, padding: "8px 12px", fontFamily: "inherit", outline: "none" };

  return (
    <div>
      {/* Date filter */}
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

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 24 }}>
        <StatCard label="Revenu Total" value={totalRevenue >= 1000 ? `${(totalRevenue / 1000).toFixed(0)}K` : totalRevenue} sub={formatCFA(totalRevenue)} accent />
        <StatCard label="Débloquages" value={totalUnlocks} sub={`${filteredPicks.length} picks`} />
        <StatCard label="Win Rate" value={`${winRate}%`} sub={`${filteredPicks.filter((p) => p.outcome === "WIN").length} victoires`} />
        <StatCard label="Prix Moyen" value={filteredPicks.length > 0 ? `${Math.round(filteredPicks.reduce((s, p) => s + p.price, 0) / filteredPicks.length / 100) * 100}` : "0"} sub="FCFA / pick" />
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
  const winRate = finished.length > 0 ? Math.round((wins / finished.length) * 100) : 0;
  const totalRevenue = users.reduce((sum, u) =>
    sum + u.unlockedPickIds.reduce((s, pid) => { const p = picks.find((pk) => pk._id === pid); return s + (p ? p.price : 0); }, 0), 0
  );
  const activeUsers = users.filter((u) => u.unlockedPickIds.length > 0).length;
  const recentPicks = [...picks].sort((a, b) => b.match_date.localeCompare(a.match_date)).slice(0, 5);
  const topUsers = [...users]
    .map((u) => ({ u, rev: u.unlockedPickIds.reduce((s, pid) => { const p = picks.find((pk) => pk._id === pid); return s + (p ? p.price : 0); }, 0) }))
    .sort((a, b) => b.rev - a.rev).slice(0, 5);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 24 }}>
        <StatCard label="Revenu Total" value={`${Math.round(totalRevenue / 1000)}K`} sub={formatCFA(totalRevenue)} accent />
        <StatCard label="Utilisateurs" value={users.length} sub={`${activeUsers} actifs`} />
        <StatCard label="Picks Totaux" value={picks.length} sub={`${picks.filter((p) => p.is_published).length} publiés`} />
        <StatCard label="Win Rate" value={`${winRate}%`} sub={`${wins}W / ${finished.length - wins}L`} />
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
type Tab = "overview" | "picks" | "users" | "revenue";

export default function AdminDashboard() {
  // ── Auth guard ────────────────────────────────────────────────────────────
  const { user, loading: authLoading, logout } = useAuth();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [picksLoading, setPicksLoading] = useState(true);
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);

  // ── Fetch picks (admin sees all, published + unpublished) ─────────────────
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

  // ── Fetch real users from /api/users ──────────────────────────────────────
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
        // Handle common API shapes: [], { users: [] }, { data: [] }
        const resolved: ApiUser[] = Array.isArray(data) ? data
          : Array.isArray(data?.users) ? data.users
          : Array.isArray(data?.data) ? data.data : [];
        setUsers(resolved);
      } catch (e) { console.error("Users fetch:", e); }
      finally { if (!cancelled) setUsersLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // ── Auth loading screen ───────────────────────────────────────────────────
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

  // ── Access denied if not logged in or not admin ───────────────────────────
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

  const tabs: { id: Tab; label: string; icon: React.FC }[] = [
    { id: "overview", label: "Dashboard", icon: Icons.dashboard },
    { id: "picks", label: "Picks", icon: Icons.picks },
    { id: "users", label: "Utilisateurs", icon: Icons.users },
    { id: "revenue", label: "Revenus", icon: Icons.revenue },
  ];

  const NavItems = () => (
    <>
      {tabs.map((t) => (
        <button key={t.id} onClick={() => { setTab(t.id); setSidebarOpen(false); }}
          style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px", borderRadius: 8, border: "none", cursor: "pointer", background: tab === t.id ? "rgba(201,168,76,0.1)" : "transparent", color: tab === t.id ? C.gold : C.muted, fontSize: 13, fontWeight: tab === t.id ? 600 : 400, fontFamily: "inherit", marginBottom: 2, textAlign: "left", borderLeft: tab === t.id ? `2px solid ${C.gold}` : "2px solid transparent", transition: "all 0.15s" }}>
          <t.icon />{t.label}
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

        /* Responsive: sidebar + table/card switching */
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

        {/* ── Desktop Sidebar ── */}
        <aside className="admin-sidebar" style={{ width: 210, flexShrink: 0, background: C.dark2, borderRight: `1px solid ${C.border}`, flexDirection: "column", position: "sticky", top: 0, height: "100vh" }}>
          <div style={{ padding: "22px 18px 18px", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 11, letterSpacing: "4px", color: C.gold, textTransform: "uppercase", marginBottom: 3 }}>Coupon Sûr</div>
            <div style={{ fontSize: 10, color: C.muted, letterSpacing: "1px" }}>Administration</div>
          </div>
          <nav style={{ padding: "10px 8px", flex: 1 }}><NavItems /></nav>
          <div style={{ padding: "14px 8px", borderTop: `1px solid ${C.border}` }}>
            <button onClick={handleLogout} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px", borderRadius: 8, border: "none", cursor: "pointer", background: "transparent", color: C.muted, fontSize: 12, fontFamily: "inherit" }}>
              <Icons.logout />Déconnexion
            </button>
          </div>
        </aside>

        {/* ── Mobile Sidebar Drawer ── */}
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
              <div style={{ padding: "14px 8px", borderTop: `1px solid ${C.border}` }}>
                <button onClick={handleLogout} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px", borderRadius: 8, border: "none", cursor: "pointer", background: "transparent", color: C.muted, fontSize: 12, fontFamily: "inherit" }}>
                  <Icons.logout />Déconnexion
                </button>
              </div>
            </div>
            <div style={{ flex: 1, background: "rgba(0,0,0,0.65)" }} onClick={() => setSidebarOpen(false)} />
          </div>
        )}

        {/* ── Main ── */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>

          {/* Topbar */}
          <header style={{ background: C.dark2, borderBottom: `1px solid ${C.border}`, padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {/* Hamburger – only visible on mobile via CSS class */}
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

            {/* Admin info */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 12, color: C.text, fontWeight: 500 }}>{user.phone}</div>
                <div style={{ fontSize: 9, color: C.gold, letterSpacing: "1.5px", textTransform: "uppercase" }}>Admin</div>
              </div>
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(201,168,76,0.12)", border: `1px solid ${C.goldDark}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Bebas Neue', sans-serif", fontSize: 14, color: C.gold, flexShrink: 0 }}>
                {user.phone.slice(-2)}
              </div>
            </div>
          </header>

          {/* Tab content */}
          <main style={{ flex: 1, padding: "20px 16px", overflowY: "auto" }}>
            {picksLoading ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}><Spinner /></div>
            ) : (
              <>
                {tab === "overview" && <OverviewTab picks={picks} users={users} />}
                {tab === "picks" && <PicksTab picks={picks} setPicks={setPicks} />}
                {tab === "users" && <UsersTab users={users} usersLoading={usersLoading} picks={picks} />}
                {tab === "revenue" && <RevenueTab picks={picks} users={users} />}
              </>
            )}
          </main>
        </div>
      </div>
    </>
  );
}