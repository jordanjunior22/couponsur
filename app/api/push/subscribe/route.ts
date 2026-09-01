import { NextRequest, NextResponse } from "next/server";
import PushSubscriptionModel from "@/models/PushSubscription";
import { connectDB } from "@/utils/ConnectDb";
import { cookies } from "next/headers";
import { verifyToken } from "@/utils/auth";

// ─── POST: save a browser's push subscription ──────────────────────────
// Body: the PushSubscription object from pushManager.subscribe() —
// { endpoint, keys: { p256dh, auth } }. Open to any visitor, logged in or
// not — subscribing doesn't require an account, same as the chat widget.
export async function POST(req: NextRequest) {
  try {
    await connectDB();

    const body = await req.json();
    const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
    const p256dh = typeof body?.keys?.p256dh === "string" ? body.keys.p256dh : "";
    const auth = typeof body?.keys?.auth === "string" ? body.keys.auth : "";

    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json({ success: false, message: "Invalid subscription" }, { status: 400 });
    }

    // Attach the logged-in user if there is one — purely informational,
    // subscribing works the same either way.
    let userId: string | null = null;
    const token = (await cookies()).get("token")?.value;
    if (token) {
      const decoded = verifyToken(token);
      if (decoded) userId = decoded.userId;
    }

    await PushSubscriptionModel.findOneAndUpdate(
      { endpoint },
      { endpoint, keys: { p256dh, auth }, user: userId },
      { upsert: true }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PUSH SUBSCRIBE ERROR:", error);
    return NextResponse.json({ success: false, message: "Échec de l'abonnement aux notifications" }, { status: 500 });
  }
}

// ─── DELETE: remove a subscription (e.g. the visitor disabled notifications) ──
// Body: { endpoint }.
export async function DELETE(req: NextRequest) {
  try {
    await connectDB();

    const body = await req.json();
    const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
    if (!endpoint) {
      return NextResponse.json({ success: false, message: "Missing endpoint" }, { status: 400 });
    }

    await PushSubscriptionModel.deleteOne({ endpoint });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PUSH UNSUBSCRIBE ERROR:", error);
    return NextResponse.json({ success: false, message: "Échec de la désinscription" }, { status: 500 });
  }
}
