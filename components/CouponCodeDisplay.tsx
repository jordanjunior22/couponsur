import { useState } from "react";

interface CouponCodeDisplayProps {
  code: string;
  broker: string;
}

const C = {
  gold: "#C9A84C",
  muted: "#7A8399",
};

export default function CouponCodeDisplay({ code, broker }: CouponCodeDisplayProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{
      fontSize: "10px",
      color: C.gold,
      marginTop: 8,
      padding: "6px 8px",
      background: "rgba(201,168,76,0.08)",
      borderRadius: 4,
      fontFamily: "monospace",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 6,
      flexWrap: "wrap",
    }}>
      <span>Code {broker}: <strong>{code}</strong></span>
      <button
        onClick={handleCopy}
        style={{
          background: "rgba(201,168,76,0.15)",
          border: `1px solid ${C.gold}40`,
          color: C.gold,
          borderRadius: 3,
          padding: "2px 6px",
          fontSize: 9,
          cursor: "pointer",
          fontWeight: 600,
          whiteSpace: "nowrap",
          transition: "all 0.2s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(201,168,76,0.25)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "rgba(201,168,76,0.15)";
        }}
      >
        {copied ? "✓ Copié" : "Copier"}
      </button>
    </div>
  );
}
