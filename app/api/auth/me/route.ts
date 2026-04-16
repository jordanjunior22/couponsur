import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/utils/auth";
import User from "@/models/Users";
import { connectDB } from "@/utils/ConnectDb";

export async function GET() {
  try {
    await connectDB();

    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;

    if (!token) {
      return NextResponse.json({ user: null });
    }

    const decoded = verifyToken(token);

    if (!decoded) {
      return NextResponse.json({ user: null });
    }

    const user = await User.findById(decoded.userId).select("-password");

    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json({ user: null });
  }
}