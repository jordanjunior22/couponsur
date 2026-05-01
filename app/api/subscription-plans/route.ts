import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import SubscriptionPlanModel from "@/models/SubscriptionPlan";

export async function GET() {
  try {
    await connectDB();

    const plans = await SubscriptionPlanModel.find({ isActive: true })
      .sort({ displayOrder: 1 })
      .lean();

    return NextResponse.json({
      success: true,
      data: plans,
    });
  } catch (error: any) {
    console.error("Error fetching subscription plans:", error);
    return NextResponse.json(
      { error: "Failed to fetch subscription plans" },
      { status: 500 }
    );
  }
}
