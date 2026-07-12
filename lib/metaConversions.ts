/**
 * lib/metaConversions.ts
 * Server-side Meta Conversions API — mirrors client-side fbq() calls with
 * matching event_id for deduplication. More reliable than client-only
 * tracking since it isn't blocked by ad blockers or lost on tab close.
 * Docs: https://developers.facebook.com/docs/marketing-api/conversions-api
 */

const PIXEL_ID = process.env.NEXT_PUBLIC_FB_PIXEL_ID;
const ACCESS_TOKEN = process.env.META_CONVERSIONS_API_TOKEN;
const API_VERSION = "v21.0";

interface ConversionEventParams {
  eventName: "Lead" | "CompleteRegistration" | "ViewContent" | "InitiateCheckout" | "Purchase";
  eventId: string; // MUST match the client-side fbq() eventID for dedup
  value?: number;
  currency?: string;
  contentName?: string;
  contentType?: string;
  userPhone?: string; // will be hashed before sending
  country?: string; //
  clientIp?: string;
  userAgent?: string;
  fbc?: string; // _fbc cookie, if available
  fbp?: string; // _fbp cookie, if available
  sourceUrl?: string;
}

async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input.trim().toLowerCase());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function sendServerEvent(params: ConversionEventParams): Promise<void> {
  if (!PIXEL_ID || !ACCESS_TOKEN) {
    console.warn("Meta Conversions API: missing PIXEL_ID or ACCESS_TOKEN — skipping server event");
    return;
  }

  try {
    const userData: Record<string, unknown> = {};

   if (params.userPhone) {
      const digits = params.userPhone.replace(/\D/g, "");
      const normalized = digits.startsWith("237") ? digits : `237${digits}`;
      userData.ph = [await sha256(normalized)];
    }
    if (params.country) {
      userData.country = [await sha256(params.country.toLowerCase())];
    }
    if (params.clientIp) userData.client_ip_address = params.clientIp;
    if (params.userAgent) userData.client_user_agent = params.userAgent;
    if (params.fbc) userData.fbc = params.fbc;
    if (params.fbp) userData.fbp = params.fbp;

    const customData: Record<string, unknown> = {};
    if (params.value != null) customData.value = params.value;
    if (params.currency) customData.currency = params.currency;
    if (params.contentName) customData.content_name = params.contentName;
    if (params.contentType) customData.content_type = params.contentType;

    const payload = {
      data: [
        {
          event_name: params.eventName,
          event_time: Math.floor(Date.now() / 1000),
          event_id: params.eventId, // dedup key — must match client fbq eventID
          event_source_url: params.sourceUrl,
          action_source: "website",
          user_data: userData,
          custom_data: customData,
        },
      ],
    };

    const res = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${PIXEL_ID}/events?access_token=${ACCESS_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error(`Meta Conversions API error (${res.status}):`, errBody);
    }
  } catch (e) {
    console.error("Meta Conversions API request failed:", e);
  }
}