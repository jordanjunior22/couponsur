"use client";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Match {
    prediction: string;
    outcome: "PENDING" | "WIN" | "LOSS";
}

export interface Pick {
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

const RECENT_CUTOFF = "2026-04-10";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getAccuracy(pick: Pick): string {
    const finished = pick.matches.filter((m) => m.outcome !== "PENDING");
    if (!finished.length) return "--";
    const wins = finished.filter((m) => m.outcome === "WIN").length;
    return `${Math.round((wins / finished.length) * 100)}%`;
}

function formatDate(d: string): string {
    if (!d) return "Date inconnue";
    const dateOnly = d.split("T")[0];
    const date = new Date(dateOnly + "T12:00:00");
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

// ─── Shared Styles ────────────────────────────────────────────────────────────
const S = {
    input: {
        background: "#1A1F26",
        border: "1px solid #2A3140",
        borderRadius: 8,
        padding: "12px 14px",
        width: "100%",
        color: "#E8EAF0",
        fontSize: 14,
        marginBottom: 10,
        outline: "none",
        fontFamily: "inherit",
    } as React.CSSProperties,
    btnGold: {
        display: "block",
        width: "100%",
        background: "#C9A84C",
        color: "#0A0C0F",
        border: "none",
        borderRadius: 10,
        padding: "15px",
        fontFamily: "'Bebas Neue', sans-serif",
        fontSize: 18,
        letterSpacing: 2,
        cursor: "pointer",
        marginBottom: 10,
    } as React.CSSProperties,
    btnGhost: {
        display: "block",
        width: "100%",
        background: "transparent",
        color: "#7A8399",
        border: "1px solid #2A3140",
        borderRadius: 10,
        padding: "12px",
        fontFamily: "inherit",
        fontSize: 13,
        cursor: "pointer",
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
        WIN: { background: "rgba(34,197,94,0.12)", color: "#22C55E", border: "1px solid rgba(34,197,94,0.25)" },
        LOSS: { background: "rgba(239,68,68,0.12)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.25)" },
        PENDING: { background: "rgba(201,168,76,0.1)", color: "#C9A84C", border: "1px solid rgba(201,168,76,0.25)" },
    };
    const labels = { WIN: "WIN", LOSS: "LOSS", PENDING: "LIVE" };
    return (
        <span style={{
            ...styles[outcome],
            fontSize: 9, letterSpacing: "1.5px", textTransform: "uppercase",
            fontWeight: 700, padding: "4px 10px", borderRadius: 4, flexShrink: 0,
        }}>
            {labels[outcome]}
        </span>
    );
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

                // ── Facebook Pixel: Lead event on registration ──
                if (typeof window !== "undefined" && (window as any).fbq) {
                    (window as any).fbq("track", "Lead", {
                        content_name: "Inscription Premium Picks",
                        currency: "XAF",
                    });
                }
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
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: "#C9A84C", letterSpacing: 2, marginBottom: 6 }}>
                    Connexion requise
                </div>
                <div style={{ fontSize: 12, color: "#7A8399" }}>
                    Connectez-vous pour débloquer ce pick premium
                </div>
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
                {loading
                    ? "Chargement…"
                    : tab === "login"
                        ? "Se connecter"
                        : "Créer un compte"}  {/* ← pixel fires after this succeeds */}
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

export function MomoPayment({ pick, onSuccess, onBack }: { pick: Pick; onSuccess: () => void; onBack: () => void }) {
    const { user } = useAuth();

    const [step, setStep] = useState<PayStep>("form");
    const [phone, setPhone] = useState(user?.phone ?? "");
    const [operator, setOperator] = useState<"mtn" | "orange">("mtn");
    const [transId, setTransId] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string>("");
    const [pollCount, setPollCount] = useState(0);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    const MAX_POLLS = 40; // 40 × 3s = 2 minutes timeout

    const clearPolling = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
    }, []);

    // ── START PAYMENT ─────────────────────────────────────
    const handlePay = async () => {
        const cleaned = phone.replace(/\s/g, "");
        if (!cleaned || cleaned.length < 9) return;
        setErrorMsg("");

        try {
            setStep("processing");

            const res = await fetch("/api/pay", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pickId: pick._id, phone: cleaned }),
            });

            const data = await res.json();

            if (!res.ok) {
                setErrorMsg(data.error || "Le paiement a échoué. Réessayez.");
                setStep("form");
                return;
            }

            setTransId(data.transId);
            setStep("pending");

        } catch {
            setErrorMsg("Erreur réseau. Vérifiez votre connexion et réessayez.");
            setStep("form");
        }
    };

    // ── POLL PAYMENT STATUS ───────────────────────────────
    useEffect(() => {
        if (!transId || step !== "pending") return;

        setPollCount(0);

        intervalRef.current = setInterval(async () => {
            setPollCount((c) => {
                if (c >= MAX_POLLS) {
                    clearPolling();
                    setStep("expired");
                    return c;
                }
                return c + 1;
            });

            try {
                const res = await fetch(`/api/payment/status?transId=${transId}`);
                const data = await res.json();
                if (!data?.status) return;

                switch (data.status) {
                    case "SUCCESSFUL":
                        clearPolling();
                        setStep("success");
                        break;
                    case "FAILED":
                        clearPolling();
                        setErrorMsg("Paiement refusé par l'opérateur.");
                        setStep("failed");
                        break;
                    case "EXPIRED":
                        clearPolling();
                        setErrorMsg("La session de paiement a expiré.");
                        setStep("expired");
                        break;
                    default:
                        break;
                }
            } catch {
                // network hiccup — keep polling
            }
        }, 3000);

        return clearPolling;
    }, [transId, step, clearPolling]);

    // ── PICK SUMMARY ──────────────────────────────────────
    const PickSummary = () => (
        <div style={{
            background: "rgba(201,168,76,0.05)", border: "1px solid rgba(201,168,76,0.15)",
            borderRadius: 10, padding: "12px 14px", marginBottom: 20,
            display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
            <div>
                <div style={{ fontSize: 9, letterSpacing: "2px", textTransform: "uppercase", color: "#7A8399", marginBottom: 4 }}>{pick.league}</div>
                <div style={{ fontSize: 13, color: "#E8EAF0", fontWeight: 600, lineHeight: 1.3 }}>{pick.title}</div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: "#C9A84C", letterSpacing: 1 }}>x{pick.total_odds}</div>
                <div style={{ fontSize: 11, color: "#C9A84C", fontWeight: 600 }}>{pick.price.toLocaleString("fr-FR")} FCFA</div>
            </div>
        </div>
    );

    // ── STEP: PROCESSING ──────────────────────────────────
    if (step === "processing") {
        return (
            <div style={{ textAlign: "center", padding: "32px 16px" }}>
                <div style={{ width: 48, height: 48, border: "4px solid #2A3140", borderTopColor: "#C9A84C", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 20px" }} />
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color: "#C9A84C", letterSpacing: 2, marginBottom: 8 }}>
                    Initialisation du paiement…
                </div>
                <div style={{ fontSize: 12, color: "#7A8399", lineHeight: 1.6 }}>
                    Connexion à {operator === "mtn" ? "MTN MoMo" : "Orange Money"} en cours.<br />
                    Veuillez patienter.
                </div>
            </div>
        );
    }

    // ── STEP: PENDING ─────────────────────────────────────
    if (step === "pending") {
        const secondsLeft = Math.max(0, (MAX_POLLS - pollCount) * 3);
        const minutes = Math.floor(secondsLeft / 60);
        const seconds = secondsLeft % 60;

        return (
            <div style={{ textAlign: "center", padding: "24px 16px" }}>
                <div style={{ marginBottom: 20 }}><IconPhone /></div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: "#C9A84C", letterSpacing: 2, marginBottom: 12 }}>
                    Confirmez sur votre téléphone
                </div>
                <div style={{ fontSize: 13, color: "#E8EAF0", marginBottom: 8, lineHeight: 1.7 }}>
                    Une notification a été envoyée au<br />
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "#C9A84C", fontWeight: 700 }}>
                        +237 {phone}
                    </span>
                </div>
                <div style={{ fontSize: 12, color: "#7A8399", marginBottom: 24, lineHeight: 1.6 }}>
                    Ouvrez votre application {operator === "mtn" ? "MTN MoMo" : "Orange Money"} et confirmez le paiement de{" "}
                    <strong style={{ color: "#E8EAF0" }}>{pick.price.toLocaleString("fr-FR")} FCFA</strong>.
                </div>

                {/* Pulsing indicator */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 20 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#C9A84C", animation: "pulse 1.2s ease-in-out infinite" }} />
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#C9A84C", animation: "pulse 1.2s ease-in-out infinite 0.4s" }} />
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#C9A84C", animation: "pulse 1.2s ease-in-out infinite 0.8s" }} />
                </div>

                <div style={{ fontSize: 11, color: "#3A4455", marginBottom: 24 }}>
                    Expiration dans {minutes}:{seconds.toString().padStart(2, "0")}
                </div>

                <div style={{ background: "rgba(201,168,76,0.04)", border: "1px dashed rgba(201,168,76,0.2)", borderRadius: 8, padding: 12, marginBottom: 16, textAlign: "left" }}>
                    <div style={{ fontSize: 11, color: "#7A8399", lineHeight: 1.7 }}>
                        <div>① Ouvrez l&apos;app {operator === "mtn" ? "MTN MoMo" : "Orange Money"}</div>
                        <div>② Acceptez la demande de paiement</div>
                        <div>③ Entrez votre code PIN</div>
                    </div>
                </div>

                <button onClick={() => { clearPolling(); setStep("form"); setTransId(null); }} style={{ ...S.btnGhost, fontSize: 12 }}>
                    Annuler le paiement
                </button>
            </div>
        );
    }

    // ── STEP: SUCCESS ─────────────────────────────────────
    if (step === "success") {
        return (
            <div style={{ textAlign: "center", padding: "32px 16px", animation: "scaleIn 0.3s ease" }}>
                <div style={{ marginBottom: 20 }}><IconSuccess /></div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, color: "#22C55E", letterSpacing: 2, marginBottom: 12 }}>
                    Paiement réussi !
                </div>
                <div style={{ fontSize: 13, color: "#E8EAF0", marginBottom: 8, lineHeight: 1.7 }}>
                    Votre paiement de{" "}
                    <span style={{ color: "#22C55E", fontWeight: 700 }}>{pick.price.toLocaleString("fr-FR")} FCFA</span>{" "}
                    a été confirmé.
                </div>
                <div style={{ fontSize: 12, color: "#7A8399", marginBottom: 28, lineHeight: 1.6 }}>
                    Le pick <strong style={{ color: "#E8EAF0" }}>{pick.title}</strong> est maintenant débloqué.
                </div>
                <button onClick={onSuccess} style={S.btnGold}>
                    Voir le Pick →
                </button>
            </div>
        );
    }

    // ── STEP: FAILED / EXPIRED ────────────────────────────
    if (step === "failed" || step === "expired") {
        const isExpired = step === "expired";
        return (
            <div style={{ textAlign: "center", padding: "32px 16px", animation: "scaleIn 0.3s ease" }}>
                <div style={{ marginBottom: 20 }}><IconFail /></div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, color: "#EF4444", letterSpacing: 2, marginBottom: 12 }}>
                    {isExpired ? "Session expirée" : "Paiement échoué"}
                </div>
                <div style={{ fontSize: 13, color: "#E8EAF0", marginBottom: 8, lineHeight: 1.7 }}>
                    {errorMsg || (isExpired
                        ? "La session a expiré avant la confirmation."
                        : "Le paiement n'a pas pu être traité.")}
                </div>
                <div style={{ fontSize: 12, color: "#7A8399", marginBottom: 28, lineHeight: 1.6 }}>
                    {isExpired
                        ? "Relancez une nouvelle tentative si vous souhaitez débloquer ce pick."
                        : "Vérifiez votre solde ou essayez avec un autre numéro."}
                </div>

                <div style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 8, padding: "10px 14px", marginBottom: 20, textAlign: "left" }}>
                    <div style={{ fontSize: 11, color: "#7A8399", lineHeight: 1.7 }}>
                        <div style={{ color: "#EF4444", fontWeight: 600, marginBottom: 4, fontSize: 10, letterSpacing: "1px", textTransform: "uppercase" }}>Causes possibles</div>
                        <div>• Solde insuffisant</div>
                        <div>• Mauvais code PIN entré</div>
                        <div>• Demande refusée ou ignorée</div>
                        <div>• Réseau mobile instable</div>
                    </div>
                </div>

                <button onClick={() => { setStep("form"); setTransId(null); setErrorMsg(""); }} style={S.btnGold}>
                    Réessayer
                </button>
                <button onClick={onBack} style={S.btnGhost}>Annuler</button>
            </div>
        );
    }

    // ── STEP: FORM (default) ──────────────────────────────
    return (
        <div>
            <PickSummary />

            {/* Error from previous attempt */}
            {errorMsg && (
                <div style={{ fontSize: 12, color: "#EF4444", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, padding: "10px 12px", marginBottom: 14 }}>
                    {errorMsg}
                </div>
            )}

            <div style={{ fontSize: 9, letterSpacing: "2px", textTransform: "uppercase", color: "#7A8399", fontWeight: 600, marginBottom: 8 }}>
                Opérateur Mobile Money
            </div>
            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                {(["mtn", "orange"] as const).map((op) => (
                    <button key={op} onClick={() => setOperator(op)} style={{
                        flex: 1, display: "flex", alignItems: "center", gap: 10,
                        padding: "12px 14px", borderRadius: 10, cursor: "pointer",
                        background: operator === op ? "rgba(201,168,76,0.07)" : "#1A1F26",
                        border: operator === op ? "1px solid #C9A84C" : "1px solid #2A3140",
                        transition: "all 0.2s",
                    }}>
                        <MomoLogo op={op} />
                        <div style={{ textAlign: "left" }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: "#E8EAF0" }}>{op === "mtn" ? "MTN MoMo" : "Orange Money"}</div>
                            <div style={{ fontSize: 10, color: "#7A8399" }}>{op === "mtn" ? "6 / 7 / 8XX" : "6 / 9XX"}</div>
                        </div>
                        {operator === op && <div style={{ marginLeft: "auto", flexShrink: 0 }}><IconCheck size={14} /></div>}
                    </button>
                ))}
            </div>

            <div style={{ fontSize: 9, letterSpacing: "2px", textTransform: "uppercase", color: "#7A8399", fontWeight: 600, marginBottom: 8 }}>
                Numéro de téléphone
            </div>
            <div style={{ position: "relative", marginBottom: 16 }}>
                <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "#7A8399", fontWeight: 600, pointerEvents: "none" }}>
                    +237
                </span>
                <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/[^0-9\s]/g, ""))}
                    placeholder="6XX XXX XXX"
                    maxLength={12}
                    style={{ ...S.input, paddingLeft: 54, marginBottom: 0 }}
                />
            </div>

            <div style={{ background: "rgba(201,168,76,0.04)", border: "1px dashed rgba(201,168,76,0.2)", borderRadius: 8, padding: 12, marginBottom: 20, display: "flex", gap: 10, alignItems: "flex-start" }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
                    <circle cx="8" cy="8" r="7" stroke="#C9A84C" strokeWidth="1.2" />
                    <path d="M8 7v4M8 5v1" stroke="#C9A84C" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
                <div style={{ fontSize: 11, color: "#7A8399", lineHeight: 1.6 }}>
                    Vous recevrez une notification push sur votre téléphone pour confirmer le paiement. Assurez-vous que votre solde est suffisant.
                </div>
            </div>

            <button
                onClick={handlePay}
                disabled={!phone || phone.replace(/\s/g, "").length < 9}
                style={{
                    ...S.btnGold,
                    opacity: !phone || phone.replace(/\s/g, "").length < 9 ? 0.45 : 1,
                    cursor: !phone || phone.replace(/\s/g, "").length < 9 ? "not-allowed" : "pointer",
                }}
            >
                Payer {pick.price.toLocaleString("fr-FR")} FCFA
            </button>
            <button onClick={onBack} style={S.btnGhost}>Annuler</button>
        </div>
    );
}

