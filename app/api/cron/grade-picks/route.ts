// ─── app/api/cron/grade-picks/route.ts ──────────────────────────────────────
//
// Grades all PENDING automated picks whose match_date is today or earlier.
// Compatible with both legacy single-combo picks and new tiered combo picks.
//
// WHEN TO RUN: 23:30 Africa/Douala (WAT = UTC+1)
//   vercel.json cron: "30 22 * * *"  (22:30 UTC = 23:30 WAT)
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import PickModel, { Outcome, IPick } from "@/models/Picks";
import {
  getFixturesByIds,
  gradeResult,
  FINISHED_STATUSES,
} from "@/lib/apiFootball";

function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const log: string[] = [];
  const info = (msg: string) => { console.log(msg);  log.push(`✓ ${msg}`); };
  const warn = (msg: string) => { console.warn(msg); log.push(`⚠ ${msg}`); };

  try {
    await connectDB();

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const pendingPicks = await PickModel.find({
      outcome:       Outcome.PENDING,
      is_automated:  true,
      match_date:    { $lte: todayEnd },
      "matches.fixtureId": { $exists: true, $ne: null },
    }).lean();

    info(`Found ${pendingPicks.length} pending automated pick(s) to check`);
    if (pendingPicks.length === 0) {
      return NextResponse.json({ ok: true, message: "Nothing to grade", log });
    }

    // Collect all unique fixture IDs
    const allFixtureIds: number[] = [
      ...new Set(
        pendingPicks.flatMap((p) =>
          p.matches.map((m) => m.fixtureId).filter((id): id is number => !!id)
        )
      ),
    ];

    info(`Fetching results for ${allFixtureIds.length} fixture(s)`);
    const fixtureData = await getFixturesByIds(allFixtureIds);
    const fixtureMap  = new Map(fixtureData.map((f) => [f.fixture.id, f]));
    info(`Received data for ${fixtureMap.size} fixture(s)`);

    let gradedPickCount   = 0;
    let updatedMatchCount = 0;

    for (const pick of pendingPicks) {
      let pickFullyGraded = true;
      let anyLoss         = false;

      const updatedMatches = pick.matches.map((match) => {
        if (match.outcome !== Outcome.PENDING) {
          if (match.outcome === Outcome.LOSS) anyLoss = true;
          return match;
        }
        if (!match.fixtureId) { pickFullyGraded = false; return match; }

        const fixture = fixtureMap.get(match.fixtureId);
        if (!fixture) {
          warn(`Fixture ${match.fixtureId} not in API response`);
          pickFullyGraded = false;
          return match;
        }

        const status = fixture.fixture.status.short;
        if (!FINISHED_STATUSES.includes(status)) {
          info(`Fixture ${match.fixtureId} still live (${status}) — skip`);
          pickFullyGraded = false;
          return match;
        }

        const homeGoals =
          fixture.score.fulltime.home ??
          fixture.score.extratime.home ??
          fixture.goals.home;
        const awayGoals =
          fixture.score.fulltime.away ??
          fixture.score.extratime.away ??
          fixture.goals.away;

        if (homeGoals === null || awayGoals === null) {
          warn(`Fixture ${match.fixtureId} finished but no score — skip`);
          pickFullyGraded = false;
          return match;
        }

        const tip     = match.tip ?? extractTipFromPrediction(match.prediction);
        const outcome = gradeResult(tip, homeGoals, awayGoals);
        const score   = `${homeGoals}-${awayGoals}`;

        updatedMatchCount++;
        info(`Graded fixture ${match.fixtureId}: ${tip} @ ${score} → ${outcome}`);
        if (outcome === Outcome.LOSS) anyLoss = true;

        return { ...match, outcome, score };
      });

      const pickOutcome: Outcome = pickFullyGraded
        ? anyLoss ? Outcome.LOSS : Outcome.WIN
        : Outcome.PENDING;

      const changed =
        updatedMatches.some((m, i) => m.outcome !== pick.matches[i]?.outcome) ||
        pickOutcome !== pick.outcome;

      if (changed) {
        await PickModel.updateOne(
          { _id: pick._id },
          { $set: { matches: updatedMatches, outcome: pickOutcome } }
        );
        if (pickOutcome !== Outcome.PENDING) {
          gradedPickCount++;
          info(`Pick "${pick.title}" resolved as ${pickOutcome}`);
        }
      }
    }

    info(`Done — graded ${gradedPickCount} pick(s), updated ${updatedMatchCount} match(es)`);
    return NextResponse.json({
      ok: true,
      gradedPicks:    gradedPickCount,
      updatedMatches: updatedMatchCount,
      log,
    });
  } catch (err) {
    console.error("grade-picks cron error:", err);
    return NextResponse.json({ ok: false, error: String(err), log }, { status: 500 });
  }
}

function extractTipFromPrediction(prediction: string): string {
  // Handles both "— 1 @ 1.55" and "— 1X @ 1.30 | UCL | conf:72"
  const match = prediction.match(/—\s*([^\s@|]+)/);
  return match?.[1] ?? "1";
}