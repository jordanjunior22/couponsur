import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import User from "@/models/Users";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { normalizeUserPhone } from "@/utils/normalizeUserPhone";

const JWT_SECRET = process.env.JWT_SECRET!;

// ─── POST: Signup ────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    await connectDB();

    const { phone: rawPhone, password } = await req.json();

    // ─── Validate input ───────────────────────────────────
    if (!rawPhone || !password) {
      return NextResponse.json(
        { success: false, message: "Phone and password are required" },
        { status: 400 }
      );
    }

    // Normalized so spaces or a typed-in "+237"/"237" country code don't
    // create a duplicate account for a phone number that already exists
    // in the other format (see utils/normalizeUserPhone).
    const phone = normalizeUserPhone(rawPhone);
    if (!phone) {
      return NextResponse.json(
        { success: false, message: "Numéro de téléphone invalide" },
        { status: 400 }
      );
    }

    if (password.length < 4) {
      return NextResponse.json(
        { success: false, message: "Password must be at least 4 characters" },
        { status: 400 }
      );
    }

    // ─── Check if user exists ─────────────────────────────
    const existingUser = await User.findOne({ phone });

    if (existingUser) {
      return NextResponse.json(
        { success: false, message: "User already exists" },
        { status: 409 }
      );
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
    // Kept in sync with login's safeUser and /api/auth/me — see the
    // comment in app/api/auth/login/route.ts for why a missing field here
    // matters even though a brand-new signup's subscription is just the
    // schema default.
    const safeUser = {
      _id: user._id,
      phone: user.phone,
      role: user.role,
      unlockedPickIds: user.unlockedPickIds,
      subscription: user.subscription,
    };

    // ─── Response with cookie ─────────────────────────────
    const response = NextResponse.json(
      { success: true, user: safeUser },
      { status: 201 }
    );

    response.cookies.set("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error: any) {
    console.error("SIGNUP ERROR:", error);

    return NextResponse.json(
      { success: false, message: error.message || "Server error" },
      { status: 500 }
    );
  }
}