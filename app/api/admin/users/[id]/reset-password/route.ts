import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import { cookies } from "next/headers";
import { verifyToken } from "@/utils/auth";
import UserModel from "@/models/Users";
import bcrypt from "bcryptjs";
import crypto from "crypto";

async function requireAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return { error: "Unauthorized", status: 401 };
  const decoded = verifyToken(token);
  if (!decoded) return { error: "Invalid token", status: 401 };
  if (decoded.role !== "ADMIN") return { error: "Forbidden", status: 403 };
  return { user: decoded };
}

// Avoids visually ambiguous characters (0/O, 1/l/I) since this gets read
// aloud or retyped by support over chat.
const RANDOM_PASSWORD_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz";
function generatePassword(length = 10) {
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (b) => RANDOM_PASSWORD_ALPHABET[b % RANDOM_PASSWORD_ALPHABET.length]).join("");
}

// ─── POST: Reset a user's password without an email/SMS flow (ADMIN ONLY) ──
//
// Stand-in for "forgot password" — this system has no email and no
// SMS/OTP verification, so there's no safe way to let a user reset their
// own password unattended (anyone typing in someone else's phone number
// could hijack their account). Support instead verifies the user
// informally (e.g. via the chat widget) and an admin resets the password
// on their EXISTING account here — same _id, so their subscription and
// unlocked picks are untouched. There is nothing to "sync": the account
// never moved.
//
// Body: { newPassword?: string } — if omitted, a random password is
// generated and returned once in the response for the admin to relay to
// the user. It is never stored or logged in plaintext.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();

    const auth = await requireAdmin();
    if ("error" in auth) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const requested = typeof body?.newPassword === "string" ? body.newPassword.trim() : "";

    if (requested && requested.length < 4) {
      return NextResponse.json(
        { success: false, message: "Le mot de passe doit contenir au moins 4 caractères" },
        { status: 400 }
      );
    }

    const generated = !requested;
    const newPassword = requested || generatePassword();
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const updated = await UserModel.findByIdAndUpdate(
      id,
      { $set: { password: hashedPassword } },
      { new: true }
    ).select("-password");

    if (!updated) {
      return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: updated,
      // Plaintext, one-time — only returned here so the admin can relay
      // it to the user. Not persisted anywhere.
      newPassword: generated ? newPassword : undefined,
    });
  } catch (error) {
    console.error("RESET PASSWORD ERROR:", error);
    return NextResponse.json({ success: false, message: "Failed to reset password" }, { status: 500 });
  }
}
