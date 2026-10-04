import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import GroupMessageModel from "@/models/GroupMessage";
import UserModel from "@/models/Users";
import { connectDB } from "@/utils/ConnectDb";
import { requireGroupChatAccess } from "@/utils/groupChatAccess";
import { detectProhibitedContact, moderationMessage } from "@/utils/chatModeration";
import { toClientMessage, isReactionEmoji } from "@/utils/groupChatSerializer";
import { maskPhone } from "@/utils/maskPhone";
import { sendPushToAdmins } from "@/lib/webpush";

// Looked up fresh rather than trusted from the edit path's own `access` -
// the pin branch below can target any message (including one from a
// sender who isn't the caller), so it needs the real current value either way.
async function isSenderBlocked(userId: string): Promise<boolean> {
  const sender = await UserModel.findById(userId).select("groupChatBlocked").lean();
  return sender?.groupChatBlocked === true;
}

// Reloads a message after an atomic update and shapes it for this viewer.
// The message is a single document, so loading it whole (image included, only
// to learn whether one exists) is fine.
async function respondWith(messageId: string, viewer: { userId: string; role: "USER" | "ADMIN" }) {
  const fresh = await GroupMessageModel.findById(messageId);
  if (!fresh) {
    return NextResponse.json({ success: false, message: "Message introuvable" }, { status: 404 });
  }
  return NextResponse.json({
    success: true,
    data: toClientMessage(fresh.toObject(), {
      senderBlocked: await isSenderBlocked(fresh.user.toString()),
      viewerId: viewer.userId,
      viewerIsAdmin: viewer.role === "ADMIN",
    }),
  });
}

const BLOCKED_RESPONSE = () =>
  NextResponse.json(
    { success: false, message: "Vous avez été bloqué de ce groupe par un administrateur." },
    { status: 403 }
  );

// ─── PATCH: one action on a message ─────────────────────────────────────────
// Body is exactly one of:
//   { react: "👍" }        - any member: toggle YOUR reaction (one of REACTION_EMOJIS)
//   { report: true }       - any member, on someone else's message: flag it to the admins
//   { clearReports: true } - admin-only: dismiss the flags on a message
//   { pinned: boolean }    - admin-only: toggles the pinned strip at the top of the room
//   { text }               - author-only: rewrites the message
// There is no admin bypass for editing - changing someone else's words (vs.
// just pinning/removing them) would misattribute what they said.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  try {
    await connectDB();

    const { messageId } = await params;
    if (!Types.ObjectId.isValid(messageId)) {
      return NextResponse.json({ success: false, message: "Message introuvable" }, { status: 404 });
    }
    // Fetched before the access check so that check can be run against
    // *this* message's own room, not a guess from the request - a message
    // is always exactly as premium- or global-gated as the room it lives
    // in, regardless of which room the caller claims to be acting in.
    const message = await GroupMessageModel.findById(messageId);
    if (!message) {
      return NextResponse.json({ success: false, message: "Message introuvable" }, { status: 404 });
    }
    const room = message.room ?? "premium";

    const access = await requireGroupChatAccess(room);
    if ("error" in access) {
      return NextResponse.json({ success: false, message: access.error }, { status: access.status });
    }
    const viewer = { userId: access.user.userId, role: access.user.role };
    const uid = new Types.ObjectId(access.user.userId);

    const body = await req.json().catch(() => ({}));

    // ── Admin: pin / dismiss reports ─────────────────────────────────────────
    if (typeof body.pinned === "boolean") {
      if (access.user.role !== "ADMIN") {
        return NextResponse.json({ success: false, message: "Réservé aux admins" }, { status: 403 });
      }
      message.pinned = body.pinned;
      await message.save();
      return respondWith(messageId, viewer);
    }

    if (body.clearReports === true) {
      if (access.user.role !== "ADMIN") {
        return NextResponse.json({ success: false, message: "Réservé aux admins" }, { status: 403 });
      }
      await GroupMessageModel.updateOne({ _id: messageId }, { $set: { reports: [] } });
      return respondWith(messageId, viewer);
    }

    // Everything below needs a member who isn't muted.
    if (access.user.blocked) return BLOCKED_RESPONSE();

    // ── React: toggle my reaction ────────────────────────────────────────────
    if (body.react !== undefined) {
      if (!isReactionEmoji(body.react)) {
        return NextResponse.json({ success: false, message: "Réaction invalide" }, { status: 400 });
      }
      const key = `reactions.${body.react}`;
      // If my id is already in this emoji's list, take it out; otherwise add
      // it. Two single-document atomic updates, no read-modify-write.
      const removed = await GroupMessageModel.findOneAndUpdate(
        { _id: messageId, [key]: uid },
        { $pull: { [key]: uid } }
      ).select("_id");
      if (!removed) {
        await GroupMessageModel.updateOne({ _id: messageId }, { $addToSet: { [key]: uid } });
      }
      return respondWith(messageId, viewer);
    }

    // ── Report: flag someone else's message to the admins ────────────────────
    if (body.report === true) {
      if (message.user.toString() === access.user.userId) {
        return NextResponse.json({ success: false, message: "Vous ne pouvez pas signaler votre propre message." }, { status: 400 });
      }
      const alreadyFirst = (message.reports?.length ?? 0) === 0;
      const added = await GroupMessageModel.updateOne(
        { _id: messageId, reports: { $ne: uid } },
        { $addToSet: { reports: uid } }
      );
      // Notify the admins once, when a message is first flagged - further
      // flags on the same message just raise its count on the dashboard side.
      if (added.modifiedCount > 0 && alreadyFirst) {
        const who = message.role === "ADMIN" ? message.nickname || "Admin" : maskPhone(message.phone);
        sendPushToAdmins({
          title: `🚩 Message signalé — groupe ${room === "premium" ? "premium" : "global"}`,
          body: `${who} : ${(message.text || "📷 Image").slice(0, 100)}`,
          url: room === "premium" ? "/groupe/premium" : "/groupe/global",
        }).catch((e) => console.error("Push on group chat report failed:", e));
      }
      return respondWith(messageId, viewer);
    }

    // ── Edit my own message ──────────────────────────────────────────────────
    if (message.user.toString() !== access.user.userId) {
      return NextResponse.json({ success: false, message: "Message introuvable" }, { status: 404 });
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

    message.text = text;
    message.editedAt = new Date();
    await message.save();

    return respondWith(messageId, viewer);
  } catch (error) {
    console.error("PATCH GROUP CHAT MESSAGE ERROR:", error);
    return NextResponse.json({ success: false, message: "Échec de l'opération" }, { status: 500 });
  }
}

// ─── DELETE: remove a message ──────────────────────────────────────────────
// The author can delete their own; an admin can delete anyone's - the
// group's moderation lever for off-topic or abusive messages.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  try {
    await connectDB();

    const { messageId } = await params;
    // Same reasoning as PATCH above - the room to gate against comes from
    // the message being deleted, not the caller's say-so.
    const existing = await GroupMessageModel.findById(messageId).select("room");
    if (!existing) {
      return NextResponse.json({ success: false, message: "Message introuvable" }, { status: 404 });
    }
    const room = existing.room ?? "premium";

    const access = await requireGroupChatAccess(room);
    if ("error" in access) {
      return NextResponse.json({ success: false, message: access.error }, { status: access.status });
    }

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
