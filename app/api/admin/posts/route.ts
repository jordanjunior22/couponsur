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

// ─── GET: every post, published or not (ADMIN ONLY) ────────────────────────
// Powers the dashboard's post list — the public feed (app/api/posts/route.ts)
// only ever returns published ones.
export async function GET() {
  try {
    await connectDB();

    const auth = await requireAdmin();
    if ("error" in auth) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const posts = await PostModel.find().sort({ createdAt: -1 }).lean();
    return NextResponse.json({ success: true, data: posts.map((p) => toClientPost(p, null)) });
  } catch (error) {
    console.error("GET ADMIN POSTS ERROR:", error);
    return NextResponse.json({ success: false, message: "Failed to fetch posts" }, { status: 500 });
  }
}

// ─── POST: publish a new post (ADMIN ONLY) ─────────────────────────────────
// Body: { text?, image? (data URI), pollOptionA?, pollOptionB? } — a poll
// needs both option labels or neither; the post's own image doubles as the
// matchup graphic when it's a "team vs team" poll.
export async function POST(req: NextRequest) {
  try {
    await connectDB();

    const auth = await requireAdmin();
    if ("error" in auth) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const body = await req.json().catch(() => ({}));
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const rawImage = typeof body.image === "string" ? body.image : null;
    const pollOptionA = typeof body.pollOptionA === "string" ? body.pollOptionA.trim() : "";
    const pollOptionB = typeof body.pollOptionB === "string" ? body.pollOptionB.trim() : "";

    if (!text && !rawImage) {
      return NextResponse.json({ success: false, message: "Le post ne peut pas être vide" }, { status: 400 });
    }
    if (text.length > 2000) {
      return NextResponse.json({ success: false, message: "Le texte est trop long (2000 caractères max)" }, { status: 400 });
    }
    if ((pollOptionA && !pollOptionB) || (!pollOptionA && pollOptionB)) {
      return NextResponse.json({ success: false, message: "Un sondage a besoin des deux options" }, { status: 400 });
    }

    let image: string | null = null;
    let imageBytes = 0;
    if (rawImage) {
      const parsed = parseImageDataUri(rawImage);
      if (!parsed) {
        return NextResponse.json({ success: false, message: "Image invalide" }, { status: 400 });
      }
      if (parsed.bytes > MAX_GROUP_IMAGE_BYTES) {
        return NextResponse.json(
          { success: false, message: `Image trop volumineuse (max ${Math.round(MAX_GROUP_IMAGE_BYTES / 1_000_000 * 10) / 10} Mo)` },
          { status: 400 }
        );
      }
      image = rawImage;
      imageBytes = parsed.bytes;
    }

    const post = await PostModel.create({
      text,
      image,
      imageBytes,
      poll: pollOptionA && pollOptionB ? { optionALabel: pollOptionA, optionBLabel: pollOptionB } : null,
      isPublished: true,
    });

    return NextResponse.json({ success: true, data: toClientPost(post.toObject(), null) }, { status: 201 });
  } catch (error) {
    console.error("CREATE POST ERROR:", error);
    return NextResponse.json({ success: false, message: "Échec de la publication" }, { status: 500 });
  }
}
