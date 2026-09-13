import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import PWAInstallModel from "@/models/PWAInstall";
import { cookies } from "next/headers";
import { verifyToken } from "@/utils/auth";

const VALID_PLATFORMS = ["ios", "android", "desktop", "other"];

// ─── POST: record/refresh a device running the PWA in standalone mode ─────
// Body: { deviceId, platform }. Open to any visitor, logged in or not —
// same reasoning as /api/push/subscribe. Called by
// components/PWAInstallTracker.tsx, rate-limited client-side so this isn't
// hit on every page load.
export async function POST(req: NextRequest) {
  try {
    await connectDB();

    const body = await req.json();
    const deviceId = typeof body?.deviceId === "string" ? body.deviceId.trim() : "";
    const platform = VALID_PLATFORMS.includes(body?.platform) ? body.platform : "other";

    if (!deviceId) {
      return NextResponse.json({ success: false, message: "Missing deviceId" }, { status: 400 });
    }

    // Attach the logged-in user if there is one — informational only, same
    // as PushSubscription; overwritten on each report so a device that
    // switches accounts ends up tagged with whoever last used it.
    let userId: string | null = null;
    const token = (await cookies()).get("token")?.value;
    if (token) {
      const decoded = verifyToken(token);
      if (decoded) userId = decoded.userId;
    }

    await PWAInstallModel.findOneAndUpdate(
      { deviceId },
      {
        $set: { platform, lastSeenAt: new Date(), ...(userId ? { user: userId } : {}) },
        $setOnInsert: { firstSeenAt: new Date() },
      },
      { upsert: true }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PWA INSTALL REGISTER ERROR:", error);
    return NextResponse.json({ success: false, message: "Failed to register install" }, { status: 500 });
  }
}
