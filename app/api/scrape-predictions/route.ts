// ─── app/api/scrape-predictions/route.ts ─────────────────────────────────────
// Returns merged predictions from SoccerVital and SoccerVista.
// Used by the admin dashboard import modal.
// Cached for 30 min by Next.js.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { getSoccerVitalPredictions } from "@/lib/soccervital";
import { getSoccerVistaPredictions } from "@/lib/soccervista";

export async function GET() {
  try {
    const [vitalRaw, vistaRaw] = await Promise.all([
      getSoccerVitalPredictions().catch(() => []),
      getSoccerVistaPredictions().catch(() => []),
    ]);

    // Enrich SoccerVital entries with cross-validation flag from Vista
    const matches = vitalRaw.map((v) => {
      const vistaMatch = vistaRaw.find(
        (vs) =>
          normTeam(vs.home) === normTeam(v.home) &&
          normTeam(vs.away) === normTeam(v.away)
      );
      const agreeVista = vistaMatch?.tip?.toUpperCase() === v.tip?.toUpperCase();
      const goalsLabel =
        v.goals === "O" ? "Over 2.5" : v.goals === "U" ? "Under 2.5" : v.goals;
      const cvStr = agreeVista ? " [✓Vista]" : "";
      return {
        home:       v.home,
        away:       v.away,
        tip:        v.tip,
        goals:      v.goals,
        league:     v.league,
        agreeVista,
        prediction: `${v.home} vs ${v.away} — Tip: ${v.tip}${goalsLabel ? ` | Goals: ${goalsLabel}` : ""}${cvStr}`,
      };
    });

    const byLeague: Record<string, typeof matches> = {};
    for (const m of matches) {
      if (!byLeague[m.league]) byLeague[m.league] = [];
      byLeague[m.league].push(m);
    }

    return NextResponse.json({
      matches,
      byLeague,
      total:     matches.length,
      vistaOnly: vistaRaw.length,
      scrapedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Scrape error:", err);
    return NextResponse.json(
      { error: "Scraping failed. Sources may be blocking or HTML changed." },
      { status: 500 }
    );
  }
}

function normTeam(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]/g, "");
}