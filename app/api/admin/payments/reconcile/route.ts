import { NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import { cookies } from "next/headers";
import { verifyToken } from "@/utils/auth";
import PaymentModel from "@/models/Payment";
import { fulfillPaymentByTransId } from "@/lib/paymentFulfillment";

async function requireAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return { error: "Unauthorized", status: 401 };
  const decoded = verifyToken(token);
  if (!decoded) return { error: "Invalid token", status: 401 };
  if (decoded.role !== "ADMIN") return { error: "Forbidden", status: 403 };
  return { user: decoded };
}

// ─── POST: Reconcile stuck payments (ADMIN ONLY) ─────────────────────────
//
// "The buyer paid but the site never gave them access" happens when
// Fapshi's webhook call to us never arrives (dropped, retried elsewhere,
// briefly down) — the payment record is left sitting at PENDING forever,
// even though the buyer's money went through. This re-checks every PENDING
// payment directly against Fapshi and, for any that actually went through,
// activates the subscription / unlocks the pick — the same fulfillment
// path the webhook itself uses, so it's exactly what would have happened
// had the webhook arrived.
export async function POST() {
  try {
    await connectDB();

    const auth = await requireAdmin();
    if ("error" in auth) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });
    }

    // Cap per run so this can't time out a serverless function on a large
    // backlog — re-running the button picks up wherever it left off, since
    // fulfilled/failed payments no longer show up as PENDING.
    const LIMIT = 200;
    const pending = await PaymentModel.find({ status: "PENDING" })
      .sort({ createdAt: 1 })
      .limit(LIMIT);

    let fulfilled = 0;
    let stillPending = 0;
    let failedOrExpired = 0;
    let errors = 0;
    const fulfilledDetails: { transId: string; phone: string; type: string }[] = [];

    for (const payment of pending) {
      const result = await fulfillPaymentByTransId(payment.fapshiTransId);
      switch (result.outcome) {
        case "fulfilled":
          fulfilled++;
          fulfilledDetails.push({ transId: payment.fapshiTransId, phone: payment.phone, type: result.type });
          break;
        case "already_fulfilled":
          // Was PENDING in our query but got fulfilled by a concurrent
          // webhook/poll between the query and this loop — not an error.
          break;
        case "not_successful":
          if (result.fapshiStatus === "FAILED" || result.fapshiStatus === "EXPIRED") failedOrExpired++;
          else stillPending++;
          break;
        case "amount_mismatch":
          failedOrExpired++;
          break;
        case "no_payment_record":
        case "error":
          errors++;
          break;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        checked: pending.length,
        fulfilled,
        stillPending,
        failedOrExpired,
        errors,
        fulfilledDetails,
        truncated: pending.length === LIMIT,
      },
    });
  } catch (error) {
    console.error("RECONCILE PAYMENTS ERROR:", error);
    return NextResponse.json({ success: false, message: "Failed to reconcile payments" }, { status: 500 });
  }
}
