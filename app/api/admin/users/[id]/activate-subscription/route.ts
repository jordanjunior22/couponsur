import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import { cookies } from "next/headers";
import { verifyToken } from "@/utils/auth";
import UserModel from "@/models/Users";

async function requireAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return { error: "Unauthorized", status: 401 };
  const decoded = verifyToken(token);
  if (!decoded) return { error: "Invalid token", status: 401 };
  if (decoded.role !== "ADMIN") return { error: "Forbidden", status: 403 };
  return { user: decoded };
}

// ─── POST: Manually activate a user's subscription (ADMIN ONLY) ─────────
//
// Emergency override for support cases — e.g. a buyer paid but the payment
// never got fulfilled (no matching payment record at all, or the "Réconcilier
// les paiements" tool didn't catch it) — where an admin needs to grant
// access directly without a matching payment. Prefer the reconcile tool
// when a payment record exists; use this when it doesn't.
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
    const days = typeof body?.days === "number" && body.days > 0 ? body.days : 30;

    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + days);

    const updated = await UserModel.findByIdAndUpdate(
      id,
      {
        $set: {
          "subscription.status": "ACTIVE",
          "subscription.plan": "MONTHLY",
          "subscription.startedAt": now,
          "subscription.expiresAt": expiresAt,
        },
      },
      { new: true }
    ).select("-password");

    if (!updated) {
      return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("ACTIVATE SUBSCRIPTION ERROR:", error);
    return NextResponse.json({ success: false, message: "Failed to activate subscription" }, { status: 500 });
  }
}
