import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/utils/auth";
import User from "@/models/Users";
import { connectDB } from "@/utils/ConnectDb";

const FIVE_MINUTES = 5 * 60 * 1000;

export async function GET() {
  try {
    await connectDB();

    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;

    if (!token) {
      return NextResponse.json({ user: null });
    }

    const decoded = verifyToken(token);

    if (!decoded) {
      return NextResponse.json({ user: null });
    }

    const user = await User.findById(decoded.userId).select("-password");

    // ─── Guard null ───────────────────────────────────────────
    if (!user) {
      return NextResponse.json({ user: null });
    }

    let needsSave = false;

    // ─── Update lastLoginAt if inactive for 5+ minutes ───────
    const now = new Date();
    if (!user.lastLoginAt || now.getTime() - user.lastLoginAt.getTime() > FIVE_MINUTES) {
      user.lastLoginAt = now;
      needsSave = true;
    }

    // ─── Lazily flip a lapsed subscription to EXPIRED ────────
    // The cron (expire-subscriptions) does this in bulk once a day, but
    // that leaves a window where the DB still says ACTIVE even though
    // access is already correctly cut off client-side (hasActiveSubscription
    // checks expiresAt directly). Doing it here too means the status is
    // corrected the moment this specific user is looked up, not just once
    // a day — so anything reading user.subscription.status (admin badges,
    // future queries) is accurate immediately, not just eventually.
    if (
      user.subscription?.status === "ACTIVE" &&
      user.subscription.expiresAt &&
      user.subscription.expiresAt < now
    ) {
      user.subscription.status = "EXPIRED";
      needsSave = true;
    }

    if (needsSave) {
      await user.save();
    }

    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json({ user: null });
  }
}