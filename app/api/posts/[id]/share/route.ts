import { NextResponse } from "next/server";
import PostModel from "@/models/Post";
import { connectDB } from "@/utils/ConnectDb";
import { requireLoggedInUser } from "@/utils/postAuth";
import { toClientPost } from "@/utils/postSerializer";

// ─── POST: record a share ───────────────────────────────────────────────────
// Called after the client's own share action succeeds (native share sheet,
// or its copy-link fallback) — just a counter, there's no repost/
// redistribution mechanism.
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
    const post = await PostModel.findByIdAndUpdate(id, { $inc: { shareCount: 1 } }, { new: true });
    if (!post) {
      return NextResponse.json({ success: false, message: "Post introuvable" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: toClientPost(post.toObject(), access.user.userId) });
  } catch (error) {
    console.error("SHARE POST ERROR:", error);
    return NextResponse.json({ success: false, message: "Échec de l'opération" }, { status: 500 });
  }
}
