import { NextRequest, NextResponse } from "next/server";
import GroupPresenceModel from "@/models/GroupPresence";
import { connectDB } from "@/utils/ConnectDb";
import { requireGroupChatAccess } from "@/utils/groupChatAccess";

// ─── POST: "I'm typing" ping ────────────────────────────────────────────────
// Body: { room }. Best-effort and cheap: stamps typingAt on the sender's
// presence row; other members' next poll shows "X écrit…" while it's fresh.
// A muted member can't post, so they never advertise typing either.
export async function POST(req: NextRequest) {
  try {
    await connectDB();

    const body = await req.json().catch(() => ({}));
    const room = body?.room === "global" ? "global" : "premium";

    const access = await requireGroupChatAccess(room);
    if ("error" in access) {
      return NextResponse.json({ success: false, message: access.error }, { status: access.status });
    }
    if (access.user.blocked) {
      return NextResponse.json({ success: true });
    }

    const now = new Date();
    await GroupPresenceModel.findOneAndUpdate(
      { room, user: access.user.userId },
      { $set: { typingAt: now, lastSeenAt: now } },
      { upsert: true }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("GROUP CHAT TYPING ERROR:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
