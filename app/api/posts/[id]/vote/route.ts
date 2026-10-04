import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import PostModel from "@/models/Post";
import { connectDB } from "@/utils/ConnectDb";
import { requireLoggedInUser } from "@/utils/postAuth";
import { respondPost, invalidatePostsCache } from "@/utils/postFeed";

// ─── POST: cast a vote on a poll post ──────────────────────────────────────
// Votes are immutable - a simple prediction-poll convention, not a
// changeable-until-close poll. Body: { option: "A" | "B" }.
// One atomic update: it only matches a poll the caller hasn't voted in yet, so
// two simultaneous taps can't count twice.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();

    const access = await requireLoggedInUser();
    if ("error" in access) {
      return NextResponse.json({ success: false, message: access.error }, { status: access.status });
    }

    const body = await req.json().catch(() => ({}));
    if (body.option !== "A" && body.option !== "B") {
      return NextResponse.json({ success: false, message: "option must be A or B" }, { status: 400 });
    }

    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Post introuvable" }, { status: 404 });
    }
    const uid = new Types.ObjectId(access.user.userId);

    const result = await PostModel.updateOne(
      { _id: id, poll: { $ne: null }, "votes.user": { $ne: uid } },
      { $push: { votes: { user: uid, option: body.option } } }
    );
    invalidatePostsCache();

    const data = await respondPost(id, access.user.userId);
    if (!data) {
      return NextResponse.json({ success: false, message: "Post introuvable" }, { status: 404 });
    }
    if (result.modifiedCount === 0) {
      // Either not a poll, or already voted. `data` is the real current state,
      // so a client that guessed wrong can put itself right.
      return NextResponse.json(
        { success: false, message: data.poll ? "Vous avez déjà voté" : "Ce post n'est pas un sondage", data },
        { status: 400 }
      );
    }
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("VOTE POST ERROR:", error);
    return NextResponse.json({ success: false, message: "Échec du vote" }, { status: 500 });
  }
}
