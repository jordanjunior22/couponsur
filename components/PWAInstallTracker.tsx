"use client";

import { useEffect } from "react";
import { usePWAInstall, isIOS } from "@/hooks/usePWAInstall";

const DEVICE_ID_KEY = "pwa_device_id";
const LAST_REPORTED_KEY = "pwa_install_reported_at";
// Once a day is plenty — this only feeds an admin count (see
// app/api/admin/pwa-installs/route.ts), nothing time-sensitive depends on
// a fresher lastSeenAt.
const REPORT_INTERVAL_MS = 24 * 60 * 60 * 1000;

function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

function detectPlatform(): "ios" | "android" | "desktop" {
  if (isIOS()) return "ios";
  if (/Android/i.test(navigator.userAgent)) return "android";
  return "desktop";
}

// Mounted site-wide (see app/layout.tsx), same pattern as ActivityPing.
// Reports to the server whenever this device is running the PWA in
// standalone mode — the client is the only one who can ever see that (see
// usePWAInstall's `display-mode: standalone` check and its `appinstalled`
// listener) — which is what makes the admin dashboard's install count
// (Users tab) possible at all. One row per device (a random id persisted
// in localStorage), not per account, so a logged-out visitor's install
// still counts and reinstalling doesn't create a duplicate as long as
// localStorage survives.
export default function PWAInstallTracker() {
  const { installed } = usePWAInstall();

  useEffect(() => {
    if (!installed) return;
    try {
      const lastReported = Number(localStorage.getItem(LAST_REPORTED_KEY) || 0);
      if (Date.now() - lastReported < REPORT_INTERVAL_MS) return;

      const deviceId = getDeviceId();
      fetch("/api/pwa-install", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, platform: detectPlatform() }),
      })
        .then(() => localStorage.setItem(LAST_REPORTED_KEY, String(Date.now())))
        .catch(() => {
          // Fire-and-forget — a missed report just delays the admin count
          // by up to a day, never worth surfacing to the visitor.
        });
    } catch {
      // localStorage unavailable (private browsing, blocked storage) —
      // nothing to persist against, skip silently.
    }
  }, [installed]);

  return null;
}
