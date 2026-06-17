// ─── lib/apiFootball.ts ─────────────────────────────────────────────────────
// Production-grade wrapper around API-Football v3
// Supports: 1X2, stats, form, H2H, World Cup & major internationals
// ─────────────────────────────────────────────────────────────────────────────

const BASE = "https://v3.football.api-sports.io";

// ─── League IDs ───────────────────────────────────────────────────────────────
export const LEAGUE_IDS = {
  // Club leagues
  premier_league:  39,
  la_liga:        140,
  bundesliga:      78,
  serie_a:        135,
  ligue_1:         61,
  champions_league: 2,
  europa_league:    3,
  europa_conference: 848,
  mls:            253,
  eredivisie:      88,
  primeira_liga:   94,
  super_lig:       203,
  brasileirao:      71,
  saudi_pro:       307,
  // International tournaments
  world_cup:        1,
  euro:            4,
  copa_america:    9,
  afcon:           6,
  nations_league:  5,
  world_cup_qual_europe: 32,
  world_cup_qual_africa: 29,
  world_cup_qual_asia:   36,
  world_cup_qual_conmebol: 35,
  club_world_cup:  15,
} as const;

export const CURRENT_SEASON = 2024; // 2024/25 season

export const BOOKMAKER_1XBET  = 8;
export const BOOKMAKER_BET365 = 6;
export const BET_MATCH_WINNER = 1;
export const BET_BTTS         = 8;
export const BET_OVER_UNDER_25 = 5;

export const FINISHED_STATUSES = ["FT", "AET", "PEN", "AWD", "WO"];

// ─── League labels ────────────────────────────────────────────────────────────
export const LEAGUE_LABEL: Record<number, string> = {
  [LEAGUE_IDS.premier_league]:  "Premier League",
  [LEAGUE_IDS.la_liga]:         "La Liga",
  [LEAGUE_IDS.bundesliga]:      "Bundesliga",
  [LEAGUE_IDS.serie_a]:         "Serie A",
  [LEAGUE_IDS.ligue_1]:         "Ligue 1",
  [LEAGUE_IDS.champions_league]:"UCL",
  [LEAGUE_IDS.europa_league]:   "UEL",
  [LEAGUE_IDS.europa_conference]:"UECL",
  [LEAGUE_IDS.mls]:             "MLS",
  [LEAGUE_IDS.eredivisie]:      "Eredivisie",
  [LEAGUE_IDS.primeira_liga]:   "Primeira Liga",
  [LEAGUE_IDS.super_lig]:       "Süper Lig",
  [LEAGUE_IDS.brasileirao]:     "Brasileirão",
  [LEAGUE_IDS.saudi_pro]:       "Saudi Pro League",
  [LEAGUE_IDS.world_cup]:       "World Cup",
  [LEAGUE_IDS.euro]:            "EURO",
  [LEAGUE_IDS.copa_america]:    "Copa América",
  [LEAGUE_IDS.afcon]:           "AFCON",
  [LEAGUE_IDS.nations_league]:  "Nations League",
  [LEAGUE_IDS.world_cup_qual_europe]: "WC Qualifiers",
  [LEAGUE_IDS.world_cup_qual_africa]: "WC Qualifiers",
  [LEAGUE_IDS.world_cup_qual_asia]:   "WC Qualifiers",
  [LEAGUE_IDS.world_cup_qual_conmebol]:"WC Qualifiers",
  [LEAGUE_IDS.club_world_cup]:  "Club World Cup",
};

// ─── Types ────────────────────────────────────────────────────────────────────
export interface APIFixture {
  fixture: {
    id: number;
    date: string;
    status: { short: string; long: string; elapsed: number | null };
    referee: string | null;
  };
  league: { id: number; name: string; country: string; season: number };
  teams: {
    home: { id: number; name: string; logo: string };
    away: { id: number; name: string; logo: string };
  };
  goals: { home: number | null; away: number | null };
  score: {
    halftime:  { home: number | null; away: number | null };
    fulltime:  { home: number | null; away: number | null };
    extratime: { home: number | null; away: number | null };
    penalty:   { home: number | null; away: number | null };
  };
}

export interface APITeamStats {
  fixtures: {
    played: { total: number; home: number; away: number };
    wins:   { total: number; home: number; away: number };
    draws:  { total: number; home: number; away: number };
    loses:  { total: number; home: number; away: number };
  };
  goals: {
    for:     { total: { total: number; home: number; away: number }; average: { total: string; home: string; away: string } };
    against: { total: { total: number; home: number; away: number }; average: { total: string; home: string; away: string } };
  };
  form: string; // last N results e.g. "WWLDW"
  clean_sheet: { total: number; home: number; away: number };
  failed_to_score: { total: number; home: number; away: number };
}

