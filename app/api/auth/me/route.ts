import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getTokenFromRequest } from "@/utils/auth";
import User from "@/models/Users";
import SubscriptionPlanModel from "@/models/SubscriptionPlan";
import { connectDB } from "@/utils/ConnectDb";
import { addCorsHeaders, handleCorsPreFlight } from "@/utils/cors";

const FIVE_MINUTES = 5 * 60 * 1000;

export async function OPTIONS(req: NextRequest) {
  return await handleCorsPreFlight(req) || new NextResponse(null, { status: 200 });
}

export async function GET(req: NextRequest) {
  try {
    await connectDB();

    const token = await getTokenFromRequest(req);

    if (!token) {
      const response = NextResponse.json({ user: null });
      return addCorsHeaders(response, req.headers.get("origin") || undefined);
    }

    const decoded = verifyToken(token);

    if (!decoded) {
      const response = NextResponse.json({ user: null });
      return addCorsHeaders(response, req.headers.get("origin") || undefined);
    }

    const user = await User.findById(decoded.userId).select("-password");

    // ─── Guard null ───────────────────────────────────────────
    if (!user) {
      const response = NextResponse.json({ user: null });
      return addCorsHeaders(response, req.headers.get("origin") || undefined);
    }

    // ─── Update lastLoginAt if inactive for 5+ minutes ───────
    const now = new Date();
    if (!user.lastLoginAt || now.getTime() - user.lastLoginAt.getTime() > FIVE_MINUTES) {
      user.lastLoginAt = now;
      await user.save();
    }

    // Convert to plain object to ensure all fields are included
    const userObj = user.toObject();
    const userResponse: any = {
      _id: userObj._id,
      phone: userObj.phone,
      role: userObj.role,
      unlockedPickIds: userObj.unlockedPickIds,
      hasActiveSubscription: false,
    };

    // If user has subscription, fetch plan details and include full subscription info
    if (user.subscription) {
      const plan = await SubscriptionPlanModel.findById(user.subscription.planId);
      const isActive = user.subscription.status === "active" && now < user.subscription.endDate;

      userResponse.subscription = {
        planName: plan?.name || "Plan inconnu",
        startDate: user.subscription.startDate,
        endDate: user.subscription.endDate,
        status: user.subscription.status,
        durationDays: plan?.durationDays || 0,
      };

      userResponse.hasActiveSubscription = isActive;
      userResponse.subscriptionEndDate = user.subscription.endDate;
    }

    const response = NextResponse.json({ user: userResponse });
    return addCorsHeaders(response, req.headers.get("origin") || undefined);
  } catch (error) {
    const response = NextResponse.json({ user: null });
    return addCorsHeaders(response, req.headers.get("origin") || undefined);
  }
}