import { NextRequest, NextResponse } from "next/server";
import ConversationModel from "@/models/Conversation";
import { connectDB } from "@/utils/ConnectDb";
import { cookies } from "next/headers";
import { verifyToken } from "@/utils/auth";

async function requireAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;

  if (!token) return { error: "Unauthorized", status: 401 };

  const decoded = verifyToken(token);
  if (!decoded) return { error: "Invalid token", status: 401 };
  if (decoded.role !== "ADMIN") return { error: "Forbidden", status: 403 };

  return { user: decoded };
}

// ─── PATCH: edit an admin reply already sent in this conversation ────────
// Body: { text }. Only ADMIN-sender messages are editable here — a
// visitor's own message is edited from their own chat endpoint.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  try {
    await connectDB();

    const auth = await requireAdmin();
    if ("error" in auth) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const { id, messageId } = await params;
    const body = await req.json();
    const text = typeof body.text === "string" ? body.text.trim() : "";

    if (!text) {
      return NextResponse.json({ success: false, message: "Le message ne peut pas être vide" }, { status: 400 });
    }
    if (text.length > 2000) {
      return NextResponse.json({ success: false, message: "Le message est trop long (2000 caractères max)" }, { status: 400 });
    }

    const conversation = await ConversationModel.findById(id);
    if (!conversation) {
      return NextResponse.json({ success: false, message: "Conversation not found" }, { status: 404 });
    }

    const message = conversation.messages.id(messageId);
    if (!message || message.sender !== "ADMIN") {
      return NextResponse.json({ success: false, message: "Message introuvable" }, { status: 404 });
    }

    message.text = text;
    message.editedAt = new Date();
    await conversation.save();

    return NextResponse.json({ success: true, data: conversation });
  } catch (error) {
    console.error("EDIT ADMIN MESSAGE ERROR:", error);
    return NextResponse.json({ success: false, message: "Échec de la modification du message" }, { status: 500 });
  }
}

// ─── DELETE: remove an admin reply already sent in this conversation ─────
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  try {
    await connectDB();

    const auth = await requireAdmin();
    if ("error" in auth) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const { id, messageId } = await params;
    const conversation = await ConversationModel.findById(id);
    if (!conversation) {
      return NextResponse.json({ success: false, message: "Conversation not found" }, { status: 404 });
    }

    const message = conversation.messages.id(messageId);
    if (!message || message.sender !== "ADMIN") {
      return NextResponse.json({ success: false, message: "Message introuvable" }, { status: 404 });
    }

    message.deleteOne();
    await conversation.save();

    return NextResponse.json({ success: true, data: conversation });
  } catch (error) {
    console.error("DELETE ADMIN MESSAGE ERROR:", error);
    return NextResponse.json({ success: false, message: "Échec de la suppression du message" }, { status: 500 });
  }
}
