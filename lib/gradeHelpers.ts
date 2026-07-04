// ─── lib/gradeHelpers.ts ──────────────────────────────────────────────────────
// Determines WIN/LOSS for a tip given a final score. Supports every tip
// format produced by predictionEngine.ts: 1, X, 2, 1X, X2, 12, O2.5, U2.5.
// ─────────────────────────────────────────────────────────────────────────────

export type GradeOutcome = "WIN" | "LOSS";

export function gradeTip(tip: string, homeGoals: number, awayGoals: number): GradeOutcome {
  const t = tip.toUpperCase().trim();
  const homeWin = homeGoals > awayGoals;
  const awayWin = awayGoals > homeGoals;
  const draw = homeGoals === awayGoals;
  const totalGoals = homeGoals + awayGoals;

  if (t === "1") return homeWin ? "WIN" : "LOSS";
  if (t === "2") return awayWin ? "WIN" : "LOSS";
  if (t === "X") return draw ? "WIN" : "LOSS";
  if (t === "1X") return homeWin || draw ? "WIN" : "LOSS";
  if (t === "X2") return awayWin || draw ? "WIN" : "LOSS";
  if (t === "12") return homeWin || awayWin ? "WIN" : "LOSS";
  if (t === "O2.5" || t === "O 2.5") return totalGoals > 2 ? "WIN" : "LOSS";
  if (t === "U2.5" || t === "U 2.5") return totalGoals < 3 ? "WIN" : "LOSS";

  // Unknown tip format — default to LOSS rather than silently marking a WIN
  // on something we can't actually verify.
  return "LOSS";
}

/**
 * Determine the overall outcome of a combo pick given each leg's outcome.
 * A combo/accumulator wins only if every leg wins. If any leg is still
 * PENDING (not yet graded), the combo stays PENDING rather than being
 * marked a loss prematurely — only an actual LOSS on any leg fails the combo.
 */
export function comboOutcome(
  legOutcomes: Array<"PENDING" | "WIN" | "LOSS">
): "PENDING" | "WIN" | "LOSS" {
  if (legOutcomes.some((o) => o === "LOSS")) return "LOSS";
  if (legOutcomes.every((o) => o === "WIN")) return "WIN";
  return "PENDING";
}