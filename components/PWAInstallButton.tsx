"use client";

import { useEffect, useState } from "react";

export default function PWAInstallButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Detect if already installed
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstalled(true);
    }

    // Listen for install prompt
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener("beforeinstallprompt", handler);

    // Detect successful install
    window.addEventListener("appinstalled", () => {
      setInstalled(true);
    });

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
    }

    setDeferredPrompt(null);
  };

  // 🚫 Don't show if:
  // - already installed
  // - no prompt available
  if (installed || !deferredPrompt) return null;

  return (
    <button
      onClick={handleInstall}
      style={{
        position: "fixed",
        bottom: 20,
        left: 20,
        right: 20,
        background: "#C9A84C",
        color: "#0A0C0F",
        border: "none",
        borderRadius: 12,
        padding: "14px",
        fontWeight: 700,
        letterSpacing: "1px",
        zIndex: 100,
      }}
    >
      📲 Installer l'application
    </button>
  );
}