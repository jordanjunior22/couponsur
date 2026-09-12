"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

// Admin-side counterpart to PushNotificationPrompt (which is deliberately
// hidden on /dashboard — see its own comment). This one is the mirror
// image: it only ever shows on /dashboard, and only to a logged-in ADMIN,
// prompting them to opt into real OS-tray push notifications for
// operational events (pick bought, new subscription, new chat message —
// see lib/webpush.ts's sendPushToAdmins and its callers). Separate
// localStorage dismissal key from the buyer prompt so an admin who also
// browses the site as a buyer isn't cross-affected either way.
const DISMISSED_KEY = "admin_push_prompt_dismissed";
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

const C = {
  dark2: "#111418", dark3: "#1A1F26", dark4: "#222830",
  border: "#2A3140", muted: "#7A8399", text: "#E8EAF0", gold: "#C9A84C",
};

export default function AdminPushNotificationPrompt() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [hydrated, setHydrated] = useState(false);
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [dismissed, setDismissed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = pathname?.startsWith("/dashboard") && user?.role === "ADMIN";

  useEffect(() => {
    if (!active) return;
    setHydrated(true);
    setSupported(
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window
    );
    if (typeof Notification !== "undefined") setPermission(Notification.permission);
    setDismissed(localStorage.getItem(DISMISSED_KEY) === "true");
  }, [active]);

  // Registration is idempotent — a repeat call to the same /sw.js just
  // resolves with the existing registration, same file the buyer prompt
  // registers, so whichever mounts first wins with no conflict.
  useEffect(() => {
    if (!active || !supported) return;
    navigator.serviceWorker.register("/sw.js").catch((e) => console.error("SW registration failed:", e));
  }, [active, supported]);

  // If notifications are already granted (e.g. enabled on a previous
  // visit), make sure the subscription is still actually on the server —
  // covers the case where it was pruned there (endpoint went stale) or
  // this is a fresh browser profile that never called /api/push/subscribe.
  useEffect(() => {
    if (!active || !supported || permission !== "granted" || !VAPID_PUBLIC_KEY) return;
    (async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        if (existing) {
          setSubscribed(true);
          return;
        }
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
        setSubscribed(true);
      } catch (e) {
        console.error("Admin push re-subscribe check failed:", e);
      }
    })();
  }, [active, supported, permission]);

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
      setSubscribed(true);
    } catch (e) {
      console.error("Admin push subscribe failed:", e);
      setError("Échec de l'activation des notifications. Réessaie plus tard.");
    } finally {
      setSubscribing(false);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "true");
    setDismissed(true);
  };

  if (!active || !hydrated || !supported || dismissed || subscribed || permission !== "default") return null;

  return (
    <div style={{
      background: C.dark3, borderBottom: `1px solid ${C.border}`,
      padding: "10px 16px", display: "flex", alignItems: "center",
      justifyContent: "center", gap: 12, flexWrap: "wrap", fontFamily: "'DM Sans', sans-serif",
    }}>
      <span style={{ fontSize: 13, color: C.text, display: "flex", alignItems: "center", gap: 8 }}>
        🔔 Active les notifications pour être alerté en temps réel des achats, abonnements et messages — même app fermée.
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
