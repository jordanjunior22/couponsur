// Minimal service worker whose only job is Web Push delivery — no
// offline caching/fetch interception, so it can't interfere with the
// app's own data fetching. Registered from components/PushNotificationPrompt.tsx.

self.addEventListener("push", (event) => {
  let data = { title: "Coupon Sur", body: "Nouveau pronostic disponible.", url: "/" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // Non-JSON payload (shouldn't happen — the server always sends JSON) — fall back to defaults.
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url || "/" },
    })
  );
});

// Focuses an already-open tab on the target URL instead of always
// opening a new one, then falls back to opening a new tab.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    (async () => {
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
