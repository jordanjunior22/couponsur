// ─── lib/soccervitalForm.ts ──────────────────────────────────────────────────
// Scrapes each league's "Latest results" table from SoccerVital's league page.
// Exposes both:
//   - getLeagueForm(): aggregated last-5 win/draw/loss form per team (used by
//     predictionEngine.ts for confidence scoring)
//   - getLeagueResults(): the raw match list with scores (used by
//     app/api/cron/grade-picks/route.ts to grade finished picks)
// Both share the same fetch + parse + cache so a league page is only
// scraped once per cache window regardless of which is called.
//
// Confirmed real table structure (via direct inspection):
//   Header row: ['date', '', 'home team', '', 'away team']
//   Data row:   ['03 Jul', 'FT', 'Yunnan Yukun', '2 : 1', 'Henan Jianye']
// The table is identified by its own header row text ("home team" +
// "away team"), not by proximity to a heading — those aren't DOM siblings
// on the real page.
// ─────────────────────────────────────────────────────────────────────────────

import * as cheerio from "cheerio";

export interface TeamForm {
  played: number;
  wins: number;
  /** Explicit counts alongside `wins` — previously only `wins`/`played`
   *  were tracked, which meant a team that draws constantly (DDDDD, 0%
   *  win rate) and a team that loses constantly (LLLLL, 0% win rate)
   *  scored identically in formGapScore. That collapsed a real distinction:
   *  "doesn't win much" is not the same signal as "loses a lot". */
  draws: number;
  losses: number;
  form: string; // e.g. "WLDWW", most recent first
}

export interface RawResult {
  date: string;   // as displayed on the page, e.g. "03 Jul" — no year given
  home: string;
  away: string;
  homeGoals: number;
  awayGoals: number;
}

interface LeagueCacheEntry {
  results: RawResult[];
  form: Map<string, TeamForm>;
  ts: number;
}

const _cache: Map<string, LeagueCacheEntry> = new Map();
const CACHE_TTL = 3 * 60 * 60 * 1000; // 3 hours

// Tolerance window (in days) when matching a stored match date against a
// scraped result's date. Games are usually graded within a day or two of
// match_date, and the results table has no year, so we don't need this
// wide — just enough to absorb timezone rounding, not enough to risk
// catching a genuinely different fixture between the same two teams.
const DATE_MATCH_TOLERANCE_DAYS = 2;

const MONTH_MAP: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

export function slugifyLeague(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9à-ÿ]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\b(fc|cf|sc|ac|as|us|afc|fk)\b/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

export function teamMatch(a: string, b: string): boolean {
  const na = normName(a);
  const nb = normName(b);
  if (na === nb) return true;
  const s = na.length < nb.length ? na : nb;
  const l = na.length < nb.length ? nb : na;
  return s.length >= 4 && l.includes(s);
}

/**
 * Parses a result's day/month string (e.g. "03 Jul", no year) into a real
 * Date, using `referenceDate` to infer the year — picking whichever of
 * (referenceYear - 1, referenceYear, referenceYear + 1) puts the parsed
 * date closest to referenceDate. This correctly handles picks graded
 * shortly after a year boundary without needing SoccerVital to publish a
 * year at all.
 */
function parseResultDate(raw: string, referenceDate: Date): Date | null {
  const match = raw.trim().match(/^(\d{1,2})\s+([A-Za-z]{3,})/);
  if (!match) return null;

  const day = parseInt(match[1], 10);
  const monthKey = match[2].slice(0, 3).toLowerCase();
  const month = MONTH_MAP[monthKey];
  if (month === undefined || Number.isNaN(day)) return null;

  const refYear = referenceDate.getFullYear();
  let best: Date | null = null;
  let bestDiff = Infinity;

  for (const year of [refYear - 1, refYear, refYear + 1]) {
    const candidate = new Date(year, month, day, 12, 0, 0);
    const diff = Math.abs(candidate.getTime() - referenceDate.getTime());
    if (diff < bestDiff) {
      bestDiff = diff;
      best = candidate;
    }
  }

  return best;
}

function daysBetween(a: Date, b: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.abs(a.getTime() - b.getTime()) / msPerDay;
}

