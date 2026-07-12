// ─── app/api/cron/morning-picks/route.ts (SoccerVital odds version) ──────────
//
// WHAT THIS DOES:
//   - Confidence comes from a heuristic (tip specificity + O/U consistency +
//     form GAP between the two sides — see lib/predictionEngine.ts), since
//     SoccerVital publishes no numeric confidence of its own.
//   - Odds for 1X2/DC picks are SoccerVital's own published decimal odds
//     (real numbers from their site, not invented) — see predictionEngine's
//     realOddForTip(). They are NOT live bookmaker market prices, so they
//     may differ from what any actual sportsbook offers at bet time.
//   - The "Safe" tier additionally requires a minimum form GAP (not just
//     confidence) — a team in clearly better recent form than its opponent,
//     backing the same side as the tip. This is what actually distinguishes
//     "Maitland WWWWW vs Adamstown LLWDL" (a strong, filterable signal) from
//     two evenly-matched teams that merely got tagged with a decisive tip.
//   - No fixture IDs exist from scraped sources, so automatic result grading
//     is NOT wired up here. Picks are created as PENDING and need either
//     manual grading or a separate results-only data source (see
//     app/api/cron/grade-picks/route.ts).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import PickModel, { Outcome } from "@/models/Picks";
import { getPredictions, type PredictionPick } from "@/lib/predictionengine";

// ─── Config ───────────────────────────────────────────────────────────────────
const MIN_CONFIDENCE = 45;      // min score (out of 100) to be included in any combo

// Fixed price bands per tier, in FCFA (100–500 range).
// minOdds is set per-tier rather than globally: a "Safe" combo is inherently
// low-odd by design (high confidence ⇒ short-priced favourites), so forcing
// every tier to the same odds floor would either break the "safe" concept
// or make it impossible to ever build one.
//
// minFormGap (0–1, or null): the minimum required form-gap (see
// formGapScore in predictionEngine.ts) between the tipped side and its
// opponent. Only enforced where set — Safe requires a genuine form
// mismatch backing the tip; Value/Bold stay gap-agnostic since they lean
// more on odds/confidence than on a "clear favourite" narrative.
const TIERS = [
  { id: "safe",  label: "Safe",  size: 3, minConf: 65, maxOdds: 3.50,  minOdds: 1.50, price: 200, minFormGap: 0.4 as number | null },
  { id: "value", label: "Value", size: 3, minConf: 50, maxOdds: 7.00,  minOdds: 2.50, price: 350, minFormGap: null as number | null },
  { id: "bold",  label: "Bold",  size: 4, minConf: 45, maxOdds: 25.0,  minOdds: 4.00, price: 500, minFormGap: null as number | null },
] as const;

