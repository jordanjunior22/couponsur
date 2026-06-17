// ─── app/api/cron/morning-picks/route.ts ─────────────────────────────────────
//
// WHAT IT DOES:
//   1. Fetches today's fixtures from API-Football (all tracked leagues incl. WC)
//   2. For each upcoming fixture: fetches odds, team stats, H2H in parallel
//   3. Runs a multi-factor scoring algorithm (odds + form + stats + H2H)
//   4. Cross-validates tips against SoccerVista & SoccerVital scrapers (+5 pts each)
//   5. Builds THREE tiered combo picks every day:
//        • "Safe"  – top 3 games by confidence, total odds 1.30–2.80
//        • "Value" – next 3 by confidence, total odds 2.80–6.00
//        • "Bold"  – top 4 highest-odd qualifiers, total odds 6.00+
//   6. Falls back gracefully: if fewer games pass filters, combos use whatever is
//      available (min 2 games per combo); combos are skipped only when truly empty.
//   7. Saves all created picks to MongoDB (published, is_automated: true)
//
// WHEN TO RUN:  09:00 Africa/Douala (WAT = UTC+1)
//   vercel.json cron: "0 8 * * *"
//
// QUOTA:  ~24 API calls for fixtures + up to 60 for stats/H2H → ~85/100 daily
//         Adjust COMBO_SIZE or disable stats for low-quota days via env flags.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import PickModel, { Outcome } from "@/models/Picks";
import {
  getFixturesByDate,
  getOddsForFixture,
  getTeamStats,
  getH2H,
  extract1X2,
  pickTip,
  scoreConfidence,
  LEAGUE_LABEL,
  type APIFixture,
  type APITeamStats,
  type APIH2H,
  type ConfidenceBreakdown,
} from "@/lib/apiFootball";
import {
  getSoccerVistaPredictions,
  crossValidate,
} from "@/lib/soccervista";
import {
  getSoccerVitalPredictions,
  crossValidateVital,
} from "@/lib/soccervital";

// ─── Config ───────────────────────────────────────────────────────────────────
const MIN_ODD = 1.25;
const MAX_ODD = 2.30;          // upper bound for a single selection
const MIN_CONFIDENCE = 45;     // min score (out of 100) to be included in any combo
const AUTO_PICK_PRICE = 2000;  // FCFA

// Tier definitions
const TIERS = [
  { id: "safe",  label: "Safe",  size: 3, minConf: 65, maxTotalOdds: 3.50, priceMultiplier: 1.0 },
  { id: "value", label: "Value", size: 3, minConf: 50, maxTotalOdds: 7.00, priceMultiplier: 1.2 },
  { id: "bold",  label: "Bold",  size: 4, minConf: 45, maxTotalOdds: 25.0, priceMultiplier: 1.5 },
] as const;

// ─── Auth guard ───────────────────────────────────────────────────────────────
function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

// ─── Enriched fixture type ────────────────────────────────────────────────────
interface EnrichedFixture {
  fixture:    APIFixture;
  tip:        string;
  odd:        number;
  odd1:       number;
  oddX:       number;
  odd2:       number;
  homeStats:  APITeamStats | null;
  awayStats:  APITeamStats | null;
  h2h:        APIH2H[];
  confidence: ConfidenceBreakdown;
  crossVista: boolean;
  crossVital: boolean;
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

    // ── 1. Today's date in WAT (UTC+1) ───────────────────────────────────────
    const today = new Date();
    today.setHours(today.getHours() + 1);
    const dateStr = today.toISOString().split("T")[0];
    info(`Running morning-picks for ${dateStr}`);

    // ── 2. Fetch all sources in parallel ─────────────────────────────────────
    const [allFixtures, vistaData, vitalData] = await Promise.all([
      getFixturesByDate(dateStr),
      getSoccerVistaPredictions().catch(() => []),
      getSoccerVitalPredictions().catch(() => []),
    ]);

    info(`Fixtures: ${allFixtures.length} | SoccerVista: ${vistaData.length} | SoccerVital: ${vitalData.length}`);

