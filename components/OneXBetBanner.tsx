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
        .xbet-banner {
          margin: 0 16px;
          background: linear-gradient(135deg, #0A1628 0%, #0D1F3C 60%, #0A1628 100%);
          border: 1px solid #1A3A6B;
          border-left: 5px solid #1565C0;
          border-radius: 14px;
          padding: 18px 20px;
          display: flex;
          align-items: center;
          gap: 16px;
          cursor: pointer;
          overflow: hidden;
          position: relative;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .xbet-banner:hover {
          border-color: #1976D2;
          box-shadow: 0 0 24px rgba(21,101,192,0.25);
        }
        .xbet-banner::before {
          content: '';
          position: absolute;
          top: -50px; right: -50px;
          width: 200px; height: 200px;
          border-radius: 50%;
          background: rgba(21,101,192,0.07);
          pointer-events: none;
        }
        .xbet-logo {
          background: #1565C0;
          border-radius: 10px;
          padding: 10px 14px;
          font-family: 'Bebas Neue', sans-serif;
          font-size: 22px;
          color: #fff;
          letter-spacing: 2px;
          flex-shrink: 0;
          line-height: 1;
          border: 1px solid #1976D2;
        }
        .xbet-logo .x { color: #FFD700; }
        .xbet-body { flex: 1; min-width: 0; }
        .xbet-tag {
          font-size: 9px;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: #42A5F5;
          font-weight: 700;
          margin-bottom: 5px;
        }
        .xbet-title {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 24px;
          color: #FFFFFF;
          letter-spacing: 1.5px;
          line-height: 1;
          margin-bottom: 8px;
        }
        .xbet-title .bonus { color: #FFD700; }
        .xbet-code-row {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .xbet-code-label {
          font-size: 10px;
          color: #7A9CC0;
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        .xbet-code {
          background: rgba(255,215,0,0.1);
          border: 1.5px dashed rgba(255,215,0,0.55);
          border-radius: 6px;
          padding: 4px 14px;
          font-family: 'Bebas Neue', sans-serif;
          font-size: 16px;
          letter-spacing: 3px;
          transition: all 0.2s;
        }
        .xbet-code.default { color: #FFD700; }
        .xbet-code.success {
          color: #22C55E;
          border-color: rgba(34,197,94,0.6);
          background: rgba(34,197,94,0.08);
        }
        .xbet-copied {
          font-size: 10px;
          color: #22C55E;
          font-weight: 700;
        }
        .xbet-sub {
          font-size: 10px;
          color: #4A6A8A;
          margin-top: 8px;
        }
        .xbet-cta {
          background: #1565C0;
          color: #fff;
          border: 1px solid #1976D2;
          border-radius: 8px;
          padding: 12px 18px;
          font-family: 'Bebas Neue', sans-serif;
          font-size: 14px;
          letter-spacing: 2px;
          cursor: pointer;
          flex-shrink: 0;
          transition: background 0.15s;
          white-space: nowrap;
        }
        .xbet-cta:hover { background: #1976D2; }

        @media (max-width: 540px) {
          .xbet-banner {
            flex-direction: column;
            align-items: flex-start;
            gap: 12px;
            padding: 16px;
          }
          .xbet-top-row {
            display: flex;
            align-items: center;
            gap: 12px;
            width: 100%;
          }
          .xbet-title { font-size: 20px; }
          .xbet-cta { width: 100%; text-align: center; }
        }

        @media (min-width: 541px) {
          .xbet-top-row { display: contents; }
        }
      `}</style>

      <div className="xbet-banner" onClick={copy}>
        <div className="xbet-top-row">
          <div className="xbet-logo">
            1<span className="x">X</span>BET
          </div>
          <div className="xbet-body">
            <div className="xbet-tag">🎁 Offre exclusive · Partenaire officiel</div>
            <div className="xbet-title">
              Bonus <span className="bonus">+200%</span> sur votre 1er dépôt
            </div>
            <div className="xbet-code-row">
              <span className="xbet-code-label">Code promo :</span>
              <span className={`xbet-code ${copied ? "success" : "default"}`}>
                {CODE}
              </span>
              {copied && <span className="xbet-copied">✓ Copié !</span>}
            </div>
            <div className="xbet-sub">
              Appuyez pour copier · Conditions 1xBet applicables
            </div>
          </div>
        </div>

        <button
          className="xbet-cta"
          onClick={(e) => { e.stopPropagation(); copy(); }}
        >
          {copied ? "✓ Copié !" : "Copier le code"}
        </button>
      </div>
    </>
  );
}