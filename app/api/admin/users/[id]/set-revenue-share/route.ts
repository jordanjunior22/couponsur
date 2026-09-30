import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import { cookies } from "next/headers";
import { verifyToken } from "@/utils/auth";
import UserModel from "@/models/Users";

async function requireSuperAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return { error: "Unauthorized", status: 401 };
  const decoded = verifyToken(token);
  if (!decoded) return { error: "Invalid token", status: 401 };
  if (decoded.role !== "ADMIN" || !decoded.isSuperAdmin) return { error: "Forbidden", status: 403 };
  return { user: decoded };
}

// ─── POST: Set/update an admin's revenue-share percentages (SUPER ADMIN ONLY) ──
//
// effectiveFrom is stamped only the FIRST time shares are configured for
// this admin — editing the percentage later never resets their earnings
// history to zero (see lib/adminEarnings.ts).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();

    const auth = await requireSuperAdmin();
    if ("error" in auth) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { subscriptionSharePercent, pickSharePercent } = body;

    if (
      typeof subscriptionSharePercent !== "number" || subscriptionSharePercent < 0 || subscriptionSharePercent > 100 ||
      typeof pickSharePercent !== "number" || pickSharePercent < 0 || pickSharePercent > 100
    ) {
      return NextResponse.json(
        { success: false, message: "Share percentages must be numbers between 0 and 100" },
        { status: 400 }
      );
    }

    const target = await UserModel.findById(id);
    if (!target) {
      return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    }
    if (target.role !== "ADMIN") {
      return NextResponse.json({ success: false, message: "Target is not an admin" }, { status: 400 });
    }

    target.revenueShare.subscriptionPercent = subscriptionSharePercent;
    target.revenueShare.pickPercent = pickSharePercent;
    if (!target.revenueShare.effectiveFrom) {
      target.revenueShare.effectiveFrom = new Date();
    }
    await target.save();

    const safeTarget = await UserModel.findById(id).select("-password");
    return NextResponse.json({ success: true, data: safeTarget });
  } catch (error) {
    console.error("SET REVENUE SHARE ERROR:", error);
    return NextResponse.json({ success: false, message: "Failed to update revenue share" }, { status: 500 });
  }
}
