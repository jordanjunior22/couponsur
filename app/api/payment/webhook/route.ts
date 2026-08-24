import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import PaymentModel from "@/models/Payment";
import { fulfillPaymentByTransId } from "@/lib/paymentFulfillment";

// ── Full Fapshi webhook payload shape (from their docs) ────────────────────
interface FapshiWebhookBody {
  transId: string;
  status: "CREATED" | "PENDING" | "SUCCESSFUL" | "FAILED" | "EXPIRED";
  medium?: "mobile money" | "orange money";
  serviceName?: string;
  amount: number;
  revenue?: number;
  payerName?: string;
  email?: string;
  redirectUrl?: string;
  externalId?: string;   // ← this is your pickId if you passed it
  userId?: string;   // ← this is your userId if you passed it
  webhook?: string;
  financialTransId?: string;
  dateInitiated?: string;
  dateConfirmed?: string;
}

export async function POST(req: NextRequest) {
  let body: FapshiWebhookBody;
  try {
    body = await req.json();
    console.log("Webhook received:", JSON.stringify(body, null, 2));
  } catch {
    console.error("Webhook: invalid JSON body");
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // ── 3. Validate required fields ──────────────────────────────────────────
  if (!body?.transId || !body?.status) {
    console.error("Webhook: missing transId or status", body);
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // ── 4. NOTE: Fapshi ONLY sends SUCCESSFUL, FAILED, EXPIRED via webhook.
  //       CREATED and PENDING are NEVER sent — polling handles those.
  //       Only process the three real statuses.
  if (!["SUCCESSFUL", "FAILED", "EXPIRED"].includes(body.status)) {
    console.log(`Webhook: ignoring status ${body.status} — not actionable`);
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // ── 5. Connect DB and find payment ───────────────────────────────────────
  try {
    await connectDB();
  } catch (err) {
    console.error("Webhook: DB connection failed:", err);
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const payment = await PaymentModel.findOne({ fapshiTransId: body.transId });

  if (!payment) {
    // Could arrive before /api/pay saved the record (race condition).
    // Log and return 200 — we can't retry but at least we don't error.
    console.warn(`Webhook: no payment record found for transId=${body.transId}`);
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // ── 6. Handle each status ─────────────────────────────────────────────────
  switch (body.status) {

    case "SUCCESSFUL": {
      // Delegates to the same fulfillment logic the client status-poll
      // endpoint uses — re-verifies against Fapshi itself (never trusts
      // this webhook body blindly) and is idempotent, so it's harmless if
      // the poll already fulfilled this transId first.
      const result = await fulfillPaymentByTransId(body.transId);

      if (result.outcome === "error") {
        console.error(`Webhook: fulfillment failed for ${body.transId}:`, result.message);
      } else if (result.outcome === "not_successful") {
        console.warn(`Webhook: verification returned ${result.fapshiStatus} for ${body.transId}`);
      } else if (result.outcome === "amount_mismatch") {
        console.error(`Webhook: amount mismatch for ${body.transId}`);
      } else {
        console.log(`Webhook: ${body.transId} → ${result.outcome}`);
      }

      return NextResponse.json({ received: true });
    }

    case "FAILED": {
      await PaymentModel.updateOne(
        { fapshiTransId: body.transId },
        { status: "FAILED" }
      );
      console.log(`Payment FAILED: transId=${body.transId}`);
      return NextResponse.json({ received: true });
    }

    case "EXPIRED": {
      await PaymentModel.updateOne(
        { fapshiTransId: body.transId },
        { status: "EXPIRED" }
      );
      console.log(`Payment EXPIRED: transId=${body.transId}`);
      return NextResponse.json({ received: true });
    }

    default:
      return NextResponse.json({ received: true });
  }
}