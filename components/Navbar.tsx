"use client";

import { useState, useEffect } from "react";
import { UserMenu } from "./UserMenu";
import { HistoryModal } from "./HistoryModal";
import { useAuth } from "@/context/AuthContext";

export function Navbar() {
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const { user } = useAuth();

  const fetchHistory = async () => {
    try {
      setLoading(true);

      const res = await fetch("/api/picks/unlocked", {
        credentials: "include",
      });

      const data = await res.json();
      console.log(data)
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

  return (
    <>
      <nav style={navStyle}>
        <div style={brandStyle}>
          COUPON<span style={{ color: "#C9A84C" }}> SÛR</span>
        </div>

        <UserMenu onOpenHistory={handleOpenHistory} />
      </nav>

      {showHistory && (
        <HistoryModal
          data={history}
          loading={loading}
          onClose={() => setShowHistory(false)}
        />
      )}
    </>
  );
}

const navStyle: React.CSSProperties = {
  background: "#0A0C0F",
  borderBottom: "1px solid #1F2937",
  padding: "14px 20px",
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
};