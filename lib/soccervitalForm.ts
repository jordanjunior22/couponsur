// ─── lib/soccervitalForm.ts ──────────────────────────────────────────────────
// Scrapes each league's "Latest results" table from SoccerVital's league page.
// Exposes both:
//   - getLeagueForm(): aggregated last-5 win/loss form per team (used by
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
      let formStr = "";
      for (const m of ms) {
        const isHome = normName(m.home) === key;
        const won = isHome ? m.homeGoals > m.awayGoals : m.awayGoals > m.homeGoals;
        const drew = m.homeGoals === m.awayGoals;
        if (won) { wins++; formStr += "W"; }
        else if (drew) formStr += "D";
        else formStr += "L";
      }
      form.set(key, { played: ms.length, wins, form: formStr });
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

/** Find a specific match's result by fuzzy team-name match */
export function findMatchResult(
  home: string,
  away: string,
  results: RawResult[]
): RawResult | null {
  for (const r of results) {
    if (teamMatch(r.home, home) && teamMatch(r.away, away)) return r;
  }
  return null;
}