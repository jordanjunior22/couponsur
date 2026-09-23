import { NextRequest, NextResponse } from "next/server";
import PostModel from "@/models/Post";
import { connectDB } from "@/utils/ConnectDb";

// ─── GET: how many published posts are newer than `since` ──────────────────
// Powers the "new actus" badge on the bottom tab bar with a single indexed
// count query instead of pulling full post bodies (incl. data-URI images)
// just to count them client-side. `since` is the caller's locally-stored
// "last viewed Actus" timestamp (see hooks/useUnreadPosts.ts) — omitted
// entirely on a first-ever visit, which counts the whole feed as unread.
// No auth required — the feed itself is public (see app/api/posts/route.ts).
export async function GET(req: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const sinceParam = searchParams.get("since");
    const since = sinceParam ? new Date(sinceParam) : new Date(0);

    const count = await PostModel.countDocuments({
      isPublished: true,
      createdAt: { $gt: since },
    });

    return NextResponse.json({ success: true, data: { count } });
  } catch (error) {
    console.error("POSTS UNREAD COUNT ERROR:", error);
    return NextResponse.json({ success: false, message: "Failed to fetch unread count" }, { status: 500 });
  }
}
