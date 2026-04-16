import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import Pick from "@/models/Picks";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";

export async function GET() {
  try {
    await connectDB();

    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;

    if (!token) {
      return NextResponse.json({ success: false }, { status: 401 });
    }

    const decoded: any = jwt.verify(token, process.env.JWT_SECRET!);

    const picks = await Pick.find({
      _id: { $in: decoded.unlockedPickIds },
    }).sort({ match_date: -1 });

    return NextResponse.json({
      success: true,
      data: picks,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, message: "Failed to fetch history" },
      { status: 500 }
    );
  }
}