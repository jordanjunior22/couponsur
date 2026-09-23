import mongoose, { Schema, Document, Model } from "mongoose";

// Shared, cross-instance cache for scraped-and-parsed SoccerVital data (see
// utils/scrapeCache.ts). Exists because the per-module in-memory Maps that
// used to back this cache (in lib/soccervital.ts / lib/soccervitalForm.ts)
// are private to a single serverless instance — under any real concurrency
// every cold or parallel Fluid Compute instance re-paid the full HTTP
// fetch + cheerio HTML parse from scratch, which is genuine CPU-bound work
// (not I/O wait) and was a real driver of the account's Active CPU usage.
// A Mongo-backed cache lets every instance share one already-parsed
// result instead.
export interface IScrapeCache extends Document {
  key: string;
  payload: unknown;
  // Absolute expiry, not a fixed TTL — callers pass their own lifetime
  // (10 min for a day's predictions, 3h for a league's form/results), so
  // one collection serves both without a single hardcoded TTL.
  expiresAt: Date;
  createdAt: Date;
}

const ScrapeCacheSchema = new Schema<IScrapeCache>(
  {
    key: { type: String, required: true, unique: true },
    payload: { type: Schema.Types.Mixed, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// TTL index — MongoDB itself deletes a doc once expiresAt is in the past,
// so a stale entry never lingers and the collection can't grow unbounded.
ScrapeCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const ScrapeCacheModel: Model<IScrapeCache> =
  mongoose.models.ScrapeCache || mongoose.model<IScrapeCache>("ScrapeCache", ScrapeCacheSchema, "scrapecache");

export default ScrapeCacheModel;
