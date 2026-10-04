import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { connectDB } from "@/utils/ConnectDb";
import { verifyToken } from "@/utils/auth";
import UserModel from "@/models/Users";
import { getSettings } from "@/models/Settings";
import { getFreeUsage, UNLIMITED_USAGE } from "@/lib/generatorQuota";

export const dynamic = "force-dynamic";

// ─── GET: how many generations the signed-in user has left today ───────────
// Read-only — never spends anything. Lets the generator screen show
// "3/5 restantes" before the first click.
export async function GET() {
  try {
    await connectDB();

    const token = (await cookies()).get("token")?.value;
    const decoded = token ? verifyToken(token) : null;
    if (!decoded) {
      return NextResponse.json({ success: false, message: "Non authentifié" }, { status: 401 });
    }

    const user = await UserModel.findById(decoded.userId).select("subscription role").lean();
    if (!user) {
      return NextResponse.json({ success: false, message: "Utilisateur introuvable" }, { status: 404 });
    }

    const isPremium = !!(
      user.subscription?.status === "ACTIVE" &&
      user.subscription.expiresAt &&
      new Date(user.subscription.expiresAt) > new Date()
    );
    if (isPremium || user.role === "ADMIN") {
      return NextResponse.json({ success: true, usage: UNLIMITED_USAGE });
    }

    const settings = await getSettings();
    const usage = await getFreeUsage(String(decoded.userId), settings.generatorFreeDailyLimit ?? 5);
    return NextResponse.json({ success: true, usage });
  } catch (error) {
    console.error("GENERATOR USAGE ERROR:", error);
    return NextResponse.json({ success: false, message: "Erreur serveur" }, { status: 500 });
  }
}
