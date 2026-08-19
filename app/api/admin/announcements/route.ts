import { NextRequest, NextResponse } from "next/server";
import AnnouncementModel, { AnnouncementType } from "@/models/Announcement";
import { connectDB } from "@/utils/ConnectDb";
import { cookies } from "next/headers";
import { verifyToken } from "@/utils/auth";

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

const VALID_TYPES: AnnouncementType[] = ["INFO", "WARNING", "SUCCESS"];

// ─── LIST ALL ANNOUNCEMENTS (ADMIN ONLY) ─────────────────
// Unlike the public /api/announcements route, this returns inactive and
// expired ones too, so the dashboard can list/edit everything.
export async function GET() {
  try {
    await connectDB();

    const auth = await requireAdmin();
    if ("error" in auth) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const announcements = await AnnouncementModel.find().sort({ createdAt: -1 }).lean();

    return NextResponse.json({ success: true, data: announcements });
  } catch (error) {
    console.error("LIST ADMIN ANNOUNCEMENTS ERROR:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch announcements" },
      { status: 500 }
    );
  }
}

// ─── CREATE ANNOUNCEMENT (ADMIN ONLY) ────────────────────
export async function POST(req: NextRequest) {
  try {
    await connectDB();

    const auth = await requireAdmin();
    if ("error" in auth) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const text = typeof body.body === "string" ? body.body.trim() : "";
    const type = VALID_TYPES.includes(body.type) ? body.type : "INFO";
    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;

    if (!title) {
      return NextResponse.json({ success: false, message: "Le titre est requis" }, { status: 400 });
    }
    if (!text) {
      return NextResponse.json({ success: false, message: "Le contenu est requis" }, { status: 400 });
    }

    const created = await AnnouncementModel.create({
      title,
      body: text,
      type,
      expiresAt,
      isActive: true,
    });

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error) {
    console.error("CREATE ANNOUNCEMENT ERROR:", error);
    return NextResponse.json(
      { success: false, message: "Failed to create announcement" },
      { status: 500 }
    );
  }
}
