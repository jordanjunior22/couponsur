"use client";

// ─── Shared "modern" loading indicator ─────────────────────────────────────
// Replaces the old two-tone "border-top-color" ring (a hard, choppy quarter
// segment chasing itself) used ad-hoc across the app. This is a smooth
// conic-gradient sweep masked into a slim ring, with a softly breathing
// glow behind it and a pulsing core at its center — reads as deliberate
// chrome instead of a plain browser spinner. Built on the `spin`/`pulse`
// keyframes already centralized in app/globals.css, so no new keyframes
// are duplicated per-component the way the old inline spinners each did.
//
// Every loading surface in the app (full-page, inline/section, this
// file's own PageLoader/InlineLoader) renders its caption through the one
// shared `Label` below — same font, size, letter-spacing, weight, color
// and gap-from-spinner everywhere, so "Chargement…" never looks like a
// different component depending on which screen happens to show it.

const RING_GRADIENT: Record<"gold" | "dark", string> = {
  gold: "conic-gradient(from 0deg, transparent 0deg, rgba(201,168,76,0.25) 90deg, #C9A84C 300deg, transparent 360deg)",
  dark: "conic-gradient(from 0deg, transparent 0deg, rgba(10,12,15,0.3) 90deg, #0A0C0F 300deg, transparent 360deg)",
};
const GLOW_COLOR: Record<"gold" | "dark", string> = {
  gold: "rgba(201,168,76,0.4)",
  dark: "rgba(10,12,15,0.4)",
};
const CORE_COLOR: Record<"gold" | "dark", string> = {
  gold: "#E8C97A",
  dark: "#0A0C0F",
};

interface SpinnerProps {
  size?: number;
  variant?: "gold" | "dark";
  glow?: boolean;
  style?: React.CSSProperties;
}

export function Spinner({ size = 44, variant = "gold", glow = true, style }: SpinnerProps) {
  const stroke = Math.max(2, Math.round(size * 0.1));
  const maskImage = `radial-gradient(farthest-side, transparent calc(100% - ${stroke}px), #000 calc(100% - ${stroke}px))`;
  return (
    <span className="cs-loader" style={{ width: size, height: size, ...style }}>
      {glow && (
        <span
          className="cs-loader-glow"
          style={{ background: `radial-gradient(circle, ${GLOW_COLOR[variant]} 0%, transparent 70%)` }}
        />
      )}
      <span
        className="cs-loader-ring"
        style={{ background: RING_GRADIENT[variant], WebkitMaskImage: maskImage, maskImage }}
      />
      <span className="cs-loader-core" style={{ background: CORE_COLOR[variant] }} />
    </span>
  );
}

// The one caption style every loader on the site uses — a small uppercase
// "eyebrow" label, the same family of text this app already uses for
// section eyebrows elsewhere (Hero's "Tendance", SubscribeBanner's tag).
// Centralized here so PageLoader and InlineLoader can never drift apart.
const labelStyle: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: "2.5px",
  textTransform: "uppercase",
  color: "#7A8399",
  textAlign: "center",
};

function Label({ children }: { children: string }) {
  return <div style={labelStyle}>{children}</div>;
}

// Every stacked spinner+label uses this exact gap — the other thing that
// has to match for the two loaders to read as one consistent component.
const STACK_GAP = 16;

// Full-viewport loading state — the first thing a visitor sees while a
// page's initial data fetch is in flight (buyer home feed, etc.).
export function PageLoader({ label }: { label?: string }) {
  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#0A0C0F", gap: STACK_GAP }}>
      <Spinner size={52} />
      {label && <Label>{label}</Label>}
    </div>
  );
}

// The root layout's very first loading gate (components/LoadWrapper.tsx)
// renders this before auth even resolves — likely the single most-seen
// loading moment in the app. Kept as its own named export (call sites use
// it with no props) but now shares the same modern ring + caption as
// everywhere else instead of the plain, unlabeled spinner it used to render.
export const LoadingSpinner = () => <PageLoader label="Chargement…" />;

// A smaller, section-scoped loading state — a modal body, a feed still
// fetching its first page, an admin import panel, etc. Sits inline in
// whatever padded block already contains it rather than claiming the
// whole viewport.
export function InlineLoader({ label, size = 40, padding = "48px 0" }: { label?: string; size?: number; padding?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding, gap: STACK_GAP }}>
      <Spinner size={size} />
      {label && <Label>{label}</Label>}
    </div>
  );
}
