"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { urlBase64ToUint8Array, ensurePushSubscriptionFresh, rememberSubscribedKey } from "@/utils/pushSubscription";

const DISMISSED_KEY = "push_prompt_dismissed";
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

const C = {
  dark2: "#111418", dark3: "#1A1F26", dark4: "#222830",
  border: "#2A3140", muted: "#7A8399", text: "#E8EAF0", gold: "#C9A84C",
};

export default function PushNotificationPrompt() {
  const pathname = usePathname();
  const [hydrated, setHydrated] = useState(false);
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [dismissed, setDismissed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hidden on the admin dashboard, same reasoning as ChatWidget — this
  // prompt is for buyers waiting on new picks, not the admin publishing them.
  const hidden = pathname?.startsWith("/dashboard");

  useEffect(() => {
    setHydrated(true);
    setSupported(
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window
    );
    if (typeof Notification !== "undefined") setPermission(Notification.permission);
    setDismissed(localStorage.getItem(DISMISSED_KEY) === "true");
  }, []);

  // Register the service worker up front (idempotent — a repeat call
  // just resolves with the existing registration) so it's ready the
  // moment the visitor opts in, without waiting on that first click.
  useEffect(() => {
    if (!supported || hidden) return;
    navigator.serviceWorker.register("/sw.js").catch((e) => console.error("SW registration failed:", e));
  }, [supported, hidden]);

  // Self-healing: if this device already granted permission and has a
  // subscription from a previous visit, make sure it's still under the
  // CURRENT VAPID public key. A key rotation (see the comment above
  // NEXT_PUBLIC_VAPID_PUBLIC_KEY in .env) otherwise leaves an already-opted-in
  // visitor silently un-notified forever — this banner never reappears
  // once permission is granted, so nothing would ever prompt them to fix it
  // themselves. Runs regardless of `dismissed`/`hidden`-for-the-banner state:
  // healing an existing subscription isn't the same as showing the prompt.
  useEffect(() => {
    if (!supported || permission !== "granted" || !VAPID_PUBLIC_KEY) return;
    ensurePushSubscriptionFresh(VAPID_PUBLIC_KEY).catch((e) => console.error("Push resync failed:", e));
  }, [supported, permission]);

  const handleEnable = async () => {
    if (!VAPID_PUBLIC_KEY) {
      setError("Notifications non configurées côté serveur.");
      return;
    }
    setSubscribing(true);
    setError(null);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") {
        setSubscribing(false);
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      await fetch("/api/push/subscribe", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      rememberSubscribedKey(VAPID_PUBLIC_KEY);
    } catch (e) {
      console.error("Push subscribe failed:", e);
      setError("Échec de l'activation des notifications. Réessaie plus tard.");
    } finally {
      setSubscribing(false);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "true");
    setDismissed(true);
  };

  // Nothing to show once granted (already subscribed), denied (nothing
  // we can do — the browser blocks re-prompting), dismissed, or on
  // unsupported browsers.
  if (hidden || !hydrated || !supported || dismissed || permission !== "default") return null;

  return (
    <div style={{
      background: C.dark3, borderBottom: `1px solid ${C.border}`,
      padding: "10px 16px", display: "flex", alignItems: "center",
      justifyContent: "center", gap: 12, flexWrap: "wrap", fontFamily: "'DM Sans', sans-serif",
    }}>
      <span style={{ fontSize: 13, color: C.text, display: "flex", alignItems: "center", gap: 8 }}>
        🔔 Active les notifications pour être alerté dès qu&apos;un nouveau pronostic est publié.
      </span>
      {error && <span style={{ fontSize: 11, color: "#EF4444" }}>{error}</span>}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={handleEnable}
          disabled={subscribing}
          style={{
            background: C.gold, color: "#0A0C0F", border: "none", borderRadius: 8,
            padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: subscribing ? "not-allowed" : "pointer",
            fontFamily: "inherit", opacity: subscribing ? 0.7 : 1, whiteSpace: "nowrap",
          }}
        >
          {subscribing ? "…" : "Activer"}
        </button>
        <button
          onClick={handleDismiss}
          aria-label="Fermer"
          style={{
            background: C.dark4, border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8,
            padding: "6px 12px", fontSize: 12, cursor: "pointer", fontFamily: "inherit",
          }}
        >
          Plus tard
        </button>
      </div>
    </div>
  );
}
