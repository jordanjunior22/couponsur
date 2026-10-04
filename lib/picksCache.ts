// Instant-open cache for the home page's picks - same idea as lib/postsCache.ts
// and lib/groupChatCache.ts: the last-known picks are remembered on the device
// (memory for this visit, localStorage across reloads) and shown IMMEDIATELY;
// the page then refreshes behind them. Warmed ahead of time by the tab bar.
//
// Keyed by account ("anon" when signed out): a live coupon's selections are
// only present for the viewer who paid for it, so one login's picks must never
// be shown to another.
import type { Pick } from "@/components/PremiumPicksPage";

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
  trend: ({ weekKey: string } & RecordTally)[];
  weeksTotal: number;
  leagues: string[];
  hasTiers: boolean;
}

export interface PicksSnapshot {
  picks: Pick[];
  stats: HomeStats | null;
  nextBefore: string | null;
  at: number;
}

const STORAGE_PREFIX = "picks_cache:";
const memory = new Map<string, PicksSnapshot>();

export function readPicksCache(viewerKey: string): PicksSnapshot | null {
  const inMemory = memory.get(viewerKey);
  if (inMemory) return inMemory;
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + viewerKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PicksSnapshot;
    if (!Array.isArray(parsed.picks)) return null;
    memory.set(viewerKey, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export function writePicksCache(viewerKey: string, snapshot: Omit<PicksSnapshot, "at">) {
  const full: PicksSnapshot = { ...snapshot, at: Date.now() };
  memory.set(viewerKey, full);
  try {
    localStorage.setItem(STORAGE_PREFIX + viewerKey, JSON.stringify(full));
  } catch {
    /* storage full / blocked - the in-memory copy still serves this visit */
  }
}

const inFlight = new Set<string>();

// Fetches the first page ahead of the user opening the home page. Best-effort.
export async function prefetchPicks(viewerKey: string, maxAgeMs = 20_000) {
  const existing = memory.get(viewerKey);
  if (existing && Date.now() - existing.at < maxAgeMs) return;
  if (inFlight.has(viewerKey)) return;
  inFlight.add(viewerKey);
  try {
    const res = await fetch("/api/picks/feed", { credentials: "include" });
    const data = await res.json();
    if (data?.success && Array.isArray(data.picks)) {
      writePicksCache(viewerKey, { picks: data.picks, stats: data.stats ?? null, nextBefore: data.nextBefore ?? null });
    }
  } catch {
    /* the page just loads normally */
  } finally {
    inFlight.delete(viewerKey);
  }
}
