/**
 * lib/pixelClient.ts
 * Thin wrapper around window.fbq so every call site uses the same shape,
 * and always passes an eventID for Conversions API deduplication.
 */

export function trackEvent(
  eventName: "Lead" | "CompleteRegistration" | "ViewContent" | "InitiateCheckout" | "Purchase",
  eventId: string,
  params?: Record<string, unknown>
) {
  if (typeof window === "undefined") return;
  const fbq = (window as any).fbq;
  if (!fbq) return;
  fbq("track", eventName, params ?? {}, { eventID: eventId });
}

/** Generates a stable id for dedup — pass the same value to the matching server-side call. */
export function generateEventId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function getFbCookies(): { fbc: string | null; fbp: string | null } {
  if (typeof document === "undefined") return { fbc: null, fbp: null };
  const get = (name: string): string | null => {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : null;
  };
  return { fbc: get("_fbc"), fbp: get("_fbp") };
}