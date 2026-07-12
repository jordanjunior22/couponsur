import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import SettingsModel, { getSettings } from "@/models/Settings";
import { cookies } from "next/headers";
import { verifyToken } from "@/utils/auth";

async function requireAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return { error: "Unauthorized", status: 401 };
  const decoded = verifyToken(token);
  if (!decoded) return { error: "Invalid token", status: 401 };
  if (decoded.role !== "ADMIN") return { error: "Forbidden", status: 403 };
  return { user: decoded };
}

export async function GET() {
  try {
    await connectDB();
    const settings = await getSettings();
    return NextResponse.json({ success: true, data: settings });
  } catch (error) {
    console.error("GET SETTINGS ERROR:", error);
    return NextResponse.json({ success: false, message: "Failed to fetch settings" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    await connectDB();

    const auth = await requireAdmin();
    if ("error" in auth) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const { subscriptionMonthlyPrice } = body;

    if (
      subscriptionMonthlyPrice === undefined ||
      typeof subscriptionMonthlyPrice !== "number" ||
      subscriptionMonthlyPrice <= 0
    ) {
      return NextResponse.json(
        { success: false, message: "subscriptionMonthlyPrice must be a positive number" },
        { status: 400 }
      );
    }

    const updated = await SettingsModel.findOneAndUpdate(
      { key: "global" },
      { $set: { subscriptionMonthlyPrice } },
      { new: true, upsert: true }
    );

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("UPDATE SETTINGS ERROR:", error);
    return NextResponse.json({ success: false, message: "Failed to update settings" }, { status: 500 });
  }
}