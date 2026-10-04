import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/utils/ConnectDb";
import UserModel from "@/models/Users";
import { requireGroupChatAccess } from "@/utils/groupChatAccess";

const MAX_IDS = 50;

// ─── GET: profile pictures for a set of chat senders ───────────────────────
// Kept off the message payload on purpose: messages are polled every few
// seconds, and repeating a picture on each of them would balloon every
// response. The room fetches this once per sender it hasn't seen yet and
// caches the result client-side.
//
// Query: ?room=premium|global&ids=<userId>,<userId>,...
// Returns: { avatars: { [userId]: dataUri } } — senders with no picture are
// simply absent from the map.
export async function GET(req: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const room = searchParams.get("room") === "global" ? "global" : "premium";

    // Same gate as reading the room's messages.
    const access = await requireGroupChatAccess(room);
    if ("error" in access) {
      return NextResponse.json({ success: false, message: access.error }, { status: access.status });
    }

    const ids = (searchParams.get("ids") || "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => Types.ObjectId.isValid(s))
      .slice(0, MAX_IDS);

    if (ids.length === 0) {
      return NextResponse.json({ success: true, avatars: {} });
    }

    const users = await UserModel.find({ _id: { $in: ids }, avatar: { $ne: null } }).select("+avatar");
    const avatars: Record<string, string> = {};
    for (const u of users) {
      if (u.avatar) avatars[u._id.toString()] = u.avatar;
    }

    return NextResponse.json({ success: true, avatars });
  } catch (error) {
    console.error("GET GROUP CHAT AVATARS ERROR:", error);
    return NextResponse.json({ success: false, message: "Failed to fetch avatars" }, { status: 500 });
  }
}
