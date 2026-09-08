import { NextResponse } from "next/server";
import PostModel from "@/models/Post";
import { connectDB } from "@/utils/ConnectDb";
import { optionalUserId } from "@/utils/postAuth";
import { toClientPost } from "@/utils/postSerializer";

// This is a live feed, not a searchable archive — a fixed recent window
// keeps the payload (and the DB scan) small, same reasoning as group
// chat's HISTORY_LIMIT.
const FEED_LIMIT = 50;

// ─── GET: the public news feed ─────────────────────────────────────────────
// Auth is optional here (unlike every other posts/* route) — anyone can
// read the feed; being logged in just adds `likedByMe`/`myVote` to what
// they see.
export async function GET() {
  try {
    await connectDB();

    const viewerId = await optionalUserId();

    const posts = await PostModel.find({ isPublished: true })
      .sort({ createdAt: -1 })
      .limit(FEED_LIMIT)
      .lean();

    return NextResponse.json({
      success: true,
      data: posts.map((p) => toClientPost(p, viewerId)),
    });
  } catch (error) {
    console.error("GET POSTS ERROR:", error);
    return NextResponse.json({ success: false, message: "Failed to fetch posts" }, { status: 500 });
  }
}
