"use client";

import { useEffect, useState } from "react";

export default function PWAInstallButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const isMobile =
    typeof window !== "undefined" &&
    /iPhone|Android|iPad/i.test(navigator.userAgent);

  useEffect(() => {
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstalled(true);
    }

    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener("beforeinstallprompt", handler);

    window.addEventListener("appinstalled", () => {
      setInstalled(true);
    });

    const savedDismiss = localStorage.getItem("pwa_dismissed");
    if (savedDismiss) setDismissed(true);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;

    if (choice.outcome === "accepted") {
      setInstalled(true);
    } else {
      localStorage.setItem("pwa_dismissed", "true");
      setDismissed(true);
    }

    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    localStorage.setItem("pwa_dismissed", "true");
    setDismissed(true);
  };

  if (installed || !deferredPrompt || dismissed) return null;

  // ───────────────────────── MOBILE UI ─────────────────────────
  if (isMobile) {
    return (
      <button
        onClick={handleInstall}
        style={{
          position: "fixed",
          bottom: 16,
          left: 16,
          right: 16,
          background: "#C9A84C",
          color: "#0A0C0F",
          border: "none",
          borderRadius: 14,
          padding: "14px",
          fontWeight: 700,
          letterSpacing: "1px",
          zIndex: 1000,
          boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
        }}
      >
        📲 Installer l'app
      </button>
    );
  }

  // ───────────────────────── DESKTOP UI ─────────────────────────
  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        left: 24,
        width: 320,
        background: "#111418",
        border: "1px solid #2A3140",
        borderRadius: 14,
        padding: 14,
        zIndex: 1000,
        boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
        animation: "fadeIn 0.25s ease",
      }}
    >
      <div style={{ marginBottom: 8 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "#C9A84C",
            letterSpacing: "1px",
            marginBottom: 4,
          }}
        >
          INSTALLER L'APPLICATION
        </div>
        <div style={{ fontSize: 11, color: "#7A8399", lineHeight: 1.4 }}>
          Accédez plus vite aux pronostics et recevez des mises à jour en temps réel.
        </div>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={handleInstall}
          style={{
            flex: 1,
            background: "#C9A84C",
            color: "#0A0C0F",
            border: "none",
            borderRadius: 10,
            padding: "10px",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Installer
        </button>

        <button
          onClick={handleDismiss}
          style={{
            background: "transparent",
            border: "1px solid #2A3140",
            color: "#7A8399",
            borderRadius: 10,
            padding: "10px 12px",
            cursor: "pointer",
          }}
        >
          Plus tard
        </button>
      </div>
    </div>
  );
}