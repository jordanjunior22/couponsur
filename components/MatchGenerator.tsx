"use client";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";

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
}

type GenState = "idle" | "loading" | "result" | "error";

// ─── AI warning — always visible, never conditional on having a result ──────
// Also does double duty as the tool's "what can it actually do" label: the
// engine currently only qualifies match-winner / double-chance picks (see
// the market filter in app/api/generate-matches/route.ts), so say that
// plainly instead of implying it covers every market.
function AiWarning() {
  return (
    <div
      role="alert"
      style={{
        background: "#B91C1C", color: "#fff", border: "1px solid #7F1D1D",
        borderRadius: 8, padding: "12px 14px", marginBottom: 14, lineHeight: 1.5,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <span style={{ fontSize: 18, flexShrink: 0 }}>⚠️</span>
        <span style={{ fontSize: 12 }}>
          <strong>Analyse générée par une IA — non vérifiée par notre équipe.</strong>{" "}
          Ces matchs n&apos;ont pas été analysés manuellement et peuvent contenir des erreurs. Utilise ce générateur à tes propres risques.
        </span>
      </div>
      <div style={{ fontSize: 11, marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.25)" }}>
        🚧 Outil en construction. Pour l&apos;instant, l&apos;IA propose uniquement le{" "}
        <strong>résultat du match (1, X, 2)</strong> et la <strong>double chance (1X, X2, 12)</strong> — d&apos;autres marchés (BTTS, Over/Under…) arriveront plus tard.
      </div>
    </div>
  );
}

// ─── Tool content ─────────────────────────────────────────────────────────────
// Rendered inside the Tools Hub sheet (see components/ToolsHub.tsx) — the hub
// owns the header/back-button/close chrome and already knows this tool is
// enabled, so this component only needs to know WHO currently has access
// (to word the pre-attempt hint accurately) and does the actual generating.
// Ephemeral by design: nothing generated here is ever saved.
export function MatchGeneratorTool({ access }: { access: "EVERYONE" | "PREMIUM" }) {
  const { user, hasActiveSubscription } = useAuth();
  const [state, setState] = useState<GenState>("idle");
  const [matches, setMatches] = useState<GeneratedMatch[]>([]);
  const [totalOdds, setTotalOdds] = useState<number | null>(null);
  const [requestedOdds, setRequestedOdds] = useState<number | null>(null);
  const [targetMissed, setTargetMissed] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [requiresPremium, setRequiresPremium] = useState(false);

  // Optional — left blank, the generator just picks from the strongest
  // qualified matches on its own.
  const [oddsInput, setOddsInput] = useState("");

  const generate = async () => {
    setState("loading");
    setErrorMsg(null);
    setResultMessage(null);
    setRequiresPremium(false);
    try {
      const trimmed = oddsInput.trim();
      const url = trimmed
        ? `/api/generate-matches?targetOdds=${encodeURIComponent(trimmed)}`
        : "/api/generate-matches";
      const res = await fetch(url, { credentials: "include" });
      const data: GenerateResponse = await res.json();

      if (!data.success) {
        setErrorMsg(data.message || "Impossible de générer des matchs pour le moment.");
        setRequiresPremium(!!data.requiresPremium);
        setState("error");
        return;
      }

      setMatches(data.matches || []);
      setTotalOdds(data.totalOdds ?? null);
      setRequestedOdds(data.requestedOdds ?? null);
      setTargetMissed(!!data.targetMissed);
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

      <div style={{ fontSize: 11, color: "#7A8399", lineHeight: 1.5, marginBottom: 14 }}>
        Notre moteur d&apos;analyse génère des matchs à titre indicatif, gratuitement — rien n&apos;est enregistré ni vendu, c&apos;est juste pour t&apos;amuser.
      </div>

      {state !== "result" && (
        <>
          <label style={{ fontSize: 10, letterSpacing: "1px", textTransform: "uppercase", color: "#7A8399", fontWeight: 600, display: "block", marginBottom: 6 }}>
            Cote totale souhaitée (optionnel)
          </label>
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
              color: "#E8EAF0", fontSize: 14, padding: "10px 12px", marginBottom: 14,
              fontFamily: "inherit", outline: "none", boxSizing: "border-box",
            }}
          />

          <button
            onClick={generate}
            disabled={state === "loading"}
            style={{
              background: state === "loading" ? "#1D4E8F" : "linear-gradient(135deg, #3B82F6, #60A5FA)",
              color: "#fff", border: "none", borderRadius: 8, padding: "13px 20px",
              fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: "1.5px",
              cursor: state === "loading" ? "not-allowed" : "pointer", width: "100%",
            }}
          >
            {state === "loading" ? "Analyse en cours…" : "🔮 Générer des matchs"}
          </button>
        </>
      )}

      {state === "error" && (
        <div style={{ marginTop: 12, fontSize: 12, color: "#EF4444", lineHeight: 1.5 }}>
          {errorMsg}
          {requiresPremium && (
            <span style={{ display: "block", marginTop: 4, color: "#7A8399" }}>
              Réservé aux abonnés premium.
            </span>
          )}
        </div>
      )}

      {state === "result" && (
        <div>
          {resultMessage && (
            <div style={{ fontSize: 12, color: "#7A8399", marginBottom: 14 }}>
              {resultMessage}
            </div>
          )}

          {matches.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
              {matches.map((m, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                    background: "#181C24", border: "1px solid #2A3140", borderRadius: 8, padding: "10px 12px",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 9, letterSpacing: "1px", textTransform: "uppercase", color: "#7A8399", marginBottom: 2 }}>
                      {m.league}
                    </div>
                    <div style={{ fontSize: 13, color: "#E8EAF0", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {m.home} vs {m.away}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 13, color: "#3B82F6", fontWeight: 700 }}>{m.tip}</div>
                    <div style={{ fontSize: 11, color: "#7A8399" }}>
                      @{m.odd}{m.isEstimatedOdd ? "*" : ""} · {m.confidence}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {totalOdds !== null && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: "#3B82F6" }}>x{totalOdds}</span>
                <span style={{ fontSize: 10, color: "#7A8399", letterSpacing: "1px", textTransform: "uppercase" }}>Cote totale estimée</span>
              </div>
              {requestedOdds !== null && targetMissed && (
                <div style={{ fontSize: 11, color: "#E8C97A", marginTop: 6 }}>
                  Cote la plus proche trouvée aujourd&apos;hui — ta cible était x{requestedOdds}.
                </div>
              )}
            </div>
          )}

          <button
            onClick={generate}
            style={{
              background: "#222830", color: "#E8EAF0", border: "1px solid #2A3140", borderRadius: 8,
              padding: "10px 20px", fontSize: 12, fontWeight: 600, cursor: "pointer", width: "100%", fontFamily: "inherit",
            }}
          >
            🔁 Générer à nouveau
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
