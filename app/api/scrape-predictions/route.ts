// ─── app/api/scrape-predictions/route.ts ────────────────────────────────────
// Place this file at: app/api/scrape-predictions/route.ts
// Install dependency: npm install cheerio
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import * as cheerio from "cheerio";

export interface ScrapedMatch {
  time: string;       // e.g. "14:30"
  home: string;       // e.g. "Bayern Munich"
  away: string;       // e.g. "Cologne"
  odd1: string;       // Home win odds
  oddX: string;       // Draw odds
  odd2: string;       // Away win odds
  tip: string;        // e.g. "1", "X2", "1X"
  goals: string;      // e.g. "O" (Over) or "U" (Under)
  league: string;     // e.g. "Germany Bundesliga I"
  prediction: string; // Full formatted string for the match subdoc
}

export async function GET() {
  try {
    const res = await fetch("https://www.soccervital.com/", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      // Cache for 30 minutes so you don't hammer their server
      next: { revalidate: 1800 },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Failed to fetch SoccerVital: ${res.status}` },
        { status: 502 }
      );
    }

    const html = await res.text();
    const $ = cheerio.load(html);
    const matches: ScrapedMatch[] = [];
    let currentLeague = "Unknown";

    // The main table contains alternating league header rows and match rows
    $("table tr").each((_, row) => {
      const cells = $(row).find("td");

      // ── League header row: has a link with league name ──────────────────
      // These rows typically have fewer cells and contain a league link
      if (cells.length < 7) {
        const leagueLink = $(row).find("a[href*='table-']");
        if (leagueLink.length > 0) {
          const leagueName = leagueLink.text().trim();
          if (leagueName) currentLeague = leagueName;
        }
        return; // skip to next row
      }

      // ── Match row: extract all columns ──────────────────────────────────
      const time  = $(cells[0]).text().trim();
      const home  = $(cells[1]).text().trim();
      const away  = $(cells[2]).text().trim();
      const odd1  = $(cells[3]).text().trim();
      const oddX  = $(cells[4]).text().trim();
      const odd2  = $(cells[5]).text().trim();
      const tip   = $(cells[6]).text().trim().replace(/\*/g, "").trim(); // remove bold markers
      const goals = $(cells[7])?.text().trim() || "";

      // Only include rows that look like a real match (time in HH:MM format)
      if (!home || !away || !/^\d{1,2}:\d{2}$/.test(time)) return;

      // Build a human-readable prediction string (maps to IMatch.prediction)
      const goalsLabel = goals === "O" ? "Over 2.5" : goals === "U" ? "Under 2.5" : goals;
      const prediction = `${home} vs ${away} — Tip: ${tip}${goalsLabel ? ` | Goals: ${goalsLabel}` : ""}`;

      matches.push({
        time,
        home,
        away,
        odd1,
        oddX,
        odd2,
        tip,
        goals,
        league: currentLeague,
        prediction,
      });
    });

    // Group by league for the frontend to display nicely
    const byLeague: Record<string, ScrapedMatch[]> = {};
    for (const m of matches) {
      if (!byLeague[m.league]) byLeague[m.league] = [];
      byLeague[m.league].push(m);
    }

    return NextResponse.json({
      matches,
      byLeague,
      total: matches.length,
      scrapedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Scrape error:", err);
    return NextResponse.json(
      { error: "Scraping failed. SoccerVital may be blocking requests or their HTML changed." },
      { status: 500 }
    );
  }
}