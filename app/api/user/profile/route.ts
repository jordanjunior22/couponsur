import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import UserModel from "@/models/Users";
import SubscriptionPlanModel from "@/models/SubscriptionPlan";
import { cookies } from "next/headers";
import { verifyToken } from "@/utils/auth";

export async function GET(req: NextRequest) {
  try {
    await connectDB();

    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;

    if (!token) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const decoded = verifyToken(token);

    if (!decoded) {
      return NextResponse.json(
        { success: false, message: "Invalid token" },
        { status: 401 }
      );
    }

    const user = await UserModel.findById(decoded.userId);

    if (!user) {
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
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

    return NextResponse.json({
      success: true,
      data: profileData,
    });
  } catch (error: any) {
    console.error("Profile fetch error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to fetch profile" },
      { status: 500 }
    );
  }
}
