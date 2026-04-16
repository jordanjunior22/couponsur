import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import PaymentModel from "@/models/Payment";
import UserModel from "@/models/Users";
import { paymentStatus, isFapshiError } from "@/utils/fapshi";

interface FapshiWebhookBody {
  transId: string;
  status: "CREATED" | "PENDING" | "SUCCESSFUL" | "FAILED" | "EXPIRED";
  amount: number;
  externalId?: string;
}

export async function POST(req: NextRequest) {
  let body: FapshiWebhookBody;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body?.transId || !body?.status) {
    return NextResponse.json(
      { error: "Missing transId or status" },
      { status: 400 }
    );
  }

  console.log(`Webhook: ${body.status} — ${body.transId}`);

  await connectDB();

  // 🔍 Find payment (FIXED FIELD)
  const payment = await PaymentModel.findOne({
    fapshiTransId: body.transId,
  });

  if (!payment) {
    console.warn(`No payment found for ${body.transId}`);
    return NextResponse.json({ received: true });
  }

  switch (body.status) {

    // ── CREATED ─────────────────────────────────────
    case "CREATED":
      return NextResponse.json({ received: true });

    // ── PENDING ─────────────────────────────────────
    case "PENDING":
      await PaymentModel.updateOne(
        { fapshiTransId: body.transId },
        { status: "PENDING" }
      );
      return NextResponse.json({ received: true });

    // In the SUCCESSFUL case of your webhook:
    case "SUCCESSFUL": {
      if (payment.status === "SUCCESSFUL") {
        return NextResponse.json({ received: true });
      }

      const verified = await paymentStatus(body.transId);
      if (isFapshiError(verified) || verified.status !== "SUCCESSFUL") {
        return NextResponse.json({ received: true });
      }

      if (verified.amount !== payment.amount) {
        await PaymentModel.updateOne(
          { fapshiTransId: body.transId },
          { status: "FAILED" }
        );
        return NextResponse.json({ error: "Amount mismatch" }, { status: 400 });
      }

      await PaymentModel.updateOne(
        { fapshiTransId: body.transId },
        { status: "SUCCESSFUL" }
      );

      // ✅ Use userId if present, fall back to phone for old records
      const filter = payment.userId
        ? { _id: payment.userId }
        : { phone: payment.phone };

      await UserModel.updateOne(filter, {
        $addToSet: { unlockedPickIds: payment.pickId },
      });

      return NextResponse.json({ received: true });
    }

    // ── FAILED ──────────────────────────────────────
    case "FAILED":
      await PaymentModel.updateOne(
        { fapshiTransId: body.transId },
        { status: "FAILED" }
      );
      return NextResponse.json({ received: true });

    // ── EXPIRED ─────────────────────────────────────
    case "EXPIRED":
      await PaymentModel.updateOne(
        { fapshiTransId: body.transId },
        { status: "EXPIRED" }
      );
      return NextResponse.json({ received: true });

    default:
      return NextResponse.json({ received: true });
  }
}