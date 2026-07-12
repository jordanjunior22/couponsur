// ─── app/api/cron/expire-subscriptions/route.ts ──────────────────────────────
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import UserModel from "@/models/Users";

function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectDB();

    const now = new Date();
    const result = await UserModel.updateMany(
      {
        "subscription.status": "ACTIVE",
        "subscription.expiresAt": { $lt: now },
      },
      {
        $set: { "subscription.status": "EXPIRED" },
      }
    );

    return NextResponse.json({
      ok: true,
      expiredCount: result.modifiedCount,
    });
  } catch (err) {
    console.error("expire-subscriptions cron error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}