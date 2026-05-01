import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import { getSessionUser } from "@/utils/session";
import UserModel from "@/models/Users";
import SubscriptionPlanModel from "@/models/SubscriptionPlan";

// ── GET: List all subscription plans ────────────────────────────
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

    const plans = await SubscriptionPlanModel.find()
      .sort({ displayOrder: 1 })
      .lean();

    return NextResponse.json({
      success: true,
      data: plans,
    });
  } catch (error: any) {
    console.error("Get subscription plans error:", error);
    return NextResponse.json(
      { error: "Failed to fetch subscription plans" },
      { status: 500 }
    );
  }
}

// ── POST: Create new subscription plan ────────────────────────────
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

    const {
      name,
      durationDays,
      basePrice,
      discountPercent,
      description,
      displayOrder,
      isActive,
    } = await req.json();

    if (!name || !durationDays || basePrice === undefined) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Validate durationDays
    if (![30, 90, 180, 365].includes(durationDays)) {
      return NextResponse.json(
        { error: "Invalid duration. Must be 30, 90, 180, or 365 days" },
        { status: 400 }
      );
    }

    const finalDiscountPercent = discountPercent || 0;
    const finalPrice = basePrice * (1 - finalDiscountPercent / 100);

    const plan = await SubscriptionPlanModel.create({
      name,
      durationDays,
      basePrice,
      discountPercent: finalDiscountPercent,
      finalPrice,
      description: description || "",
      displayOrder: displayOrder || 1,
      isActive: isActive !== false,
    });

    return NextResponse.json({
      success: true,
      data: plan,
    });
  } catch (error: any) {
    console.error("Create subscription plan error:", error.message, error);
    return NextResponse.json(
      { error: error.message || "Failed to create subscription plan" },
      { status: 500 }
    );
  }
}
