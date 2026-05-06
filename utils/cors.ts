import { NextResponse } from "next/server";

const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:8081",
  "http://192.168.1.100:8081",
  "http://192.168.1.101:8081",
  "http://192.168.1.102:8081",
  "http://192.168.1.103:8081",
  "http://192.168.1.104:8081",
  "http://192.168.1.105:8081",
];

export function addCorsHeaders(response: NextResponse, origin?: string) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  response.headers.set("Access-Control-Allow-Origin", allowedOrigin);
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  response.headers.set("Access-Control-Allow-Credentials", "true");

  return response;
}

export async function handleCorsPreFlight(request: Request) {
  const origin = request.headers.get("origin");

  if (request.method === "OPTIONS") {
    const response = new NextResponse(null, { status: 200 });
    return addCorsHeaders(response, origin || undefined);
  }

  return null;
}
