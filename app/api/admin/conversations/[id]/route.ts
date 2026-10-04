import { NextRequest, NextResponse } from "next/server";
import ConversationModel from "@/models/Conversation";
import { connectDB } from "@/utils/ConnectDb";
import { cookies } from "next/headers";
import { verifyToken } from "@/utils/auth";
import { serializeConversation } from "@/utils/chatSerializer";
import { parseImageDataUri, MAX_GROUP_IMAGE_BYTES } from "@/utils/groupChatImage";

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

// ─── GET ONE CONVERSATION (ADMIN ONLY) ───────────────────
export async function GET(
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
    const conversation = await ConversationModel.findById(id).select("-messages.image").lean();

    if (!conversation) {
      return NextResponse.json({ success: false, message: "Conversation not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: serializeConversation(conversation) });
  } catch (error) {
    console.error("GET CONVERSATION ERROR:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch conversation" },
      { status: 500 }
    );
  }
}

// ─── REPLY AS ADMIN ───────────────────────────────────────
// POST /api/admin/conversations/:id   body: { text?: string, image?: dataURI }
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
    const body = await req.json();
    const text = typeof body.text === "string" ? body.text.trim() : "";

    const rawImage = typeof body.image === "string" ? body.image : null;

    if (!text && !rawImage) {
      return NextResponse.json({ success: false, message: "Le message ne peut pas être vide" }, { status: 400 });
    }
    if (text.length > 2000) {
      return NextResponse.json({ success: false, message: "Le message est trop long (2000 caractères max)" }, { status: 400 });
    }

    let image: string | null = null;
    let imageBytes = 0;
    if (rawImage) {
      const parsed = parseImageDataUri(rawImage);
      if (!parsed) {
        return NextResponse.json({ success: false, message: "Image invalide" }, { status: 400 });
      }
      if (parsed.bytes > MAX_GROUP_IMAGE_BYTES) {
        return NextResponse.json({ success: false, message: "Image trop volumineuse" }, { status: 400 });
      }
      image = rawImage;
      imageBytes = parsed.bytes;
    }

    const now = new Date();
    const conversation = await ConversationModel.findByIdAndUpdate(
      id,
      {
        $push: { messages: { sender: "ADMIN", text, image, imageBytes, createdAt: now } },
        $set: { lastMessageAt: now },
      },
      { new: true }
    ).select("-messages.image");

    if (!conversation) {
      return NextResponse.json({ success: false, message: "Conversation not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: serializeConversation(conversation) });
  } catch (error) {
    console.error("REPLY CONVERSATION ERROR:", error);
    return NextResponse.json(
      { success: false, message: "Échec de l'envoi de la réponse" },
      { status: 500 }
    );
  }
}

// ─── UPDATE STATUS (ADMIN ONLY) ──────────────────────────
// PATCH /api/admin/conversations/:id   body: { status: "OPEN" | "RESOLVED" }
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
    const body = await req.json();

    if (body.status !== "OPEN" && body.status !== "RESOLVED") {
      return NextResponse.json(
        { success: false, message: "Invalid status (must be OPEN or RESOLVED)" },
        { status: 400 }
      );
    }

    const conversation = await ConversationModel.findByIdAndUpdate(
      id,
      { status: body.status },
      { new: true }
    ).select("-messages.image");

    if (!conversation) {
      return NextResponse.json({ success: false, message: "Conversation not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: serializeConversation(conversation) });
  } catch (error) {
    console.error("UPDATE CONVERSATION STATUS ERROR:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update conversation" },
      { status: 500 }
    );
  }
}

// ─── DELETE CONVERSATION (ADMIN ONLY) ────────────────────
export async function DELETE(
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
    const deleted = await ConversationModel.findByIdAndDelete(id);

    if (!deleted) {
      return NextResponse.json({ success: false, message: "Conversation not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Conversation deleted successfully" });
  } catch (error) {
    console.error("DELETE CONVERSATION ERROR:", error);
    return NextResponse.json(
      { success: false, message: "Failed to delete conversation" },
      { status: 500 }
    );
  }
}
