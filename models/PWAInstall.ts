import mongoose, { Schema, Document, Model } from "mongoose";

// One document per device that has ever been seen running the site in PWA
// "standalone" mode (added to home screen / installed) — see
// components/PWAInstallTracker.tsx, the only place that writes here.
// There's no browser API that reports "installed" from the server side, so
// this is a best-effort estimate built from client-side signals: the
// `appinstalled` event (Chrome/Android/desktop only) and detecting
// `display-mode: standalone` whenever the device relaunches the app from
// its home-screen icon (the only signal iOS Safari ever gives us, and only
// once the visitor actually reopens it that way — a genuine "installed but
// never reopened" device is invisible to this count on any platform).
export interface IPWAInstall extends Document {
  // Random id generated client-side and kept in localStorage — the closest
  // thing to a stable device identifier available without native app
  // install tracking. Not tied to a User: an install can happen before
  // login, or never log in at all.
  deviceId: string;
  user: mongoose.Types.ObjectId | null;
  platform: "ios" | "android" | "desktop" | "other";
  firstSeenAt: Date;
  lastSeenAt: Date;
}

const PWAInstallSchema = new Schema<IPWAInstall>(
  {
    deviceId: { type: String, required: true, unique: true },
    user: { type: Schema.Types.ObjectId, ref: "User", default: null },
    platform: { type: String, enum: ["ios", "android", "desktop", "other"], default: "other" },
    firstSeenAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

const PWAInstallModel: Model<IPWAInstall> =
  mongoose.models.PWAInstall ||
  mongoose.model<IPWAInstall>("PWAInstall", PWAInstallSchema, "pwainstalls");

export default PWAInstallModel;
