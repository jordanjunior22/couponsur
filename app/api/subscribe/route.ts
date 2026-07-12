import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import PaymentModel from "@/models/Payment";
import UserModel from "@/models/Users";
import { getSettings } from "@/models/Settings";
import { directPay, isFapshiError } from "@/utils/fapshi";
import { getSessionUser } from "@/utils/session";
import { captureRequestSignal } from "@/utils/requestSignal";

export async function POST(req: NextRequest) {
  try {
    const sessionUser = await getSessionUser(req);
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { phone, fbc, fbp, sourceUrl } = await req.json();
    if (!phone) {
      return NextResponse.json({ error: "phone is required" }, { status: 400 });
    }

    await connectDB();

    const dbUser = await UserModel.findById(sessionUser._id);
    if (!dbUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const normalizedInput = normalizePhone(phone);
    const normalizedAccount = normalizePhone(dbUser.phone);

    if (normalizedInput !== normalizedAccount) {
      return NextResponse.json(
        { error: "Le numéro saisi ne correspond pas à votre compte. Utilisez le numéro associé à votre compte." },
        { status: 403 }
      );
    }

    if (dbUser.subscription?.status === "ACTIVE" && dbUser.subscription.expiresAt && dbUser.subscription.expiresAt > new Date()) {
      return NextResponse.json(
        { error: "Vous avez déjà un abonnement actif." },
        { status: 400 }
      );
    }

    const existing = await PaymentModel.findOne({
      userId: dbUser._id,
      paymentType: "SUBSCRIPTION",
      phone: normalizedAccount,
      status: "PENDING",
    });

    if (existing) {
      return NextResponse.json({
        success: true,
        transId: existing.fapshiTransId,
        paymentId: existing._id,
        message: "Subscription payment already initiated",
      });
    }

    const settings = await getSettings();
    const price = settings.subscriptionMonthlyPrice;

    const paymentRes = await directPay({
      amount: price,
      phone: normalizedAccount,
      externalId: `sub-${dbUser._id}-${Date.now()}`,
      message: "Abonnement mensuel Coupon Sûr",
    });

    if (isFapshiError(paymentRes)) {
      return NextResponse.json({ error: paymentRes.message }, { status: 400 });
    }

    const signal = captureRequestSignal(req, { fbc, fbp, sourceUrl });

    const payment = await PaymentModel.create({
      paymentType: "SUBSCRIPTION",
      userId: dbUser._id,
      phone: normalizedAccount,
      amount: price,
      fapshiTransId: paymentRes.transId,
      status: "PENDING",
      ...signal,
    });

    return NextResponse.json({
      success: true,
      transId: paymentRes.transId,
      paymentId: payment._id,
    });
  } catch (err: any) {
    console.error("Subscribe API error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("237") ? digits : `237${digits}`;
}