"use client";
import { useState } from "react";
import {
  PiWarningFill, PiLockSimpleFill, PiRobotFill,
  PiArrowsClockwiseBold, PiSlidersHorizontalBold,
} from "react-icons/pi";
import { useAuth } from "@/context/AuthContext";
import { Spinner } from "./LoadingSpinner";

// ─── Types ────────────────────────────────────────────────────────────────────
interface GeneratedMatch {
  home: string;
  away: string;
  league: string;
  market: string;
  tip: string;
  odd: number;
  confidence: number;
  isEstimatedOdd: boolean;
}

interface GenerateResponse {
  success: boolean;
  matches?: GeneratedMatch[];
  totalOdds?: number | null;
  requestedOdds?: number | null;
  targetMissed?: boolean;
  message?: string;
  disclaimer?: string;
  requiresLogin?: boolean;
  requiresPremium?: boolean;
  // Markets the caller asked for but weren't included because they're
  // admin-restricted to premium and the caller isn't premium (see
  // app/api/generate-matches/route.ts's inner gate).
  restrictedMarkets?: string[];
}

type GenState = "idle" | "loading" | "result" | "error";

// ─── Market selection ───────────────────────────────────────────────────────
// Kept in sync with lib/predictionengine.ts's Market type and
// app/api/generate-matches/route.ts's ALL_MARKETS/DEFAULT_MARKETS.
const MARKET_LABELS: Record<string, string> = {
  "1X2": "Résultat (1X2)",
  DC: "Double Chance",
  BTTS: "BTTS",
  OU15: "+1.5 buts",
  OU25: "+2.5 buts",
  OU35: "+3.5 buts",
};
const ALL_MARKET_CODES = Object.keys(MARKET_LABELS);
const DEFAULT_MARKET_CODES = ["1X2", "DC"];

