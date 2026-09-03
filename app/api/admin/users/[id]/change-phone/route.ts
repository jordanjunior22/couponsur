import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import { cookies } from "next/headers";
import { verifyToken } from "@/utils/auth";
import UserModel from "@/models/Users";
import { normalizeUserPhone, isValidCameroonMobile } from "@/utils/normalizeUserPhone";

async function requireAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return { error: "Unauthorized", status: 401 };
  const decoded = verifyToken(token);
  if (!decoded) return { error: "Invalid token", status: 401 };
  if (decoded.role !== "ADMIN") return { error: "Forbidden", status: 403 };
  return { user: decoded };
}

// ─── POST: Change a user's phone number (ADMIN ONLY) ───────────────────────
//
// Support action for when a customer's number genuinely changed (new SIM)
// or was entered wrong at signup — same _id, so subscription, unlocked
// picks and payment history are untouched. Only the login identity moves.
//
// Same validation as signup (see utils/normalizeUserPhone and
// app/api/auth/signup/route.ts): normalized to the canonical digits-only
// form, then required to be a real 9-digit Cameroon mobile number starting
// with 6 — this app's payment flow only ever pays out to a "+237" MTN/
// Orange number, so anything else could never actually complete a
// purchase, and it's exactly how junk/duplicate accounts got in before.
//
// Body: { newPhone: string }
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
    const rawPhone = typeof body?.newPhone === "string" ? body.newPhone : "";
    const newPhone = normalizeUserPhone(rawPhone);

    if (!isValidCameroonMobile(newPhone)) {
      return NextResponse.json(
        { success: false, message: "Numéro de téléphone invalide — format attendu : 6XX XXX XXX" },
        { status: 400 }
      );
    }

    // Reject up front if another account already owns this number — the
    // unique index would catch it too, but this gives a clear message
    // instead of a raw duplicate-key error.
    const existing = await UserModel.findOne({ phone: newPhone, _id: { $ne: id } })
      .select("_id")
      .lean();
    if (existing) {
      return NextResponse.json(
        { success: false, message: "Ce numéro est déjà utilisé par un autre compte." },
        { status: 409 }
      );
    }

    const updated = await UserModel.findByIdAndUpdate(
      id,
      { $set: { phone: newPhone } },
      { new: true }
    ).select("-password");

    if (!updated) {
      return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    // Defense-in-depth against a race on the unique index (two concurrent
    // requests both slipping past the findOne check above).
    if ((error as { code?: number })?.code === 11000) {
      return NextResponse.json(
        { success: false, message: "Ce numéro est déjà utilisé par un autre compte." },
        { status: 409 }
      );
    }
    console.error("CHANGE PHONE ERROR:", error);
    return NextResponse.json({ success: false, message: "Failed to change phone number" }, { status: 500 });
  }
}
