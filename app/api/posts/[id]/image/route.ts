import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { cookies } from "next/headers";
import { connectDB } from "@/utils/ConnectDb";
import { verifyToken } from "@/utils/auth";
import PostModel from "@/models/Post";

const DATA_URI_RE = /^data:(image\/(?:png|jpe?g|webp|gif));base64,([A-Za-z0-9+/]+=*)$/;

// ─── GET: a post's picture as a real, cacheable image ──────────────────────
// The feed JSON only carries this URL (see utils/postSerializer.ts); the
// browser downloads each picture once and reuses it. The `?v=` on the URL
// changes only when the picture itself does, which is what makes the
// "immutable" caching below safe.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) return new NextResponse(null, { status: 404 });

    await connectDB();
    const post = await PostModel.findById(id).select("image isPublished").lean();
    if (!post?.image) return new NextResponse(null, { status: 404 });

    // Unpublished posts are only visible to admins (the dashboard list shows
    // their thumbnails); everyone else gets a plain 404.
    if (!post.isPublished) {
      const token = (await cookies()).get("token")?.value;
      const decoded = token ? verifyToken(token) : null;
      if (!decoded || decoded.role !== "ADMIN") return new NextResponse(null, { status: 404 });
    }

    const match = DATA_URI_RE.exec(post.image);
    if (!match) return new NextResponse(null, { status: 404 });

    return new NextResponse(Buffer.from(match[2], "base64"), {
      status: 200,
      headers: {
        "Content-Type": match[1],
        "Cache-Control": post.isPublished ? "public, max-age=31536000, immutable" : "private, no-store",
      },
    });
  } catch (error) {
    console.error("GET POST IMAGE ERROR:", error);
    return new NextResponse(null, { status: 500 });
  }
}
