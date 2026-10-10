"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  PiWarningFill, PiLockSimpleFill, PiRobotFill,
  PiArrowsClockwiseBold, PiSlidersHorizontalBold, PiArrowLeftBold, PiSparkleFill, PiCaretDownBold,
  PiClockCounterClockwiseBold,
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

interface GeneratorUsageInfo {
  unlimited: boolean;
  limit: number | null;
  used: number;
  remaining: number | null;
}

interface GenerateResponse {
  success: boolean;
  matches?: GeneratedMatch[];
  totalOdds?: number | null;
  requestedOdds?: number | null;
  targetMissed?: boolean;
  // Identity of this combination — sent back as ?avoid= on the next
  // generate so the visitor never gets the same one twice in a row.
  signature?: string;
  // Set when a FREE user has spent today's generations (HTTP 403).
  dailyLimitReached?: boolean;
  usage?: GeneratorUsageInfo;
  message?: string;
  disclaimer?: string;
  requiresLogin?: boolean;
  requiresPremium?: boolean;
  // Markets the caller asked for but weren't included because they're
  // admin-restricted to premium and the caller isn't premium (see
  // app/api/generate-matches/route.ts's inner gate).
  restrictedMarkets?: string[];
  // Selected markets with no qualifying pick today, so no leg in the combo.
  missingMarkets?: string[];
}

