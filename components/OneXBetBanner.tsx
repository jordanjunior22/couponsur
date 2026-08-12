"use client";
import { useState } from "react";

export function OneXBetBanner() {
  const [copied, setCopied] = useState(false);
  const CODE = "COUPONSURVIP";

  const copy = () => {
    navigator.clipboard.writeText(CODE).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <>
      <style>{`
        @keyframes xbet-blink {
          0%, 100% { border-color: #1A3A6B; }
          50% { border-color: #42A5F5; }
        }
        .xbet-banner {
          margin: 8px 16px;
          background: linear-gradient(135deg, #0A1628 0%, #0D1F3C 60%, #0A1628 100%);
          border: 1px solid #1A3A6B;
          border-left: 3px solid #1565C0;
          border-radius: 10px;
          padding: 10px 14px;
          display: flex;
          align-items: center;
          gap: 12px;
          cursor: pointer;
          transition: border-color 0.2s;
          animation: xbet-blink 2.2s ease-in-out infinite;
        }
        .xbet-banner:hover {
          border-color: #1976D2;
          animation-play-state: paused;
        }
        .xbet-logo {
          background: #1565C0;
          border-radius: 6px;
          padding: 5px 10px;
          font-family: 'Bebas Neue', sans-serif;
          font-size: 15px;
          color: #fff;
          letter-spacing: 1.5px;
          flex-shrink: 0;
          line-height: 1;
        }
        .xbet-logo .x { color: #FFD700; }
        .xbet-body {
          flex: 1;
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .xbet-bonus {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 15px;
          color: #fff;
          letter-spacing: 1px;
          white-space: nowrap;
        }
        .xbet-bonus .pct { color: #FFD700; }
        .xbet-divider {
          width: 1px;
          height: 14px;
          background: #1A3A6B;
          flex-shrink: 0;
        }
        .xbet-code-row {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .xbet-code-label {
          font-size: 9px;
          color: #4A6A8A;
          text-transform: uppercase;
          letter-spacing: 1px;
          white-space: nowrap;
        }
        .xbet-code {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 13px;
          letter-spacing: 2px;
          padding: 2px 8px;
          border-radius: 4px;
          border: 1px dashed rgba(255,215,0,0.5);
          background: rgba(255,215,0,0.08);
          color: #FFD700;
          white-space: nowrap;
          transition: all 0.2s;
        }
        .xbet-code.success {
          color: #22C55E;
          border-color: rgba(34,197,94,0.5);
          background: rgba(34,197,94,0.08);
        }
        .xbet-cta {
          background: #1565C0;
          color: #fff;
          border: none;
          border-radius: 6px;
          padding: 6px 12px;
          font-family: 'Bebas Neue', sans-serif;
          font-size: 12px;
          letter-spacing: 1.5px;
          cursor: pointer;
          flex-shrink: 0;
          white-space: nowrap;
          transition: background 0.15s;
        }
        .xbet-cta:hover { background: #1976D2; }

        @media (prefers-reduced-motion: reduce) {
          .xbet-banner { animation: none; }
        }
        @media (max-width: 400px) {
          .xbet-divider { display: none; }
          .xbet-code-label { display: none; }
        }
      `}</style>

      <div className="xbet-banner" onClick={copy}>
        <div className="xbet-logo">1<span className="x">X</span>BET</div>

        <div className="xbet-body">
          <span className="xbet-bonus">Bonus <span className="pct">+200%</span></span>
          <div className="xbet-divider" />
          <div className="xbet-code-row">
            <span className="xbet-code-label">Code :</span>
            <span className={`xbet-code ${copied ? "success" : ""}`}>{CODE}</span>
          </div>
        </div>

        <button className="xbet-cta" onClick={(e) => { e.stopPropagation(); copy(); }}>
          {copied ? "✓ Copié" : "Copier"}
        </button>
      </div>
    </>
  );
}