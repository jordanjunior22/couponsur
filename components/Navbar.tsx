"use client";

import { useState } from "react";
import { UserMenu } from "./UserMenu";
import { HistoryModal } from "./HistoryModal";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";
import { usePathname } from "next/navigation";

const C = {
  dark: "#0A0C0F",
  dark2: "#111418",
  dark3: "#1A1F26",
  border: "#2A3140",
  text: "#E8EAF0",
  muted: "#7A8399",
  gold: "#C9A84C",
};

export function Navbar() {
  const [showHistory, setShowHistory] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const { user } = useAuth();
  const pathname = usePathname();
  const isActive = (path: string) => pathname === path;

  const fetchHistory = async () => {
    try {
      setHistoryLoading(true);
      const res = await fetch("/api/picks/unlocked", { credentials: "include" });
      const data = await res.json();
      if (data.success) setHistory(data.data);
    } catch (err) {
      console.error("History fetch error:", err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleOpenHistory = async () => {
    setShowHistory(true);
    if (user) await fetchHistory();
  };

  const navLinks = [
    { href: "/picks", label: "Picks" },
    { href: "/billing", label: "Abonnement" },
    { href: "/contact", label: "Contact" },
  ];

  return (
    <>
      <nav style={navStyle}>
        {/* Logo */}
        <Link href="/" style={{ textDecoration: "none", flexShrink: 0 }}>
          <div style={logoStyle}>
            COUPON<span style={{ color: C.gold }}> SÛR</span>
          </div>
        </Link>

        {/* Desktop center links */}
        <div className="nav-links-desktop" style={desktopLinksStyle}>
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} style={getLinkStyle(isActive(link.href))}>
              {link.label}
            </Link>
          ))}
          {user && (
            <Link href="/profile" style={getLinkStyle(isActive("/profile"))}>
              Profil
            </Link>
          )}
        </div>

        {/* Right side: UserMenu is ALWAYS rendered, hamburger sits beside it on mobile */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: "auto" }}>
          <UserMenu onOpenHistory={handleOpenHistory} />

          {/* Hamburger — CSS shows/hides per breakpoint */}
          <button
            className="menu-icon"
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            style={hamburgerStyle}
            aria-label="Menu"
            aria-expanded={showMobileMenu}
          >
            {showMobileMenu ? "✕" : "☰"}
          </button>
        </div>
      </nav>

      {/* Mobile Sidebar */}
      {showMobileMenu && (
        <div
          style={sidebarOverlayStyle}
          onClick={() => setShowMobileMenu(false)}
        >
          <div
            style={sidebarStyle}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setShowMobileMenu(false)}
                  style={getMobileLinkStyle(isActive(link.href))}
                >
                  {link.label}
                </Link>
              ))}
              {user && (
                <Link
                  href="/profile"
                  onClick={() => setShowMobileMenu(false)}
                  style={getMobileLinkStyle(isActive("/profile"))}
                >
                  Profil
                </Link>
              )}
            </div>

            {user && (
              <>
                <div style={{ height: 1, background: C.border, margin: "16px 0" }} />
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "1px", fontWeight: 600, padding: "0 12px 6px" }}>
                    Compte
                  </div>
                  <button
                    onClick={() => { handleOpenHistory(); setShowMobileMenu(false); }}
                    style={mobileMenuBtnStyle}
                  >
                    📋 Mes Déverrouillages
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showHistory && (
        <HistoryModal
          data={history}
          loading={historyLoading}
          onClose={() => setShowHistory(false)}
        />
      )}

      <style>{`
        .nav-links-desktop { display: none !important; }
        .menu-icon { display: flex !important; }

        @media (min-width: 769px) {
          .nav-links-desktop { display: flex !important; }
          .menu-icon { display: none !important; }
        }
      `}</style>
    </>
  );
}

/* ─── STYLES ──────────────────────────────────────────────────────────────── */

const navStyle: React.CSSProperties = {
  background: "#0A0C0F",
  borderBottom: "1px solid #2A3140",
  padding: "12px 16px",
  display: "flex",
  alignItems: "center",
  gap: 16,
  position: "sticky",
  top: 0,
  zIndex: 100,
};

const logoStyle: React.CSSProperties = {
  fontFamily: "'Bebas Neue', sans-serif",
  fontSize: 18,
  letterSpacing: "2px",
  color: "#E8EAF0",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const desktopLinksStyle: React.CSSProperties = {
  gap: 24,
  alignItems: "center",
  flex: 1,
  justifyContent: "center",
};

const hamburgerStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#E8EAF0",
  fontSize: 20,
  cursor: "pointer",
  padding: 4,
  lineHeight: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 32,
  height: 32,
  borderRadius: 6,
  flexShrink: 0,
};

const sidebarOverlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.5)",
  zIndex: 999,
};

const sidebarStyle: React.CSSProperties = {
  position: "fixed",
  left: 0,
  top: 0,
  bottom: 0,
  width: "80%",
  maxWidth: 300,
  background: "#111418",
  borderRight: "1px solid #2A3140",
  padding: 16,
  overflowY: "auto",
  zIndex: 1000,
};

const mobileMenuBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#7A8399",
  fontSize: 13,
  textAlign: "left",
  cursor: "pointer",
  padding: "10px 12px",
  borderRadius: 6,
  width: "100%",
};

function getLinkStyle(active: boolean): React.CSSProperties {
  return {
    color: active ? "#C9A84C" : "#7A8399",
    textDecoration: "none",
    fontSize: 12,
    fontWeight: active ? 600 : 400,
    letterSpacing: "0.5px",
    textTransform: "uppercase",
    borderBottom: active ? "2px solid #C9A84C" : "2px solid transparent",
    paddingBottom: 4,
    transition: "all 0.2s ease",
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}

function getMobileLinkStyle(active: boolean): React.CSSProperties {
  return {
    color: active ? "#C9A84C" : "#7A8399",
    textDecoration: "none",
    fontSize: 14,
    fontWeight: active ? 600 : 400,
    padding: "10px 12px",
    borderRadius: 6,
    background: active ? "rgba(201,168,76,0.1)" : "transparent",
    borderLeft: active ? "3px solid #C9A84C" : "3px solid transparent",
    display: "block",
  };
}