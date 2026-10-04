import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import { optionalUserId } from "@/utils/postAuth";
import { toClientPost } from "@/utils/postSerializer";
import { loadPostsPage, parsePageParams } from "@/utils/postFeed";

// ─── GET: the public news feed, one page at a time ─────────────────────────
// ?limit=10 (max 20) &before=<createdAt of the last post you already have>
// Returns { data, nextCursor } — pass nextCursor back as `before` for the
// next page; null means you've reached the end.
//
// Auth is optional here (unlike every other posts/* route) — anyone can
// read the feed; being logged in just adds `likedByMe`/`myVote` to what
// they see.
export async function GET(req: NextRequest) {
  try {
    await connectDB();

    const { limit, before } = parsePageParams(new URL(req.url).searchParams);
    const viewerId = await optionalUserId();
    const { posts, imageIds, nextCursor } = await loadPostsPage({ publishedOnly: true, limit, before });

    return NextResponse.json({
      success: true,
      data: posts.map((p) => toClientPost(p, viewerId, { hasImage: imageIds.has(p._id.toString()) })),
      nextCursor,
    });
  } catch (error) {
    console.error("GET POSTS ERROR:", error);
    return NextResponse.json({ success: false, message: "Failed to fetch posts" }, { status: 500 });
  }
}
