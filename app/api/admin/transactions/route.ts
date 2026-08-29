import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import { cookies } from "next/headers";
import { verifyToken } from "@/utils/auth";
import PaymentModel from "@/models/Payment";
import mongoose from "mongoose";

async function requireAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return { error: "Unauthorized", status: 401 };
  const decoded = verifyToken(token);
  if (!decoded) return { error: "Invalid token", status: 401 };
  if (decoded.role !== "ADMIN") return { error: "Forbidden", status: 403 };
  return { user: decoded };
}

// Escapes regex metacharacters so a raw search term (which may contain
// "+" from a phone number, "." etc.) can't be interpreted as a pattern.
function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── GET: Paginated, searchable transaction list (ADMIN ONLY) ────────────
//
// Backs the "Transactions" dashboard tab — lets support look up a specific
// user's payment history (by phone or Fapshi transaction id) without
// pulling every payment ever made into the browser at once.
export async function GET(req: NextRequest) {
  try {
    await connectDB();

    const auth = await requireAdmin();
    if ("error" in auth) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10) || 20));
    const search = (searchParams.get("search") || "").trim();
    const status = searchParams.get("status") || "";
    const paymentType = searchParams.get("paymentType") || "";
    const dateFrom = searchParams.get("dateFrom") || "";
    const dateTo = searchParams.get("dateTo") || "";
    const userId = searchParams.get("userId") || "";

    const query: Record<string, unknown> = {};

    if (search) {
      const re = new RegExp(escapeRegex(search), "i");
      // A search term matching a valid ObjectId also matches by userId
      // directly, so pasting a user's id (e.g. from the Users tab) works
      // as well as searching by phone or transaction id.
      const or: Record<string, unknown>[] = [{ phone: re }, { fapshiTransId: re }];
      if (mongoose.Types.ObjectId.isValid(search)) or.push({ userId: new mongoose.Types.ObjectId(search) });
      query.$or = or;
    }
    if (status) query.status = status;
    if (paymentType) query.paymentType = paymentType;
    if (userId && mongoose.Types.ObjectId.isValid(userId)) query.userId = new mongoose.Types.ObjectId(userId);
    if (dateFrom || dateTo) {
      const createdAt: Record<string, Date> = {};
      if (dateFrom) createdAt.$gte = new Date(dateFrom + "T00:00:00");
      if (dateTo) createdAt.$lte = new Date(dateTo + "T23:59:59.999");
      query.createdAt = createdAt;
    }

    const [transactions, total] = await Promise.all([
      PaymentModel.find(query)
        .populate("userId", "phone role")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      PaymentModel.countDocuments(query),
    ]);

    return NextResponse.json({
      success: true,
      data: transactions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    console.error("LIST TRANSACTIONS ERROR:", error);
    return NextResponse.json({ success: false, message: "Failed to load transactions" }, { status: 500 });
  }
}
