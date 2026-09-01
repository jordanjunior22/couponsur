import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import User from "@/models/Users";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { verifyToken } from "@/utils/auth";

// ─── POST: self-service password change (logged-in user only) ────────────
// The second half of the "forgot password" flow — an admin resets a
// locked-out user to a temporary password (see
// /api/admin/users/[id]/reset-password), the user logs in with it, then
// uses this to set a password only they know. Requires the CURRENT
// password, so knowing someone's session cookie alone isn't enough to
// hijack the account.
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

    const { currentPassword, newPassword } = await req.json();

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { success: false, message: "Mot de passe actuel et nouveau mot de passe requis" },
        { status: 400 }
      );
    }
    if (newPassword.length < 6) {
      return NextResponse.json(
        { success: false, message: "Le nouveau mot de passe doit contenir au moins 6 caractères" },
        { status: 400 }
      );
    }

    const user = await User.findById(decoded.userId);
    if (!user) {
      return NextResponse.json({ success: false, message: "Utilisateur introuvable" }, { status: 404 });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return NextResponse.json({ success: false, message: "Mot de passe actuel incorrect" }, { status: 401 });
    }

    if (currentPassword === newPassword) {
      return NextResponse.json(
        { success: false, message: "Le nouveau mot de passe doit être différent de l'ancien" },
        { status: 400 }
      );
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("CHANGE PASSWORD ERROR:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}
