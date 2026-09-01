import { NextRequest, NextResponse } from "next/server";
import ConversationModel from "@/models/Conversation";
import UserModel from "@/models/Users";
import { connectDB } from "@/utils/ConnectDb";
import { cookies } from "next/headers";
import { verifyToken } from "@/utils/auth";

async function resolveIdentity(bodyPhone: string | null) {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;

  if (token) {
    const decoded = verifyToken(token);
    if (decoded) {
      const user = await UserModel.findById(decoded.userId).select("phone");
      if (user) return { userId: decoded.userId, phone: user.phone };
    }
  }

  const phone = bodyPhone?.trim();
  if (!phone || phone.length < 6) return null;
  return { userId: null as string | null, phone };
}

// ─── POST: ping "the visitor is typing" ────────────────────────────────────
// Fired (throttled) by the chat widget on every keystroke in the composer.
// No-op — not an error — if the conversation doesn't exist yet (visitor
// hasn't sent a first message), since there's nothing for the admin side
// to watch yet.
export async function POST(req: NextRequest) {
  try {
    await connectDB();

    const body = await req.json().catch(() => ({}));
    const identity = await resolveIdentity(typeof body?.phone === "string" ? body.phone : null);
    if (!identity) {
      return NextResponse.json({ success: true }); // nothing to ping yet
    }

    const filter = identity.userId ? { user: identity.userId } : { phone: identity.phone, user: null };
    await ConversationModel.updateOne(filter, { $set: { userTypingAt: new Date() } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("CHAT TYPING PING ERROR:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
