"use client";
import { useState, useMemo } from "react";

function fmt(n: number) {
  return Math.round(n).toLocaleString("fr-FR");
}

interface BetRow {
  n: number;
  mise: number;
  gain: number;
  newBal: number;
  pct: number;
  isMilestone: boolean;
  isGoal: boolean;
}

export function CompoundBetBanner() {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(1000);
  const [odd, setOdd] = useState(1.5);
  const [goal, setGoal] = useState(100000);

  const { rows, bets, mult } = useMemo(() => {
    let balance = start;
    let bets = 0;
    const rows: BetRow[] = [];
    const MAX = 50;

    while (balance < goal && bets < MAX) {
      const mise = balance;
      const gain = mise * odd;
      bets++;
      const prev = balance;
      balance = gain;
      const pct = Math.min(100, Math.round((balance / goal) * 100));
      const isMilestone = [10, 25, 50, 75].some(
        (p) => prev < goal * (p / 100) && balance >= goal * (p / 100)
      );
      const isGoal = balance >= goal;
      rows.push({ n: bets, mise: prev, gain: gain - prev, newBal: balance, pct, isMilestone, isGoal });
      if (isGoal) break;
    }

    const mult = Math.round(goal / start);
    return { rows, bets, mult };
  }, [start, odd, goal]);

  const finalBal = rows.length ? rows[rows.length - 1].newBal : start;

  return (
    <>
      <style>{`
        .cb-wrap { font-family: 'DM Sans', sans-serif; margin-bottom: 16px; }

        /* ── Toggle button ── */
        .cb-toggle {
          margin: 10px 16px;
          background: linear-gradient(135deg, #0A1628 0%, #3c260d 60%, #0A1628 100%);
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
        .cb-toggle:hover {
          border-color: #FFD700;
          box-shadow: 0 0 0 1px #FFD70030;
        }
        .cb-toggle-left { display: flex; align-items: center; gap: 12px; }
        .cb-toggle-icon {
          width: 38px; height: 38px; border-radius: 10px;
          background: rgba(255,215,0,0.1); border: 1px solid rgba(255,215,0,0.2);
          display: flex; align-items: center; justify-content: center;
          font-size: 18px; flex-shrink: 0;
        }
        .cb-toggle-label {
          font-size: 10px; letter-spacing: 2px; text-transform: uppercase;
          color: #42A5F5; margin-bottom: 3px;
        }
        .cb-toggle-title {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 18px; color: #fff; letter-spacing: 1px; line-height: 1;
        }
        .cb-toggle-title span { color: #FFD700; }
        .cb-toggle-right { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
        .cb-toggle-badge {
          font-size: 10px; font-weight: 700; letter-spacing: "1px";
          color: #FFD700; background: rgba(255,215,0,0.1);
          border: 1px solid rgba(255,215,0,0.25);
          border-radius: 5px; padding: 3px 8px; white-space: nowrap;
        }
        .cb-toggle-chevron {
          width: 24px; height: 24px; border-radius: 6px;
          background: rgba(255,255,255,0.06); border: 1px solid #2A3140;
          display: flex; align-items: center; justify-content: center;
          color: #7A8399; font-size: 12px;
          transition: transform 0.25s ease;
        }
        .cb-toggle-chevron.open { transform: rotate(180deg); }

        /* ── Collapsible body ── */
        .cb-body {
          overflow: hidden;
          max-height: 0;
          transition: max-height 0.4s ease, opacity 0.3s ease;
          opacity: 0;
          padding: 18px 20px;
        }
        .cb-body.open {
          max-height: 9999px;
          opacity: 1;
        }
        .cb-inner { padding: 12px 0 4px; }

        /* ── Content styles (same as before) ── */
        .cb-hero {
          background: #0D1F3C; border: 1px solid #1A3A6B;
          border-radius: 14px; padding: 20px; margin-bottom: 12px; text-align: center;
        }
        .cb-hero-sub { font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: #42A5F5; margin-bottom: 8px; }
        .cb-hero-title { font-family: 'Bebas Neue', sans-serif; font-size: 30px; color: #fff; letter-spacing: 2px; line-height: 1; margin-bottom: 4px; }
        .cb-hero-title span { color: #FFD700; }
        .cb-hero-desc { font-size: 12px; color: #7A9CC0; line-height: 1.5; }
        .cb-card { background: #1A1F26; border: 1px solid #2A3140; border-radius: 12px; padding: 18px; margin-bottom: 12px; }
        .cb-card-title { font-size: 13px; font-weight: 600; color: #E8EAF0; margin-bottom: 14px; }
        .cb-ctrl-row { display: flex; gap: 14px; flex-wrap: wrap; margin-bottom: 16px; }
        .cb-ctrl { flex: 1; min-width: 120px; display: flex; flex-direction: column; gap: 5px; }
        .cb-ctrl label { font-size: 9px; letter-spacing: 2px; text-transform: uppercase; color: #7A8399; }
        .cb-ctrl input[type=range] { width: 100%; accent-color: #1565C0; }
        .cb-ctrl span { font-family: 'Bebas Neue', sans-serif; font-size: 18px; color: #E8EAF0; letter-spacing: 1px; }
        .cb-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px,1fr)); gap: 8px; margin-bottom: 14px; }
        .cb-metric { background: #111418; border: 1px solid #2A3140; border-radius: 8px; padding: 10px 12px; }
        .cb-metric-lbl { font-size: 9px; letter-spacing: 1.5px; text-transform: uppercase; color: #7A8399; margin-bottom: 5px; }
        .cb-metric-val { font-family: 'Bebas Neue', sans-serif; font-size: 22px; letter-spacing: 1px; line-height: 1; }
        .cb-metric-sub { font-size: 10px; color: #7A8399; margin-top: 3px; }
        .cb-bar-track { width: 100%; height: 10px; background: #111418; border-radius: 5px; overflow: hidden; border: 1px solid #2A3140; }
        .cb-bar-fill { height: 100%; border-radius: 5px; background: #1565C0; transition: width 0.5s ease; }
        .cb-table-wrap { overflow-x: auto; }
        .cb-table { width: 100%; border-collapse: collapse; font-size: 12px; min-width: 300px; }
        .cb-table th { text-align: left; font-size: 9px; letter-spacing: 1.5px; text-transform: uppercase; color: #7A8399; padding: 6px 8px; border-bottom: 1px solid #2A3140; font-weight: 600; }
        .cb-table td { padding: 8px 8px; border-bottom: 1px solid #111418; color: #E8EAF0; }
        .cb-table tr.milestone td { background: rgba(255,215,0,0.06); }
        .cb-table tr.goal td { background: rgba(29,158,117,0.12); color: #6FCFB0; font-weight: 600; }
        .cb-warn { background: rgba(186,117,23,0.1); border-left: 3px solid #BA7517; border-radius: 0 8px 8px 0; padding: 10px 14px; font-size: 12px; color: #EF9F27; line-height: 1.5; margin-bottom: 12px; }
        .cb-green { background: rgba(29,158,117,0.1); border-left: 3px solid #1D9E75; border-radius: 0 8px 8px 0; padding: 12px 16px; font-size: 13px; color: #6FCFB0; line-height: 1.6; margin-top: 4px; }
        @media (max-width: 480px) {
          .cb-metric-val { font-size: 18px; }
          .cb-table { font-size: 11px; }
          .cb-table td, .cb-table th { padding: 6px 4px; }
          .cb-hero-title { font-size: 24px; }
        }
      `}</style>

      <div className="cb-wrap">

        {/* ── Toggle Button ─────────────────────────────────────────────────── */}
        <button className="cb-toggle" onClick={() => setOpen((v) => !v)}>
          <div className="cb-toggle-left">
            <div className="cb-toggle-icon">🚀</div>
            <div>
              <div className="cb-toggle-label">Stratégie · Capitalisation</div>
              <div className="cb-toggle-title">
                De <span>{fmt(start)}</span> à <span>{fmt(goal)}</span> FCFA
              </div>
            </div>
          </div>
          <div className="cb-toggle-right">
            <div className="cb-toggle-badge">
              {bets} paris · x{mult}
            </div>
            <div className={`cb-toggle-chevron${open ? " open" : ""}`}>▾</div>
          </div>
        </button>

        {/* ── Collapsible Content ────────────────────────────────────────────── */}
        <div className={`cb-body${open ? " open" : ""}`}>
          <div className="cb-inner">

            {/* Hero */}
            <div className="cb-hero">
              <div className="cb-hero-sub">🚀 Le pouvoir de la capitalisation</div>
              <div className="cb-hero-title">
                De <span>{fmt(start)}</span> à <span>{fmt(goal)}</span> FCFA
              </div>
              <div className="cb-hero-desc">
                Tu mises tout à chaque fois. Chaque victoire devient ta prochaine mise.
              </div>
            </div>

            {/* Controls + metrics */}
            <div className="cb-card">
              <div className="cb-card-title">⚙️ Configure ta stratégie</div>
              <div className="cb-ctrl-row">
                <div className="cb-ctrl">
                  <label>Mise de départ</label>
                  <input type="range" min={500} max={10000} step={500}
                    value={start} onChange={(e) => setStart(Number(e.target.value))} />
                  <span>{fmt(start)} FCFA</span>
                </div>
                <div className="cb-ctrl">
                  <label>Cote par pari</label>
                  <input type="range" min={1.1} max={3.0} step={0.1}
                    value={odd} onChange={(e) => setOdd(Number(e.target.value))} />
                  <span>{odd.toFixed(2)}</span>
                </div>
                <div className="cb-ctrl">
                  <label>Objectif retrait</label>
                  <input type="range" min={10000} max={500000} step={10000}
                    value={goal} onChange={(e) => setGoal(Number(e.target.value))} />
                  <span>{fmt(goal)} FCFA</span>
                </div>
              </div>

              <div className="cb-grid">
                {[
                  { label: "Départ", val: fmt(start), sub: "FCFA", color: "#1565C0" },
                  { label: "Paris gagnants", val: String(bets), sub: "pour atteindre l'objectif", color: "#E8EAF0" },
                  { label: "Objectif", val: fmt(goal), sub: "FCFA à retirer", color: "#FFD700" },
                  { label: "Multiplicateur", val: `x${mult}`, sub: "ton argent initial", color: "#1D9E75" },
                ].map((m) => (
                  <div className="cb-metric" key={m.label}>
                    <div className="cb-metric-lbl">{m.label}</div>
                    <div className="cb-metric-val" style={{ color: m.color }}>{m.val}</div>
                    <div className="cb-metric-sub">{m.sub}</div>
                  </div>
                ))}
              </div>

              {/* Progress bar */}
              <div style={{ marginBottom: 4 }}>
                <div style={{ fontSize: 10, color: "#7A8399", marginBottom: 5, textTransform: "uppercase", letterSpacing: "1px" }}>
                  Progression vers l'objectif
                </div>
                <div className="cb-bar-track">
                  <div className="cb-bar-fill" style={{ width: "3%" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#7A8399", marginTop: 5 }}>
                  <span>{fmt(start)} FCFA</span>
                  <span>{fmt(goal / 2)} FCFA</span>
                  <span>{fmt(goal)} FCFA</span>
                </div>
              </div>
            </div>

            {/* Warning */}
            {bets >= 15 && (
              <div className="cb-warn">
                ⚠️ Il faut beaucoup de paris consécutifs gagnants. Plus la cote est élevée, moins tu en as besoin — mais le risque augmente aussi.
              </div>
            )}

            {/* Table */}
            <div className="cb-card">
              <div className="cb-card-title">📈 Chaque pari, ton argent grandit</div>
              <div className="cb-table-wrap">
                <table className="cb-table">
                  <thead>
                    <tr>
                      <th>Pari</th>
                      <th>Mise</th>
                      <th>Gain</th>
                      <th>Nouveau solde</th>
                      <th>Progression</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.n} className={r.isGoal ? "goal" : r.isMilestone ? "milestone" : ""}>
                        <td style={{ fontWeight: 600 }}>#{r.n}</td>
                        <td>{fmt(r.mise)} F</td>
                        <td style={{ color: "#FFD700" }}>+{fmt(r.gain)} F</td>
                        <td style={{ color: r.isGoal ? "#6FCFB0" : "#22C55E", fontWeight: r.isGoal ? 700 : 400 }}>
                          {fmt(r.newBal)} F
                        </td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <div style={{ width: 60, height: 6, background: "#2A3140", borderRadius: 3, overflow: "hidden" }}>
                              <div style={{ width: `${r.pct}%`, height: "100%", background: r.isGoal ? "#1D9E75" : "#1565C0", borderRadius: 3 }} />
                            </div>
                            <span style={{ fontSize: 10, color: r.isGoal ? "#6FCFB0" : "#7A8399" }}>
                              {r.pct}%{r.isGoal ? " 🎉" : ""}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Conclusion */}
            <div className="cb-green">
              En partant de <strong>{fmt(start)} FCFA</strong> et en misant tout à chaque fois à cote{" "}
              <strong>{odd.toFixed(2)}</strong>, il te faut seulement{" "}
              <strong>{bets} paris gagnants consécutifs</strong> pour atteindre{" "}
              <strong>{fmt(Math.round(finalBal))} FCFA</strong> — soit{" "}
              <strong>x{mult} ton investissement initial</strong>. 🚀
            </div>

          </div>
        </div>
      </div>
    </>
  );
}