// ─── AI warning — always visible, never conditional on having a result ──────
// Same tinted-card language the rest of the app uses for warnings/errors
// (see the auth forms' feedback banners) rather than a solid, heavy fill —
// still unmistakably a warning, just not shouting louder than everything
// else on the page.
function AiWarning() {
  return (
    <div role="alert" style={warningCardStyle}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <PiWarningFill size={16} color="#f87171" style={{ flexShrink: 0, marginTop: 1 }} />
        <span style={{ fontSize: 12, color: "#fca5a5", lineHeight: 1.5 }}>
          <strong style={{ color: "#fff" }}>Analyse générée par une IA — non vérifiée par notre équipe.</strong>{" "}
          Ces matchs n&apos;ont pas été analysés manuellement et peuvent contenir des erreurs. Utilise ce générateur à tes propres risques.
        </span>
      </div>
      <div style={{ fontSize: 11, color: "#fca5a5", marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(239,68,68,0.25)" }}>
        Les cotes des marchés de buts (BTTS, Over/Under) sont estimées par notre propre modèle statistique à partir des scores récents, pas des cotes réelles d&apos;un bookmaker.
      </div>
    </div>
  );
}

// ─── Tool content ─────────────────────────────────────────────────────────────
// This component only needs to know WHO currently has access (to word the
// pre-attempt hint accurately) and does the actual generating. Ephemeral by
// design: nothing generated here is ever saved.
export function MatchGeneratorTool({
  access,
  marketAccess,
}: {
  access: "EVERYONE" | "PREMIUM";
  // Per-market override on top of `access` — a market missing here falls
  // back to "PREMIUM", mirroring the server's own default (see
  // app/api/generate-matches/route.ts's marketAccessFor).
  marketAccess: Record<string, "EVERYONE" | "PREMIUM">;
}) {
  const { user, hasActiveSubscription } = useAuth();
  const isPremium = hasActiveSubscription();
  const [state, setState] = useState<GenState>("idle");
  const [matches, setMatches] = useState<GeneratedMatch[]>([]);
  const [totalOdds, setTotalOdds] = useState<number | null>(null);
  const [requestedOdds, setRequestedOdds] = useState<number | null>(null);
  const [targetMissed, setTargetMissed] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [requiresPremium, setRequiresPremium] = useState(false);
  const [restrictedMarkets, setRestrictedMarkets] = useState<string[]>([]);

  const isMarketLocked = (code: string) => (marketAccess[code] ?? "PREMIUM") === "PREMIUM" && !isPremium;

  // Optional — left blank, the generator just picks from the strongest
  // qualified matches on its own.
  const [oddsInput, setOddsInput] = useState("");
  const [selectedMarkets, setSelectedMarkets] = useState<string[]>(DEFAULT_MARKET_CODES);

  const toggleMarket = (code: string) => {
    if (isMarketLocked(code)) return; // premium-only, can't be selected without an active subscription
    setSelectedMarkets((prev) => {
      if (prev.includes(code)) {
        // Always keep at least one market selected — an empty selection
        // has nothing to generate from.
        return prev.length === 1 ? prev : prev.filter((m) => m !== code);
      }
      return [...prev, code];
    });
  };

  const generate = async () => {
    setState("loading");
    setErrorMsg(null);
    setResultMessage(null);
    setRequiresPremium(false);
    setRestrictedMarkets([]);
    try {
      const trimmed = oddsInput.trim();
      const params = new URLSearchParams();
      params.set("markets", selectedMarkets.join(","));
      if (trimmed) params.set("targetOdds", trimmed);
      const url = `/api/generate-matches?${params.toString()}`;
      const res = await fetch(url, { credentials: "include" });
      const data: GenerateResponse = await res.json();

      if (!data.success) {
        setErrorMsg(data.message || "Impossible de générer des matchs pour le moment.");
        setRequiresPremium(!!data.requiresPremium);
        setRestrictedMarkets(data.restrictedMarkets || []);
        setState("error");
        return;
      }

      setMatches(data.matches || []);
      setTotalOdds(data.totalOdds ?? null);
      setRequestedOdds(data.requestedOdds ?? null);
      setTargetMissed(!!data.targetMissed);
      setRestrictedMarkets(data.restrictedMarkets || []);
      setResultMessage(data.matches?.length === 0 ? data.message || null : null);
      setState("result");
    } catch {
      setErrorMsg("Erreur réseau — réessayez.");
      setState("error");
    }
  };

  return (
    <div>
      <AiWarning />

      <div style={{ fontSize: 11, color: "#7A8399", lineHeight: 1.5, marginBottom: 16 }}>
        Notre moteur d&apos;analyse génère des matchs à titre indicatif, gratuitement — rien n&apos;est enregistré ni vendu, c&apos;est juste pour t&apos;amuser.
      </div>

      {state !== "result" && (
        <div style={configCardStyle}>
          <div style={configHeaderStyle}>
            <PiSlidersHorizontalBold size={13} color="#C9A84C" />
            <span>Configuration</span>
          </div>

          <label style={labelStyle}>Marchés</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
            {ALL_MARKET_CODES.map((code) => {
              const active = selectedMarkets.includes(code);
              const locked = isMarketLocked(code);
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => toggleMarket(code)}
                  disabled={state === "loading" || locked}
                  title={locked ? "Réservé aux abonnés premium" : undefined}
                  style={{
                    background: active ? "linear-gradient(135deg, #E8C97A, #C9A84C)" : "#181C24",
                    color: locked ? "#4A5568" : active ? "#0A0C0F" : "#9CA3AF",
                    border: `1px solid ${active ? "#C9A84C" : "#2A3140"}`,
                    borderRadius: 999, padding: "6px 12px", fontSize: 11, fontWeight: 700,
                    cursor: state === "loading" || locked ? "not-allowed" : "pointer", fontFamily: "inherit",
                    display: "flex", alignItems: "center", gap: 5, transition: "all 0.15s",
                  }}
                >
                  {locked && <PiLockSimpleFill size={11} />} {MARKET_LABELS[code]}
                </button>
              );
            })}
          </div>

          {ALL_MARKET_CODES.some(isMarketLocked) && (
            <div style={{ fontSize: 11, color: "#7A8399", lineHeight: 1.5, marginBottom: 16, display: "flex", alignItems: "flex-start", gap: 6 }}>
              <PiLockSimpleFill size={13} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>Les marchés verrouillés sont réservés aux abonnés premium — abonne-toi pour les débloquer.</span>
            </div>
          )}

          <label style={labelStyle}>Cote totale souhaitée (optionnel)</label>
          <input
            type="number"
            inputMode="decimal"
            min={1.1}
            max={100}
            step={0.1}
            placeholder="ex : 3.00"
            value={oddsInput}
            onChange={(e) => setOddsInput(e.target.value)}
            disabled={state === "loading"}
            style={{
              width: "100%", background: "#181C24", border: "1px solid #2A3140", borderRadius: 8,
              color: "#E8EAF0", fontSize: 14, padding: "10px 12px", marginBottom: 18,
              fontFamily: "inherit", outline: "none", boxSizing: "border-box",
            }}
          />

          <button onClick={generate} disabled={state === "loading"} style={generateBtnStyle(state === "loading")}>
            {state === "loading" ? (
              <>
                <Spinner size={14} variant="dark" glow={false} /> Analyse en cours…
              </>
            ) : (
              <>
                <PiRobotFill size={16} /> Générer des matchs
              </>
            )}
          </button>
        </div>
      )}

      {state === "error" && (
        <div style={errorCardStyle}>
          {errorMsg}
          {requiresPremium && (
            <span style={{ display: "block", marginTop: 4, color: "#7A8399" }}>
              Réservé aux abonnés premium.
              {restrictedMarkets.length > 0 && (
                <> ({restrictedMarkets.map((m) => MARKET_LABELS[m] || m).join(", ")})</>
              )}
            </span>
          )}
        </div>
      )}

      {state === "result" && (
        <div>
          {restrictedMarkets.length > 0 && (
            <div style={{ fontSize: 11, color: "#E8C97A", marginBottom: 12, lineHeight: 1.5, display: "flex", alignItems: "flex-start", gap: 6 }}>
              <PiLockSimpleFill size={13} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>Réservé aux abonnés premium, non inclus : {restrictedMarkets.map((m) => MARKET_LABELS[m] || m).join(", ")}.</span>
            </div>
          )}
          {resultMessage && (
            <div style={{ fontSize: 12, color: "#7A8399", marginBottom: 14 }}>
              {resultMessage}
            </div>
          )}

          {totalOdds !== null && (
            <div style={oddsCardStyle}>
              <div style={{ fontSize: 9, letterSpacing: "2px", textTransform: "uppercase", color: "#7A8399", marginBottom: 4 }}>
                Cote totale estimée
              </div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 36, color: "#C9A84C", letterSpacing: 1, lineHeight: 1 }}>
                x{totalOdds}
              </div>
              {requestedOdds !== null && targetMissed && (
                <div style={{ fontSize: 11, color: "#E8C97A", marginTop: 8 }}>
                  Cote la plus proche trouvée aujourd&apos;hui — ta cible était x{requestedOdds}.
                </div>
              )}
            </div>
          )}

          {matches.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              {matches.map((m, i) => (
                <div key={i} style={matchCardStyle}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 9, letterSpacing: "1px", textTransform: "uppercase", color: "#7A8399", marginBottom: 3 }}>
                      {m.league}
                    </div>
                    <div style={{ fontSize: 13, color: "#E8EAF0", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {m.home} vs {m.away}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 9, letterSpacing: "0.5px", textTransform: "uppercase", color: "#7A8399", marginBottom: 2 }}>
                      {MARKET_LABELS[m.market] || m.market}
                    </div>
                    <div style={{ fontSize: 13, color: "#C9A84C", fontWeight: 700 }}>{m.tip}</div>
                    <div style={{ fontSize: 11, color: "#7A8399" }}>
                      @{m.odd}{m.isEstimatedOdd ? "*" : ""} · {m.confidence}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button onClick={generate} style={regenerateBtnStyle}>
            <PiArrowsClockwiseBold size={14} /> Générer à nouveau
          </button>
        </div>
      )}

      {state === "idle" && !user && (
        <div style={{ fontSize: 11, color: "#7A8399", marginTop: 10 }}>
          Connexion requise pour générer des matchs.
        </div>
      )}
      {state === "idle" && user && access === "PREMIUM" && !hasActiveSubscription() && (
        <div style={{ fontSize: 11, color: "#7A8399", marginTop: 10 }}>
          Réservé aux abonnés premium.
        </div>
      )}
    </div>
  );
}

