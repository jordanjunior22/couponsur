import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import GroupMessageModel, { GroupRoom, IGroupReplyPreview } from "@/models/GroupMessage";
import GroupPresenceModel from "@/models/GroupPresence";
import { connectDB } from "@/utils/ConnectDb";
import { requireGroupChatAccess } from "@/utils/groupChatAccess";
import { maskPhone } from "@/utils/maskPhone";
import { parseImageDataUri, MAX_GROUP_IMAGE_BYTES } from "@/utils/groupChatImage";
import { detectProhibitedContact, moderationMessage } from "@/utils/chatModeration";
import { toClientMessage } from "@/utils/groupChatSerializer";
import { ONLINE_WINDOW_MS, TYPING_WINDOW_MS } from "@/utils/groupChatPresence";
import { getSettings } from "@/models/Settings";
import UserModel from "@/models/Users";
import { sendPushToAdmins, sendPushToUser } from "@/lib/webpush";

// First load shows the latest INITIAL_LIMIT messages; older history is
// fetched on demand, PAGE_SIZE at a time (`before`), as the reader scrolls
// up - instead of always shipping a fixed 200-message window.
const INITIAL_LIMIT = 50;
const PAGE_SIZE = 30;
// Safety cap on one "what changed since X" poll.
const POLL_LIMIT = 200;
// How much of the original message shows in a reply's quoted preview.
const REPLY_PREVIEW_LENGTH = 140;

// A request's room param defaults to "premium" - the room that existed
// before this concept did, so any caller that forgets to pass it keeps
// today's behavior instead of silently landing in the new room.
function parseRoom(value: string | null): GroupRoom {
  return value === "global" ? "global" : "premium";
}

function roomPath(room: GroupRoom) {
  return room === "premium" ? "/groupe/premium" : "/groupe/global";
}

