import { NextResponse } from "next/server";
import PostModel from "@/models/Post";
import { connectDB } from "@/utils/ConnectDb";
import { requireLoggedInUser } from "@/utils/postAuth";
import { toClientPost } from "@/utils/postSerializer";

// ─── DELETE: remove a comment ───────────────────────────────────────────────
// The author can delete their own; an admin can delete anyone's — same
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
    const post = await PostModel.findById(id);
    if (!post) {
      return NextResponse.json({ success: false, message: "Post introuvable" }, { status: 404 });
    }

    const comment = post.comments.id(commentId);
    if (!comment) {
      return NextResponse.json({ success: false, message: "Commentaire introuvable" }, { status: 404 });
    }
    if (access.user.role !== "ADMIN" && comment.user.toString() !== access.user.userId) {
      return NextResponse.json({ success: false, message: "Commentaire introuvable" }, { status: 404 });
    }

    comment.deleteOne();
    await post.save();

    return NextResponse.json({ success: true, data: toClientPost(post.toObject(), access.user.userId) });
  } catch (error) {
    console.error("DELETE POST COMMENT ERROR:", error);
    return NextResponse.json({ success: false, message: "Échec de la suppression" }, { status: 500 });
  }
}
