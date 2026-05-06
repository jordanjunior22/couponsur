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

// ─── POST: Signup ────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    await connectDB();

    const { phone, password } = await req.json();

    // ─── Validate input ───────────────────────────────────
    if (!phone || !password) {
      const response = NextResponse.json(
        { success: false, message: "Phone and password are required" },
        { status: 400 }
      );
      return addCorsHeaders(response, req.headers.get("origin") || undefined);
    }

    if (password.length < 4) {
      const response = NextResponse.json(
        { success: false, message: "Password must be at least 4 characters" },
        { status: 400 }
      );
      return addCorsHeaders(response, req.headers.get("origin") || undefined);
    }

    // ─── Check if user exists ─────────────────────────────
    const existingUser = await User.findOne({ phone });

    if (existingUser) {
      const response = NextResponse.json(
        { success: false, message: "User already exists" },
        { status: 409 }
      );
      return addCorsHeaders(response, req.headers.get("origin") || undefined);
    }

    // ─── Hash password ────────────────────────────────────
    const hashedPassword = await bcrypt.hash(password, 10);

    // ─── Create user ──────────────────────────────────────
    const user = await User.create({
      phone,
      password: hashedPassword,
      role: "USER", // default
      unlockedPickIds: [],
    });

    // ─── Create JWT (auto login) ──────────────────────────
    const token = jwt.sign(
      {
        userId: user._id,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    // ─── Safe user ────────────────────────────────────────
    const safeUser = {
      _id: user._id,
      phone: user.phone,
      role: user.role,
      unlockedPickIds: user.unlockedPickIds,
      hasActiveSubscription: false,
      subscriptionEndDate: null,
    };

    // ─── Response with cookie and token for mobile ─────────
    const response = NextResponse.json(
      { success: true, data: { user: safeUser, token } },
      { status: 201 }
    );

    response.cookies.set("token", token, {
      httpOnly: true,
      secure: false, // Works in both dev and production
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return addCorsHeaders(response, req.headers.get("origin") || undefined);
  } catch (error: any) {
    console.error("SIGNUP ERROR:", error);

    const response = NextResponse.json(
      { success: false, message: error.message || "Server error" },
      { status: 500 }
    );

    return addCorsHeaders(response, req.headers.get("origin") || undefined);
  }
}