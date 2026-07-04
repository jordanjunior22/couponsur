// ─── scripts/test-grading.ts ─────────────────────────────────────────────────
//
// End-to-end test for the grading pipeline. Does three things:
//
//   1. UNIT CHECKS — runs gradeTip() and comboOutcome() against known
//      inputs to confirm the grading logic itself is correct.
//
//   2. LIVE INTEGRATION TEST — fetches a real league's "Latest results"
//      table from SoccerVital, picks an actual finished match, creates a
//      temporary test Pick in Mongo referencing that match with a PENDING
//      outcome and a past match_date, then calls your local
//      /api/cron/grade-picks endpoint and checks that the pick got graded
//      correctly against the real result. Cleans up the test pick after.
//
// RUN WITH:
//   npx tsx scripts/test-grading.ts
//
// REQUIRES:
//   - Your dev server running locally (npm run dev) on port 3000, since
//     this calls the real cron endpoint over HTTP rather than importing
//     the route handler directly (keeps the test honest — it exercises
//     the actual deployed code path, not a re-implementation of it).
//   - MONGODB_URI and CRON_SECRET (if set) available in your environment
//     (loaded the same way your app loads them — adjust the dotenv line
//     below if your project uses a different env file).
// ─────────────────────────────────────────────────────────────────────────────

import mongoose from "mongoose";
import { gradeTip, comboOutcome } from "../lib/gradeHelpers";
import { getLeagueResults } from "../lib/soccervitalForm";
import PickModel, { Outcome } from "../models/Picks";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";
const CRON_SECRET = process.env.CRON_SECRET; // optional, matches your route's guard

// ─── 1. Unit checks ────────────────────────────────────────────────────────────

function runUnitChecks() {
  console.log("\n=== Unit checks: gradeTip() ===");

  const cases: Array<{ tip: string; home: number; away: number; expect: "WIN" | "LOSS" }> = [
    { tip: "1",    home: 2, away: 0, expect: "WIN" },
    { tip: "1",    home: 0, away: 2, expect: "LOSS" },
    { tip: "2",    home: 0, away: 2, expect: "WIN" },
    { tip: "X",    home: 1, away: 1, expect: "WIN" },
    { tip: "X",    home: 1, away: 0, expect: "LOSS" },
    { tip: "1X",   home: 1, away: 1, expect: "WIN" },
    { tip: "1X",   home: 0, away: 2, expect: "LOSS" },
    { tip: "X2",   home: 1, away: 1, expect: "WIN" },
    { tip: "X2",   home: 2, away: 0, expect: "LOSS" },
    { tip: "12",   home: 2, away: 1, expect: "WIN" },
    { tip: "12",   home: 1, away: 1, expect: "LOSS" },
    { tip: "O2.5", home: 2, away: 1, expect: "WIN" },
    { tip: "O2.5", home: 1, away: 1, expect: "LOSS" },
    { tip: "U2.5", home: 1, away: 1, expect: "WIN" },
    { tip: "U2.5", home: 2, away: 1, expect: "LOSS" },
  ];

  let pass = 0;
  for (const c of cases) {
    const result = gradeTip(c.tip, c.home, c.away);
    const ok = result === c.expect;
    if (ok) pass++;
    console.log(
      `  ${ok ? "✓" : "✗ FAIL"} tip=${c.tip.padEnd(6)} score=${c.home}:${c.away}  got=${result}  expected=${c.expect}`
    );
  }
  console.log(`  ${pass}/${cases.length} passed`);

  console.log("\n=== Unit checks: comboOutcome() ===");
  const comboCases: Array<{ legs: Array<"PENDING" | "WIN" | "LOSS">; expect: "PENDING" | "WIN" | "LOSS" }> = [
    { legs: ["WIN", "WIN", "WIN"], expect: "WIN" },
    { legs: ["WIN", "LOSS", "WIN"], expect: "LOSS" },
    { legs: ["WIN", "PENDING", "WIN"], expect: "PENDING" },
    { legs: ["LOSS", "PENDING"], expect: "LOSS" }, // any loss fails the combo immediately
  ];
  let comboPass = 0;
  for (const c of comboCases) {
    const result = comboOutcome(c.legs);
    const ok = result === c.expect;
    if (ok) comboPass++;
    console.log(`  ${ok ? "✓" : "✗ FAIL"} legs=[${c.legs.join(",")}]  got=${result}  expected=${c.expect}`);
  }
  console.log(`  ${comboPass}/${comboCases.length} passed`);

  return pass === cases.length && comboPass === comboCases.length;
}

