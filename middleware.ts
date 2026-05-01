import { NextRequest, NextResponse } from "next/server";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Routes that don't require authentication
  const publicRoutes = [
    "/",
    "/about",
    "/contact",
    "/privacy-policy",
    "/terms",
    "/disclaimer",
    "/billing",
    "/picks",
    "/profile",
    "/login",
    "/signup",
  ];

  const isPublicRoute = publicRoutes.includes(pathname);
  if (isPublicRoute) {
    return NextResponse.next();
  }

  // Get JWT token - just check for presence, not validity
  // Token validation happens in API routes (not affected by edge runtime limitations)
  const token =
    request.cookies.get("token")?.value ||
    request.cookies.get("auth_token")?.value;

  // No token = redirect to home
  if (!token) {
    console.warn(`[middleware] No token for ${pathname}, redirecting to /`);
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Token exists, allow through (actual verification happens in API routes)
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|public).*)",
  ],
};
