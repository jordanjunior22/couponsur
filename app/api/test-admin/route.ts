import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/utils/session";

export async function GET(req: NextRequest) {
  const sessionUser = await getSessionUser(req);

  return NextResponse.json({
    token_present: !!req.cookies.get("token")?.value,
    session_user: sessionUser,
    is_admin: sessionUser?.role === "ADMIN",
  });
}
