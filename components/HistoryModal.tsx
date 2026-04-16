"use client";

import { HistoryItem } from "./HistoryItem";

export function HistoryModal({
  data,
  loading,
  onClose,
}: {
  data: any[];
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <div onClick={onClose} style={overlay}>
      <div onClick={(e) => e.stopPropagation()} style={box}>
        <div style={title}>🔓 Historique des déblocages</div>

        <div style={content}>
          {/* ─── LOADING ─── */}
          {loading && (
            <div style={loadingContainer}>
              <div style={spinner} />
              <div style={loadingText}>Chargement...</div>
            </div>
          )}

          {/* ─── EMPTY ─── */}
          {!loading && data.length === 0 && (
            <div style={emptyText}>Aucun déblocage</div>
          )}

          {/* ─── DATA ─── */}
          {!loading &&
            data.map((item) => (
              <HistoryItem key={item._id} item={item} />
            ))}
        </div>

        <button onClick={onClose} style={closeBtn}>
          Fermer
        </button>
      </div>
    </div>
  );
}

/* ───── STYLES ───── */

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.85)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  zIndex: 200,
};

const box: React.CSSProperties = {
  width: "100%",
  maxWidth: 450,
  background: "#111827",
  border: "1px solid #1F2937",
  borderRadius: 14,
  padding: 16,
  maxHeight: "80vh",
  overflowY: "auto",
};

const title: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: "#C9A84C",
  marginBottom: 12,
};

const content: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

/* 🔥 Loading UI */
const loadingContainer: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 8,
  padding: "20px 0",
};

const spinner: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: "50%",
  border: "3px solid #1F2937",
  borderTop: "3px solid #C9A84C",
  animation: "spin 1s linear infinite",
};

const loadingText: React.CSSProperties = {
  fontSize: 12,
  color: "#C9A84C",
};

const emptyText: React.CSSProperties = {
  color: "#7A8399",
  fontSize: 12,
  textAlign: "center",
  padding: "10px 0",
};

const closeBtn: React.CSSProperties = {
  marginTop: 12,
  width: "100%",
  padding: 10,
  borderRadius: 10,
  background: "#C9A84C",
  color: "#0A0C0F",
  fontWeight: 700,
  border: "none",
  cursor: "pointer",
};