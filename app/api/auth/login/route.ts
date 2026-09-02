import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import User from "@/models/Users";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { normalizeUserPhone } from "@/utils/normalizeUserPhone";

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
    // Normalized so spaces or a typed-in "+237"/"237" country code can't
    // cause a false "Invalid credentials" against an account that's really
    // the same phone number (see utils/normalizeUserPhone).
    const user = await User.findOne({ phone: normalizeUserPhone(phone) });

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
    // Must mirror what /api/auth/me returns (full user minus password) —
    // this is what populates client user state right after login, and a
    // field missing here (subscription was, until this fix) reads as
    // "falsy" client-side even when the DB has it set correctly, until the
    // next /api/auth/me refetch papers over it.
    const safeUser = {
      _id: user._id,
      phone: user.phone,
      role: user.role,
      unlockedPickIds: user.unlockedPickIds,
      subscription: user.subscription,
      lastLoginAt: user.lastLoginAt,
    };

    // ─── Response with cookie ─────────────────────────────
    const response = NextResponse.json(
      { success: true, user: safeUser },
      { status: 200 }
    );

    response.cookies.set("token", token, {
      httpOnly: true, // 🔐 cannot access from JS
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
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