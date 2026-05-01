// utils/session.ts
import { NextRequest } from "next/server";
import jwt from "jsonwebtoken";
import { connectDB } from "@/utils/ConnectDb";
import UserModel, { IUser } from "@/models/Users";

const JWT_SECRET = process.env.JWT_SECRET!;

interface JWTPayload {
  userId: string;
  phone: string;
  iat?: number;
  exp?: number;
}

export interface SessionUser {
  _id: string;
  phone: string;
  role: "USER" | "ADMIN";
  unlockedPickIds: string[];
  hasActiveSubscription: boolean;
  subscriptionEndDate?: Date;
}

/**
 * Extracts and verifies the JWT from the request cookie,
 * then fetches the full user from the DB.
 *
 * Returns null if:
 * - No token cookie present
 * - Token is invalid or expired
 * - User no longer exists in DB
 */
export async function getSessionUser(
  req: NextRequest
): Promise<SessionUser | null> {
  try {
    // ── 1. Extract token from cookie ──────────────────
    const token =
      req.cookies.get("token")?.value ??
      req.cookies.get("auth_token")?.value ?? // fallback name
      null;

    if (!token) return null;

    // ── 2. Verify & decode JWT ────────────────────────
    let payload: JWTPayload;
    try {
      payload = jwt.verify(token, JWT_SECRET) as JWTPayload;
    } catch (err) {
      // expired, tampered, wrong secret — all treated as unauthenticated
      return null;
    }

    if (!payload?.userId) return null;

    // ── 3. Fetch fresh user from DB ───────────────────
    // (don't trust stale JWT data for role/unlockedPickIds)
    await connectDB();

    const user = await UserModel.findById(payload.userId)
      .select("_id phone role unlockedPickIds subscription")
      .lean<IUser>();

    if (!user) return null;

    // Check if user has active subscription
    const hasActiveSubscription =
      user.subscription &&
      user.subscription.status === "active" &&
      new Date() < user.subscription.endDate;

    return {
      _id: user._id.toString(),
      phone: user.phone,
      role: user.role,
      unlockedPickIds: user.unlockedPickIds.map((id) => id.toString()),
      hasActiveSubscription: hasActiveSubscription || false,
      subscriptionEndDate: user.subscription?.endDate,
    };
  } catch {
    return null;
  }
}

/**
 * Same as getSessionUser but throws a 401-ready error
 * instead of returning null. Useful for protected routes
 * that want to early-return in one line.
 *
 * Usage:
 *   const user = await requireSessionUser(req);  // throws if not authed
 */
export async function requireSessionUser(
  req: NextRequest
): Promise<SessionUser> {
  const user = await getSessionUser(req);
  if (!user) {
    throw new UnauthenticatedError();
  }
  return user;
}

export class UnauthenticatedError extends Error {
  status = 401;
  constructor() {
    super("Authentication required");
    this.name = "UnauthenticatedError";
  }
}