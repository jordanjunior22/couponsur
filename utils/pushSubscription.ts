// Shared by components/PushNotificationPrompt.tsx and
// AdminPushNotificationPrompt.tsx — the "keep an already-granted device's
// subscription valid" half of the push flow (the "ask for permission and
// subscribe for the first time" half stays in each component, since their
// prompt UI differs).

// Push subscription keys arrive base64url-encoded; the Push API wants
// them as a raw Uint8Array.
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

// Which VAPID public key a device's current subscription was created
// under — not something the Push API reliably lets us read back off an
// existing PushSubscription across browsers, so we just remember it
// ourselves alongside it.
const LAST_KEY_USED = "push_vapid_key_used";

export function rememberSubscribedKey(vapidPublicKey: string) {
  try { localStorage.setItem(LAST_KEY_USED, vapidPublicKey); } catch { /* localStorage unavailable — next load just re-checks and resubscribes harmlessly */ }
}

// Call once permission is already "granted" (both prompts already gate on
// that before calling this). Three cases:
//  - no existing subscription: returns false — nothing to heal, first-time
//    subscribe is the "Activer" button's job, this never auto-opts anyone in.
//  - existing subscription, key unchanged since we last subscribed:
//    returns true, no network calls.
//  - existing subscription, key changed (a VAPID rotation — see the
//    comment above NEXT_PUBLIC_VAPID_PUBLIC_KEY in .env for exactly the
//    incident this guards against) or we never recorded a key at all
//    (this device predates this self-healing logic): drop the stale
//    subscription and create a fresh one under the current key, no new
//    permission prompt needed since the OS/browser permission is already
//    granted — only re-POSTs to /api/push/subscribe in this branch, so
//    the healthy case above stays a no-op.
export async function ensurePushSubscriptionFresh(vapidPublicKey: string): Promise<boolean> {
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (!existing) return false;

  let lastKey: string | null = null;
  try { lastKey = localStorage.getItem(LAST_KEY_USED); } catch { /* treat as unknown — falls through to resubscribe */ }
  if (lastKey === vapidPublicKey) return true;

  await existing.unsubscribe();
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });

  await fetch("/api/push/subscribe", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
  rememberSubscribedKey(vapidPublicKey);
  return true;
}
