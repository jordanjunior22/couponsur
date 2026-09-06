import { NextRequest, NextResponse } from "next/server";
import GroupMessageModel, { IGroupMessage } from "@/models/GroupMessage";
import UserModel from "@/models/Users";
import { connectDB } from "@/utils/ConnectDb";
import { requireGroupChatAccess } from "@/utils/groupChatAccess";
import { maskPhone } from "@/utils/maskPhone";
import { detectProhibitedContact, moderationMessage } from "@/utils/chatModeration";
import { HydratedDocument } from "mongoose";

// Looked up fresh rather than trusted from the edit path's own `access` —
// the pin branch below can target any message (including one from a
// sender who isn't the caller), so it needs the real current value either way.
async function isSenderBlocked(userId: string): Promise<boolean> {
  const sender = await UserModel.findById(userId).select("groupChatBlocked").lean();
  return sender?.groupChatBlocked === true;
}

function toClientMessage(msg: HydratedDocument<IGroupMessage>, senderBlocked: boolean) {
  return {
    _id: msg._id.toString(),
    user: msg.user.toString(),
    phone: maskPhone(msg.phone),
    role: msg.role,
    senderBlocked,
    text: msg.text,
    image: msg.image,
    replyTo: msg.replyTo
      ? {
          messageId: msg.replyTo.messageId.toString(),
          user: msg.replyTo.user.toString(),
          role: msg.replyTo.role,
          phone: maskPhone(msg.replyTo.phone),
          text: msg.replyTo.text,
        }
      : null,
    pinned: msg.pinned,
    createdAt: msg.createdAt,
    editedAt: msg.editedAt ?? null,
  };
}

// ─── PATCH: edit your own message's text, or (admins only) pin/unpin ──────
// Body is one of:
//   { text }     — author-only, rewrites the message
//   { pinned }   — admin-only, toggles the pinned strip at the top of the room
// Never both — editing someone else's words (vs. just pinning/removing
// them) would misattribute what they said, so there's no admin bypass here.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  try {
    await connectDB();

    const access = await requireGroupChatAccess();
    if ("error" in access) {
      return NextResponse.json({ success: false, message: access.error }, { status: access.status });
    }

    const { messageId } = await params;
    const body = await req.json().catch(() => ({}));

    if (typeof body.pinned === "boolean") {
      if (access.user.role !== "ADMIN") {
        return NextResponse.json({ success: false, message: "Réservé aux admins" }, { status: 403 });
      }
      const message = await GroupMessageModel.findById(messageId);
      if (!message) {
        return NextResponse.json({ success: false, message: "Message introuvable" }, { status: 404 });
      }
      message.pinned = body.pinned;
      await message.save();
      return NextResponse.json({ success: true, data: toClientMessage(message, await isSenderBlocked(message.user.toString())) });
    }

    if (access.user.blocked) {
      return NextResponse.json(
        { success: false, message: "Vous avez été bloqué de ce groupe par un administrateur." },
        { status: 403 }
      );
    }

    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) {
      return NextResponse.json({ success: false, message: "Le message ne peut pas être vide" }, { status: 400 });
    }
    if (text.length > 2000) {
      return NextResponse.json({ success: false, message: "Le message est trop long (2000 caractères max)" }, { status: 400 });
    }
    if (access.user.role !== "ADMIN") {
      const reason = detectProhibitedContact(text);
      if (reason) {
        return NextResponse.json({ success: false, message: moderationMessage(reason) }, { status: 400 });
      }
    }

    const message = await GroupMessageModel.findOne({ _id: messageId, user: access.user.userId });
    if (!message) {
      return NextResponse.json({ success: false, message: "Message introuvable" }, { status: 404 });
    }

    message.text = text;
    message.editedAt = new Date();
    await message.save();

    // The editor is the sender and was already confirmed not blocked above.
    return NextResponse.json({ success: true, data: toClientMessage(message, false) });
  } catch (error) {
    console.error("EDIT GROUP CHAT MESSAGE ERROR:", error);
    return NextResponse.json({ success: false, message: "Échec de la modification du message" }, { status: 500 });
  }
}

// ─── DELETE: remove a message ──────────────────────────────────────────────
// The author can delete their own; an admin can delete anyone's — the
// group's moderation lever for off-topic or abusive messages.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  try {
    await connectDB();

    const access = await requireGroupChatAccess();
    if ("error" in access) {
      return NextResponse.json({ success: false, message: access.error }, { status: access.status });
    }

    const { messageId } = await params;
    const filter =
      access.user.role === "ADMIN"
        ? { _id: messageId }
        : { _id: messageId, user: access.user.userId };

    const message = await GroupMessageModel.findOneAndDelete(filter);
    if (!message) {
      return NextResponse.json({ success: false, message: "Message introuvable" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: { _id: messageId } });
  } catch (error) {
    console.error("DELETE GROUP CHAT MESSAGE ERROR:", error);
    return NextResponse.json({ success: false, message: "Échec de la suppression du message" }, { status: 500 });
  }
}
