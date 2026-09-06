import { NextResponse } from "next/server";
import GroupMessageModel from "@/models/GroupMessage";
import { connectDB } from "@/utils/ConnectDb";
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

// ─── DELETE: wipe every message in the premium group chat (ADMIN ONLY) ────
// Irreversible — reclaims whatever storage the room's messages/images were
// using. The confirmation prompt lives client-side (dashboard SettingsTab).
export async function DELETE() {
  try {
    await connectDB();

    const auth = await requireAdmin();
    if ("error" in auth) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const result = await GroupMessageModel.deleteMany({});

    return NextResponse.json({ success: true, data: { deletedCount: result.deletedCount ?? 0 } });
  } catch (error) {
    console.error("CLEAR GROUP CHAT ERROR:", error);
    return NextResponse.json({ success: false, message: "Failed to clear group chat" }, { status: 500 });
  }
}
