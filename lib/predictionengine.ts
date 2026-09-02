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
//   - Form GAP: combines a side's own win rate WITH the opponent's loss
//     rate (not just isolated win rate). A team on WWDWW (never loses)
//     facing a team on LLDLL (rarely wins) scores as a genuinely strong
//     signal. Critically, a team on DDDWD (draws constantly, 20% win
//     rate, 0% loss rate) facing a team on LLLWL (also 20% win rate, but
//     80% loss rate) is now correctly distinguished — the old isolated
//     win-rate scoring saw these as identical (both 20%) and missed the
//     real signal that the second team is falling apart. A tip backing
//     the team in worse form/higher loss rate is treated as a red flag
//     (score drops below neutral), not given free credit.
//
// IMPORTANT CAVEAT: Odds are SoccerVital's own published prices, not a live
// bookmaker market feed — they may differ from an actual sportsbook by bet
// time. Confidence remains a heuristic score, not a measured probability.
// This engine does NOT independently predict outcomes — it scores and
// filters SoccerVital's own published tip. It cannot be more accurate than
// SoccerVital's underlying tips; it can only better identify which of their
// tips look most trustworthy.
// ─────────────────────────────────────────────────────────────────────────────

import {
  getSoccerVitalPredictions,
  type SoccerVitalPrediction,
} from "./soccervital";
import { getLeagueForm, getLeagueAvgGoals, lookupTeamForm, type TeamForm } from "./soccervitalForm";
import { estimateGoalMarkets } from "./goalsModel";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Market = "1X2" | "DC" | "BTTS" | "OU15" | "OU25" | "OU35";

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
  /** -1..1. How much stronger the tipped side's combined win-rate +
   *  opponent-loss-rate signal is vs the reverse. Positive = tip backs
   *  the stronger side. Negative = tip backs the weaker side (red flag).
   *  Null when form data is missing for either side. */
  formGap: number | null;
  breakdown: ConfidenceBreakdown;
}

