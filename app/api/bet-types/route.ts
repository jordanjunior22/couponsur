import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import BetTypeModel from "@/models/BetType";

export async function GET() {
  try {
    await connectDB();

    const betTypes = await BetTypeModel.find({ isActive: true })
      .sort({ code: 1 })
      .lean();

    return NextResponse.json({
      success: true,
      data: betTypes,
    });
  } catch (error: any) {
    console.error("Error fetching bet types:", error);
    return NextResponse.json(
      { error: "Failed to fetch bet types" },
      { status: 500 }
    );
  }
}
