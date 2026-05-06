import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import { getSessionUser } from "@/utils/session";
import UserModel from "@/models/Users";
import SubscriptionPlanModel from "@/models/SubscriptionPlan";
import SubscriptionPaymentModel from "@/models/SubscriptionPayment";
import { directPay, isFapshiError } from "@/utils/fapshi";
import { addCorsHeaders, handleCorsPreFlight } from "@/utils/cors";

export async function OPTIONS(req: NextRequest) {
  return await handleCorsPreFlight(req) || new NextResponse(null, { status: 200 });
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("237") ? digits : `237${digits}`;
}

export async function POST(req: NextRequest) {
  try {
    // ── Authenticate ──────────────────────────────────────
    const sessionUser = await getSessionUser(req);
    if (!sessionUser) {
      const response = NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
      return addCorsHeaders(response, req.headers.get("origin") || undefined);
    }

    const { planId, phone } = await req.json();

    if (!planId || !phone) {
      const response = NextResponse.json(
        { success: false, message: "planId and phone are required" },
        { status: 400 }
      );
      return addCorsHeaders(response, req.headers.get("origin") || undefined);
    }

    await connectDB();

    // ── Validate user ────────────────────────────────────
    const dbUser = await UserModel.findById(sessionUser._id);
    if (!dbUser) {
      const response = NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
      return addCorsHeaders(response, req.headers.get("origin") || undefined);
    }

    // ── Validate phone matches account ───────────────────
    const normalizedInput = normalizePhone(phone);
    const normalizedAccount = normalizePhone(dbUser.phone);

    if (normalizedInput !== normalizedAccount) {
      const response = NextResponse.json(
        {
          success: false,
          message:
            "Le numéro saisi ne correspond pas à votre compte. Utilisez le numéro associé à votre compte.",
        },
        { status: 403 }
      );
      return addCorsHeaders(response, req.headers.get("origin") || undefined);
    }

    // ── Validate plan exists ─────────────────────────────
    const plan = await SubscriptionPlanModel.findById(planId);
    if (!plan || !plan.isActive) {
      const response = NextResponse.json(
        { success: false, message: "Subscription plan not found or inactive" },
        { status: 404 }
      );
      return addCorsHeaders(response, req.headers.get("origin") || undefined);
    }

    // ── Prevent duplicate pending payments ──────────────
    const existing = await SubscriptionPaymentModel.findOne({
      planId,
      userId: dbUser._id,
      status: "PENDING",
    });

    if (existing) {
      const response = NextResponse.json({
        success: true,
        data: {
          transactionId: existing.fapshiTransId,
          paymentId: existing._id,
          message: "Payment already initiated",
        },
      });
      return addCorsHeaders(response, req.headers.get("origin") || undefined);
    }

    // ── Call Fapshi ───────────────────────────────────────
    const paymentRes = await directPay({
      amount: plan.finalPrice,
      phone: normalizedAccount,
      externalId: planId.toString(),
      message: `Subscription: ${plan.name} - ${plan.finalPrice} FCFA`,
    });

    if (isFapshiError(paymentRes)) {
      const response = NextResponse.json(
        { success: false, message: paymentRes.message },
        { status: 400 }
      );
      return addCorsHeaders(response, req.headers.get("origin") || undefined);
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

    const response = NextResponse.json({
      success: true,
      data: {
        transactionId: paymentRes.transId,
        paymentId: payment._id,
        message: `Veuillez confirmer votre paiement de ${plan.finalPrice} FCFA pour ${plan.name}`,
      },
    });
    return addCorsHeaders(response, req.headers.get("origin") || undefined);
  } catch (err: any) {
    console.error("Subscription pay API error:", err);
    const response = NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
    return addCorsHeaders(response, req.headers.get("origin") || undefined);
  }
}
