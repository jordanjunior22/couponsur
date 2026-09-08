"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PiLockKeyOpenFill } from "react-icons/pi";
import { useAuth } from "@/context/AuthContext";
import { HistoryItem } from "@/components/HistoryItem";
import { InlineLoader } from "@/components/LoadingSpinner";
import { BOTTOM_SAFE_OFFSET } from "@/lib/layoutConstants";

// Full-page version of what used to be the "Historique des déblocages"
// modal opened from the Navbar's avatar menu — same /api/picks/unlocked
// fetch, same HistoryItem rows, now its own tab instead of a popup.
export default function HistoriquePage() {
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/picks/unlocked", { credentials: "include" });
        const json = await res.json();
        if (json.success) setData(json.data);
      } catch (err) {
        console.error("History fetch error:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  return (
    <main style={{ minHeight: "100vh", background: "#0A0C0F", padding: "20px 16px", paddingBottom: BOTTOM_SAFE_OFFSET }}>
      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        <div style={titleStyle}><PiLockKeyOpenFill size={17} /> Historique des déblocages</div>

        {authLoading ? null : !user ? (
          <div style={gateStyle}>
            <div style={{ fontSize: 13, color: "#7A8399", marginBottom: 14 }}>
              Connectez-vous pour voir vos picks débloqués.
            </div>
            <Link href="/profil" style={gateBtnStyle}>Se connecter</Link>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {loading && <InlineLoader size={32} label="Chargement..." padding="40px 0" />}

            {!loading && data.length === 0 && (
              <div style={{ color: "#7A8399", fontSize: 12, textAlign: "center", padding: "40px 0" }}>
                Aucun déblocage pour l&apos;instant.
              </div>
            )}

            {!loading && data.map((item) => <HistoryItem key={item._id} item={item} />)}
          </div>
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
  marginBottom: 18,
};

const gateStyle: React.CSSProperties = {
  textAlign: "center",
  padding: "50px 20px",
  border: "1px solid #1F2937",
  borderRadius: 14,
  background: "#111827",
};

const gateBtnStyle: React.CSSProperties = {
  display: "inline-block",
  background: "#C9A84C",
  color: "#0A0C0F",
  fontWeight: 700,
  fontSize: 13,
  padding: "10px 22px",
  borderRadius: 9,
  textDecoration: "none",
};

