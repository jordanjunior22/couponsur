// ─── lib/soccervital.ts ──────────────────────────────────────────────────────
// Scrapes SoccerVital for today's predicted tips + published odds.
//
// SoccerVital's table layout (confirmed by inspecting the live page) is:
//   [0] time  [1] home  [2] away  [3] odd-1  [4] odd-X  [5] odd-2
//   [6] tip (1X2/DC/etc.)  [7] goals (O/U)  [8] predicted score
//
// The 1/X/2 columns are real published decimal odds (SoccerVital's own
// explainer confirms "1 @ 2.15" style odds in European decimal format).
// These are NOT live bookmaker odds — they're SoccerVital's own quoted
// figures — but they are real numbers from the site, not invented.
// ─────────────────────────────────────────────────────────────────────────────

import * as cheerio from "cheerio";

export interface SoccerVitalPrediction {
  home:   string;
  away:   string;
  tip:    string;
  goals:  string;  // "O" (Over 2.5) | "U" (Under 2.5) | ""
  league: string;
  odd1:   number | null; // published odd for Home win
  oddX:   number | null; // published odd for Draw
  odd2:   number | null; // published odd for Away win
}

let _cache: { data: SoccerVitalPrediction[]; ts: number } | null = null;
const CACHE_TTL = 30 * 60 * 1000;

export async function getSoccerVitalPredictions(): Promise<SoccerVitalPrediction[]> {
  if (_cache && Date.now() - _cache.ts < CACHE_TTL) return _cache.data;

  try {
    const res = await fetch("https://www.soccervital.com/", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      next: { revalidate: 1800 },
    });

    if (!res.ok) return [];

    const html = await res.text();
    const $ = cheerio.load(html);
    const predictions: SoccerVitalPrediction[] = [];
    let currentLeague = "Unknown";

    $("table tr").each((_, row) => {
      const cells = $(row).find("td");

      if (cells.length < 9) {
        const leagueLink = $(row).find("a[href*='table-']");
        if (leagueLink.length > 0) {
          const n = leagueLink.text().trim();
          if (n) currentLeague = n;
        }
        return;
      }

      const time  = $(cells[0]).text().trim();
      const home  = $(cells[1]).text().trim();
      const away  = $(cells[2]).text().trim();
      const odd1  = parseOdd($(cells[3]).text());
      const oddX  = parseOdd($(cells[4]).text());
      const odd2  = parseOdd($(cells[5]).text());
      const tip   = $(cells[6]).text().trim().replace(/\*/g, "").trim();
      const goals = $(cells[7])?.text().trim() || "";

      if (!home || !away || !/^\d{1,2}:\d{2}$/.test(time)) return;

      predictions.push({ home, away, tip, goals, league: currentLeague, odd1, oddX, odd2 });
    });

    _cache = { data: predictions, ts: Date.now() };
    return predictions;
  } catch (e) {
    console.warn("SoccerVital scrape failed:", e);
    return [];
  }
}

function parseOdd(raw: string): number | null {
  const n = parseFloat(raw.trim());
  return Number.isFinite(n) && n > 1 ? n : null;
}

function normName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\b(fc|cf|sc|ac|as|us|afc|fk)\b/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

function teamMatch(a: string, b: string): boolean {
  const na = normName(a);
  const nb = normName(b);
  if (na === nb) return true;
  const s = na.length < nb.length ? na : nb;
  const l = na.length < nb.length ? nb : na;
  return s.length >= 4 && l.includes(s);
}

export function crossValidateVital(
  homeName: string,
  awayName: string,
  tip: string,
  predictions: SoccerVitalPrediction[]
): boolean {
  const t = tip.toUpperCase();
  for (const p of predictions) {
    if (teamMatch(p.home, homeName) && teamMatch(p.away, awayName)) {
      const pt = p.tip.toUpperCase();
      if (pt === t) return true;
      if ((t === "1" && pt === "1X") || (t === "1X" && pt === "1")) return true;
      if ((t === "2" && pt === "X2") || (t === "X2" && pt === "2")) return true;
    }
  }
  return false;
}