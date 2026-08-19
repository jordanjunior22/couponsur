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

// ─── UPDATE ANNOUNCEMENT (ADMIN ONLY) ────────────────────
// PATCH /api/admin/announcements/:id
// Body may include any of: title, body, type, isActive, expiresAt
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
    const updates: Record<string, unknown> = {};

    if (body.title !== undefined) {
      const title = String(body.title).trim();
      if (!title) {
        return NextResponse.json({ success: false, message: "Le titre est requis" }, { status: 400 });
      }
      updates.title = title;
    }
    if (body.body !== undefined) {
      const text = String(body.body).trim();
      if (!text) {
        return NextResponse.json({ success: false, message: "Le contenu est requis" }, { status: 400 });
      }
      updates.body = text;
    }
    if (body.type !== undefined) {
      if (!VALID_TYPES.includes(body.type)) {
        return NextResponse.json({ success: false, message: "Invalid type" }, { status: 400 });
      }
      updates.type = body.type;
    }
    if (body.isActive !== undefined) {
      updates.isActive = !!body.isActive;
    }
    if (body.expiresAt !== undefined) {
      updates.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    }

    const updated = await AnnouncementModel.findByIdAndUpdate(id, updates, { new: true, runValidators: true });

    if (!updated) {
      return NextResponse.json({ success: false, message: "Announcement not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("UPDATE ANNOUNCEMENT ERROR:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update announcement" },
      { status: 500 }
    );
  }
}

// ─── DELETE ANNOUNCEMENT (ADMIN ONLY) ────────────────────
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
    const deleted = await AnnouncementModel.findByIdAndDelete(id);

    if (!deleted) {
      return NextResponse.json({ success: false, message: "Announcement not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Announcement deleted successfully" });
  } catch (error) {
    console.error("DELETE ANNOUNCEMENT ERROR:", error);
    return NextResponse.json(
      { success: false, message: "Failed to delete announcement" },
      { status: 500 }
    );
  }
}
