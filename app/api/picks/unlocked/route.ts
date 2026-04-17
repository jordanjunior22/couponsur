import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import Pick from "@/models/Picks";
import UserModel from "@/models/Users";
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

    const user = await UserModel.findById(decoded.userId);

    if (!user) {
      return NextResponse.json({ success: false }, { status: 404 });
    }

    const picks = await Pick.find({
      _id: { $in: user.unlockedPickIds },
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