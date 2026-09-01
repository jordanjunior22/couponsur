import { NextRequest, NextResponse } from "next/server";
import ConversationModel from "@/models/Conversation";
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

// ─── POST: ping "the admin is typing" ──────────────────────────────────────
// Fired (throttled) by the admin dashboard's reply box on every keystroke.
export async function POST(
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
    await ConversationModel.updateOne({ _id: id }, { $set: { adminTypingAt: new Date() } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("ADMIN TYPING PING ERROR:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
