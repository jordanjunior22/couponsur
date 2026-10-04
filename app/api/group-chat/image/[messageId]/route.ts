import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/utils/ConnectDb";
import GroupMessageModel from "@/models/GroupMessage";
import { requireGroupChatAccess } from "@/utils/groupChatAccess";

const DATA_URI_RE = /^data:(image\/(?:png|jpe?g|webp|gif));base64,([A-Za-z0-9+/]+=*)$/;

// ─── GET: one group chat picture as a real, cacheable image ────────────────
// The message JSON only carries this address (see utils/groupChatSerializer.ts),
// so the picture is downloaded once and reused instead of being re-sent on
// every poll. Same gate as reading the room: premium pictures stay premium.
// The `?v=` on the address changes only if the picture itself does, which is
// what makes the long cache lifetime safe.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ messageId: string }> }) {
  try {
    const { messageId } = await params;
    if (!Types.ObjectId.isValid(messageId)) return new NextResponse(null, { status: 404 });

    await connectDB();
    const message = await GroupMessageModel.findById(messageId).select("image room").lean();
    if (!message?.image) return new NextResponse(null, { status: 404 });

    const access = await requireGroupChatAccess(message.room ?? "premium");
    if ("error" in access) return new NextResponse(null, { status: 404 });

    const match = DATA_URI_RE.exec(message.image);
    if (!match) return new NextResponse(null, { status: 404 });

    return new NextResponse(Buffer.from(match[2], "base64"), {
      status: 200,
      headers: {
        "Content-Type": match[1],
        // Members-only content: the member's own browser may keep it, shared
        // caches (CDNs, proxies) must not.
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("GET GROUP CHAT IMAGE ERROR:", error);
    return new NextResponse(null, { status: 500 });
  }
}
