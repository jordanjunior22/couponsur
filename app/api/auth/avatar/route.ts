import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import User from "@/models/Users";
import { cookies } from "next/headers";
import { verifyToken } from "@/utils/auth";
import { parseImageDataUri } from "@/utils/groupChatImage";

// The client downscales to ~256px before upload (see utils/imageCompression);
// this re-validates shape and size, since the server never trusts the client.
const MAX_AVATAR_BYTES = 100_000;

// ─── POST: set or remove the signed-in user's own profile picture ──────────
// Body: { avatar: "data:image/jpeg;base64,..." } to set, { avatar: null } to
// remove. Always acts on the token's own user — there is no user id param, so
// nobody can change someone else's picture.
export async function POST(req: NextRequest) {
  try {
    await connectDB();

    const token = (await cookies()).get("token")?.value;
    if (!token) {
      return NextResponse.json({ success: false, message: "Non authentifié" }, { status: 401 });
    }
    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ success: false, message: "Session invalide" }, { status: 401 });
    }

    const { avatar } = await req.json().catch(() => ({}));

    if (avatar !== null) {
      const parsed = typeof avatar === "string" ? parseImageDataUri(avatar) : null;
      if (!parsed) {
        return NextResponse.json({ success: false, message: "Image invalide" }, { status: 400 });
      }
      if (parsed.bytes > MAX_AVATAR_BYTES) {
        return NextResponse.json({ success: false, message: "Image trop volumineuse" }, { status: 400 });
      }
    }

    const updated = await User.findByIdAndUpdate(
      decoded.userId,
      { $set: { avatar: avatar } },
      { new: true }
    ).select("-password +avatar");

    if (!updated) {
      return NextResponse.json({ success: false, message: "Utilisateur introuvable" }, { status: 404 });
    }

    return NextResponse.json({ success: true, user: updated });
  } catch (error) {
    console.error("UPDATE AVATAR ERROR:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}