async function fetchAndParseLeague(leagueName: string): Promise<LeagueCacheEntry> {
  const slug = slugifyLeague(leagueName);
  const url = `https://www.soccervital.com/table-${slug}-soccer-results-and-prediction.html`;
  const empty: LeagueCacheEntry = { results: [], form: new Map(), ts: Date.now() };

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        Accept: "text/html,application/xhtml+xml",
      },
      next: { revalidate: 10800 },
    });

    if (!res.ok) return empty;

    const html = await res.text();
    const $ = cheerio.load(html);

    let resultsTable: any = null;
    $("table").each((_, table) => {
      const headerCells = $(table)
        .find("tr")
        .first()
        .find("td, th")
        .map((_, c) => $(c).text().trim().toLowerCase())
        .get();
      if (
        headerCells.some((t) => t.includes("home team")) &&
        headerCells.some((t) => t.includes("away team"))
      ) {
        resultsTable = table;
      }
    });

    if (!resultsTable) return empty;

    const results: RawResult[] = [];
    $(resultsTable)
      .find("tr")
      .each((_, row) => {
        const cells = $(row).find("td");
        if (cells.length < 5) return;

        const date  = $(cells[0]).text().trim();
        const home  = $(cells[2]).text().trim();
        const scoreText = $(cells[3]).text().trim();
        const away  = $(cells[4]).text().trim();

        const scoreMatch = scoreText.match(/(\d+)\s*:\s*(\d+)/);
        if (!home || !away || !scoreMatch) return; // header row skipped naturally

        results.push({
          date,
          home,
          away,
          homeGoals: parseInt(scoreMatch[1], 10),
          awayGoals: parseInt(scoreMatch[2], 10),
        });
      });

    // Aggregate last-5 form per team from the same raw results (most-recent-first)
    const teamMatches = new Map<string, RawResult[]>();
    for (const m of results) {
      const hKey = normName(m.home);
      const aKey = normName(m.away);
      if (!teamMatches.has(hKey)) teamMatches.set(hKey, []);
      if (!teamMatches.has(aKey)) teamMatches.set(aKey, []);
      if (teamMatches.get(hKey)!.length < 5) teamMatches.get(hKey)!.push(m);
      if (teamMatches.get(aKey)!.length < 5) teamMatches.get(aKey)!.push(m);
    }

    const form = new Map<string, TeamForm>();
    for (const [key, ms] of teamMatches) {
      let wins = 0;
      let draws = 0;
      let losses = 0;
      let formStr = "";
      for (const m of ms) {
        const isHome = normName(m.home) === key;
        const won = isHome ? m.homeGoals > m.awayGoals : m.awayGoals > m.homeGoals;
        const drew = m.homeGoals === m.awayGoals;
        if (won) { wins++; formStr += "W"; }
        else if (drew) { draws++; formStr += "D"; }
        else { losses++; formStr += "L"; }
      }
      form.set(key, { played: ms.length, wins, draws, losses, form: formStr });
    }

    return { results, form, ts: Date.now() };
  } catch (e) {
    console.warn(`SoccerVital league scrape failed for "${leagueName}":`, e);
    return empty;
  }
}

async function getLeagueData(leagueName: string): Promise<LeagueCacheEntry> {
  const slug = slugifyLeague(leagueName);
  const cached = _cache.get(slug);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached;

  const fresh = await fetchAndParseLeague(leagueName);
  _cache.set(slug, fresh);
  return fresh;
}

export async function getLeagueForm(leagueName: string): Promise<Map<string, TeamForm>> {
  return (await getLeagueData(leagueName)).form;
}

export async function getLeagueResults(leagueName: string): Promise<RawResult[]> {
  return (await getLeagueData(leagueName)).results;
}

export function lookupTeamForm(
  teamName: string,
  formMap: Map<string, TeamForm>
): TeamForm | null {
  const key = normName(teamName);
  if (formMap.has(key)) return formMap.get(key)!;

  for (const [mapKey, form] of formMap) {
    const shortest = key.length < mapKey.length ? key : mapKey;
    const longest = key.length < mapKey.length ? mapKey : key;
    if (shortest.length >= 4 && longest.includes(shortest)) return form;
  }
  return null;
}

/**
 * Find a specific match's result by fuzzy team-name match, disambiguated
 * by date when `targetDate` is provided.
 *
 * - If targetDate is given: only candidates within DATE_MATCH_TOLERANCE_DAYS
 *   are considered, and the closest one wins. This is what prevents two
 *   teams meeting again later in the season from silently overwriting an
 *   earlier fixture's grade.
 * - If targetDate is omitted (e.g. legacy picks saved before `date` existed
 *   on matches): falls back to the old team-name-only behavior, returning
 *   the first match found — same as before, so old ungraded picks don't
 *   get stuck forever.
 */
export function findMatchResult(
  home: string,
  away: string,
  results: RawResult[],
  targetDate?: Date | null
): RawResult | null {
  const candidates = results.filter(
    (r) => teamMatch(r.home, home) && teamMatch(r.away, away)
  );
  if (candidates.length === 0) return null;

  if (!targetDate) {
    return candidates[0]; // legacy fallback — no date to disambiguate with
  }

  let best: RawResult | null = null;
  let bestDiff = Infinity;

  for (const r of candidates) {
    const parsed = parseResultDate(r.date, targetDate);
    if (!parsed) continue;
    const diff = daysBetween(parsed, targetDate);
    if (diff <= DATE_MATCH_TOLERANCE_DAYS && diff < bestDiff) {
      bestDiff = diff;
      best = r;
    }
  }

  return best;
}