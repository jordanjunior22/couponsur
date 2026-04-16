import { NextRequest, NextResponse } from "next/server";
import Pick from "@/models/Picks";
import { connectDB } from "@/utils/ConnectDb";
import { cookies } from "next/headers";
import { verifyToken } from "@/utils/auth";

// ─── GET ONE PICK (PUBLIC) ───────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();

    const { id } = await params;
    const pick = await Pick.findById(id);

    if (!pick) {
      return NextResponse.json(
        { success: false, message: "Pick not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: pick });
  } catch (error: any) {
    console.error("GET ONE PICK ERROR:", error);

    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}

// ─── HELPER: REQUIRE ADMIN ───────────────────────────────
async function requireAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;

  if (!token) {
    return { error: "Unauthorized", status: 401 };
  }

  const decoded = verifyToken(token);

  if (!decoded) {
    return { error: "Invalid token", status: 401 };
  }

  if (decoded.role !== "ADMIN") {
    return { error: "Forbidden", status: 403 };
  }

  return { user: decoded };
}

// ─── UPDATE PICK (ADMIN ONLY) ────────────────────────────
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();

    const auth = await requireAdmin();
    if ("error" in auth) {
      return NextResponse.json(
        { success: false, message: auth.error },
        { status: auth.status }
      );
    }

    const { id } = await params;
    const body = await req.json();

    if (body.match_date) {
      body.match_date = new Date(body.match_date);
    }

    const updatedPick = await Pick.findByIdAndUpdate(
      id,
      body,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!updatedPick) {
      return NextResponse.json(
        { success: false, message: "Pick not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: updatedPick,
    });
  } catch (error: any) {
    console.error("UPDATE PICK ERROR:", error);

    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}

// ─── DELETE PICK (ADMIN ONLY) ────────────────────────────
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();

    const auth = await requireAdmin();
    if ("error" in auth) {
      return NextResponse.json(
        { success: false, message: auth.error },
        { status: auth.status }
      );
    }

    const { id } = await params;
    const deletedPick = await Pick.findByIdAndDelete(id);

    if (!deletedPick) {
      return NextResponse.json(
        { success: false, message: "Pick not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Pick deleted successfully",
    });
  } catch (error: any) {
    console.error("DELETE PICK ERROR:", error);

    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}