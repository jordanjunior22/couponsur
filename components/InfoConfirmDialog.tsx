import { useState } from "react";

interface DialogButton {
  label: string;
  onClick: () => void;
  style?: "primary" | "secondary" | "danger";
}

interface InfoConfirmDialogProps {
  isOpen: boolean;
  type: "info" | "success" | "error" | "warning" | "confirm";
  title: string;
  message: string;
  buttons: DialogButton[];
  onClose?: () => void;
}

const C = {
  dark: "#0A0C0F",
  dark2: "#111418",
  dark3: "#1A1F26",
  border: "#2A3140",
  text: "#E8EAF0",
  muted: "#7A8399",
  gold: "#C9A84C",
  goldDark: "#8A6A2A",
  green: "#22C55E",
  red: "#EF4444",
  blue: "#3B82F6",
};

const typeConfig = {
  info: { bg: "rgba(59,130,246,0.1)", color: C.blue, icon: "ℹ️" },
  success: { bg: "rgba(34,197,94,0.1)", color: C.green, icon: "✓" },
  error: { bg: "rgba(239,68,68,0.1)", color: C.red, icon: "✕" },
  warning: { bg: "rgba(234,179,8,0.1)", color: "#EAB308", icon: "⚠" },
  confirm: { bg: "rgba(201,168,76,0.1)", color: C.gold, icon: "?" },
};

export default function InfoConfirmDialog({
  isOpen,
  type,
  title,
  message,
  buttons,
  onClose,
}: InfoConfirmDialogProps) {
  if (!isOpen) return null;

  const config = typeConfig[type];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: 16,
        backdropFilter: "blur(4px)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) {
          onClose();
        }
      }}
    >
      <div
        style={{
          background: C.dark2,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: 24,
          maxWidth: 400,
          width: "100%",
          boxShadow: "0 10px 40px rgba(0, 0, 0, 0.5)",
        }}
      >
        {/* Icon and Title */}
        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          <div
            style={{
              fontSize: 24,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 40,
              height: 40,
              borderRadius: 8,
              background: config.bg,
              color: config.color,
              flexShrink: 0,
            }}
          >
            {config.icon}
          </div>
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: 16,
                fontWeight: 600,
                color: C.text,
              }}
            >
              {title}
            </h2>
          </div>
        </div>

        {/* Message */}
        <p
          style={{
            margin: "0 0 24px 0",
            fontSize: 14,
            color: C.muted,
            lineHeight: 1.5,
          }}
        >
          {message}
        </p>

        {/* Buttons */}
        <div
          style={{
            display: "flex",
            gap: 8,
            flexDirection: buttons.length > 2 ? "column" : "row",
          }}
        >
          {buttons.map((btn, i) => {
            let bgColor = C.gold;
            let textColor = C.dark;

            if (btn.style === "secondary") {
              bgColor = C.dark3;
              textColor = C.text;
            } else if (btn.style === "danger") {
              bgColor = C.red;
              textColor = "white";
            }

            return (
              <button
                key={i}
                onClick={() => {
                  btn.onClick();
                  if (onClose) onClose();
                }}
                style={{
                  background: bgColor,
                  color: textColor,
                  border: btn.style === "secondary" ? `1px solid ${C.border}` : "none",
                  borderRadius: 6,
                  padding: "10px 16px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  transition: "all 0.2s",
                  flex: buttons.length > 2 ? 1 : undefined,
                }}
                onMouseEnter={(e) => {
                  if (btn.style === "secondary") {
                    e.currentTarget.style.background = C.dark4;
                  }
                }}
                onMouseLeave={(e) => {
                  if (btn.style === "secondary") {
                    e.currentTarget.style.background = C.dark3;
                  }
                }}
              >
                {btn.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