/* ─── STYLES ──────────────────────────────────────────────────────────────── */

const warningCardStyle: React.CSSProperties = {
  background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
  borderRadius: 10, padding: "12px 14px", marginBottom: 16, lineHeight: 1.5,
};

const configCardStyle: React.CSSProperties = {
  background: "#111418", border: "1px solid #2A3140", borderRadius: 14, padding: 18, marginBottom: 4,
};

const configHeaderStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 7, fontSize: 10, letterSpacing: "1.5px",
  textTransform: "uppercase", color: "#7A8399", fontWeight: 700, marginBottom: 16,
};

const labelStyle: React.CSSProperties = {
  fontSize: 10, letterSpacing: "1px", textTransform: "uppercase", color: "#7A8399",
  fontWeight: 600, display: "block", marginBottom: 8,
};

const generateBtnStyle = (loading: boolean): React.CSSProperties => ({
  background: loading ? "#8a742f" : "linear-gradient(135deg, #E8C97A, #C9A84C)",
  color: "#0A0C0F", border: "none", borderRadius: 9, padding: "13px 20px",
  fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: "1.5px",
  cursor: loading ? "not-allowed" : "pointer", width: "100%",
  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
});

const errorCardStyle: React.CSSProperties = {
  marginTop: 4, fontSize: 12, color: "#f87171", lineHeight: 1.5,
  background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
  borderRadius: 10, padding: "12px 14px",
};

const oddsCardStyle: React.CSSProperties = {
  background: "#111418", border: "1px solid #2A3140", borderRadius: 14,
  padding: "16px 18px", marginBottom: 14, textAlign: "center",
};

const matchCardStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
  background: "#181C24", border: "1px solid #2A3140", borderLeft: "3px solid #C9A84C",
  borderRadius: 8, padding: "10px 12px",
};

const regenerateBtnStyle: React.CSSProperties = {
  background: "transparent", color: "#C9A84C", border: "1px solid #2A3140", borderRadius: 9,
  padding: "11px 20px", fontSize: 12, fontWeight: 700, letterSpacing: "0.5px", cursor: "pointer",
  width: "100%", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
};