// ─── 2. Live integration test ──────────────────────────────────────────────────

async function runIntegrationTest() {
  console.log("\n=== Integration test: real match + live grade-picks endpoint ===");

  const TEST_LEAGUE = "China Super League"; // known to have a recent results table
  console.log(`Fetching real results for "${TEST_LEAGUE}"...`);

  const results = await getLeagueResults(TEST_LEAGUE);
  if (results.length === 0) {
    console.log("  ✗ No results found for test league — check soccervitalForm.ts / league slug, aborting integration test.");
    return false;
  }

  const realMatch = results[0]; // most recent finished match
  console.log(`  Using real finished match: ${realMatch.home} ${realMatch.homeGoals}:${realMatch.awayGoals} ${realMatch.away}`);

  // Pick a tip we can predict the correct grade for, based on the real score
  const homeWon = realMatch.homeGoals > realMatch.awayGoals;
  const testTip = homeWon ? "1" : "2";
  const expectedOutcome: "WIN" = "WIN"; // we deliberately chose the tip that SHOULD win

  console.log(`  process.env.MONGODB_URI is ${process.env.MONGODB_URI ? `SET (length ${process.env.MONGODB_URI.length})` : "NOT SET"}`);

  if (!process.env.MONGODB_URI) {
    console.log("  ✗ MONGO_URI is not set in process.env after loading .env.local.");
    console.log("    Check that .env.local actually contains a line like: MONGO_URI=mongodb+srv://...");
    console.log("    (dotenv reported 'injected env (0)' last run, which can mean the file has no parseable KEY=VALUE lines,");
    console.log("     or the values are already present elsewhere in your environment.)");
    return false;
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("  Connected to MongoDB");

  const testPick = await PickModel.create({
    title: "TEST — grading verification (safe to delete)",
    price: 100,
    total_odds: 1.50,
    is_estimated_odds: false,
    match_date: new Date(Date.now() - 24 * 60 * 60 * 1000), // yesterday, so it's picked up by the cron's "past match_date" filter
    league: TEST_LEAGUE,
    outcome: Outcome.PENDING,
    is_published: false, // don't show this test pick to real users
    is_automated: false,
    matches: [
      {
        prediction: `${realMatch.home} v ${realMatch.away} | ${testTip} | 1.50`,
        outcome: Outcome.PENDING,
        tip: testTip,
        home: realMatch.home,
        away: realMatch.away,
        league: TEST_LEAGUE,
      },
    ],
  });

  console.log(`  Created test pick: ${testPick._id}`);

  try {
    console.log(`\n  Calling ${BASE_URL}/api/cron/grade-picks ...`);
    const headers: Record<string, string> = {};
    if (CRON_SECRET) headers["Authorization"] = `Bearer ${CRON_SECRET}`;

    const res = await fetch(`${BASE_URL}/api/cron/grade-picks`, { headers });
    const json = await res.json();
    console.log("  Response:", JSON.stringify(json, null, 2));

    const graded = await PickModel.findById(testPick._id);
    if (!graded) {
      console.log("  ✗ Test pick disappeared unexpectedly");
      return false;
    }

    console.log(`\n  Test pick after grading: outcome=${graded.outcome}, match.outcome=${graded.matches[0].outcome}, match.score=${graded.matches[0].score}`);

    const passed = graded.outcome === expectedOutcome && graded.matches[0].outcome === expectedOutcome;
    console.log(passed ? "  ✓ PASS — pick graded correctly against the real result" : "  ✗ FAIL — pick did not grade as expected");
    return passed;
  } finally {
    // Always clean up the test pick, pass or fail
    await PickModel.findByIdAndDelete(testPick._id);
    console.log(`  Cleaned up test pick ${testPick._id}`);
    await mongoose.disconnect();
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const unitsOk = runUnitChecks();
  const integrationOk = await runIntegrationTest();

  console.log("\n=== Summary ===");
  console.log(`Unit checks:        ${unitsOk ? "PASS" : "FAIL"}`);
  console.log(`Integration test:   ${integrationOk ? "PASS" : "FAIL"}`);

  if (!unitsOk || !integrationOk) process.exit(1);
}

main().catch((e) => {
  console.error("Test script crashed:", e);
  process.exit(1);
});