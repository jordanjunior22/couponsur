// Data layer of the home page's picks feed (app/api/picks/feed).
//
//  - STATS: the global record, streak and weekly trend. The home page used to
//    compute these in the browser from EVERY pick ever published; now one small
//    query of four fields per pick builds them on the server.
//  - WEEKS: picks fetched a few weeks at a time, newest first, instead of the
//    whole history. A cursor (`before`) walks back; blank weeks are skipped.
//  - CACHE: results are reused while nothing about any pick has changed. The
//    "has anything changed" check is two tiny indexed queries (newest updatedAt
//    + count of published picks), so no write route has to remember to clear
//    anything - a new pick, a result, an edit, a delete or an unpublish all move
//    that fingerprint on their own.
import PickModel from "@/models/Picks";
import { addWeeks, getWeekKey, weekKeyOfDate, weekStart } from "@/utils/weekKeys";

export interface RecordTally {
  wins: number;
  losses: number;
  refunds: number;
  graded: number;
  winRate: number | null;
}

export interface HomeStats {
  record: RecordTally;
  streak: number;
  /** Last up-to-6 weeks that have picks, oldest first. */
  trend: ({ weekKey: string } & RecordTally)[];
  weeksTotal: number;
  leagues: string[];
  hasTiers: boolean;
}

// A refunded pick counts as a win in the rate (the stake came back) - the same
// rule the home page applies everywhere.
function tally(outcomes: string[]): RecordTally {
  const wins = outcomes.filter((o) => o === "WIN").length;
  const losses = outcomes.filter((o) => o === "LOSS").length;
  const refunds = outcomes.filter((o) => o === "REFUNDED").length;
  const graded = wins + losses + refunds;
  return { wins, losses, refunds, graded, winRate: graded > 0 ? Math.round(((wins + refunds) / graded) * 100) : null };
}

// ─── fingerprint ────────────────────────────────────────────────────────────
async function fingerprint(): Promise<string> {
  const [newest, publishedCount] = await Promise.all([
    PickModel.findOne().sort({ updatedAt: -1 }).select("updatedAt").lean(),
    PickModel.countDocuments({ is_published: true }),
  ]);
  const t = newest && (newest as { updatedAt?: Date }).updatedAt ? new Date((newest as { updatedAt: Date }).updatedAt).getTime() : 0;
  return `${t}:${publishedCount}`;
}

const CACHE_MAX_ENTRIES = 40;
const cache = new Map<string, unknown>();
function remember<T>(key: string, value: T): T {
  if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
  cache.set(key, value);
  return value;
}

// ─── stats ──────────────────────────────────────────────────────────────────
async function computeStats(): Promise<HomeStats> {
  const rows = await PickModel.find({ is_published: true }).select("match_date outcome tier league").lean();

  const byWeek = new Map<string, string[]>();
  const leagues = new Set<string>();
  let hasTiers = false;
  for (const r of rows) {
    const key = weekKeyOfDate(new Date(r.match_date));
    if (!byWeek.has(key)) byWeek.set(key, []);
    byWeek.get(key)!.push(r.outcome);
    if (r.league) leagues.add(r.league);
    if (r.tier) hasTiers = true;
  }

  // Current win streak: newest finished picks first, counting wins until the
  // first loss (a refund is a void - it neither adds to it nor breaks it).
  const finished = rows
    .filter((r) => r.outcome === "WIN" || r.outcome === "LOSS")
    .sort((a, b) => new Date(b.match_date).getTime() - new Date(a.match_date).getTime());
  let streak = 0;
  for (const r of finished) {
    if (r.outcome === "WIN") streak++;
    else break;
  }

  const weekKeys = Array.from(byWeek.keys()).sort();
  return {
    record: tally(rows.map((r) => r.outcome)),
    streak,
    trend: weekKeys.slice(-6).map((weekKey) => ({ weekKey, ...tally(byWeek.get(weekKey)!) })),
    weeksTotal: weekKeys.length,
    leagues: Array.from(leagues).sort(),
    hasTiers,
  };
}

export async function loadHomeStats(): Promise<HomeStats> {
  const key = `stats:${await fingerprint()}`;
  const hit = cache.get(key) as HomeStats | undefined;
  return hit ?? remember(key, await computeStats());
}

// ─── weeks ──────────────────────────────────────────────────────────────────
export interface WeeksPage {
  /** Raw picks (unmasked) - the route masks them per viewer. */
  picks: Awaited<ReturnType<typeof queryWeeks>>["picks"];
  /** Monday of the oldest week this page covers. */
  windowStart: string;
  /** Pass back as `before` for the next older page; null = nothing older. */
  nextBefore: string | null;
}

async function queryWeeks(startKey: string, endExclusive: Date | null) {
  const range: Record<string, Date> = { $gte: weekStart(startKey) };
  if (endExclusive) range.$lt = endExclusive;
  const picks = await PickModel.find({ is_published: true, match_date: range }).sort({ match_date: -1 }).lean();
  return { picks };
}

export async function loadWeeksPage(before: string | null, weeks: number): Promise<WeeksPage> {
  const key = `weeks:${await fingerprint()}:${before ?? "first"}:${weeks}`;
  const hit = cache.get(key) as WeeksPage | undefined;
  if (hit) return hit;

  let startKey: string;
  let endExclusive: Date | null = null;

  if (!before) {
    // First page: this week and the previous (weeks - 1), plus anything dated
    // later (picks published ahead of time).
    startKey = addWeeks(getWeekKey(new Date().toISOString()), -(weeks - 1));
  } else {
    endExclusive = weekStart(before);
    // Skip blank weeks: start from the newest week that actually has a pick
    // before the cursor.
    const newestOlder = await PickModel.findOne({ is_published: true, match_date: { $lt: endExclusive } })
      .sort({ match_date: -1 })
      .select("match_date")
      .lean();
    if (!newestOlder) {
      return remember(key, { picks: [], windowStart: before, nextBefore: null });
    }
    startKey = addWeeks(weekKeyOfDate(new Date(newestOlder.match_date)), -(weeks - 1));
  }

  const { picks } = await queryWeeks(startKey, endExclusive);
  const hasOlder = !!(await PickModel.exists({ is_published: true, match_date: { $lt: weekStart(startKey) } }));

  return remember(key, { picks, windowStart: startKey, nextBefore: hasOlder ? startKey : null });
}

// ─── changes ────────────────────────────────────────────────────────────────
// Published picks changed after `since` (a new pick, a result, an edit) - what
// the home page asks every few seconds. Usually an empty answer.
export async function loadChangedPicks(since: Date, limit = 100) {
  return PickModel.find({ is_published: true, updatedAt: { $gt: since } })
    .sort({ updatedAt: 1 })
    .limit(limit)
    .lean();
}
