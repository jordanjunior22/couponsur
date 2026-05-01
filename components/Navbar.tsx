"use client";

import { useState, useEffect } from "react";
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
  const [loading, setLoading] = useState(false);

  const { user } = useAuth();
  const pathname = usePathname();

  const isActive = (path: string) => pathname === path;

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/picks/unlocked", {
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        setHistory(data.data);
      }
    } catch (err) {
      console.error("History fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenHistory = async () => {
    setShowHistory(true);
    if (user) {
      await fetchHistory();
    }
  };

  const navLinks = [
    { href: "/picks", label: "Picks" },
    { href: "/billing", label: "Abonnement" },
    { href: "/contact", label: "Contact" },
  ];

  return (
    <>
      <nav style={{ background: C.dark, borderBottom: `1px solid ${C.border}`, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 100, gap: 16 }} className="navbar">
        <Link href="/" style={{ textDecoration: "none" }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: "2px", color: C.text, cursor: "pointer", whiteSpace: "nowrap" }}>
            COUPON<span style={{ color: C.gold }}> SÛR</span>
          </div>
        </Link>

        {/* Desktop Links */}
        <div style={{ display: "none", gap: 24, alignItems: "center", flex: 1, justifyContent: "center" }} className="nav-links-desktop">
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

        <UserMenu onOpenHistory={handleOpenHistory} />

        {/* Mobile Menu Icon */}
        <button
          onClick={() => setShowMobileMenu(!showMobileMenu)}
          style={{
            display: "none",
            background: "none",
            border: "none",
            color: C.text,
            fontSize: 24,
            cursor: "pointer",
            padding: 0,
          }}
          className="menu-icon"
        >
          ☰
        </button>
      </nav>

      {/* Mobile Sidebar */}
      {showMobileMenu && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            zIndex: 999,
          }}
          onClick={() => setShowMobileMenu(false)}
        >
          <div
            style={{
              position: "fixed",
              left: 0,
              top: 0,
              bottom: 0,
              width: "80%",
              maxWidth: 300,
              background: C.dark2,
              borderRight: `1px solid ${C.border}`,
              padding: 16,
              overflowY: "auto",
              zIndex: 1000,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sidebar Links */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setShowMobileMenu(false)}
                  style={{
                    color: isActive(link.href) ? C.gold : C.muted,
                    textDecoration: "none",
                    fontSize: 14,
                    fontWeight: isActive(link.href) ? 600 : 400,
                    padding: "10px 12px",
                    borderRadius: 6,
                    background: isActive(link.href) ? "rgba(201,168,76,0.1)" : "transparent",
                    borderLeft: isActive(link.href) ? `3px solid ${C.gold}` : "3px solid transparent",
                    paddingLeft: "9px",
                  }}
                >
                  {link.label}
                </Link>
              ))}
              {user && (
                <Link
                  href="/profile"
                  onClick={() => setShowMobileMenu(false)}
                  style={{
                    color: isActive("/profile") ? C.gold : C.muted,
                    textDecoration: "none",
                    fontSize: 14,
                    fontWeight: isActive("/profile") ? 600 : 400,
                    padding: "10px 12px",
                    borderRadius: 6,
                    background: isActive("/profile") ? "rgba(201,168,76,0.1)" : "transparent",
                    borderLeft: isActive("/profile") ? `3px solid ${C.gold}` : "3px solid transparent",
                    paddingLeft: "9px",
                  }}
                >
                  Profil
                </Link>
              )}
            </div>

            {/* Divider */}
            <div style={{ height: "1px", background: C.border, margin: "16px 0" }} />

            {/* User Menu in Sidebar */}
            {user && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 12, color: C.muted, textTransform: "uppercase", letterSpacing: "1px", fontWeight: 600 }}>
                  Compte
                </div>
                <button
                  onClick={() => {
                    handleOpenHistory();
                    setShowMobileMenu(false);
                  }}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: C.muted,
                    fontSize: 13,
                    textAlign: "left",
                    cursor: "pointer",
                    padding: "8px 12px",
                    borderRadius: 6,
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(201,168,76,0.1)";
                    e.currentTarget.style.color = C.gold;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = C.muted;
                  }}
                >
                  Mes Déverrouillages
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {showHistory && (
        <HistoryModal
          data={history}
          loading={loading}
          onClose={() => setShowHistory(false)}
        />
      )}

      <style>{`
        @media (max-width: 768px) {
          .nav-links-desktop {
            display: none !important;
          }
          .menu-icon {
            display: block !important;
          }
        }

        @media (min-width: 769px) {
          .nav-links-desktop {
            display: flex !important;
          }
          .menu-icon {
            display: none !important;
          }
        }
      `}</style>
    </>
  );
}

function getLinkStyle(isActive: boolean): React.CSSProperties {
  return {
    color: isActive ? C.gold : C.muted,
    textDecoration: "none",
    fontSize: 12,
    fontWeight: isActive ? 600 : 400,
    letterSpacing: "0.5px",
    textTransform: "uppercase",
    borderBottom: isActive ? `2px solid ${C.gold}` : "2px solid transparent",
    paddingBottom: 4,
    transition: "all 0.2s ease",
    cursor: "pointer",
  };
}