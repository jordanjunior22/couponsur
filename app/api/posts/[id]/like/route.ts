import { NextResponse } from "next/server";
import { Types } from "mongoose";
import PostModel from "@/models/Post";
import { connectDB } from "@/utils/ConnectDb";
import { requireLoggedInUser } from "@/utils/postAuth";
import { toClientPost } from "@/utils/postSerializer";

// ─── POST: toggle a like ────────────────────────────────────────────────────
// No unlike-vs-like distinction in the body — this just flips the caller's
// own membership in `likes`, same "toggle" shape as a typical like button.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();

    const access = await requireLoggedInUser();
    if ("error" in access) {
      return NextResponse.json({ success: false, message: access.error }, { status: access.status });
    }

    const { id } = await params;
    const post = await PostModel.findById(id);
    if (!post) {
      return NextResponse.json({ success: false, message: "Post introuvable" }, { status: 404 });
    }

    const alreadyLiked = post.likes.some((u) => u.toString() === access.user.userId);
    if (alreadyLiked) {
      post.likes = post.likes.filter((u) => u.toString() !== access.user.userId);
    } else {
      post.likes.push(new Types.ObjectId(access.user.userId));
    }
    await post.save();

    return NextResponse.json({ success: true, data: toClientPost(post.toObject(), access.user.userId) });
  } catch (error) {
    console.error("TOGGLE POST LIKE ERROR:", error);
    return NextResponse.json({ success: false, message: "Échec de l'opération" }, { status: 500 });
  }
}
