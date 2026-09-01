/**
 * lib/webpush.ts
 * Server-side Web Push sender — delivers a browser notification to every
 * subscribed visitor (see models/PushSubscription.ts) via the standard
 * Push API, no third-party push service required.
 * Docs: https://github.com/web-push-libs/web-push
 */
import webpush from "web-push";
import PushSubscriptionModel from "@/models/PushSubscription";
import { connectDB } from "@/utils/ConnectDb";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
// web-push requires the subject to be a "mailto:" address or an
// "https://" URL identifying who's sending — reuses the site URL so
// there's nothing extra to configure in the common case.
const SUBJECT = process.env.VAPID_SUBJECT || process.env.NEXT_PUBLIC_APP_URL || "https://example.com";

let configured = false;
function ensureConfigured() {
  if (configured) return true;
  if (!PUBLIC_KEY || !PRIVATE_KEY) return false;
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
  configured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  /** Relative or absolute URL opened when the notification is clicked. */
  url?: string;
  /** Icon shown in the notification — defaults to the PWA icon in public/sw.js. */
  icon?: string;
}

export interface PushSendResult {
  attempted: number;
  sent: number;
  removed: number;
}

// Broadcasts to every stored subscription. Not configured (no VAPID
// keys set) is treated as a no-op rather than an error — callers (e.g.
// the pick-publish hook) shouldn't fail the actual request just because
// push notifications haven't been set up yet.
export async function sendPushToAll(payload: PushPayload): Promise<PushSendResult> {
  if (!ensureConfigured()) {
    console.warn("sendPushToAll: VAPID keys not configured — skipping push");
    return { attempted: 0, sent: 0, removed: 0 };
  }

  await connectDB();
  const subscriptions = await PushSubscriptionModel.find();
  const body = JSON.stringify(payload);

  let sent = 0;
  const toRemove: string[] = [];

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          body
        );
        sent++;
      } catch (error) {
        // 404/410 = the browser unsubscribed or the subscription expired —
        // clean it up so we stop paying for a dead endpoint on every push.
        // Anything else (network blip, etc.) is left alone to retry next time.
        const statusCode = (error as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          toRemove.push(sub.endpoint);
        } else {
          console.error("Push send failed:", statusCode, (error as { body?: string })?.body || error);
        }
      }
    })
  );

  if (toRemove.length > 0) {
    await PushSubscriptionModel.deleteMany({ endpoint: { $in: toRemove } });
  }

  return { attempted: subscriptions.length, sent, removed: toRemove.length };
}
