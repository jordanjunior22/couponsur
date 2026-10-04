// Shared by the pick cards (countdown) and /api/pay (closing sales), so the
// UI and the server always agree on "has this pick started?".
//
// A leg's kickoff is stored as "HH:mm" (see models/Picks.ts IMatch.kickoff)
// next to a calendar date. Those times come from the scraped source / the
// admin form and are local Cameroon time (WAT, UTC+1, no daylight saving),
// so they're converted to a real instant with that fixed offset.
const WAT_OFFSET_MS = 60 * 60 * 1000;
const TIME_RE = /^(\d{1,2}):(\d{2})$/;

interface KickoffLeg {
  kickoff?: string | null;
  date?: string | Date | null;
}
interface KickoffPick {
  match_date: string | Date;
  matches: KickoffLeg[];
}

// The calendar-date part, read the same way the rest of the app does
// (`match_date.split("T")[0]`).
function datePart(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const iso = typeof value === "string" ? value : value.toISOString();
  const part = iso.split("T")[0];
  return /^\d{4}-\d{2}-\d{2}$/.test(part) ? part : null;
}

/** Kickoff instant (ms since epoch) of one leg, or null if it has no usable time. */
export function legKickoffMs(leg: KickoffLeg, fallbackDate: string | Date): number | null {
  const m = leg.kickoff ? TIME_RE.exec(leg.kickoff.trim()) : null;
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 23 || minutes > 59) return null;
  const day = datePart(leg.date) ?? datePart(fallbackDate);
  if (!day) return null;
  const [y, mo, d] = day.split("-").map(Number);
  return Date.UTC(y, mo - 1, d, hours, minutes) - WAT_OFFSET_MS;
}

/**
 * The moment the FIRST leg of the pick kicks off (earliest across all legs),
 * or null when no leg has a kickoff time — in which case there is nothing
 * to count down to and sales are never closed on time grounds.
 *
 * The earliest leg is the one that matters: once it has started, the combo
 * is already partly decided, so buying it is no longer a fair purchase.
 */
export function pickKickoffMs(pick: KickoffPick): number | null {
  let earliest: number | null = null;
  for (const leg of pick.matches) {
    const t = legKickoffMs(leg, pick.match_date);
    if (t !== null && (earliest === null || t < earliest)) earliest = t;
  }
  return earliest;
}

/** True once the pick's first leg has kicked off. False if no time is known. */
export function hasPickStarted(pick: KickoffPick, now: number = Date.now()): boolean {
  const t = pickKickoffMs(pick);
  return t !== null && now >= t;
}
