import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import UserModel from "@/models/Users";
import SubscriptionPaymentModel from "@/models/SubscriptionPayment";
import SubscriptionPlanModel from "@/models/SubscriptionPlan";
import { verifyToken, getTokenFromRequest } from "@/utils/auth";
import { paymentStatus, isFapshiError } from "@/utils/fapshi";
import { addCorsHeaders, handleCorsPreFlight } from "@/utils/cors";

export async function OPTIONS(req: NextRequest) {
  return await handleCorsPreFlight(req) || new NextResponse(null, { status: 200 });
}

export async function POST(req: NextRequest) {
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

    const { transId, planId } = await req.json();

    if (!transId || !planId) {
      const response = NextResponse.json(
        { success: false, message: "Missing transId or planId" },
        { status: 400 }
      );
      return addCorsHeaders(response, req.headers.get("origin") || undefined);
    }

    // Find the payment record
    const payment = await SubscriptionPaymentModel.findOne({
      fapshiTransId: transId,
      userId: decoded.userId,
    });

    if (!payment) {
      const response = NextResponse.json(
        { success: false, message: "Payment not found" },
        { status: 404 }
      );
      return addCorsHeaders(response, req.headers.get("origin") || undefined);
    }

    // Check payment status with Fapshi
    const statusData = await paymentStatus(transId);

    if (isFapshiError(statusData)) {
      const response = NextResponse.json(
        {
          success: false,
          message: statusData.message,
        },
        { status: statusData.statusCode }
      );
      return addCorsHeaders(response, req.headers.get("origin") || undefined);
    }

    if (statusData.status !== "SUCCESSFUL") {
      const response = NextResponse.json(
        {
          success: false,
          message: `Payment status is ${statusData.status}`,
          status: statusData.status,
        },
        { status: 400 }
      );
      return addCorsHeaders(response, req.headers.get("origin") || undefined);
    }

    // Get the plan
    const plan = await SubscriptionPlanModel.findById(planId);

    if (!plan) {
      const response = NextResponse.json(
        { success: false, message: "Plan not found" },
        { status: 404 }
      );
      return addCorsHeaders(response, req.headers.get("origin") || undefined);
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

    const response = NextResponse.json({
      success: true,
      message: "Subscription activated",
      data: {
        planName: plan.name,
        startDate: now,
        endDate: endDate,
      },
    });
    return addCorsHeaders(response, req.headers.get("origin") || undefined);
  } catch (error: any) {
    console.error("Subscription confirm error:", error);
    const response = NextResponse.json(
      { success: false, message: error.message || "Failed to confirm subscription" },
      { status: 500 }
    );
    return addCorsHeaders(response, req.headers.get("origin") || undefined);
  }
}