// ─── Pick Card ────────────────────────────────────────────────────────────────
const borderColors = { WIN: "#22C55E", LOSS: "#EF4444", PENDING: "#C9A84C" };

function PickCard({ pick, onSelect }: { pick: Pick; onSelect: (p: Pick) => void }) {
    const { user } = useAuth();
    const acc = getAccuracy(pick);
    const isPending = pick.outcome === "PENDING";
    const isUnlocked = user?.unlockedPickIds?.includes(pick._id);

    return (
        <div onClick={() => onSelect(pick)} style={{
            background: "#1A1F26", border: "1px solid #2A3140",
            borderLeft: `3px solid ${borderColors[pick.outcome]}`,
            borderRadius: 12, marginBottom: 10, overflow: "hidden", cursor: "pointer", transition: "border-color 0.2s",
        }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.borderColor = "#3A4455")}
            onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLDivElement;
                el.style.border = "1px solid #2A3140";
                el.style.borderLeft = `3px solid ${borderColors[pick.outcome]}`;
            }}>
            <div style={{ padding: 16 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 9, letterSpacing: "1.5px", textTransform: "uppercase", fontWeight: 600, background: "#222830", border: "1px solid #2A3140", color: "#7A8399", padding: "3px 8px", borderRadius: 4, whiteSpace: "nowrap" }}>
                            {pick.league}
                        </span>
                        {acc !== "--" && (
                            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 600, color: "#C9A84C", background: "rgba(201,168,76,0.1)", border: "1px solid rgba(201,168,76,0.2)", padding: "3px 8px", borderRadius: 4, whiteSpace: "nowrap" }}>
                                {acc} acc.
                            </span>
                        )}
                    </div>
                    <OutcomeBadge outcome={pick.outcome} />
                </div>
                <div style={{ fontSize: "clamp(13px, 3.5vw, 15px)", fontWeight: 600, color: "#E8EAF0", lineHeight: 1.4, marginBottom: 12, wordBreak: "break-word" }}>
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
                    <button onClick={(e) => { e.stopPropagation(); onSelect(pick); }} style={{
                        fontSize: 10, letterSpacing: "1.5px", textTransform: "uppercase", fontWeight: 700,
                        padding: "8px 12px", borderRadius: 6, border: "none", cursor: "pointer",
                        fontFamily: "inherit", transition: "all 0.15s", whiteSpace: "nowrap", flexShrink: 0,
                        ...(isPending
                            ? { background: "#C9A84C", color: "#0A0C0F" }
                            : { background: "#222830", color: "#E8EAF0", border: "1px solid #2A3140" }),
                    }}>
                        {isPending && !isUnlocked
                            ? `Débloquer — ${pick.price.toLocaleString("fr-FR")} FCFA`
                            : "Voir détails"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Date Section ─────────────────────────────────────────────────────────────
function DateSection({ date, picks, onSelect }: { date: string; picks: Pick[]; onSelect: (p: Pick) => void }) {
    return (
        <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 10, letterSpacing: "2px", textTransform: "uppercase", color: "#7A8399", fontWeight: 500, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 4, height: 4, background: "#C9A84C", borderRadius: "50%", flexShrink: 0, display: "inline-block" }} />
                {formatDate(date)}
            </div>
            {picks.map((p) => <PickCard key={p._id} pick={p} onSelect={onSelect} />)}
        </div>
    );
}

