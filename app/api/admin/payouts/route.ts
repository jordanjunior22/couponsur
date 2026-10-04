import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import { cookies } from "next/headers";
import { verifyToken } from "@/utils/auth";
import UserModel from "@/models/Users";
import PayoutModel, { IPayout } from "@/models/Payout";
import { getAdminEarnings } from "@/lib/adminEarnings";
import { sendPushToAdmins } from "@/lib/webpush";
import { autoDisbursePayout } from "@/lib/autoDisburse";

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

    if (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0) {
      return NextResponse.json({ success: false, message: "amount must be a positive integer" }, { status: 400 });
    }

    // Re-check against the DB, not just the token — a demoted or deleted
    // admin with a still-valid JWT must not be able to withdraw.
    const admin = await UserModel.findById(auth.user.userId).select("revenueShare phone role");
    if (!admin || admin.role !== "ADMIN") {
      return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
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

    // Race guard: two simultaneous requests can both pass the balance check
    // above. Now that this payout is saved (and counted as reserved), re-check;
    // if the admin is over-committed, reject this one. Fails closed — in a
    // true tie both are rejected rather than both paid.
    const after = await getAdminEarnings(admin);
    if (after.reserved > after.totalEarned) {
      await PayoutModel.updateOne(
        { _id: payout._id, status: "REQUESTED" },
        { $set: { status: "REJECTED", decidedAt: new Date(), note: "Solde insuffisant (demandes simultanées)" } }
      );
      return NextResponse.json(
        { success: false, message: "Solde insuffisant — réessaie dans un instant" },
        { status: 409 }
      );
    }

    // Pay out right away when the Fapshi float covers it; otherwise the
    // payout stays REQUESTED for the super admin to settle manually.
    let autoDisbursed = false;
    let finalPayout: IPayout = payout;
    try {
      const auto = await autoDisbursePayout(String(payout._id));
      if (auto.disbursed) {
        autoDisbursed = true;
        finalPayout = auto.payout;
      } else {
        console.warn(`Payout ${payout._id} not auto-disbursed: ${auto.reason}`);
      }
    } catch (e) {
      console.error("Auto-disburse failed:", e);
    }

    // Fire-and-forget — same reasoning as the purchase notifications in
    // lib/paymentFulfillment.ts: a push failure must never fail the request
    // itself. Goes to every ADMIN (including the requester), harmless.
    sendPushToAdmins({
      title: autoDisbursed ? "💸 Paiement envoyé" : "💸 Demande de paiement",
      body: autoDisbursed
        ? `${admin.phone} : paiement de ${amount} XAF envoyé automatiquement`
        : `${admin.phone} a demandé un paiement de ${amount} XAF`,
      url: "/dashboard",
    }).catch((e) => console.error("Push on payout request failed:", e));

    return NextResponse.json({ success: true, data: finalPayout, autoDisbursed }, { status: 201 });
  } catch (error) {
    console.error("CREATE PAYOUT ERROR:", error);
    return NextResponse.json({ success: false, message: "Failed to request payout" }, { status: 500 });
  }
}
