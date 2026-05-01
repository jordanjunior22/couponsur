import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import SubscriptionPaymentModel from "@/models/SubscriptionPayment";
import SubscriptionPlanModel from "@/models/SubscriptionPlan";
import UserModel from "@/models/Users";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { transId, status, externalId } = body;

    if (!transId || !status) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    await connectDB();

    // ── Find payment record ──────────────────────────────
    const payment = await SubscriptionPaymentModel.findOne({
      fapshiTransId: transId,
    });

    if (!payment) {
      return NextResponse.json(
        { error: "Payment record not found" },
        { status: 404 }
      );
    }

    // ── Update payment status ────────────────────────────
    payment.status = status === "SUCCESSFUL" ? "SUCCESSFUL" : "FAILED";

    if (payment.status === "SUCCESSFUL") {
      // ── Get plan details ────────────────────────────────
      const plan = await SubscriptionPlanModel.findById(payment.planId);
      if (!plan) {
        console.error(
          "Plan not found for payment:",
          payment._id,
          "plan:",
          payment.planId
        );
        payment.status = "FAILED";
        await payment.save();
        return NextResponse.json(
          { error: "Plan not found" },
          { status: 404 }
        );
      }

      // ── Calculate subscription dates ─────────────────
      const startDate = new Date();
      const endDate = new Date(
        startDate.getTime() + plan.durationDays * 24 * 60 * 60 * 1000
      );

      payment.subscriptionStartDate = startDate;
      payment.subscriptionEndDate = endDate;

      // ── Update user subscription ─────────────────────
      await UserModel.updateOne(
        { _id: payment.userId },
        {
          subscription: {
            planId: plan._id,
            startDate,
            endDate,
            status: "active",
          },
        }
      );
    }

    await payment.save();

    return NextResponse.json({
      success: true,
      message: `Payment status updated to ${payment.status}`,
    });
  } catch (err: any) {
    console.error("Subscription webhook error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
