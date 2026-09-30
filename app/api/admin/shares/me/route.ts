import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import { cookies } from "next/headers";
import { verifyToken } from "@/utils/auth";
import UserModel from "@/models/Users";
import PayoutModel from "@/models/Payout";
import { getAdminEarnings, getAdminEarningsReport } from "@/lib/adminEarnings";

async function requireAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return { error: "Unauthorized", status: 401 };
  const decoded = verifyToken(token);
  if (!decoded) return { error: "Invalid token", status: 401 };
  if (decoded.role !== "ADMIN") return { error: "Forbidden", status: 403 };
  return { user: decoded };
}

// ─── GET: The logged-in admin's own earnings breakdown + payout history ──
//
// Backs the "Mes revenus" dashboard tab, visible to every admin (including
// the super admin, whose share is always 0/never configured, so this just
// comes back empty for them).
//
// Optional ?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD scopes the `report`
// (period totals + daily trend) for the chart/filter — purely a reporting
// view. `earnings` (the withdrawable balance) is always all-time, never
// affected by these params — see lib/adminEarnings.ts.
export async function GET(req: NextRequest) {
  try {
    await connectDB();

    const auth = await requireAdmin();
    if ("error" in auth) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const admin = await UserModel.findById(auth.user.userId).select("revenueShare");
    if (!admin) {
      return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const dateFromParam = searchParams.get("dateFrom");
    const dateToParam = searchParams.get("dateTo");
    const dateTo = dateToParam ? new Date(dateToParam + "T23:59:59.999") : new Date();
    const dateFrom = dateFromParam ? new Date(dateFromParam + "T00:00:00.000") : new Date(dateTo.getTime() - 30 * 86400000);

    const [earnings, payouts, report] = await Promise.all([
      getAdminEarnings(admin),
      PayoutModel.find({ adminId: admin._id }).sort({ createdAt: -1 }),
      getAdminEarningsReport(admin, dateFrom, dateTo),
    ]);

    return NextResponse.json({ success: true, data: { earnings, payouts, report } });
  } catch (error) {
    console.error("GET MY SHARES ERROR:", error);
    return NextResponse.json({ success: false, message: "Failed to load shares" }, { status: 500 });
  }
}
