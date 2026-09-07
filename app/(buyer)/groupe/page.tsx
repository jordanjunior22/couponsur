"use client";

import Link from "next/link";
import { PiGlobeHemisphereWestFill, PiCrownSimpleFill, PiLockSimpleFill, PiCaretRightBold } from "react-icons/pi";
import { useAuth } from "@/context/AuthContext";
import { useAppSettings } from "@/hooks/useAppSettings";
import { BOTTOM_SAFE_OFFSET } from "@/lib/layoutConstants";

// The "Chat" tab's landing screen — a picker between the two rooms
// (components/GroupChatRoom, parameterized by `room`) rather than
// dropping straight into one. Chat Global is open to any logged-in user;
// Groupe Premium keeps its original admin/active-subscriber gate.
export default function ChatHubPage() {
  const { user, hasActiveSubscription } = useAuth();
  const settings = useAppSettings();

  const isPremiumEligible = !!user && (user.role === "ADMIN" || hasActiveSubscription());
  const globalOn = !!settings?.globalChatEnabled;
  const premiumOn = !!settings?.groupChatEnabled;

  return (
    <main style={{ minHeight: "100vh", background: "#0A0C0F", padding: "20px 16px", paddingBottom: BOTTOM_SAFE_OFFSET }}>
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        <div style={titleStyle}>💬 Chat</div>

        <RoomCard
          href="/groupe/global"
          icon={<PiGlobeHemisphereWestFill size={22} />}
          label="Chat Global"
          description="Ouvert à tous les membres connectés."
          enterable={!!user && globalOn}
          lockedText={!user ? "Connectez-vous pour rejoindre" : "Temporairement indisponible"}
        />

        <RoomCard
          href="/groupe/premium"
          icon={<PiCrownSimpleFill size={22} />}
          label="Groupe Premium"
          description="Réservé aux abonnés actifs & à l'équipe."
          enterable={isPremiumEligible && premiumOn}
          lockedText={!user ? "Connectez-vous pour rejoindre" : !premiumOn ? "Temporairement indisponible" : "Réservé aux abonnés premium"}
          upsellHref={user && !isPremiumEligible ? "/profil" : undefined}
        />
      </div>
    </main>
  );
}

function RoomCard({
  href, icon, label, description, enterable, lockedText, upsellHref,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  description: string;
  enterable: boolean;
  lockedText: string;
  upsellHref?: string;
}) {
  const content = (
    <>
      <span style={iconWrapStyle}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
        <div style={cardTitleStyle}>{label}</div>
        <div style={cardDescStyle}>{enterable ? description : lockedText}</div>
      </div>
      {enterable ? <PiCaretRightBold size={16} color="#7A8399" /> : <PiLockSimpleFill size={15} color="#7A8399" />}
    </>
  );

  if (enterable) {
    return <Link href={href} style={cardStyle}>{content}</Link>;
  }
  if (upsellHref) {
    return <Link href={upsellHref} style={{ ...cardStyle, opacity: 0.75 }}>{content}</Link>;
  }
  return <div style={{ ...cardStyle, opacity: 0.6, cursor: "default" }}>{content}</div>;
}

const titleStyle: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: "#C9A84C", marginBottom: 18 };

const cardStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 14,
  background: "#111418", border: "1px solid #2A3140", borderRadius: 14,
  padding: "16px 18px", marginBottom: 12, textDecoration: "none",
  transition: "border-color 0.2s",
};

const iconWrapStyle: React.CSSProperties = {
  width: 44, height: 44, borderRadius: 12, flexShrink: 0,
  background: "rgba(201,168,76,0.1)", border: "1px solid rgba(201,168,76,0.25)",
  display: "flex", alignItems: "center", justifyContent: "center", color: "#C9A84C",
};

const cardTitleStyle: React.CSSProperties = { fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: 1, color: "#E8EAF0", marginBottom: 2 };

const cardDescStyle: React.CSSProperties = { fontSize: 11.5, color: "#7A8399", lineHeight: 1.4 };
