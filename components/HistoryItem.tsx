"use client";

import { useState } from "react";

export function HistoryItem({ item }: { item: any }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={card}>
      {/* HEADER */}
      <div onClick={() => setOpen(!open)} style={header}>
        <div>
          <div style={title}>{item.title}</div>
          <div style={date}>📅 {item.date}</div>
        </div>

        <div style={{ color: "#C9A84C" }}>{open ? "▲" : "▼"}</div>
      </div>

      {/* CONTENT */}
      {open && (
        <div style={content}>
          {item.matches?.length ? (
            item.matches.map((m: any) => (
              <div key={m.id} style={row}>
                <span>{m.prediction}</span>
                <span
                  style={{
                    color: m.outcome === "WIN" ? "#00FFA3" : "#EF4444",
                    fontWeight: 700,
                  }}
                >
                  {m.outcome}
                </span>
              </div>
            ))
          ) : (
            <div style={{ color: "#7A8399", fontSize: 12 }}>
              Aucun détail disponible
            </div>
          )}

          <div style={price}>💰 {item.price}</div>
        </div>
      )}
    </div>
  );
}

const card: React.CSSProperties = {
  border: "1px solid #1F2937",
  borderRadius: 10,
  background: "#0A0C0F",
};

const header: React.CSSProperties = {
  padding: 10,
  display: "flex",
  justifyContent: "space-between",
  cursor: "pointer",
};

const title: React.CSSProperties = {
  fontSize: 13,
  color: "#E5E7EB",
  fontWeight: 600,
};

const date: React.CSSProperties = {
  fontSize: 11,
  color: "#7A8399",
  marginTop: 3,
};

const content: React.CSSProperties = {
  borderTop: "1px solid #1F2937",
  padding: 10,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const row: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: 12,
  color: "#E5E7EB",
};

const price: React.CSSProperties = {
  marginTop: 6,
  fontSize: 11,
  color: "#C9A84C",
  fontWeight: 600,
};