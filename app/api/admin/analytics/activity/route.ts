// ─── app/api/admin/analytics/activity/route.ts ─────────────────────────────
// Powers the admin dashboard's Users → Activité view. Two purpose-built
// collections back this (see models/UserPresence.ts, models/ActivityHourBucket.ts):
//   - onlineNow/onlineUsers: UserPresence, real-time (last few minutes) —
//                  count AND the actual phone numbers, not just a number
//   - recentLogins: UserPresence, most recently active users regardless
//                  of the online window
//   - heatmap:     ActivityHourBucket grouped by weekday × hour-of-day (WAT)
//                  — the actual "when should I post" answer
//   - dailyTrend:  ActivityHourBucket grouped by day, distinct active users
// ─────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import { cookies } from "next/headers";
import { verifyToken } from "@/utils/auth";
import UserPresenceModel from "@/models/UserPresence";
import ActivityHourBucketModel, { ACTIVITY_RETENTION_DAYS } from "@/models/ActivityHourBucket";
import UserModel from "@/models/Users";

async function requireAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return { error: "Unauthorized", status: 401 };
  const decoded = verifyToken(token);
  if (!decoded) return { error: "Invalid token", status: 401 };
  if (decoded.role !== "ADMIN") return { error: "Forbidden", status: 403 };
  return { user: decoded };
}

// Matches ActivityPing's 3-minute interval + a buffer for network/timer
// jitter — a visitor pinging on schedule should never fall just outside
// this window between two pings.
const ONLINE_WINDOW_MS = 5 * 60 * 1000;
// Deliberately narrower than ACTIVITY_RETENTION_DAYS (180) — 90 days is
// plenty to see a stable weekly rhythm without older, less-relevant data
// diluting recent patterns.
const HEATMAP_WINDOW_DAYS = 90;
const TREND_DAYS = 14;
// A count alone doesn't tell the admin WHO is active — these cap the two
// name-bearing lists so the response stays small regardless of user count.
const ONLINE_LIST_LIMIT = 100;
// Now that the frontend paginates this list (10/page — see
// ACTIVITY_LIST_PAGE_SIZE in the dashboard), a higher cap is actually
// browsable instead of just a longer scroll.
const RECENT_LOGINS_LIMIT = 50;

export async function GET() {
  try {
    await connectDB();

    const auth = await requireAdmin();
    if ("error" in auth) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const now = new Date();

    const onlineSince = new Date(now.getTime() - ONLINE_WINDOW_MS);
    const onlineNow = await UserPresenceModel.countDocuments({ lastPingAt: { $gte: onlineSince } });

    // ─── Who, not just how many ─────────────────────────────────────────
    const [onlineDocs, recentDocs] = await Promise.all([
      UserPresenceModel.find({ lastPingAt: { $gte: onlineSince } })
        .sort({ lastPingAt: -1 })
        .limit(ONLINE_LIST_LIMIT)
        .lean(),
      UserPresenceModel.find({})
        .sort({ lastPingAt: -1 })
        .limit(RECENT_LOGINS_LIMIT)
        .lean(),
    ]);

    const neededIds = [...new Set([...onlineDocs, ...recentDocs].map((d) => d.userId.toString()))];
    const usersById = new Map(
      (await UserModel.find({ _id: { $in: neededIds } }).select("phone").lean())
        .map((u) => [u._id.toString(), u.phone])
    );

    const toEntry = (d: { userId: import("mongoose").Types.ObjectId; lastPingAt: Date }) => ({
      userId: d.userId.toString(),
      phone: usersById.get(d.userId.toString()) || "?",
      lastPingAt: d.lastPingAt,
    });
    const onlineUsers = onlineDocs.map(toEntry);
    const recentLogins = recentDocs.map(toEntry);

    // ─── Heatmap: weekday × hour-of-day (WAT), summed pings ─────────────
    const heatmapSince = new Date(now.getTime() - HEATMAP_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const heatmapRaw = await ActivityHourBucketModel.aggregate([
      { $match: { hourStart: { $gte: heatmapSince } } },
      {
        $group: {
          _id: {
            // $dayOfWeek: 1=Sunday..7=Saturday — converted below to JS's
            // 0=Sunday..6=Saturday so the frontend can index with
            // Date.getDay() conventions without a second mapping.
            weekday: { $dayOfWeek: { date: "$hourStart", timezone: "+01:00" } },
            hour: { $hour: { date: "$hourStart", timezone: "+01:00" } },
          },
          pings: { $sum: "$pings" },
        },
      },
    ]);

    // Dense 7×24 grid, zero-filled — the frontend shouldn't have to handle
    // sparse data for hours with no recorded activity.
    const heatmap: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const row of heatmapRaw) {
      const weekday = row._id.weekday - 1;
      const hour = row._id.hour;
      if (weekday >= 0 && weekday < 7 && hour >= 0 && hour < 24) {
        heatmap[weekday][hour] = row.pings;
      }
    }

    // ─── Daily trend: distinct active users per day, last TREND_DAYS ────
    const trendSince = new Date(now.getTime() - TREND_DAYS * 24 * 60 * 60 * 1000);
    const trendRaw = await ActivityHourBucketModel.aggregate([
      { $match: { hourStart: { $gte: trendSince } } },
      {
        $group: {
          _id: {
            day: { $dateToString: { format: "%Y-%m-%d", date: "$hourStart", timezone: "+01:00" } },
            userId: "$userId",
          },
        },
      },
      { $group: { _id: "$_id.day", activeUsers: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);

    const dailyTrend = trendRaw.map((r) => ({ date: r._id as string, activeUsers: r.activeUsers as number }));

    return NextResponse.json({
      success: true,
      data: { onlineNow, onlineUsers, recentLogins, heatmap, dailyTrend, retentionDays: ACTIVITY_RETENTION_DAYS },
    });
  } catch (error) {
    console.error("GET ACTIVITY ANALYTICS ERROR:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch activity analytics" },
      { status: 500 }
    );
  }
}
