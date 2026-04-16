import { NextResponse } from "next/server";

export async function POST() {
  const res = NextResponse.json({ success: true });

  res.cookies.set("token", "", {
    httpOnly: true,
    expires: new Date(0), // 🔥 THIS clears it
    path: "/", // IMPORTANT
  });

  return res;
}