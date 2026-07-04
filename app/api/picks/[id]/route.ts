import { NextRequest, NextResponse } from "next/server";
import Pick, { Outcome } from "@/models/Picks";
import { connectDB } from "@/utils/ConnectDb";
import { cookies } from "next/headers";
import { verifyToken } from "@/utils/auth";
import { comboOutcome } from "@/lib/gradeHelpers";

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

// ─── GRADE / TICK MATCH OUTCOMES (ADMIN ONLY) ────────────
//
// PATCH /api/picks/:id
// Body:
//   {
//     "updates": [
//       { "matchIndex": 0, "outcome": "WIN", "score": "2:1" },
//       { "matchIndex": 1, "outcome": "LOSS", "score": "0:3" }
//     ]
//   }
//
// matchIndex is the 0-based position of the match in the pick's `matches`
// array (GET this pick first to see current indices/outcomes).
//
// After applying updates, the pick's overall outcome is recomputed from
// ALL its matches: WIN only if every leg is a WIN, LOSS if any leg is a
// LOSS, otherwise stays PENDING. Marks is_manually_graded: true, which
// excludes this pick from future auto-grading cron runs — manual grading
// is treated as final.
export async function PATCH(
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
    const updates = body?.updates;

    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json(
        { success: false, message: "Body must include a non-empty 'updates' array" },
        { status: 400 }
      );
    }

    const pick = await Pick.findById(id);
    if (!pick) {
      return NextResponse.json(
        { success: false, message: "Pick not found" },
        { status: 404 }
      );
    }

    for (const u of updates) {
      if (
        typeof u.matchIndex !== "number" ||
        u.matchIndex < 0 ||
        u.matchIndex >= pick.matches.length
      ) {
        return NextResponse.json(
          { success: false, message: `Invalid matchIndex: ${u.matchIndex}` },
          { status: 400 }
        );
      }
      if (u.outcome !== "WIN" && u.outcome !== "LOSS") {
        return NextResponse.json(
          { success: false, message: `Invalid outcome: ${u.outcome} (must be WIN or LOSS)` },
          { status: 400 }
        );
      }

      pick.matches[u.matchIndex].outcome = u.outcome as Outcome;
      if (u.score) pick.matches[u.matchIndex].score = u.score;
    }

    const legOutcomes = pick.matches.map((m) => m.outcome as "PENDING" | "WIN" | "LOSS");
    const overall = comboOutcome(legOutcomes);

    pick.outcome = overall as Outcome;
    pick.is_manually_graded = true;
    pick.graded_at = new Date();

    await pick.save();

    return NextResponse.json({
      success: true,
      data: pick,
    });
  } catch (error: any) {
    console.error("GRADE PICK ERROR:", error);

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