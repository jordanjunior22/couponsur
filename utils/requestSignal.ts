// utils/requestSignal.ts
import { NextRequest } from "next/server";

export interface CapturedSignal {
  clientIp: string | null;
  userAgent: string | null;
  fbc: string | null;
  fbp: string | null;
  sourceUrl: string | null;
}

export function captureRequestSignal(req: NextRequest, body: { fbc?: string; fbp?: string; sourceUrl?: string }): CapturedSignal {
  // Vercel/most proxies set x-forwarded-for; take the first IP if there's a chain
  const forwardedFor = req.headers.get("x-forwarded-for");
  const clientIp = forwardedFor ? forwardedFor.split(",")[0].trim() : null;

  return {
    clientIp,
    userAgent: req.headers.get("user-agent"),
    fbc: body.fbc ?? null,
    fbp: body.fbp ?? null,
    sourceUrl: body.sourceUrl ?? null,
  };
}