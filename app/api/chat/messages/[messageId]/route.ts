import { NextRequest, NextResponse } from "next/server";
import ConversationModel from "@/models/Conversation";
import UserModel from "@/models/Users";
import { connectDB } from "@/utils/ConnectDb";
import { cookies } from "next/headers";
import { verifyToken } from "@/utils/auth";

// Same identity resolution as app/api/chat/route.ts — kept local rather
// than shared since it's a few lines and each chat route already owns
// its copy.
async function resolveIdentity(bodyPhone: string | null) {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;

  if (token) {
    const decoded = verifyToken(token);
    if (decoded) {
      const user = await UserModel.findById(decoded.userId).select("phone");
      if (user) return { userId: decoded.userId, phone: user.phone };
    }
  }

  const phone = bodyPhone?.trim();
  if (!phone || phone.length < 6) return null;
  return { userId: null as string | null, phone };
}

// ─── PATCH: edit one of the visitor's own messages ────────────────────────
// Body: { phone?, text }. Only the USER-side message can be edited here —
// an admin's reply is edited from the dashboard's own endpoint.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  try {
    await connectDB();

    const { messageId } = await params;
    const body = await req.json();
    const text = typeof body.text === "string" ? body.text.trim() : "";

    if (!text) {
      return NextResponse.json({ success: false, message: "Le message ne peut pas être vide" }, { status: 400 });
    }
    if (text.length > 2000) {
      return NextResponse.json({ success: false, message: "Le message est trop long (2000 caractères max)" }, { status: 400 });
    }

    const identity = await resolveIdentity(typeof body.phone === "string" ? body.phone : null);
    if (!identity) {
      return NextResponse.json({ success: false, message: "Identité introuvable" }, { status: 400 });
    }

    const filter = identity.userId ? { user: identity.userId } : { phone: identity.phone, user: null };
    const conversation = await ConversationModel.findOne(filter);
    if (!conversation) {
      return NextResponse.json({ success: false, message: "Conversation introuvable" }, { status: 404 });
    }

    const message = conversation.messages.id(messageId);
    if (!message || message.sender !== "USER") {
      return NextResponse.json({ success: false, message: "Message introuvable" }, { status: 404 });
    }

    message.text = text;
    message.editedAt = new Date();
    await conversation.save();

    return NextResponse.json({ success: true, data: conversation });
  } catch (error) {
    console.error("EDIT CHAT MESSAGE ERROR:", error);
    return NextResponse.json({ success: false, message: "Échec de la modification du message" }, { status: 500 });
  }
}

// ─── DELETE: remove one of the visitor's own messages ─────────────────────
// Body: { phone? } — DELETE requests still carry a JSON body here since
// that's the only place to pass the anonymous-visitor phone identity.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  try {
    await connectDB();

    const { messageId } = await params;
    let bodyPhone: string | null = null;
    try {
      const body = await req.json();
      bodyPhone = typeof body?.phone === "string" ? body.phone : null;
    } catch {
      // No body sent (e.g. a logged-in user) — identity falls back to the cookie.
    }

    const identity = await resolveIdentity(bodyPhone);
    if (!identity) {
      return NextResponse.json({ success: false, message: "Identité introuvable" }, { status: 400 });
    }

    const filter = identity.userId ? { user: identity.userId } : { phone: identity.phone, user: null };
    const conversation = await ConversationModel.findOne(filter);
    if (!conversation) {
      return NextResponse.json({ success: false, message: "Conversation introuvable" }, { status: 404 });
    }

    const message = conversation.messages.id(messageId);
    if (!message || message.sender !== "USER") {
      return NextResponse.json({ success: false, message: "Message introuvable" }, { status: 404 });
    }

    message.deleteOne();
    await conversation.save();

    return NextResponse.json({ success: true, data: conversation });
  } catch (error) {
    console.error("DELETE CHAT MESSAGE ERROR:", error);
    return NextResponse.json({ success: false, message: "Échec de la suppression du message" }, { status: 500 });
  }
}
