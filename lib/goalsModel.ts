// ─── lib/goalsModel.ts ────────────────────────────────────────────────────────
// Internal goal-market model (BTTS, Over/Under 1.5/2.5/3.5) built from the
// correct scores we already scrape (see lib/soccervitalForm.ts's
// TeamForm.goalsFor/goalsAgainst and getLeagueAvgGoals) — NOT a relay of
// SoccerVital's own O/U tip. Same honesty caveat as predictionEngine.ts:
// this is a simple, transparent heuristic model, not a fitted statistical
// model backed by a large dataset. With only a last-5-matches scraped
// window per team, treat it as directionally useful, not a precise
// probability.
//
// Method: independent-Poisson goal expectancy.
//   - Attack/defense strength = team's goals-for/against per game, relative
//     to the league's own average goals/team/game (from the SAME scraped
//     results, no extra fetch).
//   - No home/away split fitted from data — the 5-match window is too
//     small to split further without just fitting noise. A fixed, modest
//     home-advantage multiplier is used instead.
//   - P(BTTS=Yes)  = (1 - e^-λhome)(1 - e^-λaway)      — exact under independence
//   - P(Over X.5)  = 1 - PoissonCDF(floor(X), λhome+λaway)
// ─────────────────────────────────────────────────────────────────────────────

import type { TeamForm } from "./soccervitalForm";

export type GoalMarket = "BTTS" | "OU15" | "OU25" | "OU35";

export interface GoalMarketEstimate {
  market: GoalMarket;
  tip: string; // "BTTS" | "O1.5" | "U1.5" | "O2.5" | "U2.5" | "O3.5" | "U3.5"
  confidence: number; // 0-100
  odd: number;
  probability: number; // underlying probability behind the tip, pre-clamp
}

// Need at least this many scraped matches for a team's goal averages to be
// worth anything — below this we skip the market entirely for this fixture
// rather than fabricate a signal from 1-2 games (same philosophy as
// formGapScore's "no data → neutral, don't guess" in predictionEngine.ts).
const MIN_SAMPLE_PLAYED = 3;

// Attack/defense strength ratios are clamped so a small sample with one
// outlier scoreline (e.g. a 6-0 in a 3-game window) can't blow up λ.
const STRENGTH_MIN = 0.4;
const STRENGTH_MAX = 2.5;
const LAMBDA_MIN = 0.3;
const LAMBDA_MAX = 4.5;

const HOME_ADVANTAGE = 1.10;
const AWAY_ADJUST = 0.95;

// Bookmaker-style margin applied when converting a fair probability into a
// quoted odd — same spirit as predictionEngine.ts's existing OU25 estimate,
// just derived from an actual probability here instead of a flat formula.
const ODDS_MARGIN = 0.06;
const ODD_MIN = 1.05;
const ODD_MAX = 6;

// Confidence is a genuine probability here (unlike the point-based 1X2
// score), but it's still a model estimate off a thin sample — never claim
// nearer-to-certain than this either direction.
const CONFIDENCE_MIN = 5;
const CONFIDENCE_MAX = 95;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function poissonPmf(k: number, lambda: number): number {
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);
}

