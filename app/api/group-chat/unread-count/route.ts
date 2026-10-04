import { NextRequest, NextResponse } from "next/server";
import GroupMessageModel, { GroupRoom } from "@/models/GroupMessage";
import { connectDB } from "@/utils/ConnectDb";
import { requireGroupChatAccess } from "@/utils/groupChatAccess";
import { maskPhone } from "@/utils/maskPhone";

function parseRoom(value: string | null): GroupRoom {
  return value === "global" ? "global" : "premium";
}

// ─── GET: how many messages in a room are newer than `since` ───────────────
// Powers the unread badges (bottom tab bar + room picker) with a single
// indexed count query instead of pulling full message bodies just to count
// them client-side. `since` is the caller's locally-stored "last viewed
// this room" timestamp (see hooks/useUnreadChat.ts) — omitted entirely on
// a first-ever visit, which counts the room's whole history as unread.
export async function GET(req: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const room = parseRoom(searchParams.get("room"));
    const sinceParam = searchParams.get("since");
    const since = sinceParam ? new Date(sinceParam) : new Date(0);

    const access = await requireGroupChatAccess(room);
    if ("error" in access) {
      return NextResponse.json({ success: false, message: access.error }, { status: access.status });
    }

    // Same legacy-missing-`room` handling as the history GET (see
    // app/api/group-chat/route.ts).
    const roomFilter = room === "premium" ? { $or: [{ room: "premium" }, { room: { $exists: false } }] } : { room: "global" };

    const [count, latest] = await Promise.all([
      GroupMessageModel.countDocuments({
        ...roomFilter,
        createdAt: { $gt: since },
        // Never counts the viewer's own messages - you already know what
        // you wrote, and it'd otherwise light the badge back up the moment
        // you send something.
        user: { $ne: access.user.userId },
      }),
      // The newest message, for the preview line on the room list.
      GroupMessageModel.findOne(roomFilter)
        .sort({ createdAt: -1 })
        .select("user role nickname phone text imageBytes createdAt")
        .lean(),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        count,
        latest: latest
          ? {
              senderLabel: latest.role === "ADMIN" ? latest.nickname || "Admin" : maskPhone(latest.phone),
              preview: latest.text ? latest.text.slice(0, 90) : (latest.imageBytes ?? 0) > 0 ? "📷 Image" : "",
              at: latest.createdAt,
              mine: latest.user.toString() === access.user.userId,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("GROUP CHAT UNREAD COUNT ERROR:", error);
    return NextResponse.json({ success: false, message: "Failed to fetch unread count" }, { status: 500 });
  }
}