// Which of these messages carry a picture. The feed queries load messages
// WITHOUT their (large) image data, so presence is asked separately: a
// cheap _id-only query for the handful of messages in this response.
async function idsWithImage(ids: Types.ObjectId[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await GroupMessageModel.find({ _id: { $in: ids }, image: { $ne: null } }).select("_id").lean();
  return new Set(rows.map((r) => r._id.toString()));
}

// ─── GET: fetch (and poll) a group chat room ───────────────────────────────
// Three modes:
//   (default)       the latest INITIAL_LIMIT messages, + `hasMore` (older exist)
//   ?before=<ISO>   the PAGE_SIZE messages older than that createdAt, + `hasMore`
//   ?since=<ISO>    everything that CHANGED after that updatedAt - new messages
//                   AND edits / pins / reactions / reports on existing ones,
//                   so those show up within one poll tick instead of waiting
//                   for the slow full refresh. (Deletions have no row to
//                   return, so the client's slower full refresh still covers those.)
export async function GET(req: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const room = parseRoom(searchParams.get("room"));
    const sinceParam = searchParams.get("since");
    const beforeParam = searchParams.get("before");
    const sinceDate = sinceParam ? new Date(sinceParam) : null;
    const since = sinceDate && !Number.isNaN(sinceDate.getTime()) ? sinceDate : null;
    const beforeDate = beforeParam ? new Date(beforeParam) : null;
    const before = beforeDate && !Number.isNaN(beforeDate.getTime()) ? beforeDate : null;

    const access = await requireGroupChatAccess(room);
    if ("error" in access) {
      return NextResponse.json({ success: false, message: access.error }, { status: access.status });
    }

    // "premium" has to match both explicitly-tagged docs and every message
    // written before `room` existed (all of which were premium-room
    // messages) - "global" is strict since every global doc is written
    // with the field set from day one.
    const roomFilter = room === "premium" ? { $or: [{ room: "premium" }, { room: { $exists: false } }] } : { room: "global" };

    let docs;
    let hasMore = false;

    if (since) {
      docs = await GroupMessageModel.find({ ...roomFilter, updatedAt: { $gt: since } })
        .select("-image")
        .sort({ updatedAt: 1 })
        .limit(POLL_LIMIT)
        .lean();
    } else {
      const limit = before ? PAGE_SIZE : INITIAL_LIMIT;
      const rows = await GroupMessageModel.find(before ? { ...roomFilter, createdAt: { $lt: before } } : roomFilter)
        .select("-image")
        .sort({ createdAt: -1 })
        .limit(limit + 1)
        .lean();
      hasMore = rows.length > limit;
      docs = rows.slice(0, limit).reverse(); // back to chronological
    }

    // One batched lookup for every distinct sender in this window, rather
    // than a query per message, to know who's currently blocked.
    const senderIds = Array.from(new Set(docs.map((m) => m.user.toString())));
    const [blockedUsers, imageIds] = await Promise.all([
      UserModel.find({ _id: { $in: senderIds }, groupChatBlocked: true }).select("_id"),
      idsWithImage(docs.map((m) => m._id)),
    ]);
    const blockedSet = new Set(blockedUsers.map((u) => u._id.toString()));

    const viewerIsAdmin = access.user.role === "ADMIN";
    const data = docs.map((m) =>
      toClientMessage(m, {
        senderBlocked: blockedSet.has(m.user.toString()),
        viewerId: access.user.userId,
        viewerIsAdmin,
        hasImage: imageIds.has(m._id.toString()),
      })
    );

    // Loading older history is a one-off scroll action, not a "still here"
    // heartbeat - skip the presence write and the settings read for it.
    if (before) {
      return NextResponse.json({ success: true, data, hasMore, me: access.user.userId });
    }

    const now = new Date();
    // This viewer's own heartbeat - every poll of this room counts as
    // "still here" (see ONLINE_WINDOW_MS). Awaited before the count below so
    // a just-arrived viewer is reflected in their own first response.
    await GroupPresenceModel.findOneAndUpdate(
      { room, user: access.user.userId },
      { $set: { lastSeenAt: now } },
      { upsert: true }
    );
    const [onlineCount, settings, typingRows] = await Promise.all([
      GroupPresenceModel.countDocuments({ room, lastSeenAt: { $gte: new Date(now.getTime() - ONLINE_WINDOW_MS) } }),
      getSettings(),
      // Everyone else who pinged "typing" in the last few seconds (a handful at
      // most - a small, indexed query).
      GroupPresenceModel.find({
        room,
        typingAt: { $gte: new Date(now.getTime() - TYPING_WINDOW_MS) },
        user: { $ne: access.user.userId },
      })
        .limit(4)
        .select("user")
        .lean(),
    ]);

    let typing: string[] = [];
    if (typingRows.length > 0) {
      const typists = await UserModel.find({ _id: { $in: typingRows.map((r) => r.user) } })
        .select("phone role nickname")
        .lean();
      typing = typists.map((u) => (u.role === "ADMIN" ? u.nickname || "Admin" : maskPhone(u.phone)));
    }

    return NextResponse.json({
      success: true,
      data,
      hasMore,
      me: access.user.userId,
      amIBlocked: access.user.blocked,
      onlineCount,
      typing,
      // So the composer can wait out the pause locally instead of sending a
      // message the server is going to refuse. Admins are exempt.
      cooldownSeconds: viewerIsAdmin ? 0 : settings.groupChatCooldownSeconds ?? 2,
    });
  } catch (error) {
    console.error("GET GROUP CHAT ERROR:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch group chat" },
      { status: 500 }
    );
  }
}

