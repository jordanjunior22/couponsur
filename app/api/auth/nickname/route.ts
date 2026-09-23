import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import User from "@/models/Users";
import { cookies } from "next/headers";
import { verifyToken } from "@/utils/auth";

// ─── POST: self-service nickname change (admin only) ───────────────────────
// Lets an admin set the display name their group-chat messages show
// instead of the generic "Admin" — see GroupChatRoom's senderLabel and the
// nickname snapshot taken at send time in app/api/group-chat/route.ts.
// Not exposed to regular USER accounts; the field is meaningless there.
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

    const user = await User.findById(decoded.userId);
    if (!user) {
      return NextResponse.json({ success: false, message: "Utilisateur introuvable" }, { status: 404 });
    }
    if (user.role !== "ADMIN") {
      return NextResponse.json({ success: false, message: "Réservé aux administrateurs" }, { status: 403 });
    }

    const { nickname } = await req.json().catch(() => ({}));
    const trimmed = typeof nickname === "string" ? nickname.trim() : "";
    if (trimmed.length > 40) {
      return NextResponse.json({ success: false, message: "Le pseudo est trop long (40 caractères max)" }, { status: 400 });
    }

    // Empty string clears it back to null, i.e. back to the plain "Admin"
    // label — same "blank means unset" convention as authorName elsewhere.
    user.nickname = trimmed || null;
    await user.save();

    // Same shape as /api/auth/me (full user minus password) so the client
    // can drop this straight into AuthContext's user state.
    const safeUser = await User.findById(user._id).select("-password");
    return NextResponse.json({ success: true, user: safeUser });
  } catch (error) {
    console.error("UPDATE NICKNAME ERROR:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}