// ─── Locked Predictions Placeholder ──────────────────────────────────────────
function LockedPredictions({ pick, onUnlock }: { pick: Pick; onUnlock: () => void }) {
    return (
        <div style={{ position: "relative" }}>
            {/* Blurred ghost rows */}
            {pick.matches.map((_, i) => (
                <div key={i} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "14px 0", borderBottom: "1px solid #2A3140", gap: 12,
                    filter: "blur(5px)", userSelect: "none", pointerEvents: "none",
                    opacity: 0.45,
                }}>
                    <div style={{
                        fontSize: 13, color: "#E8EAF0", lineHeight: 1.4,
                        background: "#2A3140", borderRadius: 6, height: 18,
                        width: `${60 + (i % 3) * 15}%`,
                    }} />
                    <div style={{
                        width: 22, height: 22, borderRadius: "50%",
                        background: "rgba(201,168,76,0.1)", flexShrink: 0,
                    }} />
                </div>
            ))}

            {/* Lock overlay */}
            <div style={{
                position: "absolute", inset: 0,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                background: "linear-gradient(to bottom, rgba(17,20,24,0) 0%, rgba(17,20,24,0.85) 35%, rgba(17,20,24,0.97) 100%)",
                gap: 12, padding: "20px 16px",
            }}>
                <div style={{
                    width: 44, height: 44, borderRadius: "50%",
                    background: "rgba(201,168,76,0.1)", border: "1px solid rgba(201,168,76,0.3)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                    <IconLock />
                </div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: "#C9A84C", letterSpacing: 2, textAlign: "center" }}>
                    Pronostics verrouillés
                </div>
                <div style={{ fontSize: 12, color: "#7A8399", textAlign: "center", lineHeight: 1.5, maxWidth: 240 }}>
                    Débloquez ce pick pour accéder aux {pick.matches.length} sélection{pick.matches.length > 1 ? "s" : ""} de nos experts.
                </div>
                <button onClick={onUnlock} style={{
                    ...S.btnGold,
                    width: "auto", padding: "12px 28px", fontSize: 14,
                    marginBottom: 0, letterSpacing: 1.5,
                }}>
                    Débloquer — {pick.price.toLocaleString("fr-FR")} FCFA
                </button>
            </div>
        </div>
    );
}

