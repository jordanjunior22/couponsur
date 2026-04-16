// app/api/payment/status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { paymentStatus } from "@/utils/fapshi";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const transId = searchParams.get("transId");

  if (!transId) {
    return NextResponse.json({ error: "transId required" }, { status: 400 });
  }

  const res = await paymentStatus(transId);

  return NextResponse.json(res);
}