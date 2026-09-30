import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import PayoutModel from "@/models/Payout";
import { payoutStatus, isFapshiError } from "@/utils/fapshiPayout";

// ── Fapshi webhook payload — same shape as GET /payment-status ─────────────
interface FapshiPayoutWebhookBody {
  transId: string;
  status: "CREATED" | "PENDING" | "SUCCESSFUL" | "FAILED" | "EXPIRED";
}

// ─── POST: Fapshi disbursement-service webhook ────────────────────────────
//
// This is the webhook URL configured on the PAYOUT service on Fapshi's
// dashboard — deliberately separate from app/api/payment/webhook (the
// collection service's webhook).
//
// The webhook body's `status` is NEVER trusted directly — it's only used
// as a "something changed, go check" trigger. The actual state transition
// is always driven by a fresh payoutStatus(transId) call, authenticated
// with our own FAPSHI_PAYOUT_API_USER/KEY, exactly like
// lib/paymentFulfillment.ts already does for buyer payments. This closes
// the gap entirely regardless of x-wh-secret being configured: even a
// forged webhook body can't move a payout to FAILED (and make it
// retriable, risking a real double-send) or to PAID, because whatever it
// claims gets thrown away in favor of what Fapshi itself reports when we
// ask directly.
//
// x-wh-secret is still checked as a lighter first gate (mainly to avoid
// spending our payoutStatus rate limit — 6 req/min per transId — answering
// spam), graceful if unset: warns and proceeds rather than leaving every
// payout stuck in PROCESSING because the webhook never gets to run.
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-wh-secret");
  const expected = process.env.FAPSHI_PAYOUT_WEBHOOK_SECRET;
  if (expected) {
    if (secret !== expected) {
      console.warn("Payout webhook: x-wh-secret mismatch — rejecting");
      return NextResponse.json({ received: true }, { status: 401 });
    }
  } else {
    console.warn("Payout webhook: FAPSHI_PAYOUT_WEBHOOK_SECRET not configured — accepting unverified (harmless: the real status is always re-verified below)");
  }

  let body: FapshiPayoutWebhookBody;
  try {
    body = await req.json();
  } catch {
    console.error("Payout webhook: invalid JSON body");
    return NextResponse.json({ received: true }, { status: 200 });
  }

  if (!body?.transId || !body?.status) {
    console.error("Payout webhook: missing transId or status", body);
    return NextResponse.json({ received: true }, { status: 200 });
  }

  if (!["SUCCESSFUL", "FAILED", "EXPIRED"].includes(body.status)) {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  try {
    await connectDB();
  } catch (err) {
    console.error("Payout webhook: DB connection failed:", err);
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const payout = await PayoutModel.findOne({ fapshiTransId: body.transId });
  if (!payout) {
    console.warn(`Payout webhook: no payout record found for transId=${body.transId}`);
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // Idempotent — a retried/duplicate webhook delivery for an already-PAID
  // payout is a harmless no-op. (Deliberately not applied to FAILED — that
  // one's meant to be retriable, see app/api/admin/payouts/[id]/decide.)
  if (payout.status === "PAID") {
    return NextResponse.json({ received: true });
  }

  // ── The only thing that actually decides anything ────────────────────
  const verified = await payoutStatus(body.transId);
  if (isFapshiError(verified)) {
    console.error(`Payout webhook: verification call failed for ${body.transId}: ${verified.message}`);
    // Don't change anything on a failed verification — a future webhook
    // retry (or a manual reconcile) gets another chance.
    return NextResponse.json({ received: true }, { status: 200 });
  }

  if (verified.status === "SUCCESSFUL") {
    // Compare against netAmount (what we actually asked Fapshi to send),
    // not the admin's gross entitlement — those intentionally differ by
    // the withheld operator fee.
    if (payout.netAmount != null && verified.amount !== payout.netAmount) {
      console.error(`Payout webhook: amount mismatch for ${body.transId} — expected netAmount=${payout.netAmount}, verified amount=${verified.amount}`);
      payout.status = "FAILED";
      payout.fapshiStatus = "AMOUNT_MISMATCH";
      await payout.save();
      return NextResponse.json({ received: true });
    }

    // operatorFee/netAmount were already fixed at DISBURSE time (a flat
    // rate, see decide/route.ts) — not overwritten here. This is purely a
    // diagnostic: if Fapshi's real per-transaction cut (verified.revenue)
    // diverges meaningfully from what we assumed, that's a signal the
    // configured rate may be off, worth someone's attention.
    if (typeof verified.revenue === "number" && payout.netAmount != null) {
      const actualFee = verified.amount - verified.revenue;
      const assumedFee = payout.amount - payout.netAmount;
      if (Math.abs(actualFee - assumedFee) > 1) {
        console.warn(`Payout webhook: fee mismatch for ${body.transId} — assumed ${assumedFee} XAF withheld, Fapshi reports ${actualFee} XAF actual operator cut`);
      }
    }

    payout.status = "PAID";
    payout.fapshiStatus = verified.status;
    await payout.save();
    console.log(`Payout ${payout._id} PAID (transId=${body.transId}, operatorFee=${payout.operatorFee})`);
    return NextResponse.json({ received: true });
  }

  if (verified.status === "FAILED" || verified.status === "EXPIRED") {
    // FAILED/EXPIRED — retriable, see app/api/admin/payouts/[id]/decide.
    payout.status = "FAILED";
    payout.fapshiStatus = verified.status;
    await payout.save();
    console.log(`Payout ${payout._id} FAILED (transId=${body.transId}, fapshiStatus=${verified.status})`);
    return NextResponse.json({ received: true });
  }

  // Fapshi's own live status is still CREATED/PENDING even though the
  // webhook body claimed otherwise (stale delivery, or a forged body) —
  // do nothing and wait for a real confirmation.
  console.warn(`Payout webhook: webhook claimed ${body.status} but live status is ${verified.status} for ${body.transId} — ignoring`);
  return NextResponse.json({ received: true });
}