type GenState = "idle" | "loading" | "result" | "error";
// Which screen is showing - separate from the request state, so regenerating
// from the results keeps the results on screen (dimmed) instead of bouncing
// back to the settings, and the settings can be reopened without losing them.
type GenView = "config" | "result";

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
// One line that is always on screen; the longer note about estimated odds opens
// from it. Same tinted-card language the rest of the app uses for warnings.
function AiWarning() {
  const [open, setOpen] = useState(false);
  return (
    <div role="alert" style={warningCardStyle}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
        <PiWarningFill size={15} color="#f87171" style={{ flexShrink: 0, marginTop: 1 }} />
        <span style={{ fontSize: 11.5, color: "#fca5a5", lineHeight: 1.5, flex: 1, minWidth: 0 }}>
          <strong style={{ color: "#fff" }}>Analyse générée par une IA, non vérifiée par notre équipe.</strong>{" "}
          Des erreurs sont possibles — utilise-la à tes propres risques.
        </span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label="Plus de détails"
          style={{ background: "none", border: "none", color: "#fca5a5", cursor: "pointer", padding: 2, display: "flex", flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}
        >
          <PiCaretDownBold size={14} />
        </button>
      </div>
      {open && (
        <div style={{ fontSize: 11, color: "#fca5a5", marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(239,68,68,0.25)", lineHeight: 1.5 }}>
          Ces matchs n&apos;ont pas été analysés manuellement. Les cotes des marchés de buts (BTTS, Over/Under) sont estimées par notre propre modèle statistique à partir des scores récents, pas des cotes réelles d&apos;un bookmaker.
        </div>
      )}
    </div>
  );
}

// ─── Generations left today — visible in every state ─────────────────────────
function UsageCard({ usage, signedIn }: { usage: GeneratorUsageInfo | null; signedIn: boolean }) {
  if (!signedIn) return null;
  if (!usage) {
    return <div style={{ ...usageCardStyle, height: 62 }} aria-busy="true"><div className="mg-skel" style={{ height: 14, width: "55%", borderRadius: 6 }} /></div>;
  }

  if (usage.unlimited) {
    return (
      <div style={{ ...usageCardStyle, display: "flex", alignItems: "center", gap: 10, borderColor: "rgba(201,168,76,0.4)", background: "rgba(201,168,76,0.07)" }}>
        <PiSparkleFill size={18} color="#C9A84C" />
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#E8C97A" }}>Générations illimitées</div>
          <div style={{ fontSize: 11, color: "#7A8399", marginTop: 1 }}>Profitez-en autant que vous voulez.</div>
        </div>
      </div>
    );
  }

  const limit = usage.limit ?? 0;
  const remaining = usage.remaining ?? 0;
  const empty = remaining === 0;
  const segmented = limit > 0 && limit <= 10;

  return (
    <div style={{ ...usageCardStyle, borderColor: empty ? "rgba(239,68,68,0.35)" : "#2A3140" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 10, letterSpacing: "1.5px", textTransform: "uppercase", color: "#7A8399", fontWeight: 700 }}>
          Générations du jour
        </span>
        <span aria-live="polite" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: 1, lineHeight: 1, color: empty ? "#f87171" : "#E8C97A" }}>
          {remaining}<span style={{ fontSize: 14, color: "#7A8399" }}> / {limit}</span>
        </span>
      </div>

      {segmented ? (
        <div style={{ display: "flex", gap: 5 }}>
          {Array.from({ length: limit }, (_, i) => (
            <span key={i} style={{ flex: 1, height: 7, borderRadius: 4, background: i < remaining ? "linear-gradient(135deg, #E8C97A, #C9A84C)" : "#2A3140", transition: "background 0.3s" }} />
          ))}
        </div>
      ) : (
        <div style={{ height: 7, borderRadius: 4, background: "#2A3140", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${limit > 0 ? (remaining / limit) * 100 : 0}%`, background: "linear-gradient(135deg, #E8C97A, #C9A84C)", transition: "width 0.3s" }} />
        </div>
      )}

      <div style={{ fontSize: 11, color: "#7A8399", marginTop: 8, lineHeight: 1.5 }}>
        {empty ? (
          <>Limite atteinte. <Link href="/profil" style={{ color: "#C9A84C", fontWeight: 700 }}>Abonnez-vous</Link> pour générer sans limite, ou revenez demain.</>
        ) : (
          <>Se renouvelle chaque jour à minuit (heure du Cameroun).</>
        )}
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
  // Admins get every market, same as subscribers (enforced server-side too).
  const isPremium = hasActiveSubscription() || user?.role === "ADMIN";
  const [state, setState] = useState<GenState>("idle");
  const [view, setView] = useState<GenView>("config");
  const [matches, setMatches] = useState<GeneratedMatch[]>([]);
  const [totalOdds, setTotalOdds] = useState<number | null>(null);
  const [requestedOdds, setRequestedOdds] = useState<number | null>(null);
  const [targetMissed, setTargetMissed] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [requiresPremium, setRequiresPremium] = useState(false);
  const [restrictedMarkets, setRestrictedMarkets] = useState<string[]>([]);
  const [missingMarkets, setMissingMarkets] = useState<string[]>([]);

  const lastSignatureRef = useRef<string | null>(null);

  // How many generations are left today (free users) — null until loaded.
  const [usage, setUsage] = useState<GeneratorUsageInfo | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  useEffect(() => {
    if (!user) { setUsage(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/generate-matches/usage", { credentials: "include" });
        const data = await res.json();
        if (!cancelled && data?.success) {
          setUsage(data.usage);
          setLimitReached(!data.usage.unlimited && data.usage.remaining === 0);
        }
      } catch { /* the counter just stays hidden */ }
    })();
    return () => { cancelled = true; };
  }, [user]);

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
      if (lastSignatureRef.current) params.set("avoid", lastSignatureRef.current);
      const url = `/api/generate-matches?${params.toString()}`;
      const res = await fetch(url, { credentials: "include" });
      const data: GenerateResponse = await res.json();

      if (data.usage) {
        setUsage(data.usage);
        setLimitReached(!data.usage.unlimited && data.usage.remaining === 0);
      }

      if (!data.success) {
        if (data.dailyLimitReached) setLimitReached(true);
        setErrorMsg(data.message || "Impossible de générer des matchs pour le moment.");
        setRequiresPremium(!!data.requiresPremium);
        setRestrictedMarkets(data.restrictedMarkets || []);
        setState("error");
        return;
      }

      lastSignatureRef.current = data.signature ?? null;
      setMatches(data.matches || []);
      setTotalOdds(data.totalOdds ?? null);
      setRequestedOdds(data.requestedOdds ?? null);
      setTargetMissed(!!data.targetMissed);
      setRestrictedMarkets(data.restrictedMarkets || []);
      setMissingMarkets(data.missingMarkets || []);
      setResultMessage(data.matches?.length === 0 ? data.message || null : null);
      setState("result");
      setView("result");
    } catch {
      setErrorMsg("Erreur réseau — réessayez.");
      setState("error");
    }
  };

  const loading = state === "loading";
  const outOfGenerations = limitReached && !isPremium && !(usage?.unlimited);
  const generateDisabled = loading || outOfGenerations;
  const remainingLabel = usage && !usage.unlimited && usage.remaining !== null ? `${usage.remaining} restante${usage.remaining > 1 ? "s" : ""}` : null;
  const estimatedAny = matches.some((m) => m.isEstimatedOdd);

  // The error / "no results" card, shown on whichever screen is active.
  const errorBlock = state === "error" && (
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
  );

  return (
    <div>
      <style>{`
        .mg-skel { background: linear-gradient(90deg, #14181D 0%, #1C2128 50%, #14181D 100%); background-size: 200% 100%; animation: mgShimmer 1.3s ease-in-out infinite; }
        @keyframes mgShimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        @keyframes mgFadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        .mg-card { animation: mgFadeUp 0.28s ease both; }
        @media (prefers-reduced-motion: reduce) { .mg-skel, .mg-card { animation: none; } }
      `}</style>

      {/* Always visible, whichever screen you're on */}
      <UsageCard usage={usage} signedIn={!!user} />
      <AiWarning />

      {view === "config" && (
        <>
          <div style={{ fontSize: 11.5, color: "#7A8399", lineHeight: 1.5, margin: "2px 2px 14px" }}>
            Notre moteur d&apos;analyse génère des matchs à titre indicatif — rien n&apos;est enregistré ni vendu, c&apos;est juste pour t&apos;amuser.
          </div>

          {errorBlock}

          <div style={configCardStyle}>
            <div style={configHeaderStyle}>
              <PiSlidersHorizontalBold size={13} color="#C9A84C" />
              <span>Configuration</span>
            </div>

            <label style={labelStyle}>Marchés</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
              {ALL_MARKET_CODES.map((code) => {
                const active = selectedMarkets.includes(code);
                const locked = isMarketLocked(code);
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => toggleMarket(code)}
                    disabled={loading || locked}
                    aria-pressed={active}
                    title={locked ? "Réservé aux abonnés premium" : undefined}
                    style={{
                      background: active ? "linear-gradient(135deg, #E8C97A, #C9A84C)" : "#181C24",
                      color: locked ? "#4A5568" : active ? "#0A0C0F" : "#9CA3AF",
                      border: `1px solid ${active ? "#C9A84C" : "#2A3140"}`,
                      borderRadius: 999, padding: "7px 13px", fontSize: 11.5, fontWeight: 700,
                      cursor: loading || locked ? "not-allowed" : "pointer", fontFamily: "inherit",
                      display: "flex", alignItems: "center", gap: 5, transition: "all 0.15s",
                    }}
                  >
                    {locked && <PiLockSimpleFill size={11} />} {MARKET_LABELS[code]}
                  </button>
                );
              })}
            </div>

            {ALL_MARKET_CODES.some(isMarketLocked) && (
              <div style={{ fontSize: 11, color: "#7A8399", lineHeight: 1.5, marginBottom: 14, display: "flex", alignItems: "flex-start", gap: 6 }}>
                <PiLockSimpleFill size={13} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>Les marchés verrouillés sont réservés aux abonnés premium — abonne-toi pour les débloquer.</span>
              </div>
            )}

            <label style={labelStyle}>Cote totale souhaitée <span style={{ color: "#4A5568", textTransform: "none", letterSpacing: 0 }}>(optionnel)</span></label>
            <input
              type="number"
              inputMode="decimal"
              min={1.1}
              max={100}
              step={0.1}
              placeholder="ex : 3.00"
              value={oddsInput}
              onChange={(e) => setOddsInput(e.target.value)}
              disabled={loading}
              style={oddsInputStyle}
            />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 18 }}>
              {[2, 3, 5, 10].map((v) => {
                const on = oddsInput.trim() === String(v);
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setOddsInput(on ? "" : String(v))}
                    disabled={loading}
                    style={{
                      background: on ? "rgba(201,168,76,0.15)" : "transparent", color: on ? "#E8C97A" : "#7A8399",
                      border: `1px solid ${on ? "#C9A84C" : "#2A3140"}`, borderRadius: 8, padding: "5px 12px",
                      fontSize: 11.5, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit",
                    }}
                  >
                    x{v}
                  </button>
                );
              })}
            </div>

            <button onClick={generate} disabled={generateDisabled} style={generateBtnStyle(generateDisabled)}>
              {loading ? (
                <>
                  <Spinner size={14} variant="dark" glow={false} /> Analyse en cours…
                </>
              ) : (
                <>
                  <PiRobotFill size={16} /> Générer des matchs
                  {remainingLabel && <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: 0, opacity: 0.75 }}>· {remainingLabel}</span>}
                </>
              )}
            </button>
          </div>

          {/* Went back to the settings from a result: the result is still there. */}
          {matches.length > 0 && !loading && (
            <button type="button" onClick={() => setView("result")} style={linkBtnStyle}>
              <PiClockCounterClockwiseBold size={14} /> Revoir le dernier résultat ({matches.length} match{matches.length > 1 ? "s" : ""})
            </button>
          )}
        </>
      )}

      {view === "result" && (
        <div style={{ opacity: loading ? 0.55 : 1, transition: "opacity 0.2s" }}>
          {/* Top bar: the way back to the settings */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
            <button type="button" onClick={() => setView("config")} disabled={loading} style={backBtnStyle}>
              <PiArrowLeftBold size={14} /> Modifier les paramètres
            </button>
            {matches.length > 0 && (
              <span style={{ fontSize: 11, color: "#7A8399", whiteSpace: "nowrap" }}>{matches.length} match{matches.length > 1 ? "s" : ""}</span>
            )}
          </div>

          {errorBlock}

          {restrictedMarkets.length > 0 && (
            <div style={{ fontSize: 11, color: "#E8C97A", marginBottom: 12, lineHeight: 1.5, display: "flex", alignItems: "flex-start", gap: 6 }}>
              <PiLockSimpleFill size={13} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>Réservé aux abonnés premium, non inclus : {restrictedMarkets.map((m) => MARKET_LABELS[m] || m).join(", ")}.</span>
            </div>
          )}
          {missingMarkets.length > 0 && (
            <div style={{ fontSize: 11, color: "#7A8399", marginBottom: 12, lineHeight: 1.5 }}>
              Aucun pronostic fiable aujourd&apos;hui pour : {missingMarkets.map((m) => MARKET_LABELS[m] || m).join(", ")}.
            </div>
          )}
          {resultMessage && (
            <div style={{ fontSize: 12, color: "#7A8399", marginBottom: 14 }}>{resultMessage}</div>
          )}

          {totalOdds !== null && (
            <div className="mg-card" style={oddsCardStyle}>
              <div style={{ fontSize: 9, letterSpacing: "2px", textTransform: "uppercase", color: "#7A8399", marginBottom: 4 }}>
                Cote totale estimée
              </div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 38, color: "#C9A84C", letterSpacing: 1, lineHeight: 1 }}>
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
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
              {matches.map((m, i) => (
                <div key={`${m.home}-${m.away}-${i}`} className="mg-card" style={{ ...matchCardStyle, animationDelay: `${i * 60}ms` }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 9.5, letterSpacing: "1px", textTransform: "uppercase", color: "#7A8399", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {m.league}
                    </div>
                    <div style={{ fontSize: 13.5, color: "#E8EAF0", fontWeight: 600, lineHeight: 1.35, overflowWrap: "anywhere" }}>
                      {m.home} <span style={{ color: "#4A5568", fontWeight: 400 }}>vs</span> {m.away}
                    </div>
                    {/* Confidence at a glance */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                      <div style={{ flex: 1, height: 4, borderRadius: 3, background: "#2A3140", overflow: "hidden", maxWidth: 120 }}>
                        <div style={{ width: `${Math.max(0, Math.min(100, m.confidence))}%`, height: "100%", background: "linear-gradient(90deg, #C9A84C, #E8C97A)" }} />
                      </div>
                      <span style={{ fontSize: 10.5, color: "#7A8399" }}>{m.confidence}% confiance</span>
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 9, letterSpacing: "0.5px", textTransform: "uppercase", color: "#7A8399", marginBottom: 3 }}>
                      {MARKET_LABELS[m.market] || m.market}
                    </div>
                    <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: 0.5, color: "#C9A84C", lineHeight: 1.1 }}>{m.tip}</div>
                    <div style={{ fontSize: 11.5, color: "#9CA3AF", marginTop: 2 }}>@{m.odd}{m.isEstimatedOdd ? "*" : ""}</div>
                  </div>
                </div>
              ))}
              {estimatedAny && (
                <div style={{ fontSize: 10.5, color: "#7A8399", paddingLeft: 2 }}>* cote estimée par notre modèle statistique</div>
              )}
            </div>
          )}

          {/* Actions: back to the settings, or generate again */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => setView("config")} disabled={loading} style={{ ...secondaryBtnStyle, flex: "1 1 150px" }}>
              <PiSlidersHorizontalBold size={14} /> Paramètres
            </button>
            <button
              type="button"
              onClick={generate}
              disabled={generateDisabled}
              style={{ ...regenerateBtnStyle, flex: "2 1 200px", opacity: generateDisabled ? 0.55 : 1, cursor: generateDisabled ? "not-allowed" : "pointer" }}
            >
              {loading ? <Spinner size={14} variant="dark" glow={false} /> : <PiArrowsClockwiseBold size={14} />}
              {loading ? "Analyse en cours…" : outOfGenerations ? "Limite du jour atteinte" : "Générer à nouveau"}
              {!loading && !outOfGenerations && remainingLabel && <span style={{ fontWeight: 600, opacity: 0.75 }}>· {remainingLabel}</span>}
            </button>
          </div>

          {outOfGenerations && (
            <div style={{ fontSize: 12, color: "#E8C97A", lineHeight: 1.5, background: "rgba(201,168,76,0.08)", border: "1px solid rgba(201,168,76,0.25)", borderRadius: 10, padding: "10px 12px", marginTop: 10, textAlign: "center" }}>
              <strong>Abonne-toi pour générer sans limite</strong>, ou reviens demain.{" "}
              <Link href="/profil" style={{ color: "#C9A84C", fontWeight: 700, textDecoration: "underline" }}>S&apos;abonner</Link>
            </div>
          )}
        </div>
      )}

      {state === "idle" && view === "config" && !user && (
        <div style={{ fontSize: 11.5, color: "#7A8399", marginTop: 12 }}>
          Connexion requise pour générer des matchs.
        </div>
      )}
      {state === "idle" && view === "config" && user && access === "PREMIUM" && !isPremium && (
        <div style={{ fontSize: 11.5, color: "#7A8399", marginTop: 12 }}>
          Réservé aux abonnés premium.
        </div>
      )}
    </div>
  );
}

/* ─── STYLES ──────────────────────────────────────────────────────────────── */

const warningCardStyle: React.CSSProperties = {
  background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
  borderRadius: 10, padding: "10px 12px", marginBottom: 12, lineHeight: 1.5,
};

const usageCardStyle: React.CSSProperties = {
  background: "#111418", border: "1px solid #2A3140", borderRadius: 14, padding: "14px 16px", marginBottom: 12,
};

const configCardStyle: React.CSSProperties = {
  background: "#111418", border: "1px solid #2A3140", borderRadius: 14, padding: 18, marginBottom: 10,
};

const configHeaderStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 7, fontSize: 10, letterSpacing: "1.5px",
  textTransform: "uppercase", color: "#7A8399", fontWeight: 700, marginBottom: 16,
};

const labelStyle: React.CSSProperties = {
  fontSize: 10, letterSpacing: "1px", textTransform: "uppercase", color: "#7A8399",
  fontWeight: 600, display: "block", marginBottom: 8,
};

const oddsInputStyle: React.CSSProperties = {
  width: "100%", background: "#181C24", border: "1px solid #2A3140", borderRadius: 8,
  color: "#E8EAF0", fontSize: 14, padding: "10px 12px", marginBottom: 8,
  fontFamily: "inherit", outline: "none", boxSizing: "border-box",
};

const generateBtnStyle = (disabled: boolean): React.CSSProperties => ({
  background: disabled ? "#3A3220" : "linear-gradient(135deg, #E8C97A, #C9A84C)",
  color: disabled ? "#7A8399" : "#0A0C0F", border: "none", borderRadius: 9, padding: "13px 20px",
  fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: "1.5px",
  cursor: disabled ? "not-allowed" : "pointer", width: "100%",
  display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "wrap",
});

const errorCardStyle: React.CSSProperties = {
  marginBottom: 12, fontSize: 12, color: "#f87171", lineHeight: 1.5,
  background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
  borderRadius: 10, padding: "12px 14px",
};

const oddsCardStyle: React.CSSProperties = {
  background: "#111418", border: "1px solid #2A3140", borderRadius: 14,
  padding: "16px 18px", marginBottom: 12, textAlign: "center",
};

const matchCardStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
  background: "#181C24", border: "1px solid #2A3140", borderLeft: "3px solid #C9A84C",
  borderRadius: 10, padding: "12px 14px",
};

const backBtnStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, background: "#181C24", border: "1px solid #2A3140",
  borderRadius: 999, color: "#C9A84C", fontSize: 12, fontWeight: 700, padding: "7px 14px",
  cursor: "pointer", fontFamily: "inherit",
};

const linkBtnStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center", gap: 7, width: "100%",
  background: "transparent", border: "1px dashed #2A3140", borderRadius: 10, color: "#9CA3AF",
  fontSize: 12, fontWeight: 600, padding: "11px 14px", cursor: "pointer", fontFamily: "inherit",
};

const secondaryBtnStyle: React.CSSProperties = {
  background: "transparent", color: "#E8EAF0", border: "1px solid #2A3140", borderRadius: 9,
  padding: "12px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
  display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
};

const regenerateBtnStyle: React.CSSProperties = {
  background: "linear-gradient(135deg, #E8C97A, #C9A84C)", color: "#0A0C0F", border: "none", borderRadius: 9,
  padding: "12px 16px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
  display: "flex", alignItems: "center", justifyContent: "center", gap: 7, flexWrap: "wrap",
};
