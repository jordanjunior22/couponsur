import { NextRequest, NextResponse } from "next/server";
import GroupPresenceModel from "@/models/GroupPresence";
import UserModel from "@/models/Users";
import { connectDB } from "@/utils/ConnectDb";
import { requireGroupChatAccess } from "@/utils/groupChatAccess";
import { maskPhone } from "@/utils/maskPhone";
import { ONLINE_WINDOW_MS } from "@/utils/groupChatPresence";

const MAX_LISTED = 60;

// ─── GET: who is in the room right now ──────────────────────────────────────
// Same definition of "online" as the header count (polled within
// ONLINE_WINDOW_MS). Phones are masked exactly like in messages, so the list
// reveals nothing the conversation doesn't already show.
// Query: ?room=premium|global
export async function GET(req: NextRequest) {
  try {
    await connectDB();

    const room = new URL(req.url).searchParams.get("room") === "global" ? "global" : "premium";

    const access = await requireGroupChatAccess(room);
    if ("error" in access) {
      return NextResponse.json({ success: false, message: access.error }, { status: access.status });
    }

    const since = new Date(Date.now() - ONLINE_WINDOW_MS);
    const [total, presences] = await Promise.all([
      GroupPresenceModel.countDocuments({ room, lastSeenAt: { $gte: since } }),
      GroupPresenceModel.find({ room, lastSeenAt: { $gte: since } }).sort({ lastSeenAt: -1 }).limit(MAX_LISTED).lean(),
    ]);

    const users = await UserModel.find({ _id: { $in: presences.map((p) => p.user) } })
      .select("phone role nickname")
      .lean();

    const members = users
      .map((u) => ({
        user: u._id.toString(),
        role: u.role as "USER" | "ADMIN",
        label: u.role === "ADMIN" ? u.nickname || "Admin" : maskPhone(u.phone),
        isMe: u._id.toString() === access.user.userId,
      }))
      // Admins first, then everyone else alphabetically - a stable order so
      // the list doesn't reshuffle on every open.
      .sort((a, b) => (a.role === b.role ? a.label.localeCompare(b.label) : a.role === "ADMIN" ? -1 : 1));

    return NextResponse.json({ success: true, data: members, total });
  } catch (error) {
    console.error("GET GROUP CHAT ONLINE ERROR:", error);
    return NextResponse.json({ success: false, message: "Failed to fetch online members" }, { status: 500 });
  }
}
