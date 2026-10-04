/**
 * lib/generatorQuota.ts
 *
 * Usage limits for the AI match generator (app/api/generate-matches):
 *   - FREE users get `Settings.generatorFreeDailyLimit` generations per day
 *     (default 5), resetting at midnight WAT (UTC+1, the same clock the rest
 *     of the app uses for "today").
 *   - Subscribers and admins are unlimited.
 *   - EVERYONE (including subscribers) must wait a few seconds between
 *     generations — that's what stops a script hammering the endpoint, since
 *     "unlimited" alone would leave it wide open.
 *
 * Every state change is a single atomic Mongo update, so ten parallel
 * requests can't slip past the limit or the pause.
 */
import UserModel from "@/models/Users";

export const GENERATOR_COOLDOWN_MS = 5_000;

export interface GeneratorUsage {
  unlimited: boolean;
  limit: number | null; // null when unlimited
  used: number;
  remaining: number | null; // null when unlimited
}

/** Today's calendar date in WAT, "YYYY-MM-DD". */
export function watDay(now: number = Date.now()): string {
  return new Date(now + 60 * 60 * 1000).toISOString().split("T")[0];
}

export const UNLIMITED_USAGE: GeneratorUsage = { unlimited: true, limit: null, used: 0, remaining: null };

function limitedUsage(limit: number, used: number): GeneratorUsage {
  return { unlimited: false, limit, used, remaining: Math.max(0, limit - used) };
}

/** Read-only: what a FREE user has left today. */
export async function getFreeUsage(userId: string, limit: number): Promise<GeneratorUsage> {
  const user = await UserModel.findById(userId).select("generator").lean();
  const sameDay = user?.generator?.day === watDay();
  return limitedUsage(limit, sameDay ? user?.generator?.count ?? 0 : 0);
}

/**
 * Starts the short pause between generations. Fails (ok: false) if the last
 * generation was less than GENERATOR_COOLDOWN_MS ago.
 */
export async function claimCooldown(
  userId: string
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  const now = Date.now();
  const claimed = await UserModel.findOneAndUpdate(
    {
      _id: userId,
      $or: [{ "generator.lastAt": null }, { "generator.lastAt": { $lte: new Date(now - GENERATOR_COOLDOWN_MS) } }],
    },
    { $set: { "generator.lastAt": new Date(now) } },
    { new: false }
  ).select("_id");
  if (claimed) return { ok: true };

  const user = await UserModel.findById(userId).select("generator").lean();
  const lastAt = user?.generator?.lastAt ? new Date(user.generator.lastAt).getTime() : now;
  return { ok: false, retryAfterSec: Math.max(1, Math.ceil((lastAt + GENERATOR_COOLDOWN_MS - now) / 1000)) };
}

/**
 * Atomically spends one of a FREE user's daily generations. Returns the new
 * usage and the `day` it was charged to (needed to refund correctly if the
 * generation fails after midnight).
 */
export async function reserveCredit(
  userId: string,
  limit: number
): Promise<{ ok: true; day: string; usage: GeneratorUsage } | { ok: false; usage: GeneratorUsage }> {
  const day = watDay();

  // New day (or first ever use): reset the counter. The filter only matches
  // when the stored day differs, so racing requests can't reset it twice.
  await UserModel.updateOne(
    { _id: userId, "generator.day": { $ne: day } },
    { $set: { "generator.day": day, "generator.count": 0 } }
  );

  const updated = await UserModel.findOneAndUpdate(
    { _id: userId, "generator.day": day, "generator.count": { $lt: limit } },
    { $inc: { "generator.count": 1 } },
    { new: true }
  ).select("generator");

  if (updated) {
    return { ok: true, day, usage: limitedUsage(limit, updated.generator?.count ?? 0) };
  }
  return { ok: false, usage: limitedUsage(limit, limit) };
}

/** Gives a spent generation back (failed run / nothing to show). Never goes below 0. */
export async function refundCredit(userId: string, day: string): Promise<void> {
  await UserModel.updateOne(
    { _id: userId, "generator.day": day, "generator.count": { $gt: 0 } },
    { $inc: { "generator.count": -1 } }
  );
}