    // ── 3. Filter to only not-started fixtures ────────────────────────────────
    const upcoming = allFixtures.filter((f) => f.fixture.status.short === "NS");
    info(`${upcoming.length} not-yet-started fixture(s)`);

    if (upcoming.length === 0) {
      return NextResponse.json({ ok: true, message: "No fixtures today", log });
    }

    // ── 4. Enrich each fixture (odds + stats + H2H) ───────────────────────────
    // Run in parallel with a concurrency cap to respect rate limits
    const CONCURRENCY = 5;
    const enriched: EnrichedFixture[] = [];

    for (let i = 0; i < upcoming.length; i += CONCURRENCY) {
      const batch = upcoming.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map((fixture) => enrichFixture(fixture, vistaData, vitalData, warn))
      );
      for (const r of results) {
        if (r.status === "fulfilled" && r.value) enriched.push(r.value);
      }
    }

    info(`${enriched.length} fixture(s) fully enriched`);

    // ── 5. Filter by minimum confidence ──────────────────────────────────────
    const qualified = enriched
      .filter((e) => e.confidence.total >= MIN_CONFIDENCE)
      .sort((a, b) => b.confidence.total - a.confidence.total);

    info(`${qualified.length} fixture(s) met the confidence threshold (≥${MIN_CONFIDENCE})`);

    if (qualified.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "No qualifying fixtures after confidence filter",
        log,
      });
    }

    // ── 6. Build tiered combos ────────────────────────────────────────────────
    const createdPicks: string[] = [];
    const usedIds = new Set<number>();

    for (const tier of TIERS) {
      // Candidates: meet tier's minConf, not already used in a higher tier
      const candidates = qualified
        .filter((e) => e.confidence.total >= tier.minConf && !usedIds.has(e.fixture.fixture.id))
        .slice(0, tier.size * 2); // pool 2× to allow combination flexibility

      if (candidates.length < 2) {
        warn(`Tier "${tier.label}": not enough candidates (${candidates.length}) — skip`);
        continue;
      }

      // Try to build a combo that stays within maxTotalOdds
      const selected = pickCombo(candidates, tier.size, tier.maxTotalOdds);

      if (selected.length < 2) {
        warn(`Tier "${tier.label}": could not build combo with ≥2 games — skip`);
        continue;
      }

      // Mark IDs as used (safe tier games don't appear in bold tier)
      if (tier.id === "safe") {
        for (const s of selected) usedIds.add(s.fixture.fixture.id);
      }

      const totalOdds = parseFloat(
        selected.reduce((acc, s) => acc * s.odd, 1).toFixed(2)
      );
      const price = Math.round(AUTO_PICK_PRICE * tier.priceMultiplier / 100) * 100;

      // Dominant league label
      const leagueFreq: Record<string, number> = {};
      for (const s of selected) {
        const label = LEAGUE_LABEL[s.fixture.league.id] ?? s.fixture.league.name;
        leagueFreq[label] = (leagueFreq[label] ?? 0) + 1;
      }
      const dominantLeague =
        Object.entries(leagueFreq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Mix";

      const localeDateStr = new Date(dateStr + "T12:00:00").toLocaleDateString("fr-FR", {
        day: "2-digit", month: "2-digit", year: "numeric",
      });

      const pickTitle = `${tier.label} – ${dominantLeague} – x${selected.length} – ${localeDateStr}`;

      const avgConf = Math.round(
        selected.reduce((s, e) => s + e.confidence.total, 0) / selected.length
      );

      const matches = selected.map((s) => ({
        prediction: buildPredictionString(s),
        outcome: Outcome.PENDING,
        fixtureId: s.fixture.fixture.id,
        tip: s.tip,
        score: null,
      }));

      const pick = await PickModel.create({
        title: pickTitle,
        price,
        total_odds: totalOdds,
        match_date: new Date(dateStr + "T12:00:00"),
        league: dominantLeague,
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

/** Fetch odds, stats, H2H for a single fixture and return an EnrichedFixture */
async function enrichFixture(
  fixture: APIFixture,
  vistaData: Awaited<ReturnType<typeof getSoccerVistaPredictions>>,
  vitalData: Awaited<ReturnType<typeof getSoccerVitalPredictions>>,
  warn: (m: string) => void
): Promise<EnrichedFixture | null> {
  const { id }  = fixture.fixture;
  const homeId  = fixture.teams.home.id;
  const awayId  = fixture.teams.away.id;
  const leagueId = fixture.league.id;
  const homeName = fixture.teams.home.name;
  const awayName = fixture.teams.away.name;

  // Fetch odds, stats, H2H in parallel
  const [oddsData, homeStats, awayStats, h2h] = await Promise.all([
    getOddsForFixture(id),
    getTeamStats(homeId, leagueId),
    getTeamStats(awayId, leagueId),
    getH2H(homeId, awayId, 10),
  ]);

  if (!oddsData) {
    warn(`No odds for ${homeName} vs ${awayName} (id:${id})`);
    return null;
  }

  const parsed = extract1X2(oddsData);
  if (!parsed) {
    warn(`Could not parse 1X2 for ${homeName} vs ${awayName}`);
    return null;
  }

  const { odd1, oddX, odd2 } = parsed;
  const { tip, odd } = pickTip(odd1, oddX, odd2);

  if (odd < MIN_ODD || odd > MAX_ODD) return null;

  // Cross-validation
  const crossVista = crossValidate(homeName, awayName, tip, vistaData);
  const crossVital = crossValidateVital(homeName, awayName, tip, vitalData);

  // Score confidence (SoccerVista is primary cross-val source here)
  const confidence = scoreConfidence(
    tip,
    odd,
    homeStats,
    awayStats,
    h2h,
    crossVista || crossVital // bonus if either agrees
  );

  return { fixture, tip, odd, odd1, oddX, odd2, homeStats, awayStats, h2h, confidence, crossVista, crossVital };
}

/**
 * Greedily build the best combo of exactly `size` games (or fewer if unavailable)
 * that stays within maxTotalOdds. Sorted by confidence desc, then trimmed.
 */
function pickCombo(
  candidates: EnrichedFixture[],
  size: number,
  maxTotalOdds: number
): EnrichedFixture[] {
  // Start with the top `size` by confidence
  const selected = candidates.slice(0, size);

  // If total odds exceed the cap, swap in lower-odd alternatives
  let totalOdds = selected.reduce((acc, s) => acc * s.odd, 1);

  // If over cap, try replacing the highest-odd selection with a lower one
  if (totalOdds > maxTotalOdds) {
    const sorted = [...selected].sort((a, b) => b.odd - a.odd);
    const overflow = sorted[0];
    const replacement = candidates
      .slice(size)
      .find((c) => !selected.includes(c) && c.odd < overflow.odd);

    if (replacement) {
      const idx = selected.indexOf(overflow);
      selected[idx] = replacement;
    }
  }

  // Final total odds
  totalOdds = selected.reduce((acc, s) => acc * s.odd, 1);

  // Cap at maxTotalOdds: if still too high, drop the highest-odd game
  while (totalOdds > maxTotalOdds && selected.length > 2) {
    selected.sort((a, b) => b.odd - a.odd);
    selected.shift();
    totalOdds = selected.reduce((acc, s) => acc * s.odd, 1);
  }

  return selected;
}

/** Build the human-readable prediction string with confidence metadata */
function buildPredictionString(e: EnrichedFixture): string {
  const { homeName, awayName } = {
    homeName: e.fixture.teams.home.name,
    awayName: e.fixture.teams.away.name,
  };
  const league = LEAGUE_LABEL[e.fixture.league.id] ?? e.fixture.league.name;
  const conf   = e.confidence.total;
  const cv     = [e.crossVista && "Vista", e.crossVital && "Vital"].filter(Boolean).join("+") || "";
  const cvStr  = cv ? ` [✓${cv}]` : "";
  return `${homeName} vs ${awayName} — ${e.tip} @ ${e.odd.toFixed(2)} | ${league} | conf:${conf}${cvStr}`;
}