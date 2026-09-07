"use client";

import { useEffect, useState } from "react";

// The event Chrome/Edge fire instead of showing their own install UI, once
// they decide the page qualifies as installable — not in any TS lib yet,
// so it's typed here rather than reached for `any`.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => void;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Shared between the floating PWAInstallButton banner and the Profil tab's
// install card so the `beforeinstallprompt` capture (and its one-shot
// native prompt) lives in exactly one place instead of two components each
// keeping their own copy of this state.
export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstalled(true);
    }

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Triggers the browser's own native install prompt. Resolves "accepted"/
  // "dismissed" (mirroring the browser's own outcome), or "unavailable" if
  // there's no captured prompt to fire (already installed, or the browser
  // never offered one — Safari/iOS never does, see the isIOS export below).
  const promptInstall = async (): Promise<"accepted" | "dismissed" | "unavailable"> => {
    if (!deferredPrompt) return "unavailable";
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (outcome === "accepted") setInstalled(true);
    return outcome;
  };

  return {
    installed,
    // Whether promptInstall() will actually do anything right now.
    canInstall: !installed && !!deferredPrompt,
    promptInstall,
  };
}

// Safari on iOS never fires beforeinstallprompt — "Add to Home Screen" is
// only reachable through its own Share sheet, so that's the one platform
// worth telling people how to do it manually instead of just hiding the
// install option entirely.
export function isIOS(): boolean {
  if (typeof window === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window);
}
