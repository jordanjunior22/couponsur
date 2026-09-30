import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import { cookies } from "next/headers";
import { verifyToken } from "@/utils/auth";
import UserModel, { UserRole } from "@/models/Users";
import bcrypt from "bcryptjs";
import { normalizeUserPhone, isValidCameroonMobile } from "@/utils/normalizeUserPhone";

async function requireSuperAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return { error: "Unauthorized", status: 401 };
  const decoded = verifyToken(token);
  if (!decoded) return { error: "Invalid token", status: 401 };
  if (decoded.role !== "ADMIN" || !decoded.isSuperAdmin) return { error: "Forbidden", status: 403 };
  return { user: decoded };
}

// ─── POST: Create an admin account directly (SUPER ADMIN ONLY) ──────────
//
// Backs the "Créer un administrateur" form on the "Administrateurs" tab —
// same identity rules as signup (normalized Cameroon phone, hashed
// password) but role is ADMIN from the start and revenueShare is set
// immediately, so the new admin starts earning the moment they're created.
export async function POST(req: NextRequest) {
  try {
    await connectDB();

    const auth = await requireSuperAdmin();
    if ("error" in auth) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const body = await req.json().catch(() => ({}));
    const { phone: rawPhone, password, subscriptionSharePercent, pickSharePercent } = body;

    if (!rawPhone || !password) {
      return NextResponse.json(
        { success: false, message: "Phone and password are required" },
        { status: 400 }
      );
    }

    const phone = normalizeUserPhone(rawPhone);
    if (!isValidCameroonMobile(phone)) {
      return NextResponse.json(
        { success: false, message: "Numéro de téléphone invalide — format attendu : 6XX XXX XXX" },
        { status: 400 }
      );
    }

    if (typeof password !== "string" || password.length < 4) {
      return NextResponse.json(
        { success: false, message: "Password must be at least 4 characters" },
        { status: 400 }
      );
    }

    const subPercent = subscriptionSharePercent ?? 0;
    const pickPercent = pickSharePercent ?? 100;
    if (
      typeof subPercent !== "number" || subPercent < 0 || subPercent > 100 ||
      typeof pickPercent !== "number" || pickPercent < 0 || pickPercent > 100
    ) {
      return NextResponse.json(
        { success: false, message: "Share percentages must be numbers between 0 and 100" },
        { status: 400 }
      );
    }

    const existingUser = await UserModel.findOne({ phone });
    if (existingUser) {
      return NextResponse.json(
        { success: false, message: "Un compte existe déjà avec ce numéro" },
        { status: 409 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const admin = await UserModel.create({
      phone,
      password: hashedPassword,
      role: UserRole.ADMIN,
      isSuperAdmin: false,
      revenueShare: {
        subscriptionPercent: subPercent,
        pickPercent: pickPercent,
        effectiveFrom: new Date(),
      },
    });

    const safeAdmin = await UserModel.findById(admin._id).select("-password");

    return NextResponse.json({ success: true, data: safeAdmin }, { status: 201 });
  } catch (error) {
    console.error("CREATE ADMIN ERROR:", error);
    return NextResponse.json({ success: false, message: "Failed to create admin" }, { status: 500 });
  }
}
