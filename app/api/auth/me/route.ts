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

    // ─── Update lastLoginAt if inactive for 5+ minutes ───────
    const now = new Date();
    if (!user.lastLoginAt || now.getTime() - user.lastLoginAt.getTime() > FIVE_MINUTES) {
      user.lastLoginAt = now;
      await user.save();
    }

    // ─── Check active subscription ─────────────────────────
    const hasActiveSubscription =
      user.subscription &&
      user.subscription.status === "active" &&
      now < user.subscription.endDate;

    // Convert to plain object to ensure all fields are included
    const userObj = user.toObject();
    const userResponse = {
      _id: userObj._id,
      phone: userObj.phone,
      role: userObj.role,
      unlockedPickIds: userObj.unlockedPickIds,
      hasActiveSubscription: hasActiveSubscription || false,
      subscriptionEndDate: userObj.subscription?.endDate,
    };

    return NextResponse.json({ user: userResponse });
  } catch (error) {
    return NextResponse.json({ user: null });
  }
}