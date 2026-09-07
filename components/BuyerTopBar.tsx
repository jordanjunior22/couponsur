"use client";

import Link from "next/link";
import { PiUserFill, PiStarFill } from "react-icons/pi";
import { useAuth } from "@/context/AuthContext";
import { TOP_BAR_HEIGHT } from "@/lib/layoutConstants";

// Restores the old Navbar's layout — brand on one side, account access
// opposite it — across every buyer tab instead of just Accueil. The Profil
// tab still holds the actual login/signup form and account panel; this is
// the same-everywhere quick-access affordance the site had before that
// got tucked away as one tab among five, which made it too easy to miss.
export function BuyerTopBar() {
  const { user, hasActiveSubscription, loading } = useAuth();
  const isSubscribed = !!user && hasActiveSubscription();

  return (
    <nav style={navStyle}>
      <Link href="/" style={brandStyle}>
        COUPON<span style={{ color: "#C9A84C" }}> SÛR</span>
      </Link>

      {!loading && (
        user ? (
          <Link href="/profil" aria-label="Profil" style={avatarStyle}>
            <PiUserFill size={16} />
            {isSubscribed && (
              <span style={premiumDotStyle}>
                <PiStarFill size={9} />
              </span>
            )}
          </Link>
        ) : (
          <Link href="/profil" style={loginBtnStyle}>Se connecter</Link>
        )
      )}
    </nav>
  );
}

const navStyle: React.CSSProperties = {
  height: TOP_BAR_HEIGHT,
  boxSizing: "border-box",
  background: "#0A0C0F",
  borderBottom: "1px solid #1F2937",
  padding: "0 20px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  position: "sticky",
  top: 0,
  zIndex: 100,
};

const brandStyle: React.CSSProperties = {
  fontFamily: "'Bebas Neue', sans-serif",
  fontSize: 22,
  letterSpacing: "2px",
  color: "#E5E7EB",
  textDecoration: "none",
};

const loginBtnStyle: React.CSSProperties = {
  background: "#C9A84C",
  color: "#0A0C0F",
  fontWeight: 700,
  fontSize: 12,
  padding: "8px 14px",
  borderRadius: 8,
  letterSpacing: "0.02em",
  textDecoration: "none",
};

const avatarStyle: React.CSSProperties = {
  position: "relative",
  width: 36,
  height: 36,
  borderRadius: "50%",
  background: "rgba(201,168,76,0.15)",
  border: "1.5px solid #C9A84C",
  color: "#C9A84C",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  animation: "avatarPulse 2s ease-out infinite",
};

const premiumDotStyle: React.CSSProperties = {
  position: "absolute",
  top: -4,
  right: -4,
  width: 14,
  height: 14,
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#0A0C0F",
  color: "#C9A84C",
  filter: "drop-shadow(0 0 3px rgba(201,168,76,0.8))",
};
