"use client";

import { PiSparkleFill } from "react-icons/pi";
import { MatchGeneratorTool } from "@/components/MatchGenerator";
import { useAppSettings } from "@/hooks/useAppSettings";
import { BOTTOM_SAFE_OFFSET } from "@/lib/layoutConstants";

// Full-page home for the "Pronostic IA" tab — what used to live inside
// ToolsHub's bottom sheet as an unnamed "Générateur de matchs" utility.
// Admin's matchGeneratorEnabled toggle still gates it — this tab is hidden
// entirely by BottomTabBar when it's off, this is just the fallback for
// whoever still has the URL open from before it was disabled.
export default function PronosticPage() {
  const settings = useAppSettings();

  if (settings && !settings.matchGeneratorEnabled) {
    return (
      <main style={{ minHeight: "100vh", background: "#0A0C0F", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ color: "#7A8399", fontSize: 13, textAlign: "center" }}>
          Pronostic IA n&apos;est pas disponible pour le moment.
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", background: "#0A0C0F", padding: "20px 16px", paddingBottom: BOTTOM_SAFE_OFFSET }}>
      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        <div style={titleStyle}><PiSparkleFill size={17} /> Pronostic IA</div>
        <div style={subtitleStyle}>Notre moteur de génération de matchs par IA, à titre indicatif.</div>
        {settings && (
          <MatchGeneratorTool access={settings.matchGeneratorAccess} marketAccess={settings.matchGeneratorMarketAccess} />
        )}
      </div>
    </main>
  );
}

const titleStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 15,
  fontWeight: 700,
  color: "#C9A84C",
  marginBottom: 4,
};

const subtitleStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#7A8399",
  marginBottom: 18,
  lineHeight: 1.5,
};
