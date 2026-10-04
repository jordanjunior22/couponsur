import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { connectDB } from "@/utils/ConnectDb";
import { verifyToken } from "@/utils/auth";
import User from "@/models/Users";

// ─── POST: mute / unmute push notifications for one chat room ───────────────
// Body: { room: "premium" | "global", muted: boolean }. Always acts on the
// signed-in account itself. (Whether the device receives push at all is the
// separate notifications toggle on the Profil page.)
export async function POST(req: NextRequest) {
  try {
    await connectDB();

    const token = (await cookies()).get("token")?.value;
    const decoded = token ? verifyToken(token) : null;
    if (!decoded) {
      return NextResponse.json({ success: false, message: "Non authentifié" }, { status: 401 });
    }

    const { room, muted } = await req.json().catch(() => ({}));
    if ((room !== "premium" && room !== "global") || typeof muted !== "boolean") {
      return NextResponse.json({ success: false, message: "Valeur invalide" }, { status: 400 });
    }

    const updated = await User.findByIdAndUpdate(
      decoded.userId,
      { $set: { [`groupPushMuted.${room}`]: muted } },
      { new: true }
    ).select("-password +avatar");

    if (!updated) {
      return NextResponse.json({ success: false, message: "Utilisateur introuvable" }, { status: 404 });
    }

    return NextResponse.json({ success: true, user: updated });
  } catch (error) {
    console.error("GROUP NOTIFICATIONS ERROR:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}
