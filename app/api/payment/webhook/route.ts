import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import PaymentModel from "@/models/Payment";
import UserModel from "@/models/Users";
import { paymentStatus, isFapshiError } from "@/utils/fapshi";

// ── Full Fapshi webhook payload shape (from their docs) ────────────────────
interface FapshiWebhookBody {
  transId:          string;
  status:           "CREATED" | "PENDING" | "SUCCESSFUL" | "FAILED" | "EXPIRED";
  medium?:          "mobile money" | "orange money";
  serviceName?:     string;
  amount:           number;
  revenue?:         number;
  payerName?:       string;
  email?:           string;
  redirectUrl?:     string;
  externalId?:      string;   // ← this is your pickId if you passed it
  userId?:          string;   // ← this is your userId if you passed it
  webhook?:         string;
  financialTransId?:string;
  dateInitiated?:   string;
  dateConfirmed?:   string;
}

export async function POST(req: NextRequest) {
  // ── 1. Verify Fapshi credentials sent in headers ────────────────────────
  // Fapshi sends apiuser + apikey headers with every webhook call.
  // Verify them to reject spoofed requests.
  const incomingApiUser = req.headers.get("apiuser");
  const incomingApiKey  = req.headers.get("apikey");

  const expectedApiUser = process.env.FAPSHI_API_USER;
  const expectedApiKey  = process.env.FAPSHI_API_KEY;

  if (
    !incomingApiUser ||
    !incomingApiKey  ||
    incomingApiUser !== expectedApiUser ||
    incomingApiKey  !== expectedApiKey
  ) {
    console.error("Webhook: invalid or missing Fapshi credentials in headers");
    // Still return 200 — Fapshi doesn't retry, so don't let it think it failed
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // ── 2. Parse body ────────────────────────────────────────────────────────
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
      // Idempotency guard — already processed
      if (payment.status === "SUCCESSFUL") {
        console.log(`Webhook: transId=${body.transId} already SUCCESSFUL, skipping`);
        return NextResponse.json({ received: true });
      }

      // Verify with Fapshi before trusting the webhook
      const verified = await paymentStatus(body.transId);

      if (isFapshiError(verified)) {
        console.error(`Webhook: verification failed for ${body.transId}:`, verified.message);
        return NextResponse.json({ received: true });
      }

      if (verified.status !== "SUCCESSFUL") {
        console.warn(`Webhook: verification returned ${verified.status} for ${body.transId}`);
        return NextResponse.json({ received: true });
      }

      // Amount integrity check
      if (verified.amount !== payment.amount) {
        console.error(`Webhook: amount mismatch for ${body.transId} — expected ${payment.amount}, got ${verified.amount}`);
        await PaymentModel.updateOne(
          { fapshiTransId: body.transId },
          { status: "FAILED" }
        );
        return NextResponse.json({ received: true });
      }

      // Mark payment successful
      await PaymentModel.updateOne(
        { fapshiTransId: body.transId },
        { status: "SUCCESSFUL", dateConfirmed: new Date() }
      );

      // Unlock pick for the user
      // Try userId first (if you passed it to Fapshi), fall back to phone
      const userFilter = payment.userId
        ? { _id: payment.userId }
        : { phone: payment.phone };

      const updateResult = await UserModel.updateOne(userFilter, {
        $addToSet: { unlockedPickIds: payment.pickId },
      });

      if (updateResult.matchedCount === 0) {
        console.error(`Webhook: user not found with filter`, userFilter);
      } else {
        console.log(`✅ Unlocked pick ${payment.pickId} for user`, userFilter);
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