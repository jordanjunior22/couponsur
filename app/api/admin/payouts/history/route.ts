import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import { cookies } from "next/headers";
import { verifyToken } from "@/utils/auth";
import PayoutModel from "@/models/Payout";
import "@/models/Users";

async function requireSuperAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return { error: "Unauthorized", status: 401 };
  const decoded = verifyToken(token);
  if (!decoded) return { error: "Invalid token", status: 401 };
  if (decoded.role !== "ADMIN" || !decoded.isSuperAdmin) return { error: "Forbidden", status: 403 };
  return { user: decoded };
}

// ─── GET: Paginated history of settled payouts (SUPER ADMIN ONLY) ──────────
export async function GET(req: NextRequest) {
  try {
    await connectDB();

    const auth = await requireSuperAdmin();
    if ("error" in auth) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "10", 10) || 10));

    const filter = { status: { $in: ["PAID", "REJECTED"] } };
    const [payouts, total] = await Promise.all([
      PayoutModel.find(filter)
        .populate("adminId", "phone nickname")
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      PayoutModel.countDocuments(filter),
    ]);

    return NextResponse.json({
      success: true,
      data: payouts,
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (error) {
    console.error("GET PAYOUT HISTORY ERROR:", error);
    return NextResponse.json({ success: false, message: "Failed to load payout history" }, { status: 500 });
  }
}
