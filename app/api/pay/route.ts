import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import PickModel from "@/models/Picks";
import PaymentModel from "@/models/Payment";
import UserModel from "@/models/Users";
import { directPay, isFapshiError } from "@/utils/fapshi";
import { getSessionUser } from "@/utils/session"; // your JWT/cookie helper
import { captureRequestSignal } from "@/utils/requestSignal";
import { hasPickStarted } from "@/utils/pickKickoff";


export async function POST(req: NextRequest) {
  try {
    const sessionUser = await getSessionUser(req);
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { pickId, phone, fbc, fbp, sourceUrl } = await req.json();

    if (!pickId || !phone) {
      return NextResponse.json(
        { error: "pickId and phone are required" },
        { status: 400 }
      );
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
        {
          error:
            "Le numéro saisi ne correspond pas à votre compte. Utilisez le numéro associé à votre compte.",
        },
        { status: 403 }
      );
    }

    const pick = await PickModel.findById(pickId);
    if (!pick) {
      return NextResponse.json({ error: "Pick not found" }, { status: 404 });
    }

    // Sales close the moment the pick's first match kicks off — checked here
    // (not only in the UI) so a stale open tab or a hand-made request can't
    // buy a combo that has already started.
    if (hasPickStarted(pick)) {
      return NextResponse.json(
        { error: "Les ventes de ce pick sont fermées : le premier match a déjà commencé." },
        { status: 409 }
      );
    }

    const existing = await PaymentModel.findOne({
      pickId,
      phone: normalizedAccount,
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

    const paymentRes = await directPay({
      amount: pick.price,
      phone: normalizedAccount,
      externalId: pickId,
      message: `Payment for ${pick.title}`,
    });

    if (isFapshiError(paymentRes)) {
      return NextResponse.json({ error: paymentRes.message }, { status: 400 });
    }

    const signal = captureRequestSignal(req, { fbc, fbp, sourceUrl });

    const payment = await PaymentModel.create({
      pickId: pick._id,
      userId: dbUser._id,
      phone: normalizedAccount,
      amount: pick.price,
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
    console.error("Pay API error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("237") ? digits : `237${digits}`;
}