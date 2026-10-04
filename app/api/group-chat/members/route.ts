import { NextRequest, NextResponse } from "next/server";
import GroupPresenceModel from "@/models/GroupPresence";
import UserModel from "@/models/Users";
import { connectDB } from "@/utils/ConnectDb";
import { requireGroupChatAccess } from "@/utils/groupChatAccess";
import { maskPhone } from "@/utils/maskPhone";
import { ONLINE_WINDOW_MS } from "@/utils/groupChatPresence";

const PAGE = 30;
const MAX_BATCHES = 6;

// ─── GET: the room's members, online first ──────────────────────────────────
// A "member" is someone who has actually been in this room (a presence row),
// newest activity first - so online people lead and the rest follow by how
// recently they were around. In the Premium room only people who can still
// enter it (admins and active subscribers) are listed; a lapsed subscriber's
// old presence row is skipped.
//
// Query: ?room=premium|global&cursor=<ISO lastSeenAt of the last row you have>
//
// The Premium room's member list is ADMINS ONLY: the size and make-up of the
// premium community is not something its members get to see. Refused here, not
// just hidden in the interface.
export async function GET(req: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const room = searchParams.get("room") === "global" ? "global" : "premium";
    const cursorRaw = searchParams.get("cursor");
    const cursorDate = cursorRaw ? new Date(cursorRaw) : null;
    const cursor = cursorDate && !Number.isNaN(cursorDate.getTime()) ? cursorDate : null;

    const access = await requireGroupChatAccess(room);
    if ("error" in access) {
      return NextResponse.json({ success: false, message: access.error }, { status: access.status });
    }

    const viewerIsAdmin = access.user.role === "ADMIN";
    if (room === "premium" && !viewerIsAdmin) {
      return NextResponse.json({ success: false, message: "Réservé aux administrateurs" }, { status: 403 });
    }
    const now = Date.now();

    const eligibility =
      room === "premium"
        ? { $or: [{ role: "ADMIN" }, { "subscription.status": "ACTIVE", "subscription.expiresAt": { $gt: new Date() } }] }
        : {};

    const members: {
      user: string; role: "USER" | "ADMIN"; label: string; online: boolean; lastSeenAt: string; isMe: boolean;
    }[] = [];
    let before = cursor;
    let exhausted = false;

    // Presence rows are paged; a row whose account is no longer eligible is
    // skipped, so keep pulling batches until a page is filled (bounded).
    for (let i = 0; i < MAX_BATCHES && members.length < PAGE + 1 && !exhausted; i++) {
      const rows = await GroupPresenceModel.find({ room, ...(before ? { lastSeenAt: { $lt: before } } : {}) })
        .sort({ lastSeenAt: -1 })
        .limit(PAGE * 2)
        .lean();
      if (rows.length < PAGE * 2) exhausted = true;
      if (rows.length === 0) break;
      before = rows[rows.length - 1].lastSeenAt;

      const users = await UserModel.find({ _id: { $in: rows.map((r) => r.user) }, ...eligibility })
        .select("phone role nickname")
        .lean();
      const byId = new Map(users.map((u) => [u._id.toString(), u]));

      for (const row of rows) {
        const u = byId.get(row.user.toString());
        if (!u) continue;
        members.push({
          user: u._id.toString(),
          role: u.role as "USER" | "ADMIN",
          label: u.role === "ADMIN" ? u.nickname || "Admin" : maskPhone(u.phone),
          online: now - new Date(row.lastSeenAt).getTime() <= ONLINE_WINDOW_MS,
          lastSeenAt: new Date(row.lastSeenAt).toISOString(),
          isMe: u._id.toString() === access.user.userId,
        });
      }
    }

    const hasMore = members.length > PAGE || !exhausted;
    const page = members.slice(0, PAGE);

    return NextResponse.json({
      success: true,
      data: page,
      nextCursor: hasMore && page.length > 0 ? page[page.length - 1].lastSeenAt : null,
      hideCounts: false,
    });
  } catch (error) {
    console.error("GET GROUP CHAT MEMBERS ERROR:", error);
    return NextResponse.json({ success: false, message: "Failed to fetch members" }, { status: 500 });
  }
}
