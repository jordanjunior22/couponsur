import { NextRequest, NextResponse } from "next/server";
import { sendServerEvent } from "@/lib/metaConversions";
import { captureRequestSignal } from "@/utils/requestSignal";

// ─── POST: server-side mirror of the onboarding page's "app installed" ────
// Meta pixel event. Client-side `fbq` (see app/onboarding/page.tsx) covers
// most visitors, but is lost to ad blockers / early tab close — exactly
// the traffic an ads campaign optimizing toward installs most needs to
// count. Mirrors the same client+server pairing already used for Purchase
// events (see lib/paymentFulfillment.ts): same eventId on both sides so
// Meta dedupes them into one conversion, not two.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const eventId = typeof body.eventId === "string" ? body.eventId : null;
    if (!eventId) {
      return NextResponse.json({ success: false, message: "eventId required" }, { status: 400 });
    }

    const signal = captureRequestSignal(req, body);

    await sendServerEvent({
      eventName: "CompleteRegistration",
      eventId,
      contentName: "Onboarding - App Installed",
      country: "cm",
      clientIp: signal.clientIp ?? undefined,
      userAgent: signal.userAgent ?? undefined,
      fbc: signal.fbc ?? undefined,
      fbp: signal.fbp ?? undefined,
      sourceUrl: signal.sourceUrl ?? undefined,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("ONBOARDING TRACK ERROR:", error);
    // Never worth failing the visitor's flow over — this is a
    // fire-and-forget analytics call.
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