// ─── Modal ────────────────────────────────────────────────────────────────────
type ModalView = "detail" | "auth" | "payment";

function Modal({ pick, onClose }: { pick: Pick; onClose: () => void }) {
    const overlayRef = useRef<HTMLDivElement>(null);
    const { user, refreshUser } = useAuth();
    const isPending = pick.outcome === "PENDING";
    const isAlreadyUnlocked = user?.unlockedPickIds?.includes(pick._id) ?? false;

    // ── Determine the correct initial view ───────────────
    const getInitialView = (): ModalView => {
        if (!isPending) return "detail";         // finished pick: always readable
        if (isAlreadyUnlocked) return "detail";  // paid: show
        if (!user) return "auth";                // not logged in: auth wall
        return "payment";                        // logged in, not paid: payment wall
    };

    const [view, setView] = useState<ModalView>(getInitialView);

    // If user logs in while auth gate is open, advance to payment
    useEffect(() => {
        if (view === "auth" && user) setView("payment");
    }, [user, view]);

    // ── SAFETY NET: never show detail for a locked pending pick ──
    // This catches any edge-case where the view drifts to "detail"
    // without the pick actually being unlocked (e.g. failed payment).
    useEffect(() => {
        if (view === "detail" && isPending && !isAlreadyUnlocked) {
            setView(user ? "payment" : "auth");
        }
    }, [view, isPending, isAlreadyUnlocked, user]);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [onClose]);

    useEffect(() => {
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = ""; };
    }, []);

    const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === overlayRef.current) onClose();
    };

    const handlePaymentSuccess = async () => {
        await refreshUser();   // 🔥 THIS is the key fix
        setView("detail");
    };
    // Whether the current user can actually read the predictions
    const canViewPredictions = !isPending || isAlreadyUnlocked;

    return (
        <div ref={overlayRef} onClick={handleOverlayClick} style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
            display: "flex", alignItems: "flex-end", justifyContent: "center",
            zIndex: 50, backdropFilter: "blur(4px)",
        }}>
            <div style={{
                background: "#111418", border: "1px solid #2A3140",
                borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 600,
                padding: "24px 20px 40px", position: "relative",
                maxHeight: "90vh", overflowY: "auto",
                animation: "slideUp 0.3s cubic-bezier(0.32,0.72,0,1)",
            }}>
                <div style={{ width: 40, height: 4, background: "#3A4455", borderRadius: 2, margin: "0 auto 20px" }} />
                <button onClick={onClose} style={{
                    position: "absolute", top: 16, right: 16, width: 30, height: 30,
                    background: "#222830", border: "1px solid #2A3140", borderRadius: "50%",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer", color: "#7A8399", fontSize: 14,
                }}>✕</button>

                {/* ── Detail view ── */}
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

                        {/* ── Predictions: gated by unlock status ── */}
                        {canViewPredictions ? (
                            <div>
                                {pick.matches.map((m, i) => (
                                    <div key={i} style={{
                                        display: "flex", alignItems: "center", justifyContent: "space-between",
                                        padding: "14px 0", borderBottom: "1px solid #2A3140", gap: 12,
                                    }}>
                                        <div style={{ fontSize: 13, color: "#E8EAF0", lineHeight: 1.4 }}>{m.prediction}</div>
                                        <div style={{
                                            width: 22, height: 22, borderRadius: "50%", display: "flex",
                                            alignItems: "center", justifyContent: "center", flexShrink: 0,
                                            background: m.outcome === "WIN" ? "rgba(34,197,94,0.12)" : m.outcome === "LOSS" ? "rgba(239,68,68,0.12)" : "rgba(201,168,76,0.1)",
                                        }}>
                                            {m.outcome === "WIN" && <IconCheck />}
                                            {m.outcome === "LOSS" && <IconX />}
                                            {m.outcome === "PENDING" && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#C9A84C" }} />}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            // This branch is a failsafe — the safety-net useEffect above
                            // should redirect away from "detail" before this ever renders
                            // for a locked pending pick. It's here for defence-in-depth.
                            <LockedPredictions
                                pick={pick}
                                onUnlock={() => setView(user ? "payment" : "auth")}
                            />
                        )}
                    </>
                )}

                {/* ── Auth gate ── */}
                {view === "auth" && <AuthGate onSuccess={() => setView("payment")} />}

                {/* ── Payment flow ── */}
                {view === "payment" && (
                    <MomoPayment
                        pick={pick}
                        onSuccess={handlePaymentSuccess}
onBack={onClose}
                    />
                )}
            </div>
        </div>
    );
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────
function StatsBar({ picks }: { picks: Pick[] }) {
    const stats = useMemo(() => {
        const finished = picks.filter((p) => p.outcome !== "PENDING");
        const wins = finished.filter((p) => p.outcome === "WIN").length;
        const losses = finished.length - wins;
        const rate = finished.length > 0 ? Math.round((wins / finished.length) * 100) : 0;
        return { rate, wins, losses };
    }, [picks]);

    return (
        <section style={{ background: "#0A0C0F", borderBottom: "1px solid #2A3140", padding: "28px 20px 24px", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: -60, right: -40, width: 260, height: 260, borderRadius: "50%", background: "radial-gradient(circle,rgba(201,168,76,0.07) 0%,transparent 70%)", pointerEvents: "none" }} />
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 11, letterSpacing: "4px", color: "#C9A84C", textTransform: "uppercase", marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ display: "block", width: 20, height: 1, background: "#C9A84C" }} />
                Nos Analyse
                <span style={{ display: "block", width: 20, height: 1, background: "#C9A84C" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, maxWidth: 500 }}>
                {[
                    { label: "Win Rate", value: `${stats.rate}%`, color: "#C9A84C", accent: true },
                    { label: "Victoires", value: stats.wins, color: "#22C55E", accent: false },
                    { label: "Défaites", value: stats.losses, color: "#EF4444", accent: false },
                ].map((s) => (
                    <div key={s.label} style={{ background: s.accent ? "rgba(201,168,76,0.05)" : "#1A1F26", border: `1px solid ${s.accent ? "#8A6A2A" : "#2A3140"}`, borderRadius: 10, padding: "14px 12px", textAlign: "center" }}>
                        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, lineHeight: 1, letterSpacing: 1, color: s.color }}>{s.value}</div>
                        <div style={{ fontSize: 9, letterSpacing: "2px", color: "#7A8399", textTransform: "uppercase", marginTop: 4, fontWeight: 500 }}>{s.label}</div>
                    </div>
                ))}
            </div>
        </section>
    );
}

// ─── Filter Bar ───────────────────────────────────────────────────────────────
function FilterBar({ active, onChange, picks }: { active: string; onChange: (l: string) => void; picks: Pick[] }) {
    const leagues = useMemo(() => ["ALL", ...Array.from(new Set(picks.map((p) => p.league)))], [picks]);
    return (
        <div style={{ background: "#111418", borderBottom: "1px solid #2A3140", padding: "0 16px", display: "flex", gap: 0, overflowX: "auto", scrollbarWidth: "none", position: "sticky", top: 0, zIndex: 20 }}>
            {leagues.map((l) => (
                <button key={l} onClick={() => onChange(l)} style={{
                    padding: "14px 16px", fontSize: 10, letterSpacing: "2px", textTransform: "uppercase",
                    fontWeight: 600, color: active === l ? "#C9A84C" : "#7A8399",
                    border: "none", background: "transparent", cursor: "pointer",
                    borderBottom: active === l ? "2px solid #C9A84C" : "2px solid transparent",
                    whiteSpace: "nowrap", fontFamily: "inherit", transition: "all 0.2s", flexShrink: 0,
                }}>
                    {l}
                </button>
            ))}
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PremiumPicksPage() {
    const [activeFilter, setActiveFilter] = useState("ALL");
    const [historyOpen, setHistoryOpen] = useState(false);
    const [selectedPick, setSelectedPick] = useState<Pick | null>(null);
    const [picks, setPicks] = useState<Pick[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { user } = useAuth();

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                setLoading(true);
                setError(null);
                const res = await fetch("/api/picks");
                if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
                const data = await res.json();
                if (cancelled) return;
                let resolved: Pick[] = [];
                if (Array.isArray(data)) resolved = data;
                else if (Array.isArray(data?.picks)) resolved = data.picks;
                else if (Array.isArray(data?.data)) resolved = data.data;
                else console.warn("Unexpected API shape:", data);
                setPicks(resolved.filter((p) => p.is_published !== false));
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : "Erreur inconnue");
                    setPicks([]);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const filtered = useMemo(() => activeFilter === "ALL" ? picks : picks.filter((p) => p.league === activeFilter), [picks, activeFilter]);
    const recentPicks = useMemo(() => filtered.filter((p) => p.match_date.split("T")[0] >= RECENT_CUTOFF), [filtered]);
    const historyPicks = useMemo(() => filtered.filter((p) => p.match_date.split("T")[0] < RECENT_CUTOFF), [filtered]);
    const groupedRecent = useMemo(() => groupByDate(recentPicks), [recentPicks]);
    const groupedHistory = useMemo(() => groupByDate(historyPicks), [historyPicks]);

    if (loading) {
        return (
            <>
                <GlobalStyles />
                <div style={{ height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#0A0C0F", gap: 16 }}>
                    <div style={{ width: 50, height: 50, border: "4px solid #2A3140", borderTopColor: "#C9A84C", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                    <div style={{ fontSize: 10, letterSpacing: "3px", color: "#7A8399", textTransform: "uppercase" }}>Chargement des picks…</div>
                </div>
            </>
        );
    }

    if (error) {
        return (
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
    }

    return (
        <>
            <GlobalStyles />
            <main style={{ minHeight: "100vh", background: "#0A0C0F", paddingBottom: 80 }}>
                <StatsBar picks={picks} />
                <FilterBar active={activeFilter} onChange={setActiveFilter} picks={picks} />
                <section style={{ padding: "24px 16px", maxWidth: 700, margin: "0 auto" }}>
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
                    {recentPicks.length > 0 && (
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                            <span style={{ fontSize: 9, letterSpacing: "3px", color: "#7A8399", textTransform: "uppercase", fontWeight: 600, whiteSpace: "nowrap" }}>Picks Récents</span>
                            <div style={{ flex: 1, height: 1, background: "#2A3140" }} />
                        </div>
                    )}
                    {Object.keys(groupedRecent).sort().reverse().map((date) => (
                        <DateSection key={date} date={date} picks={groupedRecent[date]} onSelect={setSelectedPick} />
                    ))}
                    {historyPicks.length > 0 && (
                        <div style={{ marginTop: 8 }}>
                            <button onClick={() => setHistoryOpen((v) => !v)} style={{
                                display: "flex", alignItems: "center", justifyContent: "space-between",
                                width: "100%", background: "#1A1F26", border: "1px solid #2A3140",
                                borderRadius: 10, padding: 16, cursor: "pointer",
                                fontSize: 11, letterSpacing: "2px", textTransform: "uppercase",
                                color: "#7A8399", fontWeight: 600, fontFamily: "inherit",
                                marginBottom: historyOpen ? 16 : 0, transition: "border-color 0.2s",
                            }}>
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
                {selectedPick && <Modal pick={selectedPick} onClose={() => setSelectedPick(null)} />}
            </main>
        </>
    );
}