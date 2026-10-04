import { NextResponse } from "next/server";
import { Types } from "mongoose";
import PostModel from "@/models/Post";
import { connectDB } from "@/utils/ConnectDb";
import { requireLoggedInUser } from "@/utils/postAuth";
import { respondPost, invalidatePostsCache } from "@/utils/postFeed";

// ─── DELETE: remove a comment ───────────────────────────────────────────────
// The author can delete their own; an admin can delete anyone's - same
// permission shape as group chat's message delete.
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  try {
    await connectDB();

    const access = await requireLoggedInUser();
    if ("error" in access) {
      return NextResponse.json({ success: false, message: access.error }, { status: access.status });
    }

    const { id, commentId } = await params;
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(commentId)) {
      return NextResponse.json({ success: false, message: "Commentaire introuvable" }, { status: 404 });
    }
    const commentOid = new Types.ObjectId(commentId);

    // Just that one comment (no picture, no other comments) to check who wrote it.
    const found = await PostModel.findOne({ _id: id, "comments._id": commentOid })
      .select({ comments: { $elemMatch: { _id: commentOid } } })
      .lean();
    const comment = found?.comments?.[0];
    if (!comment) {
      return NextResponse.json({ success: false, message: "Commentaire introuvable" }, { status: 404 });
    }
    if (access.user.role !== "ADMIN" && comment.user.toString() !== access.user.userId) {
      return NextResponse.json({ success: false, message: "Commentaire introuvable" }, { status: 404 });
    }

    await PostModel.updateOne({ _id: id }, { $pull: { comments: { _id: commentOid } } });
    invalidatePostsCache();

    const data = await respondPost(id, access.user.userId);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("DELETE POST COMMENT ERROR:", error);
    return NextResponse.json({ success: false, message: "Échec de la suppression" }, { status: 500 });
  }
}
