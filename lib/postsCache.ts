// Instant-open cache for the Actus feed - the same idea as lib/groupChatCache.ts.
//
// The first page of posts is remembered on the device (in memory for this
// visit, in localStorage so it survives a reload) and shown IMMEDIATELY when the
// feed opens; the feed then refreshes behind it and swaps in anything newer.
// Warmed ahead of time by the bottom tab bar (see prefetchPosts), so tapping
// Actus usually opens onto content that is already there.
//
// Keyed by account ("anon" when signed out): the posts carry personal flags
// (did I like it, how did I vote) that must never leak between logins.
import type { ClientPost } from "@/components/PostCard";

const STORAGE_PREFIX = "actus_cache:";
// Comments can be long lists; the cached copy only needs enough to look right
// instantly (the refresh brings the full list right after).
const MAX_COMMENTS_CACHED = 20;

interface Snapshot {
  posts: ClientPost[];
  nextCursor: string | null;
  at: number;
}

const memory = new Map<string, Snapshot>();

export function readPostsCache(viewerKey: string): Snapshot | null {
  const inMemory = memory.get(viewerKey);
  if (inMemory) return inMemory;
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + viewerKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Snapshot;
    if (!Array.isArray(parsed.posts)) return null;
    memory.set(viewerKey, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export function writePostsCache(viewerKey: string, posts: ClientPost[], nextCursor: string | null) {
  const trimmed = posts.slice(0, 10).map((p) => ({ ...p, comments: p.comments.filter((c) => !("pending" in c && (c as { pending?: boolean }).pending)).slice(-MAX_COMMENTS_CACHED) }));
  const snapshot: Snapshot = { posts: trimmed, nextCursor: posts.length > 10 ? trimmed[trimmed.length - 1]?.createdAt ?? nextCursor : nextCursor, at: Date.now() };
  memory.set(viewerKey, snapshot);
  try {
    localStorage.setItem(STORAGE_PREFIX + viewerKey, JSON.stringify(snapshot));
  } catch {
    /* storage full / blocked - the in-memory copy still serves this visit */
  }
}

const inFlight = new Set<string>();

// Fetches the first page ahead of the user opening Actus. Best-effort.
export async function prefetchPosts(viewerKey: string, maxAgeMs = 20_000) {
  const existing = memory.get(viewerKey);
  if (existing && Date.now() - existing.at < maxAgeMs) return;
  if (inFlight.has(viewerKey)) return;
  inFlight.add(viewerKey);
  try {
    const res = await fetch("/api/posts?limit=10", { credentials: "include" });
    const data = await res.json();
    if (data?.success && Array.isArray(data.data)) {
      writePostsCache(viewerKey, data.data, data.nextCursor ?? null);
    }
  } catch {
    /* the feed just loads normally */
  } finally {
    inFlight.delete(viewerKey);
  }
}
