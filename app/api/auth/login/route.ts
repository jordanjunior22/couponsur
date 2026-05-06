import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import User from "@/models/Users";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { addCorsHeaders, handleCorsPreFlight } from "@/utils/cors";

const JWT_SECRET = process.env.JWT_SECRET!;

// ─── OPTIONS: CORS preflight ────────────────────────────
export async function OPTIONS(req: NextRequest) {
  return await handleCorsPreFlight(req) || new NextResponse(null, { status: 200 });
}

// ─── POST: Login ─────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    await connectDB();

    const { phone, password } = await req.json();

    // ─── Validate ─────────────────────────────────────────
    if (!phone || !password) {
      const response = NextResponse.json(
        { success: false, message: "Phone and password are required" },
        { status: 400 }
      );
      return addCorsHeaders(response, req.headers.get("origin") || undefined);
    }

    // ─── Find user ────────────────────────────────────────
    const user = await User.findOne({ phone });

    if (!user) {
      const response = NextResponse.json(
        { success: false, message: "Invalid credentials" },
        { status: 401 }
      );
      return addCorsHeaders(response, req.headers.get("origin") || undefined);
    }

    // ─── Check password ───────────────────────────────────
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      const response = NextResponse.json(
        { success: false, message: "Invalid credentials" },
        { status: 401 }
      );
      return addCorsHeaders(response, req.headers.get("origin") || undefined);
    }
    user.lastLoginAt = new Date();
    await user.save();
    // ─── Create JWT ───────────────────────────────────────
    const token = jwt.sign(
      {
        userId: user._id,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    // ─── Safe user ────────────────────────────────────────
    const now = new Date();
    const hasActiveSubscription = user.subscription &&
      user.subscription.status === "active" &&
      now < user.subscription.endDate;

    const safeUser = {
      _id: user._id,
      phone: user.phone,
      role: user.role,
      unlockedPickIds: user.unlockedPickIds,
      lastLoginAt: user.lastLoginAt,
      hasActiveSubscription: hasActiveSubscription || false,
      subscriptionEndDate: user.subscription?.endDate,
    };

    // ─── Response with cookie and token for mobile ─────────
    const response = NextResponse.json(
      { success: true, data: { user: safeUser, token } },
      { status: 200 }
    );

    response.cookies.set("token", token, {
      httpOnly: true,
      secure: false, // Works in both dev and production
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return addCorsHeaders(response, req.headers.get("origin") || undefined);
  } catch (error) {
    console.error("LOGIN ERROR:", error);

    const response = NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 }
    );

    return addCorsHeaders(response, req.headers.get("origin") || undefined);
  }
}