"use client";
import { useEffect, useState } from "react";
import { MatchGeneratorTool } from "./MatchGenerator";

// ─── Tools Hub ────────────────────────────────────────────────────────────────
// A single sticky entry point for every self-serve "tool" the site offers
// (currently just the AI match generator, but built so adding the next one
// is just another entry in TOOL_DEFS below). One floating button → a list of
// available tools → tap one to open its interface, with a back arrow to
// return to the list and a close button to dismiss entirely.
//
// Visibility of each tool is still fully controlled from admin/settings —
// this component only decides HOW they're presented, not whether they exist.
// ─────────────────────────────────────────────────────────────────────────────

interface SettingsShape {
  matchGeneratorEnabled: boolean;
  matchGeneratorAccess: "EVERYONE" | "PREMIUM";
  // Per-market override on top of matchGeneratorAccess (see
  // models/Settings.ts) — a market missing from this map falls back to
  // "PREMIUM", same most-restrictive-by-default posture as the server.
  matchGeneratorMarketAccess: Record<string, "EVERYONE" | "PREMIUM">;
}

interface ToolDef {
  id: string;
  label: string;
  description: string;
  icon: string;
}

const SEEN_KEY = "couponsur_tools_seen_v1";

export function ToolsHub() {
  const [settings, setSettings] = useState<SettingsShape | null>(null);
  const [open, setOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [seenIds, setSeenIds] = useState<string[]>([]);
  // Snapshot of which tools were still unseen the moment the hub was opened —
  // used to show the "Nouveau" pill for exactly one viewing, without it
  // vanishing mid-render the instant we mark them as seen.
  const [pillIds, setPillIds] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/settings");
        const data = await res.json();
        setSettings({
          matchGeneratorEnabled: !!data?.data?.matchGeneratorEnabled,
          matchGeneratorAccess: data?.data?.matchGeneratorAccess === "EVERYONE" ? "EVERYONE" : "PREMIUM",
          matchGeneratorMarketAccess:
            data?.data?.matchGeneratorMarketAccess && typeof data.data.matchGeneratorMarketAccess === "object"
              ? data.data.matchGeneratorMarketAccess
              : {},
        });
      } catch {
        setSettings({ matchGeneratorEnabled: false, matchGeneratorAccess: "PREMIUM", matchGeneratorMarketAccess: {} });
      }
    })();
    (async () => {
      try {
        const raw = localStorage.getItem(SEEN_KEY);
        setSeenIds(raw ? JSON.parse(raw) : []);
      } catch { /* private browsing etc. — just means the badge never clears, harmless */ }
    })();
  }, []);

  // ── Tool registry ── add future tools here once they have their own
  // admin/settings switch + interface component.
  const tools: ToolDef[] = [];
  if (settings?.matchGeneratorEnabled) {
    tools.push({
      id: "match-generator",
      label: "Générateur de matchs",
      description: "Génère une combinaison via notre moteur d'analyse, à titre indicatif.",
      icon: "🔮",
    });
  }

  const unseenCount = tools.filter((t) => !seenIds.includes(t.id)).length;

  const openHub = () => {
    setPillIds(tools.filter((t) => !seenIds.includes(t.id)).map((t) => t.id));
    setOpen(true);
    if (tools.length > 0) {
      const next = Array.from(new Set([...seenIds, ...tools.map((t) => t.id)]));
      setSeenIds(next);
      try { localStorage.setItem(SEEN_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    }
  };

  const close = () => { setOpen(false); setActiveTool(null); };

  if (!settings || tools.length === 0) return null;

  const active = tools.find((t) => t.id === activeTool) || null;

  return (
    <>
      <style>{`
        @keyframes toolsPulseRing {
          0% { box-shadow: 0 0 0 0 rgba(201,168,76,0.5); }
          100% { box-shadow: 0 0 0 14px rgba(201,168,76,0); }
        }
        @keyframes toolsSlideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>

      {/* ── Sticky FAB ── stacked above the chat bubble (bottom:20/right:20,
          56px) so neither one covers the other. */}
      <button
        onClick={openHub}
        aria-label="Outils"
        style={{
          position: "fixed", bottom: 92, right: 20, width: 56, height: 56, borderRadius: "50%",
          background: "linear-gradient(135deg, #C9A84C, #E8C97A)", border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24,
          boxShadow: "0 8px 24px rgba(201,168,76,0.4)", zIndex: 950,
          animation: unseenCount > 0 ? "toolsPulseRing 2s ease-out infinite" : undefined,
        }}
      >
        🧰
        {unseenCount > 0 && (
          <span style={{
            position: "absolute", top: -2, right: -2, minWidth: 18, height: 18, padding: "0 4px",
            borderRadius: "50%", background: "#EF4444", color: "#fff", fontSize: 10, fontWeight: 700,
            display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #0A0C0F",
          }}>
            {unseenCount}
          </span>
        )}
      </button>

      {/* ── Sheet ── */}
      {open && (
        <div
          onClick={(e) => e.target === e.currentTarget && close()}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 1000,
            display: "flex", alignItems: "flex-end", justifyContent: "center", backdropFilter: "blur(4px)",
          }}
        >
          <div style={{
            background: "#111418", border: "1px solid #2A3140", borderRadius: "20px 20px 0 0",
            width: "100%", maxWidth: 600, maxHeight: "85vh", display: "flex", flexDirection: "column",
            overflow: "hidden", animation: "toolsSlideUp 0.3s cubic-bezier(0.32,0.72,0,1)",
          }}>
            <div style={{ width: 40, height: 4, background: "#3A4455", borderRadius: 2, margin: "12px auto 0", flexShrink: 0 }} />

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "1px solid #2A3140", flexShrink: 0 }}>
              {active ? (
                <button
                  onClick={() => setActiveTool(null)}
                  aria-label="Retour aux outils"
                  style={{ background: "#222830", border: "1px solid #2A3140", borderRadius: 8, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#E8EAF0", flexShrink: 0, fontSize: 16 }}
                >
                  ←
                </button>
              ) : (
                <span style={{ fontSize: 20, flexShrink: 0 }}>🧰</span>
              )}
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: "#E8EAF0", letterSpacing: 1, flex: 1, minWidth: 0 }}>
                {active ? active.label : "Outils"}
              </div>
              <button
                onClick={close}
                aria-label="Fermer"
                style={{ background: "#222830", border: "1px solid #2A3140", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#7A8399", flexShrink: 0 }}
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div style={{ overflowY: "auto", padding: 18 }}>
              {!active && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {tools.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setActiveTool(t.id)}
                      style={{ display: "flex", alignItems: "center", gap: 14, textAlign: "left", background: "#181C24", border: "1px solid #2A3140", borderRadius: 12, padding: 14, cursor: "pointer", fontFamily: "inherit" }}
                    >
                      <span style={{ fontSize: 26, flexShrink: 0 }}>{t.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: "#E8EAF0" }}>{t.label}</span>
                          {pillIds.includes(t.id) && (
                            <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: "#0A0C0F", background: "#C9A84C", borderRadius: 4, padding: "2px 6px", flexShrink: 0 }}>
                              Nouveau
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: "#7A8399", lineHeight: 1.4 }}>{t.description}</div>
                      </div>
                      <span style={{ color: "#7A8399", fontSize: 16, flexShrink: 0 }}>›</span>
                    </button>
                  ))}
                </div>
              )}

              {active?.id === "match-generator" && (
                <MatchGeneratorTool access={settings.matchGeneratorAccess} marketAccess={settings.matchGeneratorMarketAccess} />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
