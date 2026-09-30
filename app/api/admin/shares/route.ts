import { NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import { cookies } from "next/headers";
import { verifyToken } from "@/utils/auth";
import UserModel from "@/models/Users";
import PayoutModel from "@/models/Payout";
import { getAdminEarnings } from "@/lib/adminEarnings";
import { getBalance, isFapshiError } from "@/utils/fapshiPayout";

async function requireSuperAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return { error: "Unauthorized", status: 401 };
  const decoded = verifyToken(token);
  if (!decoded) return { error: "Invalid token", status: 401 };
  if (decoded.role !== "ADMIN" || !decoded.isSuperAdmin) return { error: "Forbidden", status: 403 };
  return { user: decoded };
}

// ─── GET: Every admin's earnings + all pending payout requests (SUPER ADMIN ONLY) ──
//
// Backs the "Administrateurs" tab's overview and its payout-approval list.
export async function GET() {
  try {
    await connectDB();

    const auth = await requireSuperAdmin();
    if ("error" in auth) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const admins = await UserModel.find({ role: "ADMIN", isSuperAdmin: { $ne: true } }).select("-password");

    // Pending covers everything not yet in a final state: brand-new
    // requests, in-flight Fapshi transfers, and failed-but-retriable ones —
    // not just REQUESTED — so the super admin sees the full "needs
    // attention or is in flight" picture, not just new arrivals.
    const [earningsList, pendingPayouts, balanceResult] = await Promise.all([
      Promise.all(admins.map((admin) => getAdminEarnings(admin))),
      PayoutModel.find({ status: { $in: ["REQUESTED", "PROCESSING", "FAILED"] } })
        .populate("adminId", "phone nickname")
        .sort({ createdAt: 1 }),
      getBalance(),
    ]);

    const earningsByAdminId = new Map(earningsList.map((e) => [e.adminId, e]));

    // Best-effort — a Fapshi outage or misconfigured payout credentials
    // must never take down the whole "Administrateurs" tab, just hide the
    // balance readout.
    const fapshiBalance = isFapshiError(balanceResult)
      ? null
      : { balance: balanceResult.balance, currency: balanceResult.currency };

    return NextResponse.json({
      success: true,
      data: {
        admins: admins.map((admin) => ({
          admin,
          earnings: earningsByAdminId.get(String(admin._id)) ?? null,
        })),
        pendingPayouts,
        fapshiBalance,
      },
    });
  } catch (error) {
    console.error("GET ALL SHARES ERROR:", error);
    return NextResponse.json({ success: false, message: "Failed to load shares" }, { status: 500 });
  }
}
