import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import UserModel from "@/models/Users";
import SubscriptionPaymentModel from "@/models/SubscriptionPayment";
import SubscriptionPlanModel from "@/models/SubscriptionPlan";
import { cookies } from "next/headers";
import { verifyToken } from "@/utils/auth";
import { paymentStatus } from "@/utils/fapshi";

export async function POST(req: NextRequest) {
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

    const { transId, planId } = await req.json();

    if (!transId || !planId) {
      return NextResponse.json(
        { success: false, message: "Missing transId or planId" },
        { status: 400 }
      );
    }

    // Find the payment record
    const payment = await SubscriptionPaymentModel.findOne({
      fapshiTransId: transId,
      userId: decoded.userId,
    });

    if (!payment) {
      return NextResponse.json(
        { success: false, message: "Payment not found" },
        { status: 404 }
      );
    }

    // Check payment status with Fapshi
    const statusData = await paymentStatus(transId);

    if (statusData.status !== "SUCCESSFUL") {
      return NextResponse.json(
        {
          success: false,
          message: `Payment status is ${statusData.status}`,
          status: statusData.status,
        },
        { status: 400 }
      );
    }

    // Get the plan
    const plan = await SubscriptionPlanModel.findById(planId);

    if (!plan) {
      return NextResponse.json(
        { success: false, message: "Plan not found" },
        { status: 404 }
      );
    }

    // Calculate subscription dates
    const now = new Date();
    const endDate = new Date(now.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);

    // Update user with active subscription
    const user = await UserModel.findByIdAndUpdate(
      decoded.userId,
      {
        subscription: {
          planId: plan._id,
          startDate: now,
          endDate: endDate,
          status: "active",
        },
      },
      { new: true }
    );

    // Update payment status to SUCCESSFUL
    await SubscriptionPaymentModel.findByIdAndUpdate(payment._id, {
      status: "SUCCESSFUL",
      dateConfirmed: new Date(),
    });

    return NextResponse.json({
      success: true,
      message: "Subscription activated",
      data: {
        planName: plan.name,
        startDate: now,
        endDate: endDate,
      },
    });
  } catch (error: any) {
    console.error("Subscription confirm error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to confirm subscription" },
      { status: 500 }
    );
  }
}