// ─── Auth guard ───────────────────────────────────────────────────────────────
function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const log: string[] = [];
  const info = (msg: string) => { console.log(msg);  log.push(`✓ ${msg}`); };
  const warn = (msg: string) => { console.warn(msg); log.push(`⚠ ${msg}`); };

  try {
    await connectDB();

    const today = new Date();
    today.setHours(today.getHours() + 1); // WAT = UTC+1
    const dateStr = today.toISOString().split("T")[0];
    info(`Running morning-picks for ${dateStr}`);

    // ── 1. Get predictions from SoccerVital ──────────────────────────────────
    const allPicks = await getPredictions();
    info(`${allPicks.length} raw prediction(s) across all markets`);

    if (allPicks.length === 0) {
      return NextResponse.json({ ok: true, message: "No predictions today", log });
    }

    // Quick distribution snapshot for debugging — top 5 by confidence
    const top5 = [...allPicks].sort((a, b) => b.confidence - a.confidence).slice(0, 5);
    for (const p of top5) {
      const gapStr = p.formGap !== null ? p.formGap.toFixed(2) : "n/a";
      info(`  top: ${p.home} vs ${p.away} | ${p.market} ${p.tip} @ ${p.odd} | conf:${p.confidence} | gap:${gapStr}`);
    }

    // ── 2. Restrict to 1X2 / Double Chance for combo-building ────────────────
    //     (O/U picks are available via getPredictions() for a separate
    //      "markets" feed/UI if you want to surface them individually —
    //      note those carry isEstimatedOdd: true, unlike 1X2/DC picks)
    const qualified = allPicks
      .filter((p) => (p.market === "1X2" || p.market === "DC") && p.confidence >= MIN_CONFIDENCE)
      .sort((a, b) => b.confidence - a.confidence);

    info(`${qualified.length} 1X2/DC pick(s) met the confidence threshold (≥${MIN_CONFIDENCE})`);

    if (qualified.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "No qualifying picks after confidence filter",
        log,
      });
    }

    // ── 3. Build tiered combos ────────────────────────────────────────────────
    const createdPicks: string[] = [];
    const usedKeys = new Set<string>();
    const keyOf = (p: PredictionPick) => `${p.home}|${p.away}`;

    for (const tier of TIERS) {
      const candidates = qualified
        .filter((p) => p.confidence >= tier.minConf && !usedKeys.has(keyOf(p)))
        .filter((p) => tier.minFormGap === null || (p.formGap !== null && p.formGap >= tier.minFormGap))
        // Prioritize the clearest form gaps first (your "clear gap" ask),
        // falling back to confidence when gap data is unavailable (null
        // sorts last via the ?? -1 fallback).
        .sort((a, b) => (b.formGap ?? -1) - (a.formGap ?? -1));
      // NOTE: intentionally NOT sliced to a "top N" — the swap-up logic in
      // pickCombo needs the full range of qualifying confidences (and
      // therefore odds) available, or it can't find a genuinely higher-odd
      // leg to swap in when a combo starts below the tier's odds floor.

      if (candidates.length < 2) {
        warn(`Tier "${tier.label}": not enough candidates (${candidates.length}) after confidence${tier.minFormGap !== null ? "+form-gap" : ""} filter — skip`);
        continue;
      }

      const selected = pickCombo(candidates, tier.size, tier.maxOdds, tier.minOdds);

      if (selected.length < 2) {
        warn(`Tier "${tier.label}": could not build combo with ≥2 games — skip`);
        continue;
      }

      // Total combo odds = product of each leg's decimal odds (standard
      // accumulator math), NOT a sum. e.g. 1.58 × 1.42 = 2.24.
      const totalOdds = parseFloat(
        selected.reduce((acc, s) => acc * s.odd, 1).toFixed(2)
      );

      if (totalOdds < tier.minOdds) {
        warn(`Tier "${tier.label}": combo odds ${totalOdds} below floor of ${tier.minOdds} — skip`);
        continue;
      }

      if (tier.id === "safe") {
        for (const s of selected) usedKeys.add(keyOf(s));
      }

      const price = tier.price;

      // Label the combo's league honestly: only name a specific league if
      // every selected match is from that same league, otherwise say "Mixed"
      // rather than picking a misleading "dominant" one.
      const distinctLeagues = new Set(selected.map((s) => s.league));
      const leagueLabel = distinctLeagues.size === 1
        ? [...distinctLeagues][0]
        : "Mixed";

      const localeDateStr = new Date(dateStr + "T12:00:00").toLocaleDateString("fr-FR", {
        day: "2-digit", month: "2-digit", year: "numeric",
      });

      const pickTitle = `${tier.label} – ${leagueLabel} – x${selected.length} – ${localeDateStr}`;

      const avgConf = Math.round(
        selected.reduce((s, e) => s + e.confidence, 0) / selected.length
      );

      // Structured match data — home/away/tip/odd are the fields the UI
      // actually renders. No `prediction` string; nothing parses it
      // anymore, so it's dropped entirely rather than kept as dead weight.
      const matches = selected.map((s) => ({
        outcome: Outcome.PENDING,
        fixtureId: null, // no fixture ID available from scraped sources
        tip: s.tip,
        odd: s.odd,
        score: null,
        home: s.home,
        away: s.away,
        league: s.league,
        confidence: s.confidence,
        sources: s.sources,
        date: new Date(dateStr + "T12:00:00"), // combo legs are always same-day
      }));

      // All legs in a combo come from the 1X2/DC filter above, which only
      // includes picks with isEstimatedOdd === false — so the combo's odds
      // are real (SoccerVital-published), not invented.
      const pick = await PickModel.create({
        title: pickTitle,
        price,
        total_odds: totalOdds,
        is_estimated_odds: false,
        match_date: new Date(dateStr + "T12:00:00"),
        league: leagueLabel,
        outcome: Outcome.PENDING,
        is_published: true,
        is_automated: true,
        tier: tier.id,
        avg_confidence: avgConf,
        matches,
      });

      const gapSummary = selected
        .map((s) => (s.formGap !== null ? s.formGap.toFixed(2) : "n/a"))
        .join(", ");
      info(
        `[${tier.label.toUpperCase()}] Created: "${pick.title}" — x${totalOdds} — conf:${avgConf} — gaps:[${gapSummary}] — id:${pick._id}`
      );
      createdPicks.push(pick._id.toString());
    }

    if (createdPicks.length === 0) {
      return NextResponse.json({ ok: true, message: "No combos could be built today", log });
    }

    return NextResponse.json({
      ok: true,
      picksCreated: createdPicks.length,
      pickIds: createdPicks,
      totalQualified: qualified.length,
      log,
    });
  } catch (err) {
    console.error("morning-picks cron error:", err);
    return NextResponse.json({ ok: false, error: String(err), log }, { status: 500 });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pickCombo(
  candidates: PredictionPick[],
  size: number,
  maxOdds: number,
  minOdds: number
): PredictionPick[] {
  const selected = candidates.slice(0, size);
  let total = selected.reduce((acc, s) => acc * s.odd, 1);

  // Too high: swap the highest-odd selection for a lower-odd candidate.
  // Search the FULL remaining pool (not just candidates beyond the initial
  // slice) since `candidates` is sorted by form gap (then confidence), not
  // odds — a valid lower-odd replacement could exist anywhere outside
  // `selected`.
  if (total > maxOdds) {
    const sorted = [...selected].sort((a, b) => b.odd - a.odd);
    const overflow = sorted[0];
    const pool = candidates.filter((c) => !selected.includes(c));
    const replacement = pool
      .filter((c) => c.odd < overflow.odd)
      .sort((a, b) => a.odd - b.odd)
      .pop(); // closest-below replacement (highest odd that's still < overflow)
    if (replacement) selected[selected.indexOf(overflow)] = replacement;
  }

  total = selected.reduce((acc, s) => acc * s.odd, 1);
  while (total > maxOdds && selected.length > 2) {
    selected.sort((a, b) => b.odd - a.odd);
    selected.shift();
    total = selected.reduce((acc, s) => acc * s.odd, 1);
  }

  // Too low: swap the lowest-odd selection for a higher-odd candidate,
  // as long as we stay under the max. Repeat until we clear the floor or
  // run out of swaps to try.
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