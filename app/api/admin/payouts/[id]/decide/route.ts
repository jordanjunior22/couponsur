import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import { cookies } from "next/headers";
import { verifyToken } from "@/utils/auth";
import PayoutModel from "@/models/Payout";
import UserModel from "@/models/Users";
import { getSettings } from "@/models/Settings";
import { makePayout, isFapshiError } from "@/utils/fapshiPayout";
import mongoose from "mongoose";

async function requireSuperAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return { error: "Unauthorized", status: 401 };
  const decoded = verifyToken(token);
  if (!decoded) return { error: "Invalid token", status: 401 };
  if (decoded.role !== "ADMIN" || !decoded.isSuperAdmin) return { error: "Forbidden", status: 403 };
  return { user: decoded };
}

// ─── POST: Settle a payout request (SUPER ADMIN ONLY) ────────────────────
//
// DISBURSE actually moves money — it calls Fapshi's payout API right here.
// That call is async: a success response only means Fapshi ACCEPTED the
// transfer (status -> PROCESSING, fapshiTransId stored), not that it
// landed. The real outcome (PAID or FAILED) arrives later via
// app/api/payout/webhook. FAILED is retriable — DISBURSE is allowed again
// from that state, same as from REQUESTED.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();

    const auth = await requireSuperAdmin();
    if ("error" in auth) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { action, note } = body;

    if (action !== "DISBURSE" && action !== "REJECTED") {
      return NextResponse.json({ success: false, message: "action must be DISBURSE or REJECTED" }, { status: 400 });
    }

    const payout = await PayoutModel.findById(id);
    if (!payout) {
      return NextResponse.json({ success: false, message: "Payout not found" }, { status: 404 });
    }

    const retriable = payout.status === "REQUESTED" || payout.status === "FAILED";
    if (!retriable) {
      return NextResponse.json(
        { success: false, message: `Payout already ${payout.status.toLowerCase()}` },
        { status: 409 }
      );
    }

    if (action === "REJECTED") {
      payout.status = "REJECTED";
      payout.decidedAt = new Date();
      payout.decidedBy = new mongoose.Types.ObjectId(auth.user.userId);
      if (typeof note === "string" && note.trim()) payout.note = note.trim();
      await payout.save();
      return NextResponse.json({ success: true, data: payout });
    }

    // action === "DISBURSE"
    const admin = await UserModel.findById(payout.adminId).select("phone nickname");
    if (!admin) {
      return NextResponse.json({ success: false, message: "Admin not found" }, { status: 404 });
    }

    // The operator fee is withheld BEFORE the transfer, not learned after
    // it — a flat, admin-set rate (Settings.payoutOperatorFeePercent), not
    // anything Fapshi reports. netAmount is what's actually sent.
    const settings = await getSettings();
    const feePercent = settings.payoutOperatorFeePercent ?? 0;
    const operatorFee = Math.round(payout.amount * (feePercent / 100));
    const netAmount = payout.amount - operatorFee;

    if (netAmount < 100) {
      return NextResponse.json(
        { success: false, message: `Montant net après frais (${netAmount} XAF) sous le minimum Fapshi de 100 XAF` },
        { status: 400 }
      );
    }

    const result = await makePayout({
      amount: netAmount,
      phone: admin.phone,
      userId: String(admin._id),
      externalId: String(payout._id),
      message: "Paiement pronostics",
    });

    if (isFapshiError(result)) {
      return NextResponse.json(
        { success: false, message: `Fapshi: ${result.message}` },
        { status: 502 }
      );
    }

    payout.status = "PROCESSING";
    payout.fapshiTransId = result.transId;
    payout.operatorFee = operatorFee;
    payout.netAmount = netAmount;
    payout.decidedAt = new Date();
    payout.decidedBy = new mongoose.Types.ObjectId(auth.user.userId);
    if (typeof note === "string" && note.trim()) payout.note = note.trim();
    await payout.save();

    return NextResponse.json({ success: true, data: payout });
  } catch (error) {
    console.error("DECIDE PAYOUT ERROR:", error);
    return NextResponse.json({ success: false, message: "Failed to update payout" }, { status: 500 });
  }
}
