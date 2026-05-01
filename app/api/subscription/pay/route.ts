import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import { getSessionUser } from "@/utils/session";
import UserModel from "@/models/Users";
import SubscriptionPlanModel from "@/models/SubscriptionPlan";
import SubscriptionPaymentModel from "@/models/SubscriptionPayment";
import { directPay, isFapshiError } from "@/utils/fapshi";

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("237") ? digits : `237${digits}`;
}

export async function POST(req: NextRequest) {
  try {
    // ── Authenticate ──────────────────────────────────────
    const sessionUser = await getSessionUser(req);
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { planId, phone } = await req.json();

    if (!planId || !phone) {
      return NextResponse.json(
        { error: "planId and phone are required" },
        { status: 400 }
      );
    }

    await connectDB();

    // ── Validate user ────────────────────────────────────
    const dbUser = await UserModel.findById(sessionUser._id);
    if (!dbUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // ── Validate phone matches account ───────────────────
    const normalizedInput = normalizePhone(phone);
    const normalizedAccount = normalizePhone(dbUser.phone);

    if (normalizedInput !== normalizedAccount) {
      return NextResponse.json(
        {
          error:
            "Le numéro saisi ne correspond pas à votre compte. Utilisez le numéro associé à votre compte.",
        },
        { status: 403 }
      );
    }

    // ── Validate plan exists ─────────────────────────────
    const plan = await SubscriptionPlanModel.findById(planId);
    if (!plan || !plan.isActive) {
      return NextResponse.json(
        { error: "Subscription plan not found or inactive" },
        { status: 404 }
      );
    }

    // ── Prevent duplicate pending payments ──────────────
    const existing = await SubscriptionPaymentModel.findOne({
      planId,
      userId: dbUser._id,
      status: "PENDING",
    });

    if (existing) {
      return NextResponse.json({
        success: true,
        transId: existing.fapshiTransId,
        paymentId: existing._id,
        message: "Payment already initiated",
      });
    }

    // ── Call Fapshi ───────────────────────────────────────
    const paymentRes = await directPay({
      amount: plan.finalPrice,
      phone: normalizedAccount,
      externalId: planId.toString(),
      message: `Subscription: ${plan.name} - ${plan.finalPrice} FCFA`,
    });

    if (isFapshiError(paymentRes)) {
      return NextResponse.json({ error: paymentRes.message }, { status: 400 });
    }

    // ── Save subscription payment ──────────────────────────
    const payment = await SubscriptionPaymentModel.create({
      userId: dbUser._id,
      planId: plan._id,
      phone: normalizedAccount,
      amount: plan.finalPrice,
      fapshiTransId: paymentRes.transId,
      status: "PENDING",
    });

    return NextResponse.json({
      success: true,
      transId: paymentRes.transId,
      paymentId: payment._id,
    });
  } catch (err: any) {
    console.error("Subscription pay API error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
