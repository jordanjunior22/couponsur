import { connectDB } from "@/utils/ConnectDb";
import ScrapeCacheModel from "@/models/ScrapeCache";

// L1: private to this warm instance, zero I/O — same role the old
// per-module Maps played. L2 (Mongo) is what's new: it's shared across
// every instance, so a cold start or a concurrent instance under load
// reads an already-parsed result instead of re-scraping + re-parsing HTML
// (real CPU-bound work) from scratch. See models/ScrapeCache.ts.
const memCache = new Map<string, { data: unknown; expiresAt: number }>();

export async function getCached<T>(key: string): Promise<T | null> {
  const mem = memCache.get(key);
  if (mem && mem.expiresAt > Date.now()) return mem.data as T;

  try {
    await connectDB();
    const doc = await ScrapeCacheModel.findOne({ key, expiresAt: { $gt: new Date() } }).lean();
    if (doc) {
      memCache.set(key, { data: doc.payload, expiresAt: doc.expiresAt.getTime() });
      return doc.payload as T;
    }
  } catch (e) {
    // A cache-layer failure should never take down the scrape itself —
    // callers fall back to fetching fresh on a null return.
    console.warn(`Scrape cache read failed for "${key}":`, e);
  }
  return null;
}

export async function setCached(key: string, data: unknown, ttlMs: number): Promise<void> {
  const expiresAt = new Date(Date.now() + ttlMs);
  memCache.set(key, { data, expiresAt: expiresAt.getTime() });
  try {
    await connectDB();
    await ScrapeCacheModel.findOneAndUpdate(
      { key },
      { $set: { payload: data, expiresAt } },
      { upsert: true }
    );
  } catch (e) {
    console.warn(`Scrape cache write failed for "${key}":`, e);
  }
}
