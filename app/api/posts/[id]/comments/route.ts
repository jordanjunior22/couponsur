import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import PostModel from "@/models/Post";
import { connectDB } from "@/utils/ConnectDb";
import { requireLoggedInUser } from "@/utils/postAuth";
import { detectProhibitedContact, moderationMessage } from "@/utils/chatModeration";
import { respondPost, invalidatePostsCache } from "@/utils/postFeed";

// ─── POST: add a comment ────────────────────────────────────────────────────
// Same auto-moderation group chat already applies to its messages (blocks
// phone numbers / WhatsApp-Telegram links) — admins are exempt there too.
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
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) {
      return NextResponse.json({ success: false, message: "Le commentaire ne peut pas être vide" }, { status: 400 });
    }
    if (text.length > 2000) {
      return NextResponse.json({ success: false, message: "Le commentaire est trop long (2000 caractères max)" }, { status: 400 });
    }
    if (access.user.role !== "ADMIN") {
      const reason = detectProhibitedContact(text);
      if (reason) {
        return NextResponse.json({ success: false, message: moderationMessage(reason) }, { status: 400 });
      }
    }

    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Post introuvable" }, { status: 404 });
    }

    // Atomic append - never re-saves the whole post (picture and all comments).
    const result = await PostModel.updateOne(
      { _id: id },
      {
        $push: {
          comments: {
            user: new Types.ObjectId(access.user.userId),
            phone: access.user.phone,
            role: access.user.role,
            text,
          },
        },
      }
    );
    if (result.matchedCount === 0) {
      return NextResponse.json({ success: false, message: "Post introuvable" }, { status: 404 });
    }
    invalidatePostsCache();

    const data = await respondPost(id, access.user.userId);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    console.error("ADD POST COMMENT ERROR:", error);
    return NextResponse.json({ success: false, message: "Échec de l'envoi du commentaire" }, { status: 500 });
  }
}
