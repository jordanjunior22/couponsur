import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import UserModel from "@/models/Users";
import { verifyToken, getTokenFromRequest } from "@/utils/auth";
import { addCorsHeaders, handleCorsPreFlight } from "@/utils/cors";

export async function OPTIONS(req: NextRequest) {
  return await handleCorsPreFlight(req) || new NextResponse(null, { status: 200 });
}

export async function POST(req: NextRequest) {
  try {
    await connectDB();

    const token = await getTokenFromRequest(req);

    if (!token) {
      const response = NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
      return addCorsHeaders(response, req.headers.get("origin") || undefined);
    }

    const decoded = verifyToken(token);

    if (!decoded) {
      const response = NextResponse.json(
        { success: false, message: "Invalid token" },
        { status: 401 }
      );
      return addCorsHeaders(response, req.headers.get("origin") || undefined);
    }

    const body = await req.json();
    const { pickId, price } = body;

    if (!pickId || !price) {
      const response = NextResponse.json(
        { success: false, message: "Missing pickId or price" },
        { status: 400 }
      );
      return addCorsHeaders(response, req.headers.get("origin") || undefined);
    }

    const user = await UserModel.findById(decoded.userId);

    if (!user) {
      const response = NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
      return addCorsHeaders(response, req.headers.get("origin") || undefined);
    }

    // Check if pick is already unlocked
    if (user.unlockedPickIds && user.unlockedPickIds.includes(pickId)) {
      const response = NextResponse.json(
        { success: false, message: "Pick already unlocked" },
        { status: 400 }
      );
      return addCorsHeaders(response, req.headers.get("origin") || undefined);
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

    const response = NextResponse.json({
      success: true,
      message: "Pick unlocked successfully",
      data: updatedUser,
    });
    return addCorsHeaders(response, req.headers.get("origin") || undefined);
  } catch (error: any) {
    console.error("Unlock pick error:", error);
    const response = NextResponse.json(
      { success: false, message: error.message || "Failed to unlock pick" },
      { status: 500 }
    );
    return addCorsHeaders(response, req.headers.get("origin") || undefined);
  }
}
