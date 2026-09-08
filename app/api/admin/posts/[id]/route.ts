import { NextRequest, NextResponse } from "next/server";
import PostModel from "@/models/Post";
import { connectDB } from "@/utils/ConnectDb";
import { cookies } from "next/headers";
import { verifyToken } from "@/utils/auth";
import { parseImageDataUri, MAX_GROUP_IMAGE_BYTES } from "@/utils/groupChatImage";
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

// ─── PATCH: edit a post, and/or publish/unpublish (ADMIN ONLY) ─────────────
// Body is a set of optional fields — only the ones present get touched:
//   { authorName?, text?, image? (data URI, or null to remove it),
//     pollOptionA?, pollOptionB? (both, or both "" to remove the poll),
//     isPublished? }
// Editing the poll's labels (or removing it) resets `votes` — an existing
// tally is only meaningful for the exact options people voted on; keeping
// stale votes attached to edited/removed labels would misrepresent results.
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
    const post = await PostModel.findById(id);
    if (!post) {
      return NextResponse.json({ success: false, message: "Post introuvable" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));

    if (body.isPublished !== undefined) {
      if (typeof body.isPublished !== "boolean") {
        return NextResponse.json({ success: false, message: "isPublished must be a boolean" }, { status: 400 });
      }
      post.isPublished = body.isPublished;
    }

    if (body.authorName !== undefined) {
      const name = typeof body.authorName === "string" ? body.authorName.trim().slice(0, 60) : "";
      post.authorName = name || "Coupon Sûr";
    }

    if (body.text !== undefined) {
      const text = typeof body.text === "string" ? body.text.trim() : "";
      if (text.length > 2000) {
        return NextResponse.json({ success: false, message: "Le texte est trop long (2000 caractères max)" }, { status: 400 });
      }
      post.text = text;
    }

    if (body.image !== undefined) {
      if (body.image === null) {
        post.image = null;
        post.imageBytes = 0;
      } else if (typeof body.image === "string") {
        const parsed = parseImageDataUri(body.image);
        if (!parsed) {
          return NextResponse.json({ success: false, message: "Image invalide" }, { status: 400 });
        }
        if (parsed.bytes > MAX_GROUP_IMAGE_BYTES) {
          return NextResponse.json(
            { success: false, message: `Image trop volumineuse (max ${Math.round(MAX_GROUP_IMAGE_BYTES / 1_000_000 * 10) / 10} Mo)` },
            { status: 400 }
          );
        }
        post.image = body.image;
        post.imageBytes = parsed.bytes;
      }
    }

    if (body.pollOptionA !== undefined || body.pollOptionB !== undefined) {
      const a = typeof body.pollOptionA === "string" ? body.pollOptionA.trim() : "";
      const b = typeof body.pollOptionB === "string" ? body.pollOptionB.trim() : "";
      if ((a && !b) || (!a && b)) {
        return NextResponse.json({ success: false, message: "Un sondage a besoin des deux options" }, { status: 400 });
      }
      post.poll = a && b ? { optionALabel: a, optionBLabel: b } : null;
      post.votes.splice(0, post.votes.length); // see the doc comment above — labels changed, so old tallies no longer apply
    }

    if (!post.text && !post.image) {
      return NextResponse.json({ success: false, message: "Le post ne peut pas être vide" }, { status: 400 });
    }

    await post.save();

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
