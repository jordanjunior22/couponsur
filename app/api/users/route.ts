import { NextRequest, NextResponse } from "next/server";
import UserModel from "@/models/Users";
import { connectDB } from "@/utils/ConnectDb";
import { cookies } from "next/headers";
import { verifyToken } from "@/utils/auth";

// ─── HELPER: REQUIRE ADMIN ───────────────────────────────
async function requireAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;

  if (!token) return { error: "Unauthorized", status: 401 };

  const decoded = verifyToken(token);
  if (!decoded) return { error: "Invalid token", status: 401 };
  if (decoded.role !== "ADMIN") return { error: "Forbidden", status: 403 };

  return { user: decoded };
}

// ─── GET: ADMIN ONLY ────────────────────────────────────
// GET /api/users          → returns ALL users (for dashboard)
// GET /api/users?phone=X  → returns ONE user by phone
export async function GET(req: NextRequest) {
  try {
    await connectDB();

    // 🔐 Auth check
    const auth = await requireAdmin();
    if ("error" in auth) {
      return NextResponse.json(
        { success: false, message: auth.error },
        { status: auth.status }
      );
    }

    const { searchParams } = new URL(req.url);
    const phone = searchParams.get("phone");

    // ── Return ALL users when no phone param ────────────
    if (!phone) {
      const users = await UserModel.find()
        .select("-password")
        .sort({ createdAt: -1 })
        .lean();

      return NextResponse.json(
        { success: true, data: users },
        { status: 200 }
      );
    }

    // ── Return ONE user by phone ────────────────────────
    const normalizedPhone = phone.replace(/\D/g, "").replace(/^237/, "");

    const user = await UserModel.findOne({ phone: normalizedPhone })
      .select("-password")
      .populate("unlockedPickIds")
      .lean();

    if (!user) {
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: true, data: user },
      { status: 200 }
    );

  } catch (error) {
    console.error("GET USER(S) ERROR:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch user(s)" },
      { status: 500 }
    );
  }
}