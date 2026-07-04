// ─── lib/predictionEngine.ts ─────────────────────────────────────────────────
// Prediction engine using SoccerVital's tip + published odds + recent form.
//
// Odds: SoccerVital's own quoted 1/X/2 decimal odds (real numbers published
// on their site), not an invented formula. Compound tips (1X, X2, 12) derive
// a combined odd from the underlying 1/X/2 prices mathematically.
//
// Confidence is a heuristic built from four real signals:
//   - Tip specificity (how decisive SoccerVital's own pick is)
//   - Consistency between the 1X2 tip and the Over/Under signal
//   - League weight (currently flat, hook for future tuning)
//   - Recent form: last-5-games win count for the favoured team, scraped
//     from SoccerVital's own league results tables (see soccervitalForm.ts)
//
// IMPORTANT CAVEAT: Odds are SoccerVital's own published prices, not a live
// bookmaker market feed — they may differ from an actual sportsbook by bet
// time. Confidence remains a heuristic score, not a measured probability.
// ─────────────────────────────────────────────────────────────────────────────

import {
  getSoccerVitalPredictions,
  type SoccerVitalPrediction,
} from "./soccervital";
import { getLeagueForm, lookupTeamForm, type TeamForm } from "./soccervitalForm";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Market = "1X2" | "OU25" | "DC";

export interface PredictionPick {
  home: string;
  away: string;
  league: string;
  market: Market;
  tip: string;
  confidence: number;
  odd: number;
  isEstimatedOdd: boolean;
  sources: string[];
  breakdown: ConfidenceBreakdown;
}

export interface ConfidenceBreakdown {
  specificityScore: number;  // 0–40 — how decisive the tip itself is
  consistencyScore: number;  // 0–20 — 1X2 tip vs O/U signal coherence
  leagueScore: number;       // 0–10 — placeholder weight, currently flat
  formScore: number;         // 0–30 — last-5-games win record of the favoured team
  total: number;             // 0–100
}

const LEAGUE_WEIGHTS: Record<string, number> = {
  // "Premier League": 10,
};
const DEFAULT_LEAGUE_WEIGHT = 6;

// ─── Tip specificity ──────────────────────────────────────────────────────────

function specificityScore(tip: string): number {
  const t = tip.toUpperCase();
  if (t === "1" || t === "2") return 40;
  if (t === "1X" || t === "X2") return 25;
  if (t === "X") return 18;
  if (t === "12") return 10;
  return 0;
}

// ─── Consistency between 1X2 tip and O/U signal ──────────────────────────────

function consistencyScore(tip: string, goals: string): number {
  if (!goals) return 0;
  const decisive = tip === "1" || tip === "2";
  const cagey = tip === "1X" || tip === "X2";

  if (decisive && goals === "O") return 20;
  if (cagey && goals === "U") return 20;
  if (decisive && goals === "U") return 8;
  if (cagey && goals === "O") return 8;
  return 5;
}

// ─── Recent form scoring (0–30) ───────────────────────────────────────────────

/**
 * Scores the favoured side's last-5-games win record. For a straight tip
 * (1/2) this is just that team's form. For a double-chance tip (1X/X2) or a
 * hedge (X/12), we use whichever team the tip actually favours, or an
 * average of both when the tip doesn't lean either way.
 */
function formScore(
  tip: string,
  homeForm: TeamForm | null,
  awayForm: TeamForm | null
): number {
  const favoursHome = tip === "1" || tip === "1X";
  const favoursAway = tip === "2" || tip === "X2";

  const winRate = (f: TeamForm | null) => (f && f.played > 0 ? f.wins / f.played : null);

  if (favoursHome) {
    const wr = winRate(homeForm);
    return wr === null ? 10 : Math.round(wr * 30); // no data → neutral mid credit
  }
  if (favoursAway) {
    const wr = winRate(awayForm);
    return wr === null ? 10 : Math.round(wr * 30);
  }

  // Draw / "12" / no clear favourite: average both sides' win rates if available
  const hwr = winRate(homeForm);
  const awr = winRate(awayForm);
  if (hwr === null && awr === null) return 10;
  if (hwr === null) return Math.round(awr! * 30);
  if (awr === null) return Math.round(hwr * 30);
  return Math.round(((hwr + awr) / 2) * 30);
}

