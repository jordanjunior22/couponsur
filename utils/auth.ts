import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";
import { cookies } from "next/headers";

const JWT_SECRET = process.env.JWT_SECRET!;

export function verifyToken(token: string) {
  try {
    return jwt.verify(token, JWT_SECRET) as {
      userId: string;
      role: string;
    };
  } catch (error) {
    return null;
  }
}

export async function getTokenFromRequest(req: NextRequest): Promise<string | null> {
  // Try to get token from cookie first (web), then from Authorization header (mobile)
  let token: string | undefined;

  const cookieStore = await cookies();
  token = cookieStore.get("token")?.value;

  // If no cookie token, try Authorization header (for mobile app)
  if (!token) {
    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    }
  }

  return token || null;
}