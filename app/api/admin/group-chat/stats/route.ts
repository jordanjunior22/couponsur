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

// ─── GET: storage footprint of the premium group chat (ADMIN ONLY) ────────
// Reports how much room the room's messages/images are taking up in Mongo,
// so an admin can decide whether "clear all chats" is worth doing.
export async function GET() {
  try {
    await connectDB();

    const auth = await requireAdmin();
    if ("error" in auth) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const [agg] = await GroupMessageModel.aggregate([
      {
        $group: {
          _id: null,
          messageCount: { $sum: 1 },
          imageCount: { $sum: { $cond: [{ $ifNull: ["$image", false] }, 1, 0] } },
          imageBytes: { $sum: { $ifNull: ["$imageBytes", 0] } },
          textBytes: { $sum: { $strLenBytes: { $ifNull: ["$text", ""] } } },
          oldestAt: { $min: "$createdAt" },
          newestAt: { $max: "$createdAt" },
        },
      },
    ]);

    const messageCount = agg?.messageCount ?? 0;
    const imageCount = agg?.imageCount ?? 0;
    const imageBytes = agg?.imageBytes ?? 0;
    const textBytes = agg?.textBytes ?? 0;

    return NextResponse.json({
      success: true,
      data: {
        messageCount,
        imageCount,
        totalBytes: imageBytes + textBytes,
        oldestAt: agg?.oldestAt ?? null,
        newestAt: agg?.newestAt ?? null,
      },
    });
  } catch (error) {
    console.error("GROUP CHAT STATS ERROR:", error);
    return NextResponse.json({ success: false, message: "Failed to fetch group chat stats" }, { status: 500 });
  }
}
