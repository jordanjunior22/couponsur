import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import { getSessionUser } from "@/utils/session";
import UserModel from "@/models/Users";
import BetTypeModel from "@/models/BetType";
import mongoose from "mongoose";

// ── PUT: Update bet type ───────────────────────────────────────
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const sessionUser = await getSessionUser(req);
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const user = await UserModel.findById(sessionUser._id);

    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid bet type ID" }, { status: 400 });
    }

    const updates = await req.json();

    const betType = await BetTypeModel.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });

    if (!betType) {
      return NextResponse.json(
        { error: "Bet type not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: betType,
    });
  } catch (error: any) {
    console.error("Update bet type error:", error);
    return NextResponse.json(
      { error: "Failed to update bet type" },
      { status: 500 }
    );
  }
}

// ── DELETE: Delete bet type ────────────────────────────────────
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const sessionUser = await getSessionUser(req);
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const user = await UserModel.findById(sessionUser._id);

    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid bet type ID" }, { status: 400 });
    }

    const betType = await BetTypeModel.findByIdAndDelete(id);

    if (!betType) {
      return NextResponse.json(
        { error: "Bet type not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Bet type deleted",
    });
  } catch (error: any) {
    console.error("Delete bet type error:", error);
    return NextResponse.json(
      { error: "Failed to delete bet type" },
      { status: 500 }
    );
  }
}
