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

    // Convert Buffer images to base64 for JSON serialization
    let pickData: any = pick.toObject ? pick.toObject() : pick;

    // Handle images array
    if (pickData.images && Array.isArray(pickData.images)) {
      pickData.images = pickData.images.map((img: any) => {
        let buffer = img.data;

        // Handle case where toObject() serializes Buffer as { type: "Buffer", data: [...] }
        if (buffer && typeof buffer === 'object' && buffer.type === 'Buffer' && Array.isArray(buffer.data)) {
          buffer = Buffer.from(buffer.data);
        }

        // Convert to base64 string
        if (Buffer.isBuffer(buffer)) {
          return { ...img, data: buffer.toString('base64') };
        } else if (typeof buffer === 'string') {
          return img; // Already base64
        }
        return img;
      });
    }

    return NextResponse.json({ success: true, data: pickData });
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

    // Handle images update if provided (new images only)
    if (body.images && Array.isArray(body.images) && body.pickType === "IMAGE") {
      body.images = body.images.map((img: any) => {
        const base64Data = img.base64 || img;
        const contentType = img.contentType || "image/jpeg";

        // Only process if base64Data is a string (new images)
        if (typeof base64Data === 'string') {
          // Convert base64 to Buffer
          const imageBuffer = Buffer.from(
            base64Data.replace(/^data:image\/\w+;base64,/, ""),
            "base64"
          );

          return {
            data: imageBuffer,
            contentType,
          };
        }
        // If not a string, assume it's already a Buffer from existing data
        return img;
      });
    }

    // Type-specific validation (only for new creations or when images are provided)
    if (body.pickType === "IMAGE" && body.images && Array.isArray(body.images) && body.images.length === 0) {
      return NextResponse.json(
        { success: false, message: "IMAGE type requires at least one image" },
        { status: 400 }
      );
    }

    if (body.pickType === "SIMPLE" && (!body.matches || body.matches.length === 0)) {
      return NextResponse.json(
        { success: false, message: "SIMPLE type requires at least one match" },
        { status: 400 }
      );
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

    // Convert images to base64 for response
    let responseData: any = updatedPick.toObject ? updatedPick.toObject() : updatedPick;
    if (responseData.images && Array.isArray(responseData.images)) {
      responseData.images = responseData.images.map((img: any) => {
        let buffer = img.data;
        if (buffer && typeof buffer === 'object' && buffer.type === 'Buffer' && Array.isArray(buffer.data)) {
          buffer = Buffer.from(buffer.data);
        }
        if (Buffer.isBuffer(buffer)) {
          return { ...img, data: buffer.toString('base64') };
        }
        return img;
      });
    }

    return NextResponse.json({
      success: true,
      data: responseData,
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
      data: deletedPick,
    });
  } catch (error: any) {
    console.error("DELETE PICK ERROR:", error);

    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}
