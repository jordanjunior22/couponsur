import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import BetTypeModel from "@/models/BetType";
import { addCorsHeaders, handleCorsPreFlight } from "@/utils/cors";

export async function OPTIONS(req: NextRequest) {
  return await handleCorsPreFlight(req) || new NextResponse(null, { status: 200 });
}

export async function GET(req: NextRequest) {
  try {
    await connectDB();

    const betTypes = await BetTypeModel.find({ isActive: true })
      .sort({ code: 1 })
      .lean();

    const response = NextResponse.json({
      success: true,
      data: betTypes,
    });
    return addCorsHeaders(response, req.headers.get("origin") || undefined);
  } catch (error: any) {
    console.error("Error fetching bet types:", error);
    const response = NextResponse.json(
      { error: "Failed to fetch bet types" },
      { status: 500 }
    );
    return addCorsHeaders(response, req.headers.get("origin") || undefined);
  }
}
