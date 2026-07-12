// ─── lib/soccervital.ts ──────────────────────────────────────────────────────
// Scrapes SoccerVital for a given day's predicted tips + published odds.
//
// SoccerVital's table layout (confirmed by inspecting the live page) is:
//   [0] time  [1] home  [2] away  [3] odd-1  [4] odd-X  [5] odd-2
//   [6] tip (1X2/DC/etc.)  [7] goals (O/U)  [8] predicted score
//
// The 1/X/2 columns are real published decimal odds (SoccerVital's own
// explainer confirms "1 @ 2.15" style odds in European decimal format).
// These are NOT live bookmaker odds — they're SoccerVital's own quoted
// figures — but they are real numbers from the site, not invented.
//
// DATE HANDLING: the bare homepage (https://www.soccervital.com/) renders
// "today" using a client-side jQuery UI datepicker (`#date_picker`) that
// fills itself in via JS using the VISITOR'S browser clock — this value
// never appears in the raw HTML we fetch, and more importantly, the
// server has no reliable way to know we wanted WAT's "today" specifically.
// This was the actual root cause of a real incident: the cron created
// picks dated for the 12th using fixtures that were really from the 11th,
// because we were trusting the server's own undocumented default instead
// of asking for a specific day.
//
// Confirmed via DevTools: changing the datepicker navigates to
//   https://www.soccervital.com/soccer-games/?date=DD-MM-YYYY
// We now always build this URL explicitly using WAT's current date, so
// there is no ambiguity about which day's fixtures we're getting.
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
  time:   string;        // raw kickoff time as scraped, e.g. "15:00"
}

interface CacheEntry {
  data: SoccerVitalPrediction[];
  ts: number;
}

// Cache is now keyed per requested date string, since we can (and do, via
// the admin import modal vs. the cron) request different days in the same
// process lifetime. A single shared cache keyed by nothing would silently
// return one day's data for a request meant for another.
const _cache: Map<string, CacheEntry> = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

/** Formats a Date as SoccerVital's expected DD-MM-YYYY query param. */
function formatDateParam(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

/**
 * Returns "today" in WAT (UTC+1), matching the timezone convention already
 * used by the cron (`today.setHours(today.getHours() + 1)`). Centralized
 * here so every caller computes "today" the same way instead of each
 * reimplementing the UTC+1 offset independently.
 */
export function getTodayWAT(): Date {
  const now = new Date();
  const wat = new Date(now.getTime() + 60 * 60 * 1000); // UTC+1
  return wat;
}

/**
 * Fetches predictions for a specific date. Defaults to "today" in WAT if
 * no date is given — but unlike the old version, this is now an EXPLICIT
 * default computed by us, not an implicit one decided by SoccerVital's
 * server based on its own clock/timezone.
 */
export async function getSoccerVitalPredictions(
  targetDate: Date = getTodayWAT()
): Promise<SoccerVitalPrediction[]> {
  const dateParam = formatDateParam(targetDate);
  const cacheKey = dateParam;

  const cached = _cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  try {
    const url = `https://www.soccervital.com/soccer-games/?date=${dateParam}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      // No Next.js fetch Data Cache here — we manage freshness ourselves
      // via the in-memory `_cache` above, keyed per date. A second,
      // independent cache layer on top would just reintroduce the same
      // kind of hidden-staleness risk we're fixing.
      cache: "no-store",
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

      predictions.push({ home, away, tip, goals, league: currentLeague, odd1, oddX, odd2, time });
    });

    _cache.set(cacheKey, { data: predictions, ts: Date.now() });
    return predictions;
  } catch (e) {
    console.warn(`SoccerVital scrape failed for date ${dateParam}:`, e);
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