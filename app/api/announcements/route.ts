import { NextResponse } from "next/server";
import AnnouncementModel from "@/models/Announcement";
import { connectDB } from "@/utils/ConnectDb";

// ─── LIST ACTIVE ANNOUNCEMENTS (PUBLIC) ──────────────────
// Powers the site-wide banner — only announcements the admin has left
// active and that haven't passed their optional expiry date.
export async function GET() {
  try {
    await connectDB();

    const announcements = await AnnouncementModel.find({
      isActive: true,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    })
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ success: true, data: announcements });
  } catch (error) {
    console.error("LIST ANNOUNCEMENTS ERROR:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch announcements" },
      { status: 500 }
    );
  }
}
