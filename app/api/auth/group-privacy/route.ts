import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { connectDB } from "@/utils/ConnectDb";
import { verifyToken } from "@/utils/auth";
import User from "@/models/Users";

// ─── POST: show or hide my coupon stats on my group chat profile card ──────
// Body: { visible: boolean }. Always acts on the signed-in account itself.
export async function POST(req: NextRequest) {
  try {
    await connectDB();

    const token = (await cookies()).get("token")?.value;
    if (!token) {
      return NextResponse.json({ success: false, message: "Non authentifié" }, { status: 401 });
    }
    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ success: false, message: "Session invalide" }, { status: 401 });
    }

    const { visible } = await req.json().catch(() => ({}));
    if (typeof visible !== "boolean") {
      return NextResponse.json({ success: false, message: "Valeur invalide" }, { status: 400 });
    }

    const updated = await User.findByIdAndUpdate(
      decoded.userId,
      { $set: { groupProfileVisible: visible } },
      { new: true }
    ).select("-password +avatar");

    if (!updated) {
      return NextResponse.json({ success: false, message: "Utilisateur introuvable" }, { status: 404 });
    }

    return NextResponse.json({ success: true, user: updated });
  } catch (error) {
    console.error("GROUP PRIVACY ERROR:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}
