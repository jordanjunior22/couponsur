// ─── app/api/cron/grade-picks/route.ts ────────────────────────────────────────
//
// WHAT IT DOES:
//   1. Finds all PENDING picks whose match_date has passed (i.e. games
//      should have finished by now).
//   2. For each match inside those picks, looks up the final score by
//      re-scraping that match's league page on SoccerVital (the same
//      "Latest results" table used for form scoring — see soccervitalForm.ts)
//      and fuzzy-matching team names.
//   3. Grades each leg (WIN/LOSS) using gradeHelpers.ts, and grades the
//      overall combo (WIN only if every leg wins; LOSS if any leg loses;
//      stays PENDING if any leg's result still can't be found).
//   4. Saves updated outcomes/scores back to Mongo.
//
// LIMITATIONS (be aware of these):
//   - No fixture ID exists for scraped picks, so matching relies on fuzzy
//     team-name comparison within the stored league. If a match isn't found
//     in that league's "Latest results" table (e.g. postponed, or the table
//     only keeps a short window of recent results, or league-slug mismatch),
//     it stays PENDING and needs manual grading via the tick-outcome route.
//   - SoccerVital's results table doesn't include a year, only a day/month
//     — for older PENDING picks this could theoretically misfire across a
//     year boundary. Not a concern for near-term grading (typical use case).
//   - This does NOT touch is_manually_graded picks — those are considered
//     final once ticked by a human.
//
// WHEN TO RUN: a few hours after match_date, once games should be finished
//   (e.g. suggested cron: run at 23:00 WAT covering that day's matches, or
//   the following morning before the next day's morning-picks run).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import PickModel, { Outcome } from "@/models/Picks";
import { getLeagueResults, findMatchResult } from "@/lib/soccervitalForm";
import { gradeTip, comboOutcome } from "@/lib/gradeHelpers";

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

    const now = new Date();
    const pendingPicks = await PickModel.find({
      outcome: Outcome.PENDING,
      is_manually_graded: { $ne: true },
      match_date: { $lte: now },
    });

    info(`${pendingPicks.length} pending pick(s) with a match_date in the past`);

    if (pendingPicks.length === 0) {
      return NextResponse.json({ ok: true, message: "Nothing to grade", log });
    }

    // Cache league results within this run so multiple picks sharing a
    // league only trigger one scrape each.
    const leagueResultsCache = new Map<string, Awaited<ReturnType<typeof getLeagueResults>>>();
    const getResultsCached = async (league: string) => {
      if (!leagueResultsCache.has(league)) {
        leagueResultsCache.set(league, await getLeagueResults(league));
      }
      return leagueResultsCache.get(league)!;
    };

    let gradedPicks = 0;
    let stillPending = 0;

    for (const pick of pendingPicks) {
      let anyUpdated = false;

      for (const match of pick.matches) {
        if (match.outcome !== Outcome.PENDING) continue; // already graded (e.g. manually)
        if (!match.home || !match.away || !match.league) {
          warn(`Pick ${pick._id}: match missing home/away/league — needs manual grading`);
          continue;
        }

        const results = await getResultsCached(match.league);
        const result = findMatchResult(match.home, match.away, results);

        if (!result) continue; // not found yet — leave PENDING, try again next run

        const outcome = gradeTip(match.tip ?? "", result.homeGoals, result.awayGoals);
        match.outcome = outcome as Outcome;
        match.score = `${result.homeGoals}:${result.awayGoals}`;
        anyUpdated = true;
      }

      const legOutcomes = pick.matches.map((m) => m.outcome as "PENDING" | "WIN" | "LOSS");
      const overall = comboOutcome(legOutcomes);

      if (overall !== "PENDING") {
        pick.outcome = overall as Outcome;
        pick.graded_at = new Date();
        gradedPicks++;
        info(`Graded pick ${pick._id} ("${pick.title}") → ${overall}`);
      } else {
        stillPending++;
        if (anyUpdated) info(`Pick ${pick._id}: some legs graded, still awaiting others`);
      }

      if (anyUpdated || overall !== "PENDING") {
        await pick.save();
      }
    }

    info(`${gradedPicks} pick(s) fully graded, ${stillPending} still awaiting results`);

    return NextResponse.json({
      ok: true,
      gradedPicks,
      stillPending,
      totalChecked: pendingPicks.length,
      log,
    });
  } catch (err) {
    console.error("grade-picks cron error:", err);
    return NextResponse.json({ ok: false, error: String(err), log }, { status: 500 });
  }
}