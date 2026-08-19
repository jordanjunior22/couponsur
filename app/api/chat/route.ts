import { NextRequest, NextResponse } from "next/server";
import ConversationModel from "@/models/Conversation";
import UserModel from "@/models/Users";
import { connectDB } from "@/utils/ConnectDb";
import { cookies } from "next/headers";
import { verifyToken } from "@/utils/auth";

// Resolves who's talking: a logged-in visitor is identified by their
// userId (reliable, can't be spoofed via query/body); an anonymous
// visitor is identified by whatever phone they typed into the widget —
// the same low-security identity model the rest of the site already
// uses for phone-based accounts.
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

// ─── GET: fetch (and poll) the caller's own conversation ─────────────────
// Logged-in visitors are matched by userId; anonymous visitors pass
// ?phone=... (whatever number they entered when they opened the widget).
export async function GET(req: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const identity = await resolveIdentity(searchParams.get("phone"));

    if (!identity) {
      return NextResponse.json({ success: true, data: null });
    }

    const conversation = identity.userId
      ? await ConversationModel.findOne({ user: identity.userId })
      : await ConversationModel.findOne({ phone: identity.phone, user: null });

    return NextResponse.json({ success: true, data: conversation });
  } catch (error) {
    console.error("GET CHAT ERROR:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch conversation" },
      { status: 500 }
    );
  }
}

// ─── POST: send a message as the visitor ──────────────────────────────────
// Body: { phone?, text }. phone is required only when the sender isn't
// logged in (it's how they'll be found again on the next poll).
export async function POST(req: NextRequest) {
  try {
    await connectDB();

    const body = await req.json();
    const text = typeof body.text === "string" ? body.text.trim() : "";

    if (!text) {
      return NextResponse.json(
        { success: false, message: "Le message ne peut pas être vide" },
        { status: 400 }
      );
    }
    if (text.length > 2000) {
      return NextResponse.json(
        { success: false, message: "Le message est trop long (2000 caractères max)" },
        { status: 400 }
      );
    }

    const identity = await resolveIdentity(typeof body.phone === "string" ? body.phone : null);
    if (!identity) {
      return NextResponse.json(
        { success: false, message: "Un numéro de téléphone valide est requis" },
        { status: 400 }
      );
    }

    const filter = identity.userId
      ? { user: identity.userId }
      : { phone: identity.phone, user: null };

    const now = new Date();
    const conversation = await ConversationModel.findOneAndUpdate(
      filter,
      {
        $setOnInsert: { phone: identity.phone, user: identity.userId },
        $push: { messages: { sender: "USER", text, createdAt: now } },
        $set: { lastMessageAt: now, status: "OPEN" },
      },
      { new: true, upsert: true }
    );

    return NextResponse.json({ success: true, data: conversation }, { status: 201 });
  } catch (error) {
    console.error("SEND CHAT MESSAGE ERROR:", error);
    return NextResponse.json(
      { success: false, message: "Échec de l'envoi du message" },
      { status: 500 }
    );
  }
}
