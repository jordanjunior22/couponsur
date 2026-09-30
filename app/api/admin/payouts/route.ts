import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import { cookies } from "next/headers";
import { verifyToken } from "@/utils/auth";
import UserModel from "@/models/Users";
import PayoutModel from "@/models/Payout";
import { getAdminEarnings } from "@/lib/adminEarnings";
import { sendPushToAdmins } from "@/lib/webpush";

async function requireAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return { error: "Unauthorized", status: 401 };
  const decoded = verifyToken(token);
  if (!decoded) return { error: "Invalid token", status: 401 };
  if (decoded.role !== "ADMIN") return { error: "Forbidden", status: 403 };
  return { user: decoded };
}

// ─── POST: Request a payout for the logged-in admin (ANY ADMIN) ──────────
//
// The amount is always re-verified server-side against the live balance
// (lib/adminEarnings.ts) — never trusts whatever the client sends. Creates
// a REQUESTED record for the super admin to settle manually and marks
// PAID/REJECTED from the "Administrateurs" tab — see
// app/api/admin/payouts/[id]/decide/route.ts.
export async function POST(req: NextRequest) {
  try {
    await connectDB();

    const auth = await requireAdmin();
    if ("error" in auth) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const body = await req.json().catch(() => ({}));
    const { amount } = body;

    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ success: false, message: "amount must be a positive number" }, { status: 400 });
    }

    const admin = await UserModel.findById(auth.user.userId).select("revenueShare phone");
    if (!admin) {
      return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    }

    const earnings = await getAdminEarnings(admin);
    if (amount > earnings.availableBalance) {
      return NextResponse.json(
        { success: false, message: `Montant demandé (${amount}) supérieur au solde disponible (${earnings.availableBalance})` },
        { status: 400 }
      );
    }

    const payout = await PayoutModel.create({
      adminId: admin._id,
      amount,
      status: "REQUESTED",
    });

    // Fire-and-forget — same reasoning as the purchase notifications in
    // lib/paymentFulfillment.ts: a push failure must never fail the request
    // itself. Goes to every ADMIN (including the requester), harmless.
    sendPushToAdmins({
      title: "💸 Demande de paiement",
      body: `${admin.phone} a demandé un paiement de ${amount} XAF`,
      url: "/dashboard",
    }).catch((e) => console.error("Push on payout request failed:", e));

    return NextResponse.json({ success: true, data: payout }, { status: 201 });
  } catch (error) {
    console.error("CREATE PAYOUT ERROR:", error);
    return NextResponse.json({ success: false, message: "Failed to request payout" }, { status: 500 });
  }
}
