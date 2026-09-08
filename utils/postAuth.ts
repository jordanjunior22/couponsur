// Auth helpers for the "Actus" news feed's buyer-facing routes (like, vote,
// comment, share). Posting/moderation is admin-only (each admin route
// keeps its own small requireAdmin(), same duplication pattern the rest of
// app/api/admin/* already uses) — this file is only for "is anyone logged
// in", shared across four routes that all need exactly that same check.
import { cookies } from "next/headers";
import { verifyToken } from "@/utils/auth";
import UserModel from "@/models/Users";

export interface PostAuthUser {
  userId: string;
  phone: string;
  role: "USER" | "ADMIN";
}

export type PostAuthResult = { user: PostAuthUser } | { error: string; status: number };

// Login-only gate — no subscription tier involved here, unlike group
// chat's premium room.
export async function requireLoggedInUser(): Promise<PostAuthResult> {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return { error: "Unauthorized", status: 401 };

  const decoded = verifyToken(token);
  if (!decoded) return { error: "Invalid token", status: 401 };

  const dbUser = await UserModel.findById(decoded.userId).select("phone role");
  if (!dbUser) return { error: "Invalid token", status: 401 };

  return { user: { userId: dbUser._id.toString(), phone: dbUser.phone, role: dbUser.role } };
}

// Best-effort — used by the public feed GET to know "am I logged in" for
// likedByMe/myVote without requiring it. Never throws.
export async function optionalUserId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return null;
    const decoded = verifyToken(token);
    return decoded?.userId ?? null;
  } catch {
    return null;
  }
}
