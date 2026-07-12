import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import PaymentModel from "@/models/Payment";
import Pick from "@/models/Picks";
import UserModel from "@/models/Users";
import { paymentStatus, isFapshiError } from "@/utils/fapshi";
import { sendServerEvent } from "@/lib/metaConversions";

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
      if (payment.status === "SUCCESSFUL") {
        console.log(`Webhook: transId=${body.transId} already SUCCESSFUL, skipping`);
        return NextResponse.json({ received: true });
      }

      const verified = await paymentStatus(body.transId);

      if (isFapshiError(verified)) {
        console.error(`Webhook: verification failed for ${body.transId}:`, verified.message);
        return NextResponse.json({ received: true });
      }

      if (verified.status !== "SUCCESSFUL") {
        console.warn(`Webhook: verification returned ${verified.status} for ${body.transId}`);
        return NextResponse.json({ received: true });
      }

      if (verified.amount !== payment.amount) {
        console.error(`Webhook: amount mismatch for ${body.transId} — expected ${payment.amount}, got ${verified.amount}`);
        await PaymentModel.updateOne({ fapshiTransId: body.transId }, { status: "FAILED" });
        return NextResponse.json({ received: true });
      }

      await PaymentModel.updateOne(
        { fapshiTransId: body.transId },
        { status: "SUCCESSFUL", dateConfirmed: new Date() }
      );

      const userFilter = payment.userId
        ? { _id: payment.userId }
        : { phone: payment.phone };

      if (payment.paymentType === "SUBSCRIPTION") {
        const now = new Date();
        const expiresAt = new Date(now);
        expiresAt.setMonth(expiresAt.getMonth() + 1);

        const updateResult = await UserModel.updateOne(userFilter, {
          $set: {
            "subscription.status": "ACTIVE",
            "subscription.plan": "MONTHLY",
            "subscription.startedAt": now,
            "subscription.expiresAt": expiresAt,
          },
        });

        if (updateResult.matchedCount === 0) {
          console.error(`Webhook: user not found for subscription activation`, userFilter);
        } else {
          console.log(`✅ Activated subscription for user`, userFilter, `until ${expiresAt.toISOString()}`);
        }

        // Server-side Purchase event — event_id MUST match the client-side
        // one fired in SubscribePayment's success screen (`sub-purchase-${transId}`)
        await sendServerEvent({
          eventName: "Purchase",
          eventId: `sub-purchase-${body.transId}`,
          value: payment.amount,
          currency: "XAF",
          contentName: "Abonnement Mensuel",
          contentType: "product",
          userPhone: payment.phone,
          country: "cm",
          clientIp: payment.clientIp ?? undefined,
          userAgent: payment.userAgent ?? undefined,
          fbc: payment.fbc ?? undefined,
          fbp: payment.fbp ?? undefined,
          sourceUrl: payment.sourceUrl ?? undefined,
        });
      } else {
        if (!payment.pickId) {
          console.error(`Webhook: PICK payment ${payment._id} has no pickId — skipping unlock`);
          return NextResponse.json({ received: true });
        }

        const updateResult = await UserModel.updateOne(userFilter, {
          $addToSet: { unlockedPickIds: payment.pickId },
        });

        if (updateResult.matchedCount === 0) {
          console.error(`Webhook: user not found with filter`, userFilter);
        } else {
          console.log(`✅ Unlocked pick ${payment.pickId} for user`, userFilter);
        }

        // Server-side Purchase event — event_id MUST match the client-side
        // one fired in MomoPayment's success screen (`purchase-${transId}`)
        const pick = await Pick.findById(payment.pickId).select("title");
        await sendServerEvent({
          eventName: "Purchase",
          eventId: `purchase-${body.transId}`,
          value: payment.amount,
          currency: "XAF",
          contentName: pick?.title,
          contentType: "product",
          userPhone: payment.phone,
          country: "cm",
          clientIp: payment.clientIp ?? undefined,
          userAgent: payment.userAgent ?? undefined,
          fbc: payment.fbc ?? undefined,
          fbp: payment.fbp ?? undefined,
          sourceUrl: payment.sourceUrl ?? undefined,
        });
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