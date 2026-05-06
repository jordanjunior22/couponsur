import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import UserModel from "@/models/Users";
import SubscriptionPlanModel from "@/models/SubscriptionPlan";
import { verifyToken, getTokenFromRequest } from "@/utils/auth";
import { addCorsHeaders, handleCorsPreFlight } from "@/utils/cors";

export async function OPTIONS(req: NextRequest) {
  return await handleCorsPreFlight(req) || new NextResponse(null, { status: 200 });
}

export async function GET(req: NextRequest) {
  try {
    await connectDB();

    const token = await getTokenFromRequest(req);

    if (!token) {
      const response = NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
      return addCorsHeaders(response, req.headers.get("origin") || undefined);
    }

    const decoded = verifyToken(token);

    if (!decoded) {
      const response = NextResponse.json(
        { success: false, message: "Invalid token" },
        { status: 401 }
      );
      return addCorsHeaders(response, req.headers.get("origin") || undefined);
    }

    const user = await UserModel.findById(decoded.userId);

    if (!user) {
      const response = NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
      return addCorsHeaders(response, req.headers.get("origin") || undefined);
    }

    let profileData: any = {
      phone: user.phone,
      createdAt: user.createdAt,
      hasActiveSubscription: false,
    };

    // If user has subscription, fetch plan details
    if (user.subscription) {
      const plan = await SubscriptionPlanModel.findById(user.subscription.planId);

      profileData.subscription = {
        planName: plan?.name || "Plan inconnu",
        startDate: user.subscription.startDate,
        endDate: user.subscription.endDate,
        status: user.subscription.status,
        durationDays: plan?.durationDays || 0,
      };

      profileData.hasActiveSubscription = user.subscription.status === "active" &&
        new Date() < user.subscription.endDate;
    }

    const response = NextResponse.json({
      success: true,
      data: profileData,
    });
    return addCorsHeaders(response, req.headers.get("origin") || undefined);
  } catch (error: any) {
    console.error("Profile fetch error:", error);
    const response = NextResponse.json(
      { success: false, message: error.message || "Failed to fetch profile" },
      { status: 500 }
    );
    return addCorsHeaders(response, req.headers.get("origin") || undefined);
  }
}
