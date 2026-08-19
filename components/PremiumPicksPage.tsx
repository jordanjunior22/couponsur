"use client";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { OneXBetBanner } from "./OneXBetBanner";
import { CompoundBetBanner } from "./CompoundBanner";
import { trackEvent, generateEventId, getFbCookies } from "@/lib/pixelClient";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Match {
  home: string;
  away: string;
  tip: string;
  odd: number;
  league?: string;
  confidence?: number;
  sources?: string[];
  outcome: "PENDING" | "WIN" | "LOSS";
}

export type PickTier = "safe" | "value" | "bold" | null;

export interface Pick {
  _id: string;
  title: string;
  price: number;
  total_odds: number;
  match_date: string;
  league: string;
  outcome: "PENDING" | "WIN" | "LOSS";
  is_published: boolean;
  is_automated?: boolean;
  tier?: PickTier;
  avg_confidence?: number | null;
  matches: Match[];
}

const PAGE_SIZE = 6;

// Recent = last 30 days (dynamic)
const RECENT_CUTOFF = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  .toISOString()
  .split("T")[0];

// ─── Tier config ──────────────────────────────────────────────────────────────
const TIER_META: Record<string, { label: string; desc: string }> = {
  safe:  { label: "Safe",  desc: "Cotes prudentes" },
  value: { label: "Value", desc: "Équilibre risque / rendement" },
  bold:  { label: "Bold",  desc: "Cotes élevées" },
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

// ─── Outcome Badge ────────────────────────────────────────────────────────────
const OutcomeBadge = ({ outcome }: { outcome: "PENDING" | "WIN" | "LOSS" }) => {
  const styles: Record<string, React.CSSProperties> = {
    WIN:     { background: "rgba(34,197,94,0.12)",  color: "#22C55E", border: "1px solid rgba(34,197,94,0.25)"  },
    LOSS:    { background: "rgba(239,68,68,0.12)",  color: "#EF4444", border: "1px solid rgba(239,68,68,0.25)"  },
    PENDING: { background: "rgba(201,168,76,0.1)",  color: "#C9A84C", border: "1px solid rgba(201,168,76,0.25)" },
  };
  const labels = { WIN: "WIN", LOSS: "LOSS", PENDING: "LIVE" };
  return (
    <span style={{ ...styles[outcome], fontSize: 9, letterSpacing: "1.5px", textTransform: "uppercase", fontWeight: 700, padding: "4px 10px", borderRadius: 4, flexShrink: 0 }}>
      {labels[outcome]}
    </span>
  );
};

// ─── Hero ─────────────────────────────────────────────────────────────────────
function Hero({ picks }: { picks: Pick[] }) {
  const publishedPicks = picks.filter((p) => p.is_published !== false);
  const gradedPicks = publishedPicks.filter((p) => p.outcome !== "PENDING");
  const wins = gradedPicks.filter((p) => p.outcome === "WIN").length;
  const winRate = gradedPicks.length > 0 ? Math.round((wins / gradedPicks.length) * 100) : null;
  const todayCount = publishedPicks.filter((p) => {
    const today = new Date().toISOString().split("T")[0];
    return p.match_date.split("T")[0] === today;
  }).length;

  return (
    <div style={{ padding: "32px 16px 24px", maxWidth: 700, margin: "0 auto", textAlign: "center" }}>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(28px, 7vw, 40px)", color: "#E8EAF0", letterSpacing: 2, marginBottom: 8 }}>
        Pronostics Football Premium
      </div>
      <div style={{ fontSize: 13, color: "#7A8399", marginBottom: 12, lineHeight: 1.6 }}>
        Sélections quotidiennes à partir de 200 FCFA — Safe, Value et Bold pour chaque profil.
      </div>
      <div style={{
        display: "inline-flex", alignItems: "flex-start", gap: 8, textAlign: "left",
        background: "rgba(201,168,76,0.04)", border: "1px solid rgba(201,168,76,0.12)",
        borderRadius: 8, padding: "10px 14px", marginBottom: 20, maxWidth: 480,
      }}>
        <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>⚠️</span>
        <p style={{ fontSize: 11, color: "#7A8399", lineHeight: 1.6, margin: 0 }}>
          Pariez à vos propres risques : nos pronostics sont fournis à titre indicatif
          et ne garantissent aucun résultat. Ne misez que ce que vous pouvez vous
          permettre de perdre — nous déclinons toute responsabilité quant à vos pertes.
        </p>
      </div>
      {(winRate !== null || todayCount > 0) && (
        <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
          {winRate !== null && (
            <div style={{ background: "rgba(201,168,76,0.06)", border: "1px solid rgba(201,168,76,0.2)", borderRadius: 8, padding: "8px 16px" }}>
              <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color: "#C9A84C" }}>{winRate}%</span>
              <span style={{ fontSize: 10, color: "#7A8399", marginLeft: 6, textTransform: "uppercase", letterSpacing: "1px" }}>Taux de réussite</span>
            </div>
          )}
          {todayCount > 0 && (
            <div style={{ background: "rgba(201,168,76,0.06)", border: "1px solid rgba(201,168,76,0.2)", borderRadius: 8, padding: "8px 16px" }}>
              <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color: "#C9A84C" }}>{todayCount}</span>
              <span style={{ fontSize: 10, color: "#7A8399", marginLeft: 6, textTransform: "uppercase", letterSpacing: "1px" }}>Picks aujourd&apos;hui</span>
            </div>
          )}
        </div>
      )}
      <button
        onClick={() => document.getElementById("today-picks")?.scrollIntoView({ behavior: "smooth" })}
        style={{ background: "#C9A84C", color: "#0A0C0F", border: "none", borderRadius: 8, padding: "12px 28px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.5px" }}
      >
        Voir les pronostics du jour
      </button>
    </div>
  );
}

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
        else if (data.status === "FAILED")  { clearPolling(); setErrorMsg("Paiement refusé par l'opérateur."); setStep("failed"); }
        else if (data.status === "EXPIRED") { clearPolling(); setErrorMsg("La session de paiement a expiré."); setStep("expired"); }
      } catch { /* keep polling */ }
    }, 3000);
    return clearPolling;
  }, [transId, step, clearPolling]);

  const priceLabel = monthlyPrice != null ? `${monthlyPrice.toLocaleString("fr-FR")} FCFA` : "…";

  if (step === "processing") return (
    <div style={{ textAlign: "center", padding: "32px 16px" }}>
      <div style={{ width: 48, height: 48, border: "4px solid #2A3140", borderTopColor: "#C9A84C", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 20px" }} />
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
        <div style={{ fontSize: 13, color: "#E8EAF0", fontWeight: 600, marginBottom: 6 }}>Abonnement Mensuel</div>
        <div style={{ fontSize: 12, color: "#7A8399", lineHeight: 1.6, marginBottom: 10 }}>Accès illimité à tous les picks pendant 30 jours — plus besoin de débloquer un par un.</div>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: "#C9A84C" }}>
          {priceLabel}<span style={{ fontSize: 12, color: "#7A8399", fontFamily: "'DM Sans', sans-serif" }}> / mois</span>
        </div>
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
        else if (data.status === "FAILED")  { clearPolling(); setErrorMsg("Paiement refusé par l'opérateur."); setStep("failed"); }
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
      <div style={{ width: 48, height: 48, border: "4px solid #2A3140", borderTopColor: "#C9A84C", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 20px" }} />
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
const borderColors = { WIN: "#22C55E", LOSS: "#EF4444", PENDING: "#C9A84C" };

function PickCard({ pick, onSelect }: { pick: Pick; onSelect: (p: Pick) => void }) {
  const { user, hasActiveSubscription } = useAuth();
  const isPending = pick.outcome === "PENDING";
  const isSubscribed = hasActiveSubscription();
  const isUnlocked = isSubscribed || user?.unlockedPickIds?.includes(pick._id);
  const tierMeta = pick.tier ? TIER_META[pick.tier] : null;
  const countdown = useCountdown(isPending ? pick.match_date : null);

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

// ─── Locked Predictions ───────────────────────────────────────────────────────
function LockedPredictions({ pick, onUnlock }: { pick: Pick; onUnlock: () => void }) {
  return (
    <div style={{ position: "relative" }}>
      {pick.matches.map((m, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0", borderBottom: "1px solid #2A3140", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: "#E8EAF0", lineHeight: 1.4 }}>
            {m.home} vs {m.away}
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
          <span style={{ color: "#7A8399" }}> | </span>
          <span style={{ color: "#C9A84C", fontWeight: 700 }}>{match.tip}</span>
          {match.odd != null && (
            <><span style={{ color: "#7A8399" }}> | </span><span style={{ color: "#7A8399" }}>{match.odd}</span></>
          )}
        </div>
        <div style={{ width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: match.outcome === "WIN" ? "rgba(34,197,94,0.12)" : match.outcome === "LOSS" ? "rgba(239,68,68,0.12)" : "rgba(201,168,76,0.1)" }}>
          {match.outcome === "WIN"     && <IconCheck />}
          {match.outcome === "LOSS"    && <IconX />}
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
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50, backdropFilter: "blur(4px)" }}>
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
              <div style={{ marginLeft: "auto" }}><OutcomeBadge outcome={pick.outcome} /></div>
            </div>
            {canViewPredictions
              ? <div>{pick.matches.map((m, i) => <PredictionRow key={i} match={m} />)}</div>
              : <LockedPredictions pick={pick} onUnlock={() => setView(user ? "payment" : "auth")} />
            }
          </>
        )}
        {view === "auth"    && <AuthGate onSuccess={() => setView("payment")} />}
        {view === "payment" && <MomoPayment pick={pick} onSuccess={handlePaymentSuccess} onBack={onClose} />}
      </div>
    </div>
  );
}

// ─── Filter Bar ───────────────────────────────────────────────────────────────
type FilterType = "ALL" | "safe" | "value" | "bold" | string;

function FilterBar({ active, onChange, picks }: { active: FilterType; onChange: (l: FilterType) => void; picks: Pick[] }) {
  const hasTiers = picks.some((p) => p.tier);
  const leagues  = useMemo(() => Array.from(new Set(picks.map((p) => p.league))), [picks]);
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
  const [activeFilter, setActiveFilter]   = useState<FilterType>("ALL");
  const [historyOpen, setHistoryOpen]     = useState(false);
  const [selectedPick, setSelectedPick]   = useState<Pick | null>(null);
  const [picks, setPicks]                 = useState<Pick[]>([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState<string | null>(null);
  const [showSubscribe, setShowSubscribe] = useState(false);
  const [visibleCount, setVisibleCount]   = useState(PAGE_SIZE);   // ← pagination
  const { user, hasActiveSubscription, refreshUser } = useAuth();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true); setError(null);
        const res = await fetch("/api/picks");
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        if (cancelled) return;
        let resolved: Pick[] = [];
        if (Array.isArray(data))             resolved = data;
        else if (Array.isArray(data?.picks)) resolved = data.picks;
        else if (Array.isArray(data?.data))  resolved = data.data;
        setPicks(resolved.filter((p) => p.is_published !== false));
      } catch (err) {
        if (!cancelled) { setError(err instanceof Error ? err.message : "Erreur inconnue"); setPicks([]); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Reset pagination whenever filter changes
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [activeFilter]);

  const filtered = useMemo(() => {
    if (activeFilter === "ALL") return picks;
    if (["safe", "value", "bold"].includes(activeFilter)) return picks.filter((p) => p.tier === activeFilter);
    return picks.filter((p) => p.league === activeFilter);
  }, [picks, activeFilter]);

  // ── Pagination logic ────────────────────────────────────────────────────────
  const today = new Date().toISOString().split("T")[0];

  const todayPicks = useMemo(
    () => filtered.filter((p) => p.match_date.split("T")[0] === today),
    [filtered]
  );

  const olderPicks = useMemo(
    () =>
      filtered
        .filter((p) => p.match_date.split("T")[0] !== today)
        .sort((a, b) => b.match_date.localeCompare(a.match_date)),
    [filtered]
  );

  const historyPicks = useMemo(
    () => olderPicks.filter((p) => p.match_date.split("T")[0] < RECENT_CUTOFF),
    [olderPicks]
  );

  const paginatedOlder = useMemo(
    () => olderPicks.filter((p) => p.match_date.split("T")[0] >= RECENT_CUTOFF),
    [olderPicks]
  );

  const visibleOlder   = useMemo(() => paginatedOlder.slice(0, visibleCount), [paginatedOlder, visibleCount]);
  const groupedToday   = useMemo(() => groupByDate(todayPicks),   [todayPicks]);
  const groupedVisible = useMemo(() => groupByDate(visibleOlder),  [visibleOlder]);
  const groupedHistory = useMemo(() => groupByDate(historyPicks),  [historyPicks]);

  const hasMore   = visibleCount < paginatedOlder.length;
  const remaining = Math.min(PAGE_SIZE, paginatedOlder.length - visibleCount);
  // ───────────────────────────────────────────────────────────────────────────

  if (loading) return (
    <>
      <GlobalStyles />
      <div style={{ height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#0A0C0F", gap: 16 }}>
        <div style={{ width: 50, height: 50, border: "4px solid #2A3140", borderTopColor: "#C9A84C", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <div style={{ fontSize: 10, letterSpacing: "3px", color: "#7A8399", textTransform: "uppercase" }}>Chargement des picks…</div>
      </div>
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
      <main style={{ minHeight: "100vh", background: "#0A0C0F", paddingBottom: 80 }}>
        <Hero picks={picks} />
        <FilterBar active={activeFilter} onChange={setActiveFilter} picks={picks} />
        <OneXBetBanner />
        {/* ── Subscription banners ── */}
{user && !hasActiveSubscription() && (
          <div
            onClick={() => setShowSubscribe(true)}
            style={{
              margin: "0 0 20px",
              borderRadius: 14,
              overflow: "hidden",
              cursor: "pointer",
              position: "relative",
              background: "linear-gradient(135deg, #1A1508 0%, #110F05 50%, #1A1508 100%)",
              border: "1px solid rgba(201,168,76,0.35)",
              boxShadow: "0 0 32px rgba(201,168,76,0.08), inset 0 1px 0 rgba(201,168,76,0.15)",
            }}
          >
            {/* Glow top-right orb */}
            <div style={{
              position: "absolute", top: -40, right: -40,
              width: 160, height: 160, borderRadius: "50%",
              background: "radial-gradient(circle, rgba(201,168,76,0.12) 0%, transparent 70%)",
              pointerEvents: "none",
            }} />

            {/* Gold top bar */}
            <div style={{
              height: 3,
              background: "linear-gradient(90deg, transparent, #C9A84C, #E8C97A, #C9A84C, transparent)",
            }} />

            <div style={{ padding: "16px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Tag */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <span style={{
                    fontSize: 9, letterSpacing: "2px", textTransform: "uppercase",
                    fontWeight: 700, color: "#C9A84C",
                    background: "rgba(201,168,76,0.1)", border: "1px solid rgba(201,168,76,0.25)",
                    padding: "2px 8px", borderRadius: 3,
                  }}>
                    ⭐ Accès illimité
                  </span>
                </div>

                {/* Headline */}
                <div style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: "clamp(17px, 4.5vw, 22px)",
                  color: "#E8EAF0", letterSpacing: 1, lineHeight: 1.2, marginBottom: 6,
                }}>
                  Tous les picks,{" "}
                  <span style={{ color: "#C9A84C" }}>sans limite</span>
                </div>

                {/* Sub */}
                <div style={{ fontSize: 11, color: "#7A8399", lineHeight: 1.5 }}>
                  Abonnement mensuel · Accès immédiat · Annulable à tout moment
                </div>
              </div>

              {/* CTA */}
              <button
                onClick={(e) => { e.stopPropagation(); setShowSubscribe(true); }}
                style={{
                  background: "linear-gradient(135deg, #C9A84C, #E8C97A)",
                  color: "#0A0C0F", border: "none", borderRadius: 8,
                  padding: "11px 20px",
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: 15, letterSpacing: "1.5px",
                  cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
                  boxShadow: "0 4px 16px rgba(201,168,76,0.3)",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 6px 24px rgba(201,168,76,0.45)")}
                onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "0 4px 16px rgba(201,168,76,0.3)")}
              >
                S&apos;abonner →
              </button>
            </div>
          </div>
        )}
        {user && hasActiveSubscription() && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, padding: "10px 14px", background: "rgba(201,168,76,0.06)", border: "1px solid rgba(201,168,76,0.2)", borderRadius: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#C9A84C", flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: "#C9A84C", letterSpacing: "0.5px" }}>
              Abonné — accès illimité actif{user.subscription?.expiresAt ? ` jusqu'au ${new Date(user.subscription.expiresAt).toLocaleDateString("fr-FR")}` : ""}
            </span>
          </div>
        )}
        {user && !hasActiveSubscription() && user.subscription?.status === "EXPIRED" && (
          <div style={{ fontSize: 11, color: "#EF4444", marginBottom: 8 }}>
            Votre abonnement a expiré{user.subscription.expiresAt ? ` le ${new Date(user.subscription.expiresAt).toLocaleDateString("fr-FR")}` : ""}.
          </div>
        )}

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

          {/* ── OLDER RECENT — paginated ── */}
          {paginatedOlder.length > 0 && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: todayPicks.length > 0 ? 12 : 0, marginBottom: 20 }}>
                <span style={{ fontSize: 9, letterSpacing: "3px", color: "#7A8399", textTransform: "uppercase", fontWeight: 600, whiteSpace: "nowrap" }}>
                  Picks Récents
                </span>
                <div style={{ flex: 1, height: 1, background: "#2A3140" }} />
                <span style={{ fontSize: 10, color: "#7A8399", whiteSpace: "nowrap" }}>
                  {Math.min(visibleCount, paginatedOlder.length)} / {paginatedOlder.length}
                </span>
              </div>

              {Object.keys(groupedVisible).sort().reverse().map((date) => (
                <DateSection key={date} date={date} picks={groupedVisible[date]} onSelect={setSelectedPick} />
              ))}

              {hasMore && (
                <div style={{ textAlign: "center", marginTop: 4, marginBottom: 28 }}>
                  <button
                    onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                    style={{
                      background: "transparent", border: "1px solid #2A3140", borderRadius: 10,
                      color: "#C9A84C", fontSize: 12, fontWeight: 700, letterSpacing: "1.5px",
                      textTransform: "uppercase", padding: "13px 32px", cursor: "pointer",
                      fontFamily: "inherit", width: "100%", maxWidth: 320, transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(201,168,76,0.06)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#C9A84C"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#2A3140"; }}
                  >
                    Voir plus — {remaining} pick{remaining > 1 ? "s" : ""}
                  </button>
                </div>
              )}
            </>
          )}

          {/* ── HISTORY accordion ── */}
          {historyPicks.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <button onClick={() => setHistoryOpen((v) => !v)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: "#1A1F26", border: "1px solid #2A3140", borderRadius: 10, padding: 16, cursor: "pointer", fontSize: 11, letterSpacing: "2px", textTransform: "uppercase", color: "#7A8399", fontWeight: 600, fontFamily: "inherit", marginBottom: historyOpen ? 16 : 0, transition: "border-color 0.2s" }}>
                <span>Historique ({historyPicks.length})</span>
                <IconChevron open={historyOpen} />
              </button>
              {historyOpen && (
                <div style={{ animation: "fadeIn 0.2s ease" }}>
                  {Object.keys(groupedHistory).sort().reverse().map((date) => (
                    <DateSection key={date} date={date} picks={groupedHistory[date]} onSelect={setSelectedPick} />
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
        <CompoundBetBanner />

        {selectedPick && <Modal pick={selectedPick} onClose={() => setSelectedPick(null)} />}

        {showSubscribe && (
          <div onClick={(e) => e.target === e.currentTarget && setShowSubscribe(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50, backdropFilter: "blur(4px)" }}>
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