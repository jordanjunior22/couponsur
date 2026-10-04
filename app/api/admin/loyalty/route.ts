import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import { cookies } from "next/headers";
import { verifyToken } from "@/utils/auth";
import PaymentModel from "@/models/Payment";
import "@/models/Users";

async function requireAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return { error: "Unauthorized", status: 401 };
  const decoded = verifyToken(token);
  if (!decoded) return { error: "Invalid token", status: 401 };
  if (decoded.role !== "ADMIN") return { error: "Forbidden", status: 403 };
  return { user: decoded };
}

const DAY_MS = 86_400_000;

const SORTS: Record<string, Record<string, 1 | -1>> = {
  // Most subscription payments first — the most direct "how loyal" measure.
  payments: { paymentsCount: -1, firstPaidAt: 1 },
  // Longest-standing subscribers first.
  tenure: { firstPaidAt: 1, paymentsCount: -1 },
  // Biggest spenders first.
  spent: { totalSpent: -1, paymentsCount: -1 },
};

// ─── GET: Subscriber loyalty ranking (ADMIN ONLY) ──────────────────────────
//
// Derived entirely from SUCCESSFUL SUBSCRIPTION payments (never a stored
// counter), grouped per user:
//   - paymentsCount  → how many months/renewals they've paid for
//   - firstPaidAt    → "customer since"
//   - lastPaidAt     → most recent renewal
//   - totalSpent     → lifetime subscription spend
//   - avgGapDays     → how often they pay: (last - first) / (count - 1)
//
// Note: an admin's manual "activate subscription" override creates no
// Payment record, so those grants don't count toward loyalty — only real
// payments do.
//
// Query: ?page=1&limit=15&sort=payments|tenure|spent
export async function GET(req: NextRequest) {
  try {
    await connectDB();

    const auth = await requireAdmin();
    if ("error" in auth) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "15", 10) || 15));
    const sortKey = searchParams.get("sort") || "payments";
    const sort = SORTS[sortKey] ?? SORTS.payments;

    const [result] = await PaymentModel.aggregate([
      { $match: { paymentType: "SUBSCRIPTION", status: "SUCCESSFUL" } },
      {
        $group: {
          _id: "$userId",
          paymentsCount: { $sum: 1 },
          totalSpent: { $sum: "$amount" },
          firstPaidAt: { $min: "$createdAt" },
          lastPaidAt: { $max: "$createdAt" },
        },
      },
      { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "user" } },
      { $unwind: "$user" },
      { $match: { "user.role": "USER" } },
      {
        $facet: {
          summary: [
            {
              $group: {
                _id: null,
                subscribers: { $sum: 1 },
                repeatSubscribers: { $sum: { $cond: [{ $gte: ["$paymentsCount", 2] }, 1, 0] } },
                totalPayments: { $sum: "$paymentsCount" },
                totalRevenue: { $sum: "$totalSpent" },
              },
            },
          ],
          rows: [
            { $sort: { ...sort, _id: 1 } },
            { $skip: (page - 1) * limit },
            { $limit: limit },
            {
              $project: {
                _id: 0,
                userId: "$_id",
                phone: "$user.phone",
                subscriptionStatus: "$user.subscription.status",
                expiresAt: "$user.subscription.expiresAt",
                paymentsCount: 1,
                totalSpent: 1,
                firstPaidAt: 1,
                lastPaidAt: 1,
              },
            },
          ],
        },
      },
    ]);

    const s = result?.summary?.[0] ?? { subscribers: 0, repeatSubscribers: 0, totalPayments: 0, totalRevenue: 0 };
    const now = Date.now();

    const rows = (result?.rows ?? []).map((r: {
      userId: unknown; phone: string; subscriptionStatus?: string; expiresAt?: Date | null;
      paymentsCount: number; totalSpent: number; firstPaidAt: Date; lastPaidAt: Date;
    }) => {
      const tenureDays = Math.max(0, Math.floor((now - new Date(r.firstPaidAt).getTime()) / DAY_MS));
      const avgGapDays =
        r.paymentsCount > 1
          ? Math.round((new Date(r.lastPaidAt).getTime() - new Date(r.firstPaidAt).getTime()) / DAY_MS / (r.paymentsCount - 1))
          : null;
      const active =
        r.subscriptionStatus === "ACTIVE" && !!r.expiresAt && new Date(r.expiresAt).getTime() > now;
      return {
        userId: String(r.userId),
        phone: r.phone,
        paymentsCount: r.paymentsCount,
        totalSpent: r.totalSpent,
        firstPaidAt: r.firstPaidAt,
        lastPaidAt: r.lastPaidAt,
        tenureDays,
        avgGapDays,
        active,
      };
    });

    return NextResponse.json({
      success: true,
      data: rows,
      summary: {
        subscribers: s.subscribers,
        repeatSubscribers: s.repeatSubscribers,
        repeatRate: s.subscribers > 0 ? Math.round((s.repeatSubscribers / s.subscribers) * 100) : 0,
        avgPayments: s.subscribers > 0 ? Math.round((s.totalPayments / s.subscribers) * 10) / 10 : 0,
        totalRevenue: s.totalRevenue,
      },
      pagination: {
        page,
        limit,
        total: s.subscribers,
        totalPages: Math.max(1, Math.ceil(s.subscribers / limit)),
      },
    });
  } catch (error) {
    console.error("LOYALTY ERROR:", error);
    return NextResponse.json({ success: false, message: "Failed to load loyalty stats" }, { status: 500 });
  }
}