// ─── POST: send a message to a room ─────────────────────────────────────────
// Body: { room?, text?, image? (data URI), replyTo? (message id) } - at
// least one of text/image is required.
export async function POST(req: NextRequest) {
  try {
    await connectDB();

    const body = await req.json().catch(() => ({}));
    const room = parseRoom(typeof body.room === "string" ? body.room : null);

    const access = await requireGroupChatAccess(room);
    if ("error" in access) {
      return NextResponse.json({ success: false, message: access.error }, { status: access.status });
    }
    if (access.user.blocked) {
      return NextResponse.json(
        { success: false, message: "Vous avez été bloqué de ce groupe par un administrateur." },
        { status: 403 }
      );
    }

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
    // Admins are exempt - everyone else gets auto-blocked from moving the
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

    // ── Pause between messages (anti-flood) ──────────────────────────────────
    // One atomic update claims the slot, so a burst of parallel requests can't
    // all slip through. Placed after validation so a rejected message never
    // costs the sender their turn. Admins are exempt.
    if (access.user.role !== "ADMIN") {
      const settings = await getSettings();
      const cooldownMs = (settings.groupChatCooldownSeconds ?? 2) * 1000;
      if (cooldownMs > 0) {
        const nowMs = Date.now();
        const claimed = await UserModel.findOneAndUpdate(
          {
            _id: access.user.userId,
            $or: [{ groupChatLastAt: null }, { groupChatLastAt: { $lte: new Date(nowMs - cooldownMs) } }],
          },
          { $set: { groupChatLastAt: new Date(nowMs) } }
        ).select("_id");
        if (!claimed) {
          const u = await UserModel.findById(access.user.userId).select("groupChatLastAt").lean();
          const lastMs = u?.groupChatLastAt ? new Date(u.groupChatLastAt).getTime() : nowMs;
          const wait = Math.max(1, Math.ceil((lastMs + cooldownMs - nowMs) / 1000));
          return NextResponse.json(
            { success: false, message: `Doucement ! Patientez ${wait} seconde${wait > 1 ? "s" : ""} avant d'envoyer un autre message.` },
            { status: 429 }
          );
        }
      }
    }

    let replyTo: IGroupReplyPreview | null = null;
    if (replyToId) {
      const original = await GroupMessageModel.findById(replyToId).select("room user role phone nickname text imageBytes");
      if (original && (original.room ?? "premium") === room) {
        replyTo = {
          messageId: original._id,
          user: original.user,
          role: original.role,
          phone: original.phone,
          nickname: original.nickname ?? null,
          text: original.text
            ? original.text.slice(0, REPLY_PREVIEW_LENGTH)
            : ((original.imageBytes ?? 0) > 0 ? "📷 Image" : ""),
        };
      }
      // A replyTo pointing at a message that no longer exists (e.g. it was
      // deleted between the user opening the reply box and hitting send),
      // or that belongs to the other room, just gets dropped silently -
      // the new message still sends fine.
    }

    const message = await GroupMessageModel.create({
      room,
      user: access.user.userId,
      phone: access.user.phone,
      role: access.user.role,
      nickname: access.user.nickname,
      text,
      image,
      imageBytes,
      replyTo,
    });

    const senderLabel = access.user.role === "ADMIN" ? access.user.nickname || "Admin" : maskPhone(access.user.phone);
    const preview = text ? text.slice(0, 120) : "📷 Image";

    // Fire-and-forget - only when a buyer (not an admin themselves) posts,
    // so admins replying to each other never self-notify.
    if (access.user.role !== "ADMIN") {
      sendPushToAdmins({
        title: `💬 Message — groupe ${room === "premium" ? "premium" : "global"}`,
        body: `${senderLabel} : ${preview}`,
        url: "/dashboard",
      }).catch((e) => console.error("Push on group chat message failed:", e));
    }

    // Tell the author of the message being replied to - unless that's the
    // sender themselves, or they're looking at the room right now (they'll
    // see it appear; a notification on top would just be noise).
    if (replyTo && replyTo.user.toString() !== access.user.userId) {
      const targetId = replyTo.user.toString();
      GroupPresenceModel.exists({
        room,
        user: targetId,
        lastSeenAt: { $gte: new Date(Date.now() - ONLINE_WINDOW_MS) },
      })
        .then((online) => {
          if (online) return;
          return sendPushToUser(targetId, {
            title: `↩ ${senderLabel} vous a répondu`,
            body: preview,
            url: roomPath(room),
          });
        })
        .catch((e) => console.error("Push on group chat reply failed:", e));
    }

    return NextResponse.json(
      // Sender can't be blocked here - that was already rejected above.
      {
        success: true,
        data: toClientMessage(message.toObject(), {
          senderBlocked: false,
          viewerId: access.user.userId,
          viewerIsAdmin: access.user.role === "ADMIN",
          hasImage: !!image,
        }),
      },
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
