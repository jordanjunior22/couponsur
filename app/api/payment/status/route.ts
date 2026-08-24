// app/api/payment/status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { paymentStatus, isFapshiError } from "@/utils/fapshi";
import { connectDB } from "@/utils/ConnectDb";
import { fulfillPaymentByTransId } from "@/lib/paymentFulfillment";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const transId = searchParams.get("transId");

  if (!transId) {
    return NextResponse.json({ error: "transId required" }, { status: 400 });
  }

  const res = await paymentStatus(transId);

  // The buyer-facing payment screen polls this endpoint and shows a
  // "success" screen the moment Fapshi confirms SUCCESSFUL — but actually
  // granting access (activating the subscription / unlocking the pick)
  // used to happen only in the Fapshi webhook, arriving separately. If
  // that webhook was ever dropped or delayed, the buyer saw "success" but
  // never actually got access. Fulfilling right here too — idempotently,
  // same helper the webhook uses — means the poll itself can complete the
  // activation, so it no longer depends solely on the webhook showing up.
  if (!isFapshiError(res) && res.status === "SUCCESSFUL") {
    try {
      await connectDB();
      const result = await fulfillPaymentByTransId(transId);
      if (result.outcome === "error") {
        console.error(`Payment status poll: fulfillment failed for ${transId}:`, result.message);
      }
    } catch (err) {
      // Never fail the status check itself over a fulfillment hiccup — the
      // webhook (or a later poll, or the admin reconcile tool) still gets
      // another chance at it.
      console.error(`Payment status poll: fulfillment threw for ${transId}:`, err);
    }
  }

  return NextResponse.json(res);
}