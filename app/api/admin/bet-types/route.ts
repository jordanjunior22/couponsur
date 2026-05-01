import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import { getSessionUser } from "@/utils/session";
import UserModel from "@/models/Users";
import BetTypeModel from "@/models/BetType";

// ── GET: List all bet types ────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const sessionUser = await getSessionUser(req);
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const user = await UserModel.findById(sessionUser._id);

    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const betTypes = await BetTypeModel.find().sort({ code: 1 }).lean();

    return NextResponse.json({
      success: true,
      data: betTypes,
    });
  } catch (error: any) {
    console.error("Get bet types error:", error);
    return NextResponse.json(
      { error: "Failed to fetch bet types" },
      { status: 500 }
    );
  }
}

// ── POST: Create new bet type ──────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const sessionUser = await getSessionUser(req);
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const user = await UserModel.findById(sessionUser._id);

    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { code, label, description, category, predictions, isActive } =
      await req.json();

    if (!code || !label || !predictions || predictions.length === 0) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const betType = await BetTypeModel.create({
      code: code.toUpperCase(),
      label,
      description,
      category: category || "OTHER",
      predictions,
      isActive: isActive !== false,
    });

    return NextResponse.json({
      success: true,
      data: betType,
    });
  } catch (error: any) {
    console.error("Create bet type error:", error);
    if (error.code === 11000) {
      return NextResponse.json(
        { error: "Bet type code already exists" },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Failed to create bet type" },
      { status: 500 }
    );
  }
}
