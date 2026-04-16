import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import PickModel from "@/models/Picks";
import PaymentModel from "@/models/Payment";
import UserModel from "@/models/Users";
import { directPay, isFapshiError } from "@/utils/fapshi";
import { getSessionUser } from "@/utils/session"; // your JWT/cookie helper

export async function POST(req: NextRequest) {
  try {
    // ── Authenticate first ─────────────────────────────
    const sessionUser = await getSessionUser(req);
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { pickId, phone } = await req.json();

    if (!pickId || !phone) {
      return NextResponse.json(
        { error: "pickId and phone are required" },
        { status: 400 }
      );
    }

    // ── Validate that the phone belongs to the session user ──
    await connectDB();

    const dbUser = await UserModel.findById(sessionUser._id);
    if (!dbUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Normalize both for comparison (strip spaces, add country code etc.)
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

    // ── Prevent duplicate payments ─────────────────────
    const existing = await PaymentModel.findOne({
      pickId,
      phone: normalizedAccount, // always use the canonical phone
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

    // ── Call Fapshi ────────────────────────────────────
    const paymentRes = await directPay({
      amount: pick.price,
      phone: normalizedAccount, // always the account phone, never user input
      externalId: pickId,
      message: `Payment for ${pick.title}`,
    });

    if (isFapshiError(paymentRes)) {
      return NextResponse.json({ error: paymentRes.message }, { status: 400 });
    }

    // ── Save payment with userId for extra safety ──────
    const payment = await PaymentModel.create({
      pickId: pick._id,
      userId: dbUser._id,          // ← add this field
      phone: normalizedAccount,    // canonical account phone
      amount: pick.price,
      fapshiTransId: paymentRes.transId,
      status: "PENDING",
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

// Normalize: strip spaces, ensure +237 prefix
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  // If already has country code (237XXXXXXXXX), keep it; else prepend
  return digits.startsWith("237") ? digits : `237${digits}`;
}