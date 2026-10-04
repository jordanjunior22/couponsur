import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import GroupPresenceModel from "@/models/GroupPresence";
import UserModel from "@/models/Users";
import PickModel from "@/models/Picks";
import PaymentModel from "@/models/Payment";
import { connectDB } from "@/utils/ConnectDb";
import { requireGroupChatAccess } from "@/utils/groupChatAccess";
import { maskPhone } from "@/utils/maskPhone";
import { ONLINE_WINDOW_MS } from "@/utils/groupChatPresence";
import { claimProfileView } from "@/utils/groupProfileThrottle";

const HISTORY_SIZE = 10;
// Safety cap on how many of a member's purchased coupons are looked at.
const MAX_PICKS_SCANNED = 500;

function loyaltyLabel(monthsPaid: number): "Nouveau" | "Régulier" | "Fidèle" | "VIP" | null {
  if (monthsPaid >= 7) return "VIP";
  if (monthsPaid >= 4) return "Fidèle";
  if (monthsPaid >= 2) return "Régulier";
  if (monthsPaid >= 1) return "Nouveau";
  return null;
}

// ─── GET: one member's profile card ─────────────────────────────────────────
// Query: ?room=premium|global
//
// What it returns - and, deliberately, what it never does:
//   - the picture and a MASKED name (never the phone number),
//   - counts of the coupons they bought that have FINISHED, their win rate and
//     streak, a loyalty badge (a tier name, never an amount or a count of
//     payments), and the last HISTORY_SIZE finished coupons with the result;
//   - NO prices, NO payments, NO coupon still in play, and never the picks
//     inside a coupon - only its title, tier, total odds, date and result.
// A member who switched "Mes stats dans les groupes" off shows as private
// (admins can still look, marked as such).
export async function GET(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    await connectDB();

    const { userId } = await params;
    if (!Types.ObjectId.isValid(userId)) {
      return NextResponse.json({ success: false, message: "Membre introuvable" }, { status: 404 });
    }
    const room = new URL(req.url).searchParams.get("room") === "global" ? "global" : "premium";

    const access = await requireGroupChatAccess(room);
    if ("error" in access) {
      return NextResponse.json({ success: false, message: access.error }, { status: access.status });
    }

    // Opening your own card is free; everyone else's counts toward the
    // per-minute limit that stops anyone sweeping through all profiles.
    const isMe = userId === access.user.userId;
    if (!isMe && !(await claimProfileView(access.user.userId))) {
      return NextResponse.json(
        { success: false, message: "Trop de profils consultés d'un coup - réessayez dans une minute." },
        { status: 429 }
      );
    }

    // Only people who have been in THIS room can be looked up through it.
    const presence = await GroupPresenceModel.findOne({ room, user: userId }).select("lastSeenAt").lean();
    const target = await UserModel.findById(userId)
      .select("+avatar phone role nickname createdAt unlockedPickIds groupProfileVisible subscription")
      .lean();
    if (!presence || !target) {
      return NextResponse.json({ success: false, message: "Membre introuvable" }, { status: 404 });
    }
    if (room === "premium") {
      const stillEligible =
        target.role === "ADMIN" ||
        (target.subscription?.status === "ACTIVE" &&
          !!target.subscription.expiresAt &&
          new Date(target.subscription.expiresAt) > new Date());
      if (!stillEligible) {
        return NextResponse.json({ success: false, message: "Membre introuvable" }, { status: 404 });
      }
    }

    const viewerIsAdmin = access.user.role === "ADMIN";
    const isStaff = target.role === "ADMIN";
    const optedOut = target.groupProfileVisible === false;
    const showStats = !isStaff && (!optedOut || isMe || viewerIsAdmin);

    const base = {
      user: target._id.toString(),
      role: target.role as "USER" | "ADMIN",
      label: isStaff ? target.nickname || "Admin" : maskPhone(target.phone),
      avatar: target.avatar ?? null,
      online: Date.now() - new Date(presence.lastSeenAt).getTime() <= ONLINE_WINDOW_MS,
      lastSeenAt: new Date(presence.lastSeenAt).toISOString(),
      memberSince: target.createdAt,
      isMe,
    };

    // Staff don't buy coupons; a private profile shows nothing beyond the basics.
    if (!showStats) {
      return NextResponse.json({
        success: true,
        data: { ...base, isStaff, isPrivate: !isStaff && optedOut, stats: null, history: [], loyalty: null },
      });
    }

    // ── Coupons they bought that have finished ───────────────────────────────
    const ids = (target.unlockedPickIds ?? []).slice(-MAX_PICKS_SCANNED);
    const settled = ids.length
      ? await PickModel.find({ _id: { $in: ids }, is_published: true, outcome: { $in: ["WIN", "LOSS", "REFUNDED"] } })
          .select("title tier total_odds match_date outcome")
          .sort({ match_date: -1 })
          .lean()
      : [];

    const wins = settled.filter((p) => p.outcome === "WIN").length;
    const losses = settled.filter((p) => p.outcome === "LOSS").length;
    const refunds = settled.filter((p) => p.outcome === "REFUNDED").length;
    const decided = wins + losses + refunds;

    // Current streak: newest finished coupons first, counting wins until the
    // first loss (a refund is a void - it neither adds to nor breaks it).
    let streak = 0;
    for (const p of settled) {
      if (p.outcome === "WIN") streak++;
      else if (p.outcome === "LOSS") break;
    }

    // Loyalty badge: only the tier NAME leaves the server.
    const monthsPaid = await PaymentModel.countDocuments({ userId, paymentType: "SUBSCRIPTION", status: "SUCCESSFUL" });

    return NextResponse.json({
      success: true,
      data: {
        ...base,
        isStaff: false,
        isPrivate: false,
        // Set only when an admin is looking at a profile the member hid.
        hiddenFromMembers: optedOut && !isMe,
        stats: {
          played: decided,
          wins,
          losses,
          refunds,
          // A refund counts as a win here, same as the home page.
          winRate: decided > 0 ? Math.round(((wins + refunds) / decided) * 100) : null,
          streak,
        },
        loyalty: loyaltyLabel(monthsPaid),
        history: settled.slice(0, HISTORY_SIZE).map((p) => ({
          _id: p._id.toString(),
          title: p.title,
          tier: p.tier ?? null,
          totalOdds: p.total_odds,
          matchDate: p.match_date,
          outcome: p.outcome as "WIN" | "LOSS" | "REFUNDED",
        })),
      },
    });
  } catch (error) {
    console.error("GET GROUP CHAT MEMBER PROFILE ERROR:", error);
    return NextResponse.json({ success: false, message: "Failed to fetch profile" }, { status: 500 });
  }
}
