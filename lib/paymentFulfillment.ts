/**
 * lib/paymentFulfillment.ts
 *
 * Single source of truth for "a payment was confirmed SUCCESSFUL by Fapshi
 * → grant the thing the user paid for" (activate a subscription, or unlock
 * a pick). Idempotent — safe to call more than once for the same transId.
 *
 * Why this exists: previously this logic lived only inside the Fapshi
 * webhook handler. The buyer-facing payment screen polls Fapshi directly
 * for status and shows "success" the moment Fapshi confirms it — but if
 * the webhook call never reaches us (dropped, retried elsewhere, briefly
 * down, misconfigured), the buyer sees a success screen while our own DB
 * never actually activates their subscription. That's the "I paid but
 * couldn't access anything" bug. Calling this same fulfillment function
 * from BOTH the webhook AND the client status-poll endpoint means whichever
 * one observes SUCCESSFUL first does the activation, so it no longer
 * depends solely on the webhook arriving.
 */
import PaymentModel from "@/models/Payment";
import UserModel from "@/models/Users";
import Pick from "@/models/Picks";
import { paymentStatus, isFapshiError } from "@/utils/fapshi";
import { sendServerEvent } from "@/lib/metaConversions";
import { sendPushToAdmins } from "@/lib/webpush";

export type FulfillResult =
  | { outcome: "already_fulfilled" }
  | { outcome: "fulfilled"; type: "SUBSCRIPTION" | "PICK" }
  | { outcome: "not_successful"; fapshiStatus?: string }
  | { outcome: "amount_mismatch" }
  | { outcome: "no_payment_record" }
  | { outcome: "error"; message: string };

/**
 * Re-verifies `transId` against Fapshi (never trusts a caller-supplied
 * status) and, only if genuinely SUCCESSFUL, activates the subscription or
 * unlocks the pick tied to that payment. Assumes the caller already called
 * connectDB().
 */
export async function fulfillPaymentByTransId(transId: string): Promise<FulfillResult> {
  const payment = await PaymentModel.findOne({ fapshiTransId: transId });
  if (!payment) return { outcome: "no_payment_record" };
  if (payment.status === "SUCCESSFUL") return { outcome: "already_fulfilled" };

  const verified = await paymentStatus(transId);
  if (isFapshiError(verified)) return { outcome: "error", message: verified.message };
  if (verified.status !== "SUCCESSFUL") return { outcome: "not_successful", fapshiStatus: verified.status };

  if (verified.amount !== payment.amount) {
    await PaymentModel.updateOne({ fapshiTransId: transId }, { status: "FAILED" });
    return { outcome: "amount_mismatch" };
  }

  await PaymentModel.updateOne(
    { fapshiTransId: transId },
    { status: "SUCCESSFUL", dateConfirmed: new Date() }
  );

  const userFilter = payment.userId ? { _id: payment.userId } : { phone: payment.phone };

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
      console.error(`fulfillPaymentByTransId: user not found for subscription activation`, userFilter);
      return { outcome: "error", message: "User not found for subscription activation" };
    }

    console.log(`✅ Activated subscription for user`, userFilter, `until ${expiresAt.toISOString()}`);

    // Server-side Purchase event — event_id MUST match the client-side one
    // fired in SubscribePayment's success screen (`sub-purchase-${transId}`)
    await sendServerEvent({
      eventName: "Purchase",
      eventId: `sub-purchase-${transId}`,
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

    // Fire-and-forget — a push failure must never fail the fulfillment
    // that just granted the buyer their subscription.
    sendPushToAdmins({
      title: "💳 Nouvel abonnement",
      body: `Abonnement mensuel activé — ${payment.phone} (${payment.amount} XAF)`,
      url: "/dashboard",
    }).catch((e) => console.error("Push on subscription activation failed:", e));

    return { outcome: "fulfilled", type: "SUBSCRIPTION" };
  }

  if (!payment.pickId) {
    console.error(`fulfillPaymentByTransId: PICK payment ${payment._id} has no pickId — skipping unlock`);
    return { outcome: "error", message: "PICK payment missing pickId" };
  }

  const updateResult = await UserModel.updateOne(userFilter, {
    $addToSet: { unlockedPickIds: payment.pickId },
  });

  if (updateResult.matchedCount === 0) {
    console.error(`fulfillPaymentByTransId: user not found`, userFilter);
    return { outcome: "error", message: "User not found for pick unlock" };
  }

  console.log(`✅ Unlocked pick ${payment.pickId} for user`, userFilter);

  const pick = await Pick.findById(payment.pickId).select("title");
  await sendServerEvent({
    eventName: "Purchase",
    eventId: `purchase-${transId}`,
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

  // Fire-and-forget, same reasoning as the subscription push above.
  sendPushToAdmins({
    title: "💰 Pronostic acheté",
    body: `${pick?.title ?? "Un pronostic"} acheté par ${payment.phone} (${payment.amount} XAF)`,
    url: "/dashboard",
  }).catch((e) => console.error("Push on pick purchase failed:", e));

  return { outcome: "fulfilled", type: "PICK" };
}
