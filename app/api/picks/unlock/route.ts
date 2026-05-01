import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import UserModel from "@/models/Users";
import { cookies } from "next/headers";
import { verifyToken } from "@/utils/auth";

export async function POST(req: NextRequest) {
  try {
    await connectDB();

    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;

    if (!token) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const decoded = verifyToken(token);

    if (!decoded) {
      return NextResponse.json(
        { success: false, message: "Invalid token" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { pickId, price } = body;

    if (!pickId || !price) {
      return NextResponse.json(
        { success: false, message: "Missing pickId or price" },
        { status: 400 }
      );
    }

    const user = await UserModel.findById(decoded.userId);

    if (!user) {
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    // Check if pick is already unlocked
    if (user.unlockedPickIds && user.unlockedPickIds.includes(pickId)) {
      return NextResponse.json(
        { success: false, message: "Pick already unlocked" },
        { status: 400 }
      );
    }

    // In a real app, you would process payment here
    // For now, we'll just add it to unlockedPickIds
    // TODO: Integrate payment processing (Stripe, etc.)

    // Add pick to user's unlocked picks
    const updatedUser = await UserModel.findByIdAndUpdate(
      decoded.userId,
      {
        $addToSet: { unlockedPickIds: pickId },
      },
      { new: true }
    );

    return NextResponse.json({
      success: true,
      message: "Pick unlocked successfully",
      data: updatedUser,
    });
  } catch (error: any) {
    console.error("Unlock pick error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to unlock pick" },
      { status: 500 }
    );
  }
}
