import { NextResponse } from "next/server";
import ConversationModel from "@/models/Conversation";
import { connectDB } from "@/utils/ConnectDb";
import { cookies } from "next/headers";
import { verifyToken } from "@/utils/auth";
import { serializeConversation } from "@/utils/chatSerializer";

// ─── HELPER: REQUIRE ADMIN ───────────────────────────────
async function requireAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;

  if (!token) return { error: "Unauthorized", status: 401 };

  const decoded = verifyToken(token);
  if (!decoded) return { error: "Invalid token", status: 401 };
  if (decoded.role !== "ADMIN") return { error: "Forbidden", status: 403 };

  return { user: decoded };
}

// ─── LIST CONVERSATIONS (ADMIN ONLY) ─────────────────────
export async function GET() {
  try {
    await connectDB();

    const auth = await requireAdmin();
    if ("error" in auth) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });
    }

    // `-messages.image`: the list never carries picture data, only URLs.
    const conversations = await ConversationModel.find().select("-messages.image").sort({ lastMessageAt: -1 }).lean();

    return NextResponse.json({ success: true, data: conversations.map(serializeConversation) });
  } catch (error) {
    console.error("LIST CONVERSATIONS ERROR:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch conversations" },
      { status: 500 }
    );
  }
}
