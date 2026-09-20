// Minimal service worker whose only job is Web Push delivery — no
// offline caching/fetch interception, so it can't interfere with the
// app's own data fetching. Registered from components/PushNotificationPrompt.tsx.

// Sets the OS app-icon badge to the number of notifications still sitting
// in the tray (the source of truth, so it never drifts from what the user
// actually has unseen) — 0/none clears it instead of showing "0". Silently
// no-ops where the Badging API isn't available (e.g. Firefox, or a browser
// tab that isn't installed as a PWA).
async function syncBadge() {
  if (!("setAppBadge" in self.navigator)) return;
  try {
    const notifications = await self.registration.getNotifications();
    if (notifications.length > 0) {
      await self.navigator.setAppBadge(notifications.length);
    } else {
      await self.navigator.clearAppBadge();
    }
  } catch {
    // Badging API present but not permitted in this context — ignore.
  }
}

self.addEventListener("push", (event) => {
  let data = { title: "Coupon Sur", body: "Nouveau pronostic disponible.", url: "/" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // Non-JSON payload (shouldn't happen — the server always sends JSON) — fall back to defaults.
  }

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(data.title, {
        body: data.body,
        icon: data.icon || "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        data: { url: data.url || "/" },
      });
      await syncBadge();
    })()
  );
});

// Focuses an already-open tab on the target URL instead of always
// opening a new one, then falls back to opening a new tab.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    (async () => {
      await syncBadge();
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of allClients) {
        if (client.url === targetUrl && "focus" in client) {
          await client.focus();
          return;
        }
      }
      await self.clients.openWindow(targetUrl);
    })()
  );
});

// Lets an open tab ask the SW to clear the badge/tray once the user has
// actually seen the app (see components/AppBadgeSync.tsx) — covers opening
// the app from its home-screen icon directly, not just tapping a notification.
self.addEventListener("message", (event) => {
  if (event.data?.type !== "CLEAR_BADGE") return;
  event.waitUntil(
    (async () => {
      const notifications = await self.registration.getNotifications();
      notifications.forEach((n) => n.close());
      if ("clearAppBadge" in self.navigator) {
        try {
          await self.navigator.clearAppBadge();
        } catch {
          // Ignore — same reasoning as syncBadge().
        }
      }
    })()
  );
});
