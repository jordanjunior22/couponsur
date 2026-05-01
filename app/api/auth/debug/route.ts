import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/utils/auth";

// DEBUG ENDPOINT - Remove in production!
export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;

    if (!token) {
      return NextResponse.json({
        error: "No token found",
        cookies: cookieStore.getAll().map((c) => c.name),
      });
    }

    const decoded = verifyToken(token);

    return NextResponse.json({
      token_present: !!token,
      token_decoded: decoded,
      token_content: {
        userId: decoded?.userId,
        role: decoded?.role,
      },
    });
  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
    });
  }
}
