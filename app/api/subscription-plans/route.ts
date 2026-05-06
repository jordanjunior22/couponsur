import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import SubscriptionPlanModel from "@/models/SubscriptionPlan";
import { addCorsHeaders, handleCorsPreFlight } from "@/utils/cors";

export async function OPTIONS(req: NextRequest) {
  return await handleCorsPreFlight(req) || new NextResponse(null, { status: 200 });
}

export async function GET(req: NextRequest) {
  try {
    await connectDB();

    const plans = await SubscriptionPlanModel.find({ isActive: true })
      .sort({ displayOrder: 1 })
      .lean();

    const response = NextResponse.json({
      success: true,
      data: plans,
    });
    return addCorsHeaders(response, req.headers.get("origin") || undefined);
  } catch (error: any) {
    console.error("Error fetching subscription plans:", error);
    const response = NextResponse.json(
      { error: "Failed to fetch subscription plans" },
      { status: 500 }
    );
    return addCorsHeaders(response, req.headers.get("origin") || undefined);
  }
}