// ─── Real odd for the tip, derived from SoccerVital's 1/X/2 prices ──────────

function realOddForTip(
  tip: string,
  odd1: number | null,
  oddX: number | null,
  odd2: number | null
): number | null {
  const t = tip.toUpperCase();
  if (t === "1") return odd1;
  if (t === "X") return oddX;
  if (t === "2") return odd2;

  if (t === "1X" && odd1 && oddX) return +(1 / (1 / odd1 + 1 / oddX)).toFixed(2);
  if (t === "X2" && oddX && odd2) return +(1 / (1 / oddX + 1 / odd2)).toFixed(2);
  if (t === "12" && odd1 && odd2) return +(1 / (1 / odd1 + 1 / odd2)).toFixed(2);

  return null;
}

// ─── Build 1X2/DC + O/U picks per match ──────────────────────────────────────

function scoreMatch(
  p: SoccerVitalPrediction,
  leagueForm: Map<string, TeamForm>
): PredictionPick[] {
  const picks: PredictionPick[] = [];
  if (!p.tip) return picks;

  const leagueWeight = LEAGUE_WEIGHTS[p.league] ?? DEFAULT_LEAGUE_WEIGHT;
  const spec = specificityScore(p.tip);
  const cons = consistencyScore(p.tip, p.goals);

  const homeForm = lookupTeamForm(p.home, leagueForm);
  const awayForm = lookupTeamForm(p.away, leagueForm);
  const form = formScore(p.tip, homeForm, awayForm);

  const total = Math.min(spec + cons + leagueWeight + form, 100);
  const odd = realOddForTip(p.tip, p.odd1, p.oddX, p.odd2);

  if (odd !== null) {
    picks.push({
      home: p.home,
      away: p.away,
      league: p.league,
      market: p.tip === "1X" || p.tip === "X2" ? "DC" : "1X2",
      tip: p.tip,
      confidence: total,
      odd,
      isEstimatedOdd: false,
      sources: ["Vital"],
      breakdown: {
        specificityScore: spec,
        consistencyScore: cons,
        leagueScore: leagueWeight,
        formScore: form,
        total,
      },
    });
  }

  if (p.goals === "O" || p.goals === "U") {
    const ouTip = p.goals === "O" ? "O2.5" : "U2.5";
    const ouConfidence = Math.min(30 + cons + Math.round(form * 0.5), 90);
    const estimatedOdd = +(1 + ((100 - ouConfidence) / 55) * 3).toFixed(2);
    picks.push({
      home: p.home,
      away: p.away,
      league: p.league,
      market: "OU25",
      tip: ouTip,
      confidence: ouConfidence,
      odd: Math.min(Math.max(estimatedOdd, 1.05), 4.5),
      isEstimatedOdd: true,
      sources: ["Vital"],
      breakdown: {
        specificityScore: 30,
        consistencyScore: cons,
        leagueScore: 0,
        formScore: form,
        total: ouConfidence,
      },
    });
  }

  return picks;
}

// ─── Public entrypoint ────────────────────────────────────────────────────────

export async function getPredictions(): Promise<PredictionPick[]> {
  const vitalData = await getSoccerVitalPredictions().catch(() => []);

  // Fetch form data once per distinct league, in parallel, capped batches
  const leagues = [...new Set(vitalData.map((p) => p.league))];
  const formByLeague = new Map<string, Map<string, TeamForm>>();

  const BATCH = 5;
  for (let i = 0; i < leagues.length; i += BATCH) {
    const batch = leagues.slice(i, i + BATCH);
    const results = await Promise.allSettled(batch.map((l) => getLeagueForm(l)));
    results.forEach((r, idx) => {
      if (r.status === "fulfilled") formByLeague.set(batch[idx], r.value);
    });
  }

  const picks = vitalData.flatMap((p) =>
    scoreMatch(p, formByLeague.get(p.league) ?? new Map())
  );

  return picks.sort((a, b) => b.confidence - a.confidence);
}