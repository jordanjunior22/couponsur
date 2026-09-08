import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import PostModel from "@/models/Post";
import { connectDB } from "@/utils/ConnectDb";
import { requireLoggedInUser } from "@/utils/postAuth";
import { toClientPost } from "@/utils/postSerializer";

// ─── POST: cast a vote on a poll post ──────────────────────────────────────
// Votes are immutable — a simple prediction-poll convention, not a
// changeable-until-close poll. Body: { option: "A" | "B" }.
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
    const post = await PostModel.findById(id);
    if (!post) {
      return NextResponse.json({ success: false, message: "Post introuvable" }, { status: 404 });
    }
    if (!post.poll) {
      return NextResponse.json({ success: false, message: "Ce post n'est pas un sondage" }, { status: 400 });
    }
    if (post.votes.some((v) => v.user.toString() === access.user.userId)) {
      return NextResponse.json({ success: false, message: "Vous avez déjà voté" }, { status: 400 });
    }

    post.votes.push({ user: new Types.ObjectId(access.user.userId), option: body.option });
    await post.save();

    return NextResponse.json({ success: true, data: toClientPost(post.toObject(), access.user.userId) });
  } catch (error) {
    console.error("VOTE POST ERROR:", error);
    return NextResponse.json({ success: false, message: "Échec du vote" }, { status: 500 });
  }
}
