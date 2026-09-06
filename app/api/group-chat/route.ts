import { NextRequest, NextResponse } from "next/server";
import GroupMessageModel, { GroupSender, IGroupReplyPreview } from "@/models/GroupMessage";
import { connectDB } from "@/utils/ConnectDb";
import { requireGroupChatAccess } from "@/utils/groupChatAccess";
import { maskPhone } from "@/utils/maskPhone";
import { parseImageDataUri, MAX_GROUP_IMAGE_BYTES } from "@/utils/groupChatImage";
import { detectProhibitedContact, moderationMessage } from "@/utils/chatModeration";
import UserModel from "@/models/Users";
import { Types } from "mongoose";

// How many past messages a poll/first-load returns. This is a live chat,
// not a searchable archive, so a fixed recent window keeps the payload
// (and the DB scan) small instead of paginating.
const HISTORY_LIMIT = 200;
// How much of the original message shows in a reply's quoted preview.
const REPLY_PREVIEW_LENGTH = 140;

interface LeanGroupMessage {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  phone: string;
  role: GroupSender;
  text: string;
  image: string | null;
  imageBytes: number;
  replyTo: IGroupReplyPreview | null;
  pinned: boolean;
  createdAt: Date;
  editedAt?: Date | null;
}

// Never send a bare number to the client — every message crosses this
// before it leaves the route, for every viewer including admins, since
// the whole point is that the group can't see each other's real numbers.
// `senderBlocked` is looked up live (not stored on the message) since a
// block applies to the account going forward, not retroactively to what
// they already sent — see GET below for how it's batched.
function toClientMessage(msg: LeanGroupMessage, senderBlocked: boolean) {
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

// ─── GET: fetch (and poll) the premium group chat history ─────────────────
export async function GET() {
  try {
    await connectDB();

    const access = await requireGroupChatAccess();
    if ("error" in access) {
      return NextResponse.json({ success: false, message: access.error }, { status: access.status });
    }

    const messages = await GroupMessageModel.find()
      .sort({ createdAt: -1 })
      .limit(HISTORY_LIMIT)
      .lean<LeanGroupMessage[]>();

    // One batched lookup for every distinct sender in this window, rather
    // than a query per message, to know who's currently blocked.
    const senderIds = Array.from(new Set(messages.map((m) => m.user.toString())));
    const blockedUsers = await UserModel.find({ _id: { $in: senderIds }, groupChatBlocked: true }).select("_id");
    const blockedSet = new Set(blockedUsers.map((u) => u._id.toString()));

    return NextResponse.json({
      success: true,
      data: messages.reverse().map((m) => toClientMessage(m, blockedSet.has(m.user.toString()))),
      me: access.user.userId,
      amIBlocked: access.user.blocked,
    });
  } catch (error) {
    console.error("GET GROUP CHAT ERROR:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch group chat" },
      { status: 500 }
    );
  }
}

// ─── POST: send a message to the group ─────────────────────────────────────
// Body: { text?, image? (data URI), replyTo? (message id) } — at least one
// of text/image is required.
export async function POST(req: NextRequest) {
  try {
    await connectDB();

    const access = await requireGroupChatAccess();
    if ("error" in access) {
      return NextResponse.json({ success: false, message: access.error }, { status: access.status });
    }
    if (access.user.blocked) {
      return NextResponse.json(
        { success: false, message: "Vous avez été bloqué de ce groupe par un administrateur." },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const rawImage = typeof body.image === "string" ? body.image : null;
    const replyToId = typeof body.replyTo === "string" ? body.replyTo : null;

    if (!text && !rawImage) {
      return NextResponse.json(
        { success: false, message: "Le message ne peut pas être vide" },
        { status: 400 }
      );
    }
    if (text.length > 2000) {
      return NextResponse.json(
        { success: false, message: "Le message est trop long (2000 caractères max)" },
        { status: 400 }
      );
    }
    // Admins are exempt — everyone else gets auto-blocked from moving the
    // conversation off-platform (phone numbers, WhatsApp/Telegram links).
    if (access.user.role !== "ADMIN" && text) {
      const reason = detectProhibitedContact(text);
      if (reason) {
        return NextResponse.json({ success: false, message: moderationMessage(reason) }, { status: 400 });
      }
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

    let replyTo: IGroupReplyPreview | null = null;
    if (replyToId) {
      const original = await GroupMessageModel.findById(replyToId).select("user role phone text image");
      if (original) {
        replyTo = {
          messageId: original._id,
          user: original.user,
          role: original.role,
          phone: original.phone,
          text: original.text
            ? original.text.slice(0, REPLY_PREVIEW_LENGTH)
            : (original.image ? "📷 Image" : ""),
        };
      }
      // A replyTo pointing at a message that no longer exists (e.g. it was
      // deleted between the user opening the reply box and hitting send)
      // just gets dropped silently — the new message still sends fine.
    }

    const message = await GroupMessageModel.create({
      user: access.user.userId,
      phone: access.user.phone,
      role: access.user.role,
      text,
      image,
      imageBytes,
      replyTo,
    });

    return NextResponse.json(
      // Sender can't be blocked here — that was already rejected above.
      { success: true, data: toClientMessage(message.toObject(), false) },
      { status: 201 }
    );
  } catch (error) {
    console.error("SEND GROUP CHAT MESSAGE ERROR:", error);
    return NextResponse.json(
      { success: false, message: "Échec de l'envoi du message" },
      { status: 500 }
    );
  }
}
