import { NextRequest, NextResponse } from "next/server";
import PostModel from "@/models/Post";
import { connectDB } from "@/utils/ConnectDb";
import { cookies } from "next/headers";
import { verifyToken } from "@/utils/auth";
import { toClientPost } from "@/utils/postSerializer";

async function requireAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return { error: "Unauthorized", status: 401 };
  const decoded = verifyToken(token);
  if (!decoded) return { error: "Invalid token", status: 401 };
  if (decoded.role !== "ADMIN") return { error: "Forbidden", status: 403 };
  return { user: decoded };
}

// ─── PATCH: publish/unpublish (ADMIN ONLY) ─────────────────────────────────
// No text-edit in v1 — delete + repost covers a mistake, this route only
// toggles visibility.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();

    const auth = await requireAdmin();
    if ("error" in auth) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    if (typeof body.isPublished !== "boolean") {
      return NextResponse.json({ success: false, message: "isPublished must be a boolean" }, { status: 400 });
    }

    const post = await PostModel.findByIdAndUpdate(id, { isPublished: body.isPublished }, { new: true });
    if (!post) {
      return NextResponse.json({ success: false, message: "Post introuvable" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: toClientPost(post.toObject(), null) });
  } catch (error) {
    console.error("UPDATE POST ERROR:", error);
    return NextResponse.json({ success: false, message: "Échec de la mise à jour" }, { status: 500 });
  }
}

// ─── DELETE: remove a post entirely (ADMIN ONLY) ───────────────────────────
// Comments/likes/votes are embedded, so they go with it.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();

    const auth = await requireAdmin();
    if ("error" in auth) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const post = await PostModel.findByIdAndDelete(id);
    if (!post) {
      return NextResponse.json({ success: false, message: "Post introuvable" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: { _id: id } });
  } catch (error) {
    console.error("DELETE POST ERROR:", error);
    return NextResponse.json({ success: false, message: "Échec de la suppression" }, { status: 500 });
  }
}
