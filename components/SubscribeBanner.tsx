"use client";

// ─── Subscription status banner ────────────────────────────────────────────
// Sits directly under <main> in PremiumPicksPage, alongside OneXBetBanner —
// same 16px horizontal margin convention every top-level section there uses
// (FilterBar's padding, OneXBetBanner's margin, Hero's padding) so this
// doesn't read edge-to-edge next to them like it used to when it was inline
// with its own `margin: "0 0 20px"` (zero horizontal).
//
// One of three mutually-exclusive states depending on the buyer's account:
// not subscribed (the gold promo CTA), actively subscribed (a quiet status
// line), or a lapsed subscription (the promo CTA again, plus an expiry note).
interface SubscribeBannerProps {
  isLoggedIn: boolean;
  isSubscribed: boolean;
  subscriptionStatus?: "NONE" | "ACTIVE" | "EXPIRED";
  expiresAt?: string | null;
  onSubscribe: () => void;
}

export function SubscribeBanner({ isLoggedIn, isSubscribed, subscriptionStatus, expiresAt, onSubscribe }: SubscribeBannerProps) {
  if (!isLoggedIn) return null;

  if (isSubscribed) {
    return (
      <div style={activeWrapStyle}>
        <div style={dotStyle} />
        <span style={activeTextStyle}>
          Abonné — accès illimité actif{expiresAt ? ` jusqu'au ${new Date(expiresAt).toLocaleDateString("fr-FR")}` : ""}
        </span>
      </div>
    );
  }

  return (
    <>
      <div onClick={onSubscribe} style={promoWrapStyle}>
        {/* Glow top-right orb */}
        <div style={glowStyle} />

        {/* Gold top bar */}
        <div style={topBarStyle} />

        <div style={promoBodyStyle}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Tag */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <span style={tagStyle}>⭐ Accès illimité</span>
            </div>

            {/* Headline */}
            <div style={headlineStyle}>
              Tous les pronostics,{" "}
              <span style={{ color: "#C9A84C" }}>sans limite</span>
            </div>

            {/* Sub */}
            <div style={{ fontSize: 11, color: "#7A8399", lineHeight: 1.5 }}>
              Abonnement mensuel · Pronostic IA sans restriction · Annulable à tout moment
            </div>
          </div>

          {/* CTA */}
          <button
            onClick={(e) => { e.stopPropagation(); onSubscribe(); }}
            style={ctaStyle}
            onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 6px 24px rgba(201,168,76,0.45)")}
            onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "0 4px 16px rgba(201,168,76,0.3)")}
          >
            S&apos;abonner →
          </button>
        </div>
      </div>

      {subscriptionStatus === "EXPIRED" && (
        <div style={expiredTextStyle}>
          Votre abonnement a expiré{expiresAt ? ` le ${new Date(expiresAt).toLocaleDateString("fr-FR")}` : ""}.
        </div>
      )}
    </>
  );
}

/* ─── STYLES ──────────────────────────────────────────────────────────────── */

const promoWrapStyle: React.CSSProperties = {
  margin: "8px 16px 20px",
  borderRadius: 14,
  overflow: "hidden",
  cursor: "pointer",
  position: "relative",
  background: "linear-gradient(135deg, #1A1508 0%, #110F05 50%, #1A1508 100%)",
  border: "1px solid rgba(201,168,76,0.35)",
  boxShadow: "0 0 32px rgba(201,168,76,0.08), inset 0 1px 0 rgba(201,168,76,0.15)",
};

const glowStyle: React.CSSProperties = {
  position: "absolute", top: -40, right: -40,
  width: 160, height: 160, borderRadius: "50%",
  background: "radial-gradient(circle, rgba(201,168,76,0.12) 0%, transparent 70%)",
  pointerEvents: "none",
};

const topBarStyle: React.CSSProperties = {
  height: 3,
  background: "linear-gradient(90deg, transparent, #C9A84C, #E8C97A, #C9A84C, transparent)",
};

const promoBodyStyle: React.CSSProperties = {
  padding: "16px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap",
};

const tagStyle: React.CSSProperties = {
  fontSize: 9, letterSpacing: "2px", textTransform: "uppercase",
  fontWeight: 700, color: "#C9A84C",
  background: "rgba(201,168,76,0.1)", border: "1px solid rgba(201,168,76,0.25)",
  padding: "2px 8px", borderRadius: 3,
};

const headlineStyle: React.CSSProperties = {
  fontFamily: "'Bebas Neue', sans-serif",
  fontSize: "clamp(17px, 4.5vw, 22px)",
  color: "#E8EAF0", letterSpacing: 1, lineHeight: 1.2, marginBottom: 6,
};

const ctaStyle: React.CSSProperties = {
  background: "linear-gradient(135deg, #C9A84C, #E8C97A)",
  color: "#0A0C0F", border: "none", borderRadius: 8,
  padding: "11px 20px",
  fontFamily: "'Bebas Neue', sans-serif",
  fontSize: 15, letterSpacing: "1.5px",
  cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
  boxShadow: "0 4px 16px rgba(201,168,76,0.3)",
  transition: "all 0.15s",
};

const activeWrapStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 8,
  margin: "8px 16px 20px", padding: "10px 14px",
  background: "rgba(201,168,76,0.06)", border: "1px solid rgba(201,168,76,0.2)", borderRadius: 8,
};

const dotStyle: React.CSSProperties = { width: 8, height: 8, borderRadius: "50%", background: "#C9A84C", flexShrink: 0 };

const activeTextStyle: React.CSSProperties = { fontSize: 11, color: "#C9A84C", letterSpacing: "0.5px" };

const expiredTextStyle: React.CSSProperties = { fontSize: 11, color: "#EF4444", margin: "0 16px 8px" };
