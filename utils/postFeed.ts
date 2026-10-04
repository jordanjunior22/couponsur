// Cursor-paged reading of posts, shared by the public feed and the admin
// list. Two things keep it light:
//   - Pages of a few posts, newest first, continued with `before` (the
//     createdAt of the last post already loaded) — stable even when new
//     posts arrive meanwhile, unlike skip/limit.
//   - The image data URI is never loaded here (`-image`); we only ask which
//     of these posts HAVE one, and the browser fetches each picture from
//     /api/posts/[id]/image on its own, cached.
import PostModel from "@/models/Post";

export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 20;

export function parsePageParams(searchParams: URLSearchParams) {
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(searchParams.get("limit") || "", 10) || DEFAULT_PAGE_SIZE));
  const beforeRaw = searchParams.get("before");
  const beforeDate = beforeRaw ? new Date(beforeRaw) : null;
  const before = beforeDate && !Number.isNaN(beforeDate.getTime()) ? beforeDate : null;
  return { limit, before };
}

export async function loadPostsPage(opts: { publishedOnly: boolean; limit: number; before: Date | null }) {
  const filter: Record<string, unknown> = {};
  if (opts.publishedOnly) filter.isPublished = true;
  if (opts.before) filter.createdAt = { $lt: opts.before };

  // One extra row tells us whether another page exists.
  const rows = await PostModel.find(filter).select("-image").sort({ createdAt: -1 }).limit(opts.limit + 1).lean();
  const hasMore = rows.length > opts.limit;
  const posts = hasMore ? rows.slice(0, opts.limit) : rows;

  const withImage = await PostModel.find({ _id: { $in: posts.map((p) => p._id) }, image: { $ne: null } })
    .select("_id")
    .lean();
  const imageIds = new Set(withImage.map((d) => d._id.toString()));

  const last = posts[posts.length - 1];
  return {
    posts,
    imageIds,
    nextCursor: hasMore && last ? new Date(last.createdAt).toISOString() : null,
  };
}
