// Cursor-paged reading of posts, shared by the public feed and the admin
// list. Two things keep it light:
//   - Pages of a few posts, newest first, continued with `before` (the
//     createdAt of the last post already loaded) — stable even when new
//     posts arrive meanwhile, unlike skip/limit.
//   - The image data URI is never loaded here (`-image`); we only ask which
//     of these posts HAVE one, and the browser fetches each picture from
//     /api/posts/[id]/image on its own, cached.
import { Types } from "mongoose";
import PostModel from "@/models/Post";
import { toClientPost } from "@/utils/postSerializer";

export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 20;

export function parsePageParams(searchParams: URLSearchParams) {
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(searchParams.get("limit") || "", 10) || DEFAULT_PAGE_SIZE));
  const beforeRaw = searchParams.get("before");
  const beforeDate = beforeRaw ? new Date(beforeRaw) : null;
  const before = beforeDate && !Number.isNaN(beforeDate.getTime()) ? beforeDate : null;
  return { limit, before };
}

// Which of these posts HAVE a picture (without loading the pictures).
async function imageIdsFor(ids: Types.ObjectId[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const withImage = await PostModel.find({ _id: { $in: ids }, image: { $ne: null } }).select("_id").lean();
  return new Set(withImage.map((d) => d._id.toString()));
}

// ─── Short server-side cache of the PUBLIC feed pages ───────────────────────
// The page itself (posts, counts) is the same for every visitor - only the
// "did I like it / how did I vote" flags are personal, and those are applied
// afterwards, per request. Cached for a few seconds and cleared the moment
// anything about a post changes (like, comment, vote, publish, edit, delete),
// so a burst of visitors costs one database read instead of one each.
const PAGE_CACHE_MS = 10_000;
type PageResult = { posts: Awaited<ReturnType<typeof queryPage>>["posts"]; imageIds: Set<string>; nextCursor: string | null };
const pageCache = new Map<string, { at: number; value: PageResult }>();

export function invalidatePostsCache() {
  pageCache.clear();
}

async function queryPage(opts: { publishedOnly: boolean; limit: number; before: Date | null }) {
  const filter: Record<string, unknown> = {};
  if (opts.publishedOnly) filter.isPublished = true;
  if (opts.before) filter.createdAt = { $lt: opts.before };

  // One extra row tells us whether another page exists.
  const rows = await PostModel.find(filter).select("-image").sort({ createdAt: -1 }).limit(opts.limit + 1).lean();
  const hasMore = rows.length > opts.limit;
  const posts = hasMore ? rows.slice(0, opts.limit) : rows;
  const imageIds = await imageIdsFor(posts.map((p) => p._id));

  const last = posts[posts.length - 1];
  return {
    posts,
    imageIds,
    nextCursor: hasMore && last ? new Date(last.createdAt).toISOString() : null,
  };
}

export async function loadPostsPage(opts: { publishedOnly: boolean; limit: number; before: Date | null }) {
  // Only the public feed is cached; the admin list always reads fresh.
  if (!opts.publishedOnly) return queryPage(opts);

  const key = `${opts.limit}:${opts.before ? opts.before.toISOString() : ""}`;
  const hit = pageCache.get(key);
  if (hit && Date.now() - hit.at < PAGE_CACHE_MS) return hit.value;

  const value = await queryPage(opts);
  pageCache.set(key, { at: Date.now(), value });
  return value;
}

// Published posts that changed after `since` (new ones, and likes / comments /
// votes on existing ones). What the feed's few-seconds poll asks for - usually
// an empty answer, which is tiny.
export async function loadChangedPosts(since: Date, limit = 50) {
  const posts = await PostModel.find({ isPublished: true, updatedAt: { $gt: since } })
    .select("-image")
    .sort({ updatedAt: 1 })
    .limit(limit)
    .lean();
  const imageIds = await imageIdsFor(posts.map((p) => p._id));
  return { posts, imageIds };
}

// One post, shaped for a viewer, WITHOUT loading its picture. The like /
// vote / comment routes answer with this instead of loading and re-saving the
// whole document (picture included) just to flip a counter.
export async function respondPost(id: string, viewerId: string | null) {
  const post = await PostModel.findById(id).select("-image").lean();
  if (!post) return null;
  const hasImage = (await imageIdsFor([post._id])).has(post._id.toString());
  return toClientPost(post, viewerId, { hasImage });
}
