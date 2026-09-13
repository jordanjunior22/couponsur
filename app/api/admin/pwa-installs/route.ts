import { NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import PWAInstallModel from "@/models/PWAInstall";
import { cookies } from "next/headers";
import { verifyToken } from "@/utils/auth";

async function requireAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return { error: "Unauthorized", status: 401 };
  const decoded = verifyToken(token);
  if (!decoded) return { error: "Invalid token", status: 401 };
  if (decoded.role !== "ADMIN") return { error: "Forbidden", status: 403 };
  return { user: decoded };
}

// ─── GET: PWA install count for the dashboard's Utilisateurs tab ──────────
// "Installed" here means a device has been seen running the site in
// standalone display mode (see models/PWAInstall.ts for why this is a
// best-effort estimate, not an exact count).
export async function GET() {
  try {
    await connectDB();

    const auth = await requireAdmin();
    if ("error" in auth) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const [total, linkedToUser, byPlatform] = await Promise.all([
      PWAInstallModel.countDocuments(),
      PWAInstallModel.countDocuments({ user: { $ne: null } }),
      PWAInstallModel.aggregate([{ $group: { _id: "$platform", count: { $sum: 1 } } }]),
    ]);

    const platforms: Record<string, number> = { ios: 0, android: 0, desktop: 0, other: 0 };
    for (const row of byPlatform as { _id: string; count: number }[]) {
      platforms[row._id] = row.count;
    }

    return NextResponse.json({ success: true, data: { total, linkedToUser, platforms } });
  } catch (error) {
    console.error("PWA INSTALLS COUNT ERROR:", error);
    return NextResponse.json({ success: false, message: "Failed to fetch install count" }, { status: 500 });
  }
}