export interface ConfidenceBreakdown {
  specificityScore: number;  // 0–40 — how decisive the tip itself is
  consistencyScore: number;  // 0–20 — 1X2 tip vs O/U signal coherence
  leagueScore: number;       // 0–10 — placeholder weight, currently flat
  formScore: number;         // 0–30 — form-gap-based score (see formGapScore)
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

// ─── Form GAP scoring (0–30) ───────────────────────────────────────────────────

/**
 * Scores the favoured side using BOTH win rate and loss rate, not win rate
 * alone. Previously a team on DDDDD (0% win rate, 0% loss rate — draws
 * constantly) and a team on LLLLL (0% win rate, 100% loss rate — loses
 * constantly) scored identically, because only wins/played was measured.
 * That's a real gap: "doesn't win much" and "loses a lot" are different
 * signals, and the difference is exactly what separates a genuinely safe
 * pick from a risky one.
 *
 * The human heuristic this encodes: back the side with HIGH win rate and
 * LOW loss rate, when the opponent has HIGH loss rate and LOW win rate —
 * i.e. a team that rarely draws or loses, facing a team that rarely wins
 * or draws. Two teams that both draw a lot (low win rate, low loss rate on
 * both sides) is a genuinely different, more uncertain matchup than one
 * side being in freefall — and should score lower, not the same.
 */
function formGapScore(
  tip: string,
  homeForm: TeamForm | null,
  awayForm: TeamForm | null
): { score: number; gap: number | null } {
  const rates = (f: TeamForm | null) => {
    if (!f || f.played === 0) return null;
    return { winRate: f.wins / f.played, lossRate: f.losses / f.played };
  };

  const homeRates = rates(homeForm);
  const awayRates = rates(awayForm);

  if (homeRates === null || awayRates === null) {
    return { score: 10, gap: null }; // no data on one side — neutral, can't measure a gap
  }

  const favoursHome = tip === "1" || tip === "1X";
  const favoursAway = tip === "2" || tip === "X2";

  // "Strength" combines a side's own win rate with the OPPONENT's loss
  // rate — this is what actually captures "team A wins a lot AND team B
  // loses a lot", not just "team A's win rate is higher than team B's".
  let gap: number;
  if (favoursHome) {
    const favouredStrength = (homeRates.winRate + awayRates.lossRate) / 2;
    const opponentStrength = (awayRates.winRate + homeRates.lossRate) / 2;
    gap = favouredStrength - opponentStrength;
  } else if (favoursAway) {
    const favouredStrength = (awayRates.winRate + homeRates.lossRate) / 2;
    const opponentStrength = (homeRates.winRate + awayRates.lossRate) / 2;
    gap = favouredStrength - opponentStrength;
  } else {
    // Draw / "12" / no clear favourite: a big gap either way argues
    // AGAINST this tip — a lopsided strength gap usually points toward a
    // decisive result, not a draw — so invert it.
    const homeStrength = (homeRates.winRate + awayRates.lossRate) / 2;
    const awayStrength = (awayRates.winRate + homeRates.lossRate) / 2;
    gap = -Math.abs(homeStrength - awayStrength);
  }

  // Map gap (-1..1) to a 0-30 score. gap=0 sits at the midpoint (15);
  // gap=+1 maxes out at 30; a negative gap (tipping the weaker side)
  // drops below 15 instead of getting free credit.
  const score = Math.round(((gap + 1) / 2) * 30);
  return { score: Math.max(0, Math.min(30, score)), gap };
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
  leagueForm: Map<string, TeamForm>,
  leagueAvgGoals: number
): PredictionPick[] {
  const picks: PredictionPick[] = [];
  if (!p.tip) return picks;

  const leagueWeight = LEAGUE_WEIGHTS[p.league] ?? DEFAULT_LEAGUE_WEIGHT;
  const spec = specificityScore(p.tip);
  const cons = consistencyScore(p.tip, p.goals);

  const homeForm = lookupTeamForm(p.home, leagueForm);
  const awayForm = lookupTeamForm(p.away, leagueForm);
  const { score: form, gap: formGap } = formGapScore(p.tip, homeForm, awayForm);

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
      formGap,
      breakdown: {
        specificityScore: spec,
        consistencyScore: cons,
        leagueScore: leagueWeight,
        formScore: form,
        total,
      },
    });
  }

  // ─── Goal markets (BTTS, Over/Under 1.5/2.5/3.5) ───────────────────────
  // Internal model off our own scraped correct-score history (see
  // lib/goalsModel.ts), not just a relay of SoccerVital's O/U 2.5 tip —
  // that tip is still used, but only as a small cross-check on the 2.5
  // line inside estimateGoalMarkets(). Returns [] when either side lacks
  // enough scraped history to trust (see MIN_SAMPLE_PLAYED there).
  const goalMarkets = estimateGoalMarkets(homeForm, awayForm, leagueAvgGoals, p.goals as "O" | "U" | "");
  for (const gm of goalMarkets) {
    picks.push({
      home: p.home,
      away: p.away,
      league: p.league,
      market: gm.market,
      tip: gm.tip,
      confidence: gm.confidence,
      odd: gm.odd,
      isEstimatedOdd: true,
      sources: ["Vital"],
      formGap,
      // Not a points breakdown for goal markets (confidence here is a
      // genuine Poisson-derived probability, not tip-specificity +
      // consistency + form points) — kept populated only so every
      // PredictionPick shares the same shape for downstream consumers.
      breakdown: {
        specificityScore: 0,
        consistencyScore: 0,
        leagueScore: 0,
        formScore: 0,
        total: gm.confidence,
      },
    });
  }

  return picks;
}

// ─── Combo building ────────────────────────────────────────────────────────────
// Shared by the morning-picks cron (fixed tier bands) and the buyer-facing
// match generator (a user-chosen target odds) — both need "take the
// strongest candidates, then nudge the selection until the total odds lands
// in a band" and there's no reason to keep two copies of that logic.

/** Picks `size` candidates (already sorted strongest-first) and swaps entries
 *  in/out until the combined odds land within [minOdds, maxOdds], as best as
 *  the candidate pool allows. */
export function pickCombo(
  candidates: PredictionPick[],
  size: number,
  maxOdds: number,
  minOdds: number
): PredictionPick[] {
  const selected = candidates.slice(0, size);
  let total = selected.reduce((acc, s) => acc * s.odd, 1);

  if (total > maxOdds) {
    const sorted = [...selected].sort((a, b) => b.odd - a.odd);
    const overflow = sorted[0];
    const pool = candidates.filter((c) => !selected.includes(c));
    const replacement = pool
      .filter((c) => c.odd < overflow.odd)
      .sort((a, b) => a.odd - b.odd)
      .pop();
    if (replacement) selected[selected.indexOf(overflow)] = replacement;
  }

  total = selected.reduce((acc, s) => acc * s.odd, 1);
  while (total > maxOdds && selected.length > 1) {
    selected.sort((a, b) => b.odd - a.odd);
    selected.shift();
    total = selected.reduce((acc, s) => acc * s.odd, 1);
  }

  total = selected.reduce((acc, s) => acc * s.odd, 1);
  let attempts = 0;
  while (total < minOdds && attempts < candidates.length) {
    const sorted = [...selected].sort((a, b) => a.odd - b.odd);
    const weakest = sorted[0];
    const pool = candidates.filter((c) => !selected.includes(c));
    const replacement = pool
      .filter((c) => c.odd > weakest.odd)
      .sort((a, b) => b.odd - a.odd)
      .find((c) => {
        const projected = (total / weakest.odd) * c.odd;
        return projected <= maxOdds;
      });
    if (!replacement) break;
    selected[selected.indexOf(weakest)] = replacement;
    total = selected.reduce((acc, s) => acc * s.odd, 1);
    attempts++;
  }

  return selected;
}

export interface ComboResult {
  selected: PredictionPick[];
  totalOdds: number;
}

/**
 * Tries combo sizes from 1 up to `maxSize` and returns whichever gets
 * closest to `targetOdds` (within a ±25% band around it, widened slightly
 * from pickCombo's own band since here the user picks the target, not a
 * fixed product tier — so it's better to return the closest honest match
 * than nothing at all). Returns null only if candidates is empty.
 */
export function buildComboForTargetOdds(
  candidates: PredictionPick[],
  maxSize: number,
  targetOdds: number
): ComboResult | null {
  if (candidates.length === 0) return null;

  const minOdds = targetOdds * 0.75;
  const maxOdds = targetOdds * 1.25;

  let best: ComboResult | null = null;
  for (let size = 1; size <= Math.min(maxSize, candidates.length); size++) {
    const combo = pickCombo(candidates, size, maxOdds, minOdds);
    if (combo.length === 0) continue;
    const totalOdds = parseFloat(combo.reduce((acc, s) => acc * s.odd, 1).toFixed(2));
    if (best === null || Math.abs(totalOdds - targetOdds) < Math.abs(best.totalOdds - targetOdds)) {
      best = { selected: combo, totalOdds };
    }
  }
  return best;
}

// ─── Public entrypoint ────────────────────────────────────────────────────────

export async function getPredictions(targetDate?: Date): Promise<PredictionPick[]> {
  const vitalData = await getSoccerVitalPredictions(targetDate).catch(() => []);

  const leagues = [...new Set(vitalData.map((p) => p.league))];
  const formByLeague = new Map<string, Map<string, TeamForm>>();
  const avgGoalsByLeague = new Map<string, number>();

  const BATCH = 5;
  for (let i = 0; i < leagues.length; i += BATCH) {
    const batch = leagues.slice(i, i + BATCH);
    // form fetched first, avgGoals second and sequentially per league so
    // the second call always hits the now-warm per-league cache in
    // soccervitalForm.ts instead of racing a duplicate scrape of the same
    // page (both accessors are backed by the same cached fetch).
    const results = await Promise.allSettled(
      batch.map(async (l) => ({ form: await getLeagueForm(l), avgGoals: await getLeagueAvgGoals(l) }))
    );
    results.forEach((r, idx) => {
      if (r.status === "fulfilled") {
        formByLeague.set(batch[idx], r.value.form);
        avgGoalsByLeague.set(batch[idx], r.value.avgGoals);
      }
    });
  }

  const picks = vitalData.flatMap((p) =>
    scoreMatch(p, formByLeague.get(p.league) ?? new Map(), avgGoalsByLeague.get(p.league) ?? 2.6)
  );

  return picks.sort((a, b) => b.confidence - a.confidence);
}