export interface APIH2H {
  fixture: APIFixture["fixture"];
  league:  APIFixture["league"];
  teams:   APIFixture["teams"];
  goals:   APIFixture["goals"];
  score:   APIFixture["score"];
}

export interface APIOdds {
  fixture: { id: number };
  bookmakers: Array<{
    id: number;
    name: string;
    bets: Array<{
      id: number;
      name: string;
      values: Array<{ value: string; odd: string }>;
    }>;
  }>;
}

export interface APIResponse<T> {
  results: number;
  errors: Record<string, string> | string[];
  paging:  { current: number; total: number };
  response: T[];
}

// ─── Confidence score breakdown (returned alongside a pick selection) ─────────
export interface ConfidenceBreakdown {
  oddsScore:    number; // 0–30 — tighter favourite odd = higher score
  formScore:    number; // 0–25 — recent form (last 5)
  statsScore:   number; // 0–25 — goals for/against, clean sheets
  h2hScore:     number; // 0–15 — head-to-head history
  crossValScore:number; // 0–5  — bonus if SoccerVista agrees
  total:        number; // 0–100
}

// ─── Core fetch ───────────────────────────────────────────────────────────────
async function apiFetch<T>(
  endpoint: string,
  params: Record<string, string | number> = {}
): Promise<T[]> {
  const apiKey = process.env.APIFOOTBALL_KEY;
  if (!apiKey) throw new Error("APIFOOTBALL_KEY env var not set");

  const url = new URL(`${BASE}/${endpoint}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  const res = await fetch(url.toString(), {
    headers: { "x-apisports-key": apiKey, Accept: "application/json" },
    cache: "no-store",
  });

  if (!res.ok) throw new Error(`API-Football ${endpoint} → HTTP ${res.status}`);

  const json: APIResponse<T> = await res.json();
  const errCount = Array.isArray(json.errors)
    ? json.errors.length
    : Object.keys(json.errors).length;
  if (errCount > 0) throw new Error(`API-Football error: ${JSON.stringify(json.errors)}`);

  return json.response;
}

// ─── Public API helpers ───────────────────────────────────────────────────────

/** All fixtures for a given date across every tracked league */
export async function getFixturesByDate(date: string): Promise<APIFixture[]> {
  const leagueIds = Object.values(LEAGUE_IDS);
  const all: APIFixture[] = [];

  // Run league calls in parallel (batches of 5 to avoid hammering)
  const BATCH = 5;
  for (let i = 0; i < leagueIds.length; i += BATCH) {
    const batch = leagueIds.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map((leagueId) =>
        apiFetch<APIFixture>("fixtures", {
          league: leagueId,
          season: CURRENT_SEASON,
          date,
          timezone: "Africa/Douala",
        })
      )
    );
    for (const r of results) {
      if (r.status === "fulfilled") all.push(...r.value);
    }
  }
  return all;
}

/** 1X2 odds for a single fixture (tries 1xBet first, falls back to Bet365) */
export async function getOddsForFixture(fixtureId: number): Promise<APIOdds | null> {
  for (const bookmaker of [BOOKMAKER_1XBET, BOOKMAKER_BET365]) {
    try {
      const results = await apiFetch<APIOdds>("odds", {
        fixture:   fixtureId,
        bookmaker,
        bet: BET_MATCH_WINNER,
      });
      if (results[0]) return results[0];
    } catch { /* try next */ }
  }
  return null;
}

/** Team season stats (form, goals, clean sheets) */
export async function getTeamStats(
  teamId: number,
  leagueId: number
): Promise<APITeamStats | null> {
  try {
    const r = await apiFetch<APITeamStats>("teams/statistics", {
      team:   teamId,
      league: leagueId,
      season: CURRENT_SEASON,
    });
    return r[0] ?? null;
  } catch { return null; }
}

/** Last N H2H fixtures between two teams */
export async function getH2H(
  homeId: number,
  awayId: number,
  last = 10
): Promise<APIH2H[]> {
  try {
    return await apiFetch<APIH2H>("fixtures/headtohead", {
      h2h:  `${homeId}-${awayId}`,
      last,
    });
  } catch { return []; }
}

/** Single fixture by ID */
export async function getFixtureById(fixtureId: number): Promise<APIFixture | null> {
  try {
    const r = await apiFetch<APIFixture>("fixtures", { id: fixtureId });
    return r[0] ?? null;
  } catch { return null; }
}

/** Multiple fixtures by ID list (chunked to ≤20 per call) */
export async function getFixturesByIds(ids: number[]): Promise<APIFixture[]> {
  if (ids.length === 0) return [];
  const chunks: number[][] = [];
  for (let i = 0; i < ids.length; i += 20) chunks.push(ids.slice(i, i + 20));
  const all: APIFixture[] = [];
  for (const chunk of chunks) {
    try {
      const f = await apiFetch<APIFixture>("fixtures", { ids: chunk.join("-") });
      all.push(...f);
    } catch (e) { console.warn("getFixturesByIds chunk failed:", e); }
  }
  return all;
}

// ─── Odds helpers ─────────────────────────────────────────────────────────────

export function extract1X2(
  oddsData: APIOdds
): { odd1: number; oddX: number; odd2: number } | null {
  for (const bm of oddsData.bookmakers) {
    for (const bet of bm.bets) {
      if (bet.id === BET_MATCH_WINNER) {
        const home = bet.values.find((v) => v.value === "Home");
        const draw = bet.values.find((v) => v.value === "Draw");
        const away = bet.values.find((v) => v.value === "Away");
        if (home && draw && away) {
          return {
            odd1: parseFloat(home.odd),
            oddX: parseFloat(draw.odd),
            odd2: parseFloat(away.odd),
          };
        }
      }
    }
  }
  return null;
}

/** Determine the best tip + its odd from 1X2 values */
export function pickTip(
  odd1: number,
  oddX: number,
  odd2: number
): { tip: string; odd: number } {
  const options = [
    { tip: "1",  odd: odd1 },
    { tip: "2",  odd: odd2 },
  ];
  const favourite = options.reduce((a, b) => (a.odd < b.odd ? a : b));

  // Clear favourite in [1.25, 2.20] range
  if (favourite.odd >= 1.25 && favourite.odd <= 2.20) return favourite;

  // Double chance fallback
  if (odd1 < odd2) return { tip: "1X", odd: +(Math.sqrt(odd1 * oddX)).toFixed(2) };
  return { tip: "X2", odd: +(Math.sqrt(oddX * odd2)).toFixed(2) };
}

// ─── Statistical confidence scoring ──────────────────────────────────────────

/** Convert a form string like "WWLDW" to a 0–1 score (last 5 games) */
function formToScore(form: string): number {
  const last5 = form.slice(-5);
  let pts = 0;
  for (const c of last5) {
    if (c === "W") pts += 3;
    else if (c === "D") pts += 1;
  }
  return pts / 15; // max 15 pts → normalise to 0–1
}

/**
 * Full confidence scoring for a potential pick.
 * Returns a ConfidenceBreakdown with sub-scores and total (0–100).
 *
 * @param tip        The tip string ("1", "2", "1X", "X2")
 * @param odd        The decimal odd for the tip
 * @param homeStats  Season stats for the home team (may be null)
 * @param awayStats  Season stats for the away team (may be null)
 * @param h2h        Last H2H fixtures (may be empty)
 * @param crossVal   Whether SoccerVista agrees with this tip
 */
export function scoreConfidence(
  tip: string,
  odd: number,
  homeStats: APITeamStats | null,
  awayStats: APITeamStats | null,
  h2h: APIH2H[],
  crossVal: boolean
): ConfidenceBreakdown {
  // ── 1. Odds score (0–30) ─────────────────────────────────────────────────
  // Sweet spot: 1.30–1.65 → max score; falls off toward 2.20
  let oddsScore = 0;
  if (odd <= 1.65) oddsScore = 30;
  else if (odd <= 1.80) oddsScore = 25;
  else if (odd <= 2.00) oddsScore = 18;
  else if (odd <= 2.20) oddsScore = 12;
  else oddsScore = 5;

  // ── 2. Form score (0–25) ─────────────────────────────────────────────────
  let formScore = 0;
  const favouringHome = tip === "1" || tip === "1X";
  const favouringAway = tip === "2" || tip === "X2";

  if (favouringHome && homeStats?.form) {
    formScore = Math.round(formToScore(homeStats.form) * 25);
  } else if (favouringAway && awayStats?.form) {
    formScore = Math.round(formToScore(awayStats.form) * 25);
  } else if (homeStats?.form && awayStats?.form) {
    // Double-chance / draw scenarios: use average
    const hf = formToScore(homeStats.form);
    const af = formToScore(awayStats.form);
    formScore = Math.round(((hf + af) / 2) * 25);
  }

  // ── 3. Stats score (0–25) ────────────────────────────────────────────────
  let statsScore = 0;

  if (favouringHome && homeStats) {
    const played = homeStats.fixtures.played.home || 1;
    const winRate = homeStats.fixtures.wins.home / played;
    const goalsFor = parseFloat(homeStats.goals.for.average.home || "0");
    const goalsAgainst = parseFloat(homeStats.goals.against.average.home || "99");
    const cleanSheetRate = (homeStats.clean_sheet?.home ?? 0) / played;

    statsScore = Math.round(
      winRate * 12 +               // up to 12 pts for win rate
      Math.min(goalsFor / 3, 1) * 7 + // up to 7 pts for scoring
      (1 - Math.min(goalsAgainst / 3, 1)) * 4 + // up to 4 pts for defence
      cleanSheetRate * 2           // up to 2 pts for clean sheets
    );
  } else if (favouringAway && awayStats) {
    const played = awayStats.fixtures.played.away || 1;
    const winRate = awayStats.fixtures.wins.away / played;
    const goalsFor = parseFloat(awayStats.goals.for.average.away || "0");
    const goalsAgainst = parseFloat(awayStats.goals.against.average.away || "99");
    const cleanSheetRate = (awayStats.clean_sheet?.away ?? 0) / played;

    statsScore = Math.round(
      winRate * 12 +
      Math.min(goalsFor / 3, 1) * 7 +
      (1 - Math.min(goalsAgainst / 3, 1)) * 4 +
      cleanSheetRate * 2
    );
  } else if (homeStats && awayStats) {
    // Double-chance: average of both sides
    const hPlayed = homeStats.fixtures.played.total || 1;
    const aPlayed = awayStats.fixtures.played.total || 1;
    const hWR = homeStats.fixtures.wins.total / hPlayed;
    const aWR = awayStats.fixtures.wins.total / aPlayed;
    statsScore = Math.round(((hWR + aWR) / 2) * 25);
  }
  statsScore = Math.min(statsScore, 25);

  // ── 4. H2H score (0–15) ──────────────────────────────────────────────────
  let h2hScore = 0;
  if (h2h.length > 0) {
    const last = h2h.slice(0, 6); // last 6 meetings
    let wins = 0;
    for (const m of last) {
      const hg = m.goals.home ?? 0;
      const ag = m.goals.away ?? 0;
      if (favouringHome  && hg > ag) wins++;
      if (favouringAway  && ag > hg) wins++;
      if (tip === "1X"   && hg >= ag) wins++;
      if (tip === "X2"   && ag >= hg) wins++;
    }
    h2hScore = Math.round((wins / last.length) * 15);
  }

  // ── 5. Cross-validation bonus (0–5) ─────────────────────────────────────
  const crossValScore = crossVal ? 5 : 0;

  const total = Math.min(
    oddsScore + formScore + statsScore + h2hScore + crossValScore,
    100
  );

  return { oddsScore, formScore, statsScore, h2hScore, crossValScore, total };
}

// ─── Result grading ───────────────────────────────────────────────────────────

export function gradeResult(
  tip: string,
  homeGoals: number,
  awayGoals: number
): "WIN" | "LOSS" {
  const t = tip.toUpperCase();
  const homeWin = homeGoals > awayGoals;
  const awayWin = awayGoals > homeGoals;
  const draw    = homeGoals === awayGoals;

  if (t === "1")    return homeWin ? "WIN" : "LOSS";
  if (t === "2")    return awayWin ? "WIN" : "LOSS";
  if (t === "X")    return draw    ? "WIN" : "LOSS";
  if (t === "1X")   return homeWin || draw ? "WIN" : "LOSS";
  if (t === "X2")   return awayWin || draw ? "WIN" : "LOSS";
  if (t === "12")   return homeWin || awayWin ? "WIN" : "LOSS";
  if (t === "BTTS") return homeGoals > 0 && awayGoals > 0 ? "WIN" : "LOSS";
  if (t === "O2.5" || t === "O 2.5") return homeGoals + awayGoals > 2 ? "WIN" : "LOSS";
  if (t === "U2.5" || t === "U 2.5") return homeGoals + awayGoals < 3 ? "WIN" : "LOSS";
  if (t === "O1.5" || t === "O 1.5") return homeGoals + awayGoals > 1 ? "WIN" : "LOSS";
  if (t === "U1.5" || t === "U 1.5") return homeGoals + awayGoals < 2 ? "WIN" : "LOSS";
  return "LOSS";
}