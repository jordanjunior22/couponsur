// ─── app/api/cron/morning-picks/route.ts (SoccerVital odds version) ──────────
//
// WHAT THIS DOES:
//   - Confidence comes from a heuristic (tip specificity + O/U consistency —
//     see lib/predictionEngine.ts), since SoccerVital publishes no numeric
//     confidence of its own.
//   - Odds for 1X2/DC picks are SoccerVital's own published decimal odds
//     (real numbers from their site, not invented) — see predictionEngine's
//     realOddForTip(). They are NOT live bookmaker market prices, so they
//     may differ from what any actual sportsbook offers at bet time.
//   - No fixture IDs exist from scraped sources, so automatic result grading
//     is NOT wired up here. Picks are created as PENDING and need either
//     manual grading or a separate results-only data source.
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
const TIERS = [
  { id: "safe",  label: "Safe",  size: 3, minConf: 65, maxOdds: 3.50,  minOdds: 1.50, price: 200 },
  { id: "value", label: "Value", size: 3, minConf: 50, maxOdds: 7.00,  minOdds: 2.50, price: 350 },
  { id: "bold",  label: "Bold",  size: 4, minConf: 45, maxOdds: 25.0,  minOdds: 4.00, price: 500 },
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
      info(`  top: ${p.home} vs ${p.away} | ${p.market} ${p.tip} @ ${p.odd} | conf:${p.confidence}`);
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
        .filter((p) => p.confidence >= tier.minConf && !usedKeys.has(keyOf(p)));
      // NOTE: intentionally NOT sliced to a "top N" — the swap-up logic in
      // pickCombo needs the full range of qualifying confidences (and
      // therefore odds) available, or it can't find a genuinely higher-odd
      // leg to swap in when a combo starts below the tier's odds floor.

      if (candidates.length < 2) {
        warn(`Tier "${tier.label}": not enough candidates (${candidates.length}) — skip`);
        continue;
      }

      const selected = pickCombo(candidates, tier.size, tier.maxOdds, tier.minOdds);

      if (selected.length < 2) {
        warn(`Tier "${tier.label}": could not build combo with ≥2 games — skip`);
        continue;
      }

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

      const matches = selected.map((s) => ({
        prediction: buildPredictionString(s),
        outcome: Outcome.PENDING,
        fixtureId: null, // no fixture ID available from scraped sources
        tip: s.tip,
        score: null,
        home: s.home,
        away: s.away,
        league: s.league,
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

      info(
        `[${tier.label.toUpperCase()}] Created: "${pick.title}" — x${totalOdds} — conf:${avgConf} — id:${pick._id}`
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

  // Too high: swap the highest-odd selection for a lower-odd candidate
  if (total > maxOdds) {
    const sorted = [...selected].sort((a, b) => b.odd - a.odd);
    const overflow = sorted[0];
    const replacement = candidates
      .slice(size)
      .find((c) => !selected.includes(c) && c.odd < overflow.odd);
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

function buildPredictionString(p: PredictionPick): string {
  return `${p.home} v ${p.away} | ${p.tip} | ${p.odd.toFixed(2)}`;
}