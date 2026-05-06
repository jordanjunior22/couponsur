import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import User from "@/models/Users";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET!;

// ─── POST: Login ─────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    await connectDB();

    const { phone, password } = await req.json();

    // ─── Validate ─────────────────────────────────────────
    if (!phone || !password) {
      return NextResponse.json(
        { success: false, message: "Phone and password are required" },
        { status: 400 }
      );
    }

    // ─── Find user ────────────────────────────────────────
    const user = await User.findOne({ phone });

    if (!user) {
      return NextResponse.json(
        { success: false, message: "Invalid credentials" },
        { status: 401 }
      );
    }

    // ─── Check password ───────────────────────────────────
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return NextResponse.json(
        { success: false, message: "Invalid credentials" },
        { status: 401 }
      );
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
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error) {
    console.error("LOGIN ERROR:", error);

    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 }
    );
  }
}