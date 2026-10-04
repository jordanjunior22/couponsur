import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import PostModel from "@/models/Post";
import { connectDB } from "@/utils/ConnectDb";
import { requireLoggedInUser } from "@/utils/postAuth";
import { respondPost, invalidatePostsCache } from "@/utils/postFeed";

// ─── POST: like or unlike ───────────────────────────────────────────────────
// Body (optional): { liked: boolean } - the state the caller WANTS. Asking
// for a state, instead of "flip it", makes the call safe to repeat and to
// reorder: tapping fast, or a retry after a dropped connection, still lands
// on what the person last chose. With no body it flips, as it always did.
//
// One atomic update ($addToSet / $pull) - the old read-modify-write could
// drop a like when two people liked the same post at the same moment.
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

    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Post introuvable" }, { status: 404 });
    }
    const uid = new Types.ObjectId(access.user.userId);

    const body = await req.json().catch(() => ({}));
    let wantLiked: boolean;
    if (typeof body.liked === "boolean") {
      wantLiked = body.liked;
    } else {
      wantLiked = !(await PostModel.exists({ _id: id, likes: uid }));
    }

    await PostModel.updateOne({ _id: id }, wantLiked ? { $addToSet: { likes: uid } } : { $pull: { likes: uid } });
    invalidatePostsCache();

    const data = await respondPost(id, access.user.userId);
    if (!data) {
      return NextResponse.json({ success: false, message: "Post introuvable" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("TOGGLE POST LIKE ERROR:", error);
    return NextResponse.json({ success: false, message: "Échec de l'opération" }, { status: 500 });
  }
}
