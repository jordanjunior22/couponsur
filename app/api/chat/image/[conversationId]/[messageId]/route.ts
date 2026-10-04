import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { cookies } from "next/headers";
import { connectDB } from "@/utils/ConnectDb";
import { verifyToken } from "@/utils/auth";
import ConversationModel from "@/models/Conversation";

const DATA_URI_RE = /^data:(image\/(?:png|jpe?g|webp|gif));base64,([A-Za-z0-9+/]+=*)$/;

// ─── GET: one support-chat picture as a real, cacheable image ──────────────
// The conversation JSON only carries this URL (see utils/chatSerializer.ts).
// Who may view it:
//   - any admin,
//   - the signed-in visitor who owns the conversation,
//   - an anonymous visitor, identified (like everywhere else in this chat)
//     by the phone they typed into the widget: ?phone=...
// Everyone else gets a plain 404, so a guessed URL reveals nothing.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string; messageId: string }> }
) {
  try {
    const { conversationId, messageId } = await params;
    if (!Types.ObjectId.isValid(conversationId) || !Types.ObjectId.isValid(messageId)) {
      return new NextResponse(null, { status: 404 });
    }

    await connectDB();

    // $elemMatch returns just the one message, not the whole thread.
    const conversation = await ConversationModel.findById(conversationId)
      .select({ user: 1, phone: 1, messages: { $elemMatch: { _id: new Types.ObjectId(messageId) } } })
      .lean();
    const message = conversation?.messages?.[0];
    if (!conversation || !message?.image) return new NextResponse(null, { status: 404 });

    const token = (await cookies()).get("token")?.value;
    const decoded = token ? verifyToken(token) : null;

    let allowed = false;
    if (decoded?.role === "ADMIN") {
      allowed = true;
    } else if (decoded && conversation.user && String(conversation.user) === String(decoded.userId)) {
      allowed = true;
    } else if (!conversation.user) {
      const phone = new URL(req.url).searchParams.get("phone")?.trim();
      allowed = !!phone && phone === conversation.phone;
    }
    if (!allowed) return new NextResponse(null, { status: 404 });

    const match = DATA_URI_RE.exec(message.image);
    if (!match) return new NextResponse(null, { status: 404 });

    return new NextResponse(Buffer.from(match[2], "base64"), {
      status: 200,
      headers: {
        "Content-Type": match[1],
        // Private conversation: cached by the visitor's own browser only,
        // never a shared cache. The ?v= on the URL changes with the picture.
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("GET CHAT IMAGE ERROR:", error);
    return new NextResponse(null, { status: 500 });
  }
}
