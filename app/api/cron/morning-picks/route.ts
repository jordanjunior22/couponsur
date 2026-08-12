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
//   - The "Safe" tier requires a minimum form GAP (win rate + opponent loss
//     rate combined, not just isolated win rate — see formGapScore) AND is
//     constrained to a tight 2.00–2.50 total-odds band on just 2 legs. This
//     deliberately trades "biggest possible combo" for "smallest, most
//     defensible combo" — Safe is meant to be the tier where the pick with
//     the single strongest signal always leads, not diluted by extra legs.
//   - No fixture IDs exist from scraped sources, so automatic result grading
//     is NOT wired up here. Picks are created as PENDING and need either
//     manual grading or a separate results-only data source (see
//     app/api/cron/grade-picks/route.ts).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import PickModel, { Outcome } from "@/models/Picks";
import { getPredictions, type PredictionPick } from "@/lib/predictionengine";
import { getTodayWAT } from "@/lib/soccervital";

// ─── Config ───────────────────────────────────────────────────────────────────
const MIN_CONFIDENCE = 45;

// minFormGap (0–1, or null): the minimum required form-gap (see
// formGapScore in predictionEngine.ts) between the tipped side and its
// opponent. Only enforced where set — Safe requires a genuine form
// mismatch backing the tip; Value/Bold stay gap-agnostic since they lean
// more on odds/confidence than on a "clear favourite" narrative.
//
// Safe is deliberately narrow: 2 legs, odds must land between 2.00 and
// 2.50 total. On days where no 1-2 leg combination from the gap-qualified
// pool lands in that band, Safe simply won't produce a pick — that's
// expected behavior, not a bug, given how tight the band is.
const TIERS = [
  { id: "safe",  label: "Safe",  size: 2, minConf: 65, maxOdds: 2.50,  minOdds: 2.00, price: 200, minFormGap: 0.4 as number | null },
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

    const todayWAT = getTodayWAT();
    const dateStr = todayWAT.toISOString().split("T")[0];
    const dayStart = new Date(dateStr + "T00:00:00");
    const dayEnd = new Date(dateStr + "T23:59:59.999");

    info(`Running morning-picks for ${dateStr} (requesting this exact date from SoccerVital)`);

    // ── 0. Idempotency guard ──────────────────────────────────────────────────
    const alreadyRanToday = await PickModel.exists({
      is_automated: true,
      match_date: { $gte: dayStart, $lte: dayEnd },
    });

    if (alreadyRanToday) {
      warn(`Automated picks already exist for ${dateStr} — aborting to avoid duplicates. Delete existing picks first if you intentionally want to regenerate today's combos.`);
      return NextResponse.json({
        ok: true,
        aborted: true,
        reason: "already_ran_today",
        message: `Automated picks already exist for ${dateStr}. No new picks created.`,
        log,
      });
    }

    // ── 1. Get predictions from SoccerVital for TODAY specifically ───────────
    const allPicks = await getPredictions(todayWAT);
    info(`${allPicks.length} raw prediction(s) across all markets`);

    if (allPicks.length === 0) {
      return NextResponse.json({ ok: true, message: "No predictions today", log });
    }

    const top5 = [...allPicks].sort((a, b) => b.confidence - a.confidence).slice(0, 5);
    for (const p of top5) {
      const gapStr = p.formGap !== null ? p.formGap.toFixed(2) : "n/a";
      info(`  top: ${p.home} vs ${p.away} | ${p.market} ${p.tip} @ ${p.odd} | conf:${p.confidence} | gap:${gapStr}`);
    }

    // ── 2. Restrict to 1X2 / Double Chance for combo-building ────────────────
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
        .sort((a, b) => (b.formGap ?? -1) - (a.formGap ?? -1));

      if (candidates.length < 1) {
        warn(`Tier "${tier.label}": no candidates after confidence${tier.minFormGap !== null ? "+form-gap" : ""}+dedup filter — skip`);
        continue;
      }

      const selected = pickCombo(candidates, tier.size, tier.maxOdds, tier.minOdds);

      if (selected.length < 1) {
        warn(`Tier "${tier.label}": could not build a combo — skip`);
        continue;
      }

      const totalOdds = parseFloat(
        selected.reduce((acc, s) => acc * s.odd, 1).toFixed(2)
      );

      if (totalOdds < tier.minOdds || totalOdds > tier.maxOdds) {
        warn(`Tier "${tier.label}": best achievable odds ${totalOdds} fell outside the required ${tier.minOdds}–${tier.maxOdds} band — skip`);
        continue;
      }

      for (const s of selected) usedKeys.add(keyOf(s));

      const price = tier.price;

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
        outcome: Outcome.PENDING,
        fixtureId: null,
        tip: s.tip,
        odd: s.odd,
        score: null,
        home: s.home,
        away: s.away,
        league: s.league,
        confidence: s.confidence,
        sources: s.sources,
        date: new Date(dateStr + "T12:00:00"),
      }));

      const pick = await PickModel.create({
        title: pickTitle,
        price,
        total_odds: totalOdds,
        is_estimated_odds: false,
        match_date: new Date(dateStr + "T12:00:00"),
        league: leagueLabel,
        outcome: Outcome.PENDING,
        is_published: false,
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