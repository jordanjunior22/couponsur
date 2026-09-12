/**
 * lib/webpush.ts
 * Server-side Web Push sender — delivers a browser notification to every
 * subscribed visitor (see models/PushSubscription.ts) via the standard
 * Push API, no third-party push service required.
 * Docs: https://github.com/web-push-libs/web-push
 */
import webpush from "web-push";
import PushSubscriptionModel, { IPushSubscription } from "@/models/PushSubscription";
import UserModel, { UserRole } from "@/models/Users";
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

// Shared delivery loop used by every "send to this set of subscriptions"
// helper below — fans out with allSettled (one dead/slow endpoint can't
// block the rest) and sweeps subscriptions the push service reports as
// gone (404/410 = the browser unsubscribed or the subscription expired).
async function deliverPush(
  subscriptions: IPushSubscription[],
  payload: PushPayload
): Promise<PushSendResult> {
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
  return deliverPush(subscriptions, payload);
}

// Broadcasts only to subscriptions belonging to ADMIN accounts — the
// admin-side counterpart of sendPushToAll, for operational alerts (a pick
// was bought, a subscription activated, a customer sent a chat message)
// that only the admin(s) running the site need to see, not every buyer.
// An admin subscribes the same way a buyer does (see
// components/AdminPushNotificationPrompt.tsx →
// POST /api/push/subscribe), which tags the subscription with their
// userId — that's what lets this filter to admins only.
export async function sendPushToAdmins(payload: PushPayload): Promise<PushSendResult> {
  if (!ensureConfigured()) {
    console.warn("sendPushToAdmins: VAPID keys not configured — skipping push");
    return { attempted: 0, sent: 0, removed: 0 };
  }

  await connectDB();
  const admins = await UserModel.find({ role: UserRole.ADMIN }).select("_id");
  if (admins.length === 0) return { attempted: 0, sent: 0, removed: 0 };

  const subscriptions = await PushSubscriptionModel.find({
    user: { $in: admins.map((a) => a._id) },
  });
  return deliverPush(subscriptions, payload);
}
