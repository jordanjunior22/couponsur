"use client";

import { useEffect, useState } from "react";
import { PiBellFill, PiBellSlashFill } from "react-icons/pi";
import { urlBase64ToUint8Array, rememberSubscribedKey } from "@/utils/pushSubscription";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

// Manual on/off control for push notifications, for the profil page.
// PushNotificationPrompt/AdminPushNotificationPrompt only ever show once
// (permission === "default") — dismiss it ("Plus tard") or just never
// notice it, and there was no way back in short of clearing browser site
// data. This is that way back in: it reflects the device's actual
// subscription state (not just Notification.permission, since a
// subscription can be silently pruned server-side — see lib/webpush.ts's
// isPermanentlyDead — while permission stays "granted") and drives the
// same POST/DELETE /api/push/subscribe plumbing the banners use.
export default function PushNotificationToggle() {
  const [hydrated, setHydrated] = useState(false);
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ok =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setSupported(ok);
    setHydrated(true);
    if (!ok) return;
    setPermission(Notification.permission);
    (async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        setSubscribed(!!existing);
      } catch (e) {
        console.error("Push toggle status check failed:", e);
      }
    })();
  }, []);

  const handleToggleOn = async () => {
    if (!VAPID_PUBLIC_KEY) {
      setError("Notifications non configurées côté serveur.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") {
        setBusy(false);
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
      setSubscribed(true);
    } catch (e) {
      console.error("Push toggle enable failed:", e);
      setError("Échec de l'activation des notifications. Réessaie plus tard.");
    } finally {
      setBusy(false);
    }
  };

  const handleToggleOff = async () => {
    setBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        // Delete server-side first — unsubscribe() invalidates the
        // endpoint, so if the DELETE failed after that we'd leave a dead
        // row behind for lib/webpush.ts to discover (and log) later.
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: existing.endpoint }),
        });
        await existing.unsubscribe();
      }
      setSubscribed(false);
    } catch (e) {
      console.error("Push toggle disable failed:", e);
      setError("Échec de la désactivation. Réessaie plus tard.");
    } finally {
      setBusy(false);
    }
  };

  if (!hydrated || !supported) return null;

  // Browser-level block. requestPermission() would just silently resolve
  // "denied" again — only the browser's own site settings can undo this,
  // so there's nothing for a toggle to do here except explain that.
  if (permission === "denied") {
    return (
      <div style={cardStyle}>
        <div style={rowStyle}>
          <span style={iconWrapStyle}><PiBellSlashFill size={16} /></span>
          <div>
            <div style={titleTextStyle}>Notifications</div>
            <div style={helpTextStyle}>Bloquées par le navigateur — active-les dans les paramètres du site pour les recevoir.</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      <div style={rowStyle}>
        <span style={iconWrapStyle}><PiBellFill size={16} /></span>
        <div style={{ flex: 1 }}>
          <div style={titleTextStyle}>Notifications push</div>
          <div style={helpTextStyle}>Sois alerté des nouveaux pronostics, même app fermée.</div>
        </div>
        <button
          role="switch"
          aria-checked={subscribed}
          aria-label="Activer les notifications push"
          disabled={busy}
          onClick={() => (subscribed ? handleToggleOff() : handleToggleOn())}
          style={{
            ...switchTrackStyle,
            background: subscribed ? "#C9A84C" : "#2A3140",
            cursor: busy ? "not-allowed" : "pointer",
            opacity: busy ? 0.6 : 1,
          }}
        >
          <span style={{ ...switchThumbStyle, transform: subscribed ? "translateX(18px)" : "translateX(2px)" }} />
        </button>
      </div>
      {error && <div style={errorTextStyle}>{error}</div>}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "#111827",
  border: "1px solid #1F2937",
  borderRadius: 16,
  padding: "18px 20px",
  marginTop: 16,
};

const rowStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 12 };

const iconWrapStyle: React.CSSProperties = { display: "flex", flexShrink: 0, color: "#C9A84C" };

const titleTextStyle: React.CSSProperties = { fontSize: 13.5, fontWeight: 600, color: "#E5E7EB" };

const helpTextStyle: React.CSSProperties = { fontSize: 11.5, color: "#6B7280", marginTop: 2, lineHeight: 1.4 };

const errorTextStyle: React.CSSProperties = { fontSize: 11, color: "#EF4444", marginTop: 10 };

const switchTrackStyle: React.CSSProperties = {
  position: "relative", width: 40, height: 22, borderRadius: 11, border: "none",
  flexShrink: 0, padding: 0, transition: "background 0.15s ease",
};

const switchThumbStyle: React.CSSProperties = {
  position: "absolute", top: 2, left: 0, width: 18, height: 18, borderRadius: "50%",
  background: "#0A0C0F", transition: "transform 0.15s ease",
};
