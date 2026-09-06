import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import { cookies } from "next/headers";
import { verifyToken } from "@/utils/auth";
import UserModel from "@/models/Users";

async function requireAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return { error: "Unauthorized", status: 401 };
  const decoded = verifyToken(token);
  if (!decoded) return { error: "Invalid token", status: 401 };
  if (decoded.role !== "ADMIN") return { error: "Forbidden", status: 403 };
  return { user: decoded };
}

// ─── PATCH: mute/unmute a user from the premium group chat (ADMIN ONLY) ───
// Scoped to this one feature — they keep their account, subscription, and
// (if they still qualify) the ability to read the room; they just can't
// post while blocked. Triggered from the 🚫 icon on a message's sender in
// GroupChatRoom.tsx.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();

    const auth = await requireAdmin();
    if ("error" in auth) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    if (typeof body.blocked !== "boolean") {
      return NextResponse.json({ success: false, message: "blocked must be a boolean" }, { status: 400 });
    }

    const target = await UserModel.findById(id).select("role groupChatBlocked");
    if (!target) {
      return NextResponse.json({ success: false, message: "Utilisateur introuvable" }, { status: 404 });
    }
    if (target.role === "ADMIN") {
      return NextResponse.json({ success: false, message: "Impossible de bloquer un administrateur" }, { status: 400 });
    }

    target.groupChatBlocked = body.blocked;
    await target.save();

    return NextResponse.json({ success: true, data: { userId: target._id.toString(), blocked: target.groupChatBlocked } });
  } catch (error) {
    console.error("GROUP CHAT BLOCK ERROR:", error);
    return NextResponse.json({ success: false, message: "Failed to update block status" }, { status: 500 });
  }
}
