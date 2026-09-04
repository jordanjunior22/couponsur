// ─── app/api/activity/ping/route.ts ────────────────────────────────────────
// Lightweight "I'm here" beacon from a logged-in visitor's browser (see
// components/ActivityPing.tsx for the client side). Powers the admin
// dashboard's Users → Activité view: UserPresence answers "who's online
// right now", ActivityHourBucket accumulates the historical when-are-my-
// users-active pattern (day×hour heatmap + daily trend).
//
// No request body — identity comes from the session cookie, same as every
// other authenticated route in this app.
// ─────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import { cookies } from "next/headers";
import { verifyToken } from "@/utils/auth";
import UserPresenceModel from "@/models/UserPresence";
import ActivityHourBucketModel from "@/models/ActivityHourBucket";

/**
 * The start of the current hour, in WAT (UTC+1), as a real absolute Date —
 * same shift-by-1h convention as getTodayWAT() in lib/soccervital.ts, so
 * "hour boundary" means the same wall-clock thing everywhere in this app.
 */
function truncateToHourWAT(d: Date = new Date()): Date {
  const wat = new Date(d.getTime() + 60 * 60 * 1000);
  wat.setUTCMinutes(0, 0, 0);
  return new Date(wat.getTime() - 60 * 60 * 1000);
}

export async function POST() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) {
      // Not an error — logged-out visitors just aren't tracked (see
      // components/ActivityPing.tsx, which doesn't even call this unless
      // a user is logged in). Quietly no-op rather than 401-spamming.
      return NextResponse.json({ success: true, tracked: false });
    }
    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ success: true, tracked: false });
    }

    await connectDB();

    const now = new Date();
    const hourStart = truncateToHourWAT(now);

    await Promise.all([
      UserPresenceModel.findOneAndUpdate(
        { userId: decoded.userId },
        { $set: { lastPingAt: now } },
        { upsert: true }
      ),
      ActivityHourBucketModel.findOneAndUpdate(
        { userId: decoded.userId, hourStart },
        { $inc: { pings: 1 } },
        { upsert: true }
      ),
    ]);

    return NextResponse.json({ success: true, tracked: true });
  } catch (error) {
    // A missed ping is never worth surfacing to the visitor — just log it.
    console.error("ACTIVITY PING ERROR:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
