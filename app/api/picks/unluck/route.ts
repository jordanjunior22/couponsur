import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import User from "@/models/Users";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    await connectDB();

    const { pickId } = await req.json();

    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;

    if (!token) {
      return NextResponse.json({ success: false }, { status: 401 });
    }

    const decoded: any = jwt.verify(token, process.env.JWT_SECRET!);

    const user = await User.findById(decoded.id);

    if (!user) {
      return NextResponse.json({ success: false }, { status: 404 });
    }

    // Already unlocked
    if (user.unlockedPickIds.includes(pickId)) {
      return NextResponse.json({ success: true, user });
    }

    user.unlockedPickIds.push(pickId);
    await user.save();

    return NextResponse.json({
      success: true,
      user,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: "Unlock failed" },
      { status: 500 }
    );
  }
}