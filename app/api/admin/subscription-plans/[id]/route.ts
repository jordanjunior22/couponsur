import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import { getSessionUser } from "@/utils/session";
import UserModel from "@/models/Users";
import SubscriptionPlanModel from "@/models/SubscriptionPlan";
import mongoose from "mongoose";

// ── PUT: Update subscription plan ──────────────────────────────
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid plan ID" }, { status: 400 });
    }

    const updates = await req.json();

    // Validate durationDays if provided
    if (
      updates.durationDays &&
      ![30, 90, 180, 365].includes(updates.durationDays)
    ) {
      return NextResponse.json(
        { error: "Invalid duration. Must be 30, 90, 180, or 365 days" },
        { status: 400 }
      );
    }

    // Recalculate finalPrice if basePrice or discountPercent is provided
    if (updates.basePrice !== undefined || updates.discountPercent !== undefined) {
      const plan = await SubscriptionPlanModel.findById(id);
      if (plan) {
        const basePrice = updates.basePrice ?? plan.basePrice;
        const discountPercent = updates.discountPercent ?? plan.discountPercent;
        updates.finalPrice = basePrice * (1 - discountPercent / 100);
      }
    }

    const plan = await SubscriptionPlanModel.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    );

    if (!plan) {
      return NextResponse.json(
        { error: "Subscription plan not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: plan,
    });
  } catch (error: any) {
    console.error("Update subscription plan error:", error.message, error);
    return NextResponse.json(
      { error: error.message || "Failed to update subscription plan" },
      { status: 500 }
    );
  }
}

// ── DELETE: Delete subscription plan ───────────────────────────
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid plan ID" }, { status: 400 });
    }

    const plan = await SubscriptionPlanModel.findByIdAndDelete(id);

    if (!plan) {
      return NextResponse.json(
        { error: "Subscription plan not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Subscription plan deleted",
    });
  } catch (error: any) {
    console.error("Delete subscription plan error:", error);
    return NextResponse.json(
      { error: "Failed to delete subscription plan" },
      { status: 500 }
    );
  }
}
