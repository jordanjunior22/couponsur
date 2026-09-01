"use client";
import { Fragment, useState, useMemo } from "react";

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

// Safety cap on the simulation loop — at low risk % combined with a low
// odd, the balance can grow so slowly that "reaching the goal" would take
// an unreasonable number of consecutive wins. We stop here and say so,
// rather than simulate thousands of rows.
const MAX_BETS = 500;

// Presets shown as quick-pick chips. 10% is the recommended default —
// the whole point of this rework is that a buyer no longer has to stake
// their entire balance (100%, the old "tout miser" behavior) to see their
// capital grow; a fixed, small fraction per bet means one loss never
// wipes them out.
const RISK_PRESETS = [
  { value: 5, label: "5%" },
  { value: 10, label: "10%", recommended: true },
  { value: 20, label: "20%" },
  { value: 50, label: "50%" },
  { value: 100, label: "100% (tout)", danger: true },
];

// Condenses a long simulation down to a readable table: the first few
// bets, every milestone/goal row, and the last few — instead of
// rendering hundreds of rows when low risk + low odds make the climb
// slow. Gaps in the bet number sequence are marked so the reader knows
// rows were skipped, not that the data is missing.
function sampleRows(rows: BetRow[], maxShown = 24): (BetRow & { gapBefore?: boolean })[] {
  if (rows.length <= maxShown) return rows;
  const edgeCount = 6;
  const head = rows.slice(0, edgeCount);
  const tail = rows.slice(-edgeCount);
  const middle = rows.filter((r, i) => i >= edgeCount && i < rows.length - edgeCount && (r.isMilestone || r.isGoal));
  const byN = new Map<number, BetRow>();
  [...head, ...middle, ...tail].forEach((r) => byN.set(r.n, r));
  const sorted = [...byN.values()].sort((a, b) => a.n - b.n);
  return sorted.map((r, i) => ({ ...r, gapBefore: i > 0 && r.n - sorted[i - 1].n > 1 }));
}

export function CompoundBetBanner() {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(10000);
  const [odd, setOdd] = useState(1.5);
  const [goal, setGoal] = useState(100000);
  const [riskPct, setRiskPct] = useState(10);

  const { rows, bets, mult, reached } = useMemo(() => {
    let balance = start;
    let bets = 0;
    const rows: BetRow[] = [];
    const stakeFraction = riskPct / 100;

    while (balance < goal && bets < MAX_BETS) {
      const mise = balance * stakeFraction;
      const profit = mise * (odd - 1);
      bets++;
      const prev = balance;
      balance = balance + profit;
      const pct = Math.min(100, Math.round((balance / goal) * 100));
      const isMilestone = [10, 25, 50, 75].some(
        (p) => prev < goal * (p / 100) && balance >= goal * (p / 100)
      );
      const isGoal = balance >= goal;
      rows.push({ n: bets, mise, gain: profit, newBal: balance, pct, isMilestone, isGoal });
      if (isGoal) break;
    }

    const finalBal = rows.length ? rows[rows.length - 1].newBal : start;
    const mult = Math.round((finalBal / start) * 10) / 10;
    const reached = rows.length > 0 && rows[rows.length - 1].isGoal;
    return { rows, bets, mult, reached };
  }, [start, odd, goal, riskPct]);

  const finalBal = rows.length ? rows[rows.length - 1].newBal : start;
  const displayRows = useMemo(() => sampleRows(rows), [rows]);
  const firstStake = rows[0]?.mise ?? start * (riskPct / 100);

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
        .cb-table-wrap { overflow-x: auto; max-height: 420px; overflow-y: auto; }
        .cb-table { width: 100%; border-collapse: collapse; font-size: 12px; min-width: 300px; }
        .cb-table th { text-align: left; font-size: 9px; letter-spacing: 1.5px; text-transform: uppercase; color: #7A8399; padding: 6px 8px; border-bottom: 1px solid #2A3140; font-weight: 600; position: sticky; top: 0; background: #1A1F26; }
        .cb-table td { padding: 8px 8px; border-bottom: 1px solid #111418; color: #E8EAF0; }
        .cb-table tr.milestone td { background: rgba(255,215,0,0.06); }
        .cb-table tr.goal td { background: rgba(29,158,117,0.12); color: #6FCFB0; font-weight: 600; }
        .cb-table tr.gap td { color: #4A5568; font-size: 10px; text-align: center; letter-spacing: 2px; }
        .cb-warn { background: rgba(186,117,23,0.1); border-left: 3px solid #BA7517; border-radius: 0 8px 8px 0; padding: 10px 14px; font-size: 12px; color: #EF9F27; line-height: 1.5; margin-bottom: 12px; }
        .cb-green { background: rgba(29,158,117,0.1); border-left: 3px solid #1D9E75; border-radius: 0 8px 8px 0; padding: 12px 16px; font-size: 13px; color: #6FCFB0; line-height: 1.6; margin-top: 4px; }
        .cb-shield { background: rgba(21,101,192,0.1); border-left: 3px solid #1565C0; border-radius: 0 8px 8px 0; padding: 12px 16px; font-size: 12px; color: #8DB8E8; line-height: 1.6; margin-bottom: 12px; }
        .cb-risk-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
        .cb-risk-chip {
          background: #111418; border: 1px solid #2A3140; border-radius: 8px;
          padding: 8px 14px; font-size: 12px; font-weight: 700; color: #7A8399;
          cursor: pointer; transition: all 0.15s; font-family: inherit;
        }
        .cb-risk-chip.active { background: rgba(21,101,192,0.15); border-color: #1565C0; color: #42A5F5; }
        .cb-risk-chip.active.danger { background: rgba(239,68,68,0.12); border-color: #EF4444; color: #EF4444; }
        .cb-risk-chip .rec { display: block; font-size: 8px; letter-spacing: 1px; text-transform: uppercase; color: #22C55E; margin-top: 2px; }
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
            <div className="cb-toggle-icon">🛡️</div>
            <div>
              <div className="cb-toggle-label">Stratégie · Gestion du risque</div>
              <div className="cb-toggle-title">
                De <span>{fmt(start)}</span> à <span>{fmt(goal)}</span> FCFA
              </div>
            </div>
          </div>
          <div className="cb-toggle-right">
            <div className="cb-toggle-badge">
              {riskPct}% / pari · {reached ? `${bets} paris` : `500+ paris`}
            </div>
            <div className={`cb-toggle-chevron${open ? " open" : ""}`}>▾</div>
          </div>
        </button>

        {/* ── Collapsible Content ────────────────────────────────────────────── */}
        <div className={`cb-body${open ? " open" : ""}`}>
          <div className="cb-inner">

            {/* Hero */}
            <div className="cb-hero">
              <div className="cb-hero-sub">🛡️ Fais grandir ton capital sans jamais tout risquer</div>
              <div className="cb-hero-title">
                De <span>{fmt(start)}</span> à <span>{fmt(goal)}</span> FCFA
              </div>
              <div className="cb-hero-desc">
                Tu ne risques que {riskPct}% de ton capital à chaque pari. Le reste ({100 - riskPct}%) reste toujours protégé.
              </div>
            </div>

            {/* Risk management */}
            <div className="cb-card">
              <div className="cb-card-title">🛡️ Combien risquer par pari ?</div>
              <div className="cb-risk-row">
                {RISK_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    className={`cb-risk-chip${riskPct === p.value ? " active" : ""}${p.danger ? " danger" : ""}`}
                    onClick={() => setRiskPct(p.value)}
                  >
                    {p.label}
                    {p.recommended && <span className="rec">Recommandé</span>}
                  </button>
                ))}
              </div>
              <div className="cb-shield">
                🛡️ À {riskPct}% par pari, ta mise de départ est de <strong>{fmt(firstStake)} FCFA</strong>.
                Si tu perds ce pari, il te reste <strong>{100 - riskPct}%</strong> de ton capital pour continuer —
                {riskPct >= 100
                  ? " contrairement à une mise à 100%, où une seule défaite efface tout ton capital."
                  : " une stratégie \"tout miser\" (100%), elle, peut tout perdre en un seul pari raté."}
              </div>
            </div>

            {/* Controls + metrics */}
            <div className="cb-card">
              <div className="cb-card-title">⚙️ Configure ta stratégie</div>
              <div className="cb-ctrl-row">
                <div className="cb-ctrl">
                  <label>Mise de départ</label>
                  <input type="range" min={1000} max={1000000} step={1000}
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
                  <input type="range" min={10000} max={2000000} step={10000}
                    value={goal} onChange={(e) => setGoal(Number(e.target.value))} />
                  <span>{fmt(goal)} FCFA</span>
                </div>
              </div>

              <div className="cb-grid">
                {[
                  { label: "Départ", val: fmt(start), sub: "FCFA", color: "#1565C0" },
                  { label: "Mise / pari", val: `${riskPct}%`, sub: `≈ ${fmt(firstStake)} FCFA au départ`, color: "#42A5F5" },
                  { label: "Paris gagnants", val: reached ? String(bets) : `500+`, sub: reached ? "pour atteindre l'objectif" : "objectif non atteint", color: "#E8EAF0" },
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
                  Progression vers l&apos;objectif
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
            {!reached ? (
              <div className="cb-warn">
                ⚠️ Avec une mise de {riskPct}% et une cote de {odd.toFixed(2)}, la croissance est trop lente pour
                atteindre l&apos;objectif en un nombre raisonnable de paris. Augmente la mise, la cote, ou réduis l&apos;objectif.
              </div>
            ) : bets >= 40 && (
              <div className="cb-warn">
                ⚠️ Il faut {bets} paris consécutifs gagnants. C&apos;est le prix de la sécurité : plus la mise par pari est
                petite, plus la progression est lente — mais ton capital ne peut jamais partir en un seul pari perdu.
              </div>
            )}

            {/* Table */}
            <div className="cb-card">
              <div className="cb-card-title">📈 Chaque pari, ton argent grandit — en sécurité</div>
              <div className="cb-table-wrap">
                <table className="cb-table">
                  <thead>
                    <tr>
                      <th>Pari</th>
                      <th>Mise ({riskPct}%)</th>
                      <th>Gain</th>
                      <th>Nouveau solde</th>
                      <th>Progression</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayRows.map((r) => (
                      <Fragment key={r.n}>
                        {r.gapBefore && (
                          <tr className="gap"><td colSpan={5}>⋯</td></tr>
                        )}
                        <tr className={r.isGoal ? "goal" : r.isMilestone ? "milestone" : ""}>
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
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Conclusion */}
            {reached ? (
              <div className="cb-green">
                En partant de <strong>{fmt(start)} FCFA</strong> et en risquant seulement{" "}
                <strong>{riskPct}% de ton capital</strong> à chaque pari à cote <strong>{odd.toFixed(2)}</strong>, il te faut{" "}
                <strong>{bets} paris gagnants consécutifs</strong> pour atteindre{" "}
                <strong>{fmt(Math.round(finalBal))} FCFA</strong> — soit{" "}
                <strong>x{mult} ton investissement initial</strong>, sans jamais exposer tout ton capital en un seul pari. 🛡️
              </div>
            ) : (
              <div className="cb-green">
                Après {MAX_BETS} paris à {riskPct}% et cote {odd.toFixed(2)}, ton capital serait de{" "}
                <strong>{fmt(Math.round(finalBal))} FCFA</strong> (x{mult}) — augmente la mise ou la cote pour
                atteindre {fmt(goal)} FCFA plus vite. 🛡️
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  );
}
