// ─── lib/gradeHelpers.ts ──────────────────────────────────────────────────────
// Determines WIN/LOSS/REFUNDED for a tip given a final score. Supports every
// tip format produced by predictionEngine.ts: 1, X, 2, 1X, X2, 12, BTTS,
// O2.5, U2.5, O1.5, U1.5, DNB.
// ─────────────────────────────────────────────────────────────────────────────

export type GradeOutcome = "WIN" | "LOSS" | "REFUNDED";

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
  if (t === "BTTS") return homeGoals > 0 && awayGoals > 0 ? "WIN" : "LOSS";
  if (t === "O2.5" || t === "O 2.5") return totalGoals > 2 ? "WIN" : "LOSS";
  if (t === "U2.5" || t === "U 2.5") return totalGoals < 3 ? "WIN" : "LOSS";
  if (t === "O1.5" || t === "O 1.5") return totalGoals > 1 ? "WIN" : "LOSS";
  if (t === "U1.5" || t === "U 1.5") return totalGoals < 2 ? "WIN" : "LOSS";
  // Draw No Bet — the stake is refunded on a draw (that's the whole point
  // of the market: no bet if it's a draw), otherwise it's a normal 1/2 bet.
  if (t === "DNB") return draw ? "REFUNDED" : homeWin ? "WIN" : "LOSS";

  // Unknown tip format — default to LOSS rather than silently marking a WIN
  // (or a refund) on something we can't actually verify.
  return "LOSS";
}

/**
 * Determine the overall outcome of a combo pick given each leg's outcome.
 * A combo/accumulator wins only if every non-refunded leg wins — a
 * REFUNDED leg (match cancelled, or a push like DNB on a draw) is removed
 * from consideration entirely rather than treated as a win or a loss,
 * mirroring how real sportsbooks settle a voided leg in an accumulator.
 * If EVERY leg ends up refunded, the whole combo is refunded. If any
 * (non-refunded) leg is still PENDING, the combo stays PENDING — only an
 * actual LOSS on a graded leg fails the combo.
 */
export function comboOutcome(
  legOutcomes: Array<"PENDING" | "WIN" | "LOSS" | "REFUNDED">
): "PENDING" | "WIN" | "LOSS" | "REFUNDED" {
  const relevant = legOutcomes.filter((o) => o !== "REFUNDED");
  if (relevant.length === 0) return "REFUNDED";
  if (relevant.some((o) => o === "LOSS")) return "LOSS";
  if (relevant.every((o) => o === "WIN")) return "WIN";
  return "PENDING";
}