function factorial(n: number): number {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

function poissonCdf(k: number, lambda: number): number {
  let sum = 0;
  for (let i = 0; i <= k; i++) sum += poissonPmf(i, lambda);
  return sum;
}

function fairOdd(probability: number): number {
  const p = clamp(probability, 0.01, 0.99);
  const odd = (1 / p) * (1 - ODDS_MARGIN);
  return +clamp(odd, ODD_MIN, ODD_MAX).toFixed(2);
}

/**
 * Estimates BTTS + Over/Under 1.5/2.5/3.5 for one match. Returns an empty
 * array when either side doesn't have enough scraped history to trust
 * (see MIN_SAMPLE_PLAYED) rather than emitting a low-quality guess.
 *
 * `siteGoalsSignal` is SoccerVital's own O/U 2.5 tip ("O" | "U" | "") —
 * used only as a small cross-validation bonus/penalty on the 2.5 line
 * specifically (it's the only line the site publishes a signal for),
 * mirroring predictionEngine.ts's existing consistencyScore() philosophy
 * of folding in a second free signal rather than discarding it.
 */
export function estimateGoalMarkets(
  homeForm: TeamForm | null,
  awayForm: TeamForm | null,
  leagueAvgGoalsPerMatch: number,
  siteGoalsSignal: "O" | "U" | ""
): GoalMarketEstimate[] {
  if (
    !homeForm || !awayForm ||
    homeForm.played < MIN_SAMPLE_PLAYED || awayForm.played < MIN_SAMPLE_PLAYED
  ) {
    return [];
  }

  const leagueAvgPerTeam = leagueAvgGoalsPerMatch > 0 ? leagueAvgGoalsPerMatch / 2 : 1.3;

  const homeAttack = clamp((homeForm.goalsFor / homeForm.played) / leagueAvgPerTeam, STRENGTH_MIN, STRENGTH_MAX);
  const homeDefense = clamp((homeForm.goalsAgainst / homeForm.played) / leagueAvgPerTeam, STRENGTH_MIN, STRENGTH_MAX);
  const awayAttack = clamp((awayForm.goalsFor / awayForm.played) / leagueAvgPerTeam, STRENGTH_MIN, STRENGTH_MAX);
  const awayDefense = clamp((awayForm.goalsAgainst / awayForm.played) / leagueAvgPerTeam, STRENGTH_MIN, STRENGTH_MAX);

  const lambdaHome = clamp(leagueAvgPerTeam * homeAttack * awayDefense * HOME_ADVANTAGE, LAMBDA_MIN, LAMBDA_MAX);
  const lambdaAway = clamp(leagueAvgPerTeam * awayAttack * homeDefense * AWAY_ADJUST, LAMBDA_MIN, LAMBDA_MAX);
  const lambdaTotal = lambdaHome + lambdaAway;

  const estimates: GoalMarketEstimate[] = [];

  // ─── BTTS ─── only the "Yes" side is gradable (see gradeHelpers.ts —
  // tip "BTTS" always means Yes), so only emit when Yes is the more
  // likely outcome; a low pBtts just means we don't have a BTTS tip to
  // offer for this match, not that we invent a "No" market.
  const pBtts = (1 - Math.exp(-lambdaHome)) * (1 - Math.exp(-lambdaAway));
  if (pBtts >= 0.5) {
    estimates.push({
      market: "BTTS",
      tip: "BTTS",
      confidence: Math.round(clamp(pBtts * 100, CONFIDENCE_MIN, CONFIDENCE_MAX)),
      odd: fairOdd(pBtts),
      probability: pBtts,
    });
  }

  // ─── Over/Under 1.5 / 2.5 / 3.5 ───
  const lines: Array<{ market: GoalMarket; k: number; threshold: string }> = [
    { market: "OU15", k: 1, threshold: "1.5" },
    { market: "OU25", k: 2, threshold: "2.5" },
    { market: "OU35", k: 3, threshold: "3.5" },
  ];

  for (const line of lines) {
    const pOver = 1 - poissonCdf(line.k, lambdaTotal);
    const over = pOver >= 0.5;
    const probability = over ? pOver : 1 - pOver;
    let confidence = clamp(probability * 100, CONFIDENCE_MIN, CONFIDENCE_MAX);

    // Cross-validate against SoccerVital's own 2.5 signal only.
    if (line.market === "OU25" && siteGoalsSignal) {
      const siteAgrees = (siteGoalsSignal === "O" && over) || (siteGoalsSignal === "U" && !over);
      confidence = clamp(confidence + (siteAgrees ? 5 : -5), CONFIDENCE_MIN, CONFIDENCE_MAX);
    }

    estimates.push({
      market: line.market,
      tip: `${over ? "O" : "U"}${line.threshold}`,
      confidence: Math.round(confidence),
      odd: fairOdd(probability),
      probability,
    });
  }

  return estimates;
}
