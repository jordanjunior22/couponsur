"use client";
import { useState, useEffect, useMemo } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────
interface ScrapedMatch {
    time: string;
    home: string;
    away: string;
    odd1: string;
    oddX: string;
    odd2: string;
    tip: string;
    goals: string;
    league: string;
    prediction: string;
}

interface CreatedPick {
    _id: string;
    title: string;
    price: number;
    total_odds: number;
    match_date: string;
    league: string;
    outcome: "PENDING" | "WIN" | "LOSS";
    is_published: boolean;
    matches: { prediction: string; outcome: "PENDING" | "WIN" | "LOSS" }[];
}

interface Props {
    onClose: () => void;
    onPickCreated: (pick: CreatedPick) => void;
}

// ─── Colors ───────────────────────────────────────────────────────────────────
const C = {
    dark: "#0A0C0F", dark2: "#111418", dark3: "#1A1F26", dark4: "#222830",
    border: "#2A3140", faint: "#3A4455", text: "#E8EAF0", muted: "#7A8399",
    gold: "#C9A84C", goldLight: "#E8C97A", goldDark: "#8A6A2A",
    green: "#22C55E", red: "#EF4444", blue: "#3B82F6",
};

const LEAGUES = [
    "Premier League", "Ligue 1", "La Liga", "Serie A",
    "Bundesliga", "UCL", "MLS", "Eredivisie", "Mix"
];

// ─── Tip color helper ─────────────────────────────────────────────────────────
function tipColor(tip: string): string {
    if (!tip) return C.muted;
    const t = tip.toUpperCase();
    if (t === "1") return C.green;
    if (t === "2") return C.red;
    if (t === "X") return C.gold;
    if (t === "BTTS") return "#A855F7";
    if (t.startsWith("O")) return "#06B6D4";
    if (t.startsWith("U")) return "#F97316";
    if (t === "DNB") return "#EC4899";
    return C.blue;
}

// ─── Map tip → betTypeCode ────────────────────────────────────────────────────
function betTypeFromTip(tip: string): string {
    const t = tip.toUpperCase();
    if (t === "BTTS") return "BTTS";
    if (t.startsWith("O")) return "OU25";
    if (t.startsWith("U")) return "OU25";
    if (t === "1X" || t === "X2" || t === "12") return "DC";
    return "1X2";
}

// ─── Step indicator ───────────────────────────────────────────────────────────
function Steps({ current }: { current: 1 | 2 }) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
            {[
                { n: 1, label: "Sélectionner les matchs" },
                { n: 2, label: "Configurer le pick" },
            ].map(({ n, label }, i) => (
                <div key={n} style={{ display: "flex", alignItems: "center", gap: 8, flex: i === 0 ? "none" : 1 }}>
                    <div style={{
                        width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center",
                        justifyContent: "center", fontSize: 11, fontWeight: 700,
                        background: current >= n ? C.gold : C.dark4,
                        color: current >= n ? C.dark : C.muted,
                        border: `1px solid ${current >= n ? C.gold : C.border}`,
                        flexShrink: 0,
                    }}>{n}</div>
                    <span style={{ fontSize: 11, color: current >= n ? C.text : C.muted, whiteSpace: "nowrap" }}>{label}</span>
                    {i === 0 && <div style={{ flex: 1, height: 1, background: current >= 2 ? C.goldDark : C.border, margin: "0 4px" }} />}
                </div>
            ))}
        </div>
    );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────
export default function SoccerVitalImportModal({ onClose, onPickCreated }: Props) {
    // ── State: scraping ────────────────────────────────────────────────────────
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [allMatches, setAllMatches] = useState<ScrapedMatch[]>([]);
    const [byLeague, setByLeague] = useState<Record<string, ScrapedMatch[]>>({});
    const [scrapedAt, setScrapedAt] = useState<string>("");

    // ── State: step 1 – selection ──────────────────────────────────────────────
    const [step, setStep] = useState<1 | 2>(1);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [leagueFilter, setLeagueFilter] = useState("ALL");
    const [search, setSearch] = useState("");

    // ── State: step 2 – pick config ────────────────────────────────────────────
    const [title, setTitle] = useState("");
    const [price, setPrice] = useState(2000);
    const [totalOdds, setTotalOdds] = useState(2.0);
    const [matchDate, setMatchDate] = useState(new Date().toISOString().split("T")[0]);
    const [league, setLeague] = useState("Mix");
    const [isPublished, setIsPublished] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    // ── Per-match tip overrides ────────────────────────────────────────────────
    const [tipOverrides, setTipOverrides] = useState<Record<string, string>>({});

    // ── Fetch matches on mount ─────────────────────────────────────────────────
    useEffect(() => {
        (async () => {
            try {
                setLoading(true);
                setError(null);
                const res = await fetch("/api/scrape-predictions");
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Erreur de scraping");
                setAllMatches(data.matches || []);
                setByLeague(data.byLeague || {});
                setScrapedAt(data.scrapedAt || "");
            } catch (e: unknown) {
                setError(e instanceof Error ? e.message : "Erreur inconnue");
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    // ── Filtered matches for step 1 ────────────────────────────────────────────
    const filteredMatches = useMemo(() => {
        return allMatches.filter((m) => {
            const matchesLeague = leagueFilter === "ALL" || m.league === leagueFilter;
            const q = search.toLowerCase();
            const matchesSearch = !q || m.home.toLowerCase().includes(q) || m.away.toLowerCase().includes(q) || m.league.toLowerCase().includes(q);
            return matchesLeague && matchesSearch;
        });
    }, [allMatches, leagueFilter, search]);

    // ── Selected match objects ─────────────────────────────────────────────────
    const selectedMatches = useMemo(
        () => allMatches.filter((m) => selected.has(`${m.home}|${m.away}`)),
        [allMatches, selected]
    );

    // ── Helper: get effective tip ──────────────────────────────────────────────
    const effectiveTip = (m: ScrapedMatch) =>
        tipOverrides[`${m.home}|${m.away}`] ?? m.tip;

    // ── Helper: get odd for a tip ──────────────────────────────────────────────
    const oddForTip = (m: ScrapedMatch, tip: string): number => {
        const t = tip.toUpperCase();
        if (t === "1") return parseFloat(m.odd1) || 1.5;
        if (t === "X") return parseFloat(m.oddX) || 3.0;
        if (t === "2") return parseFloat(m.odd2) || 2.0;
        if (t === "1X") return Math.min(parseFloat(m.odd1) || 1.5, parseFloat(m.oddX) || 3.0);
        if (t === "X2") return Math.min(parseFloat(m.oddX) || 3.0, parseFloat(m.odd2) || 2.0);
        if (t === "12") return Math.min(parseFloat(m.odd1) || 1.5, parseFloat(m.odd2) || 2.0);
        return 1.8;
    };

    // ── Auto-recalculate total odds ────────────────────────────────────────────
    useEffect(() => {
        if (selectedMatches.length === 0) return;
        const odds = selectedMatches.reduce((acc, m) => {
            const tip = tipOverrides[`${m.home}|${m.away}`] ?? m.tip;
            const o = oddForTip(m, tip);
            return acc * (isNaN(o) ? 1.8 : o);
        }, 1);
        setTotalOdds(parseFloat(odds.toFixed(2)));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selected, selectedMatches, tipOverrides]);

    // ── Auto-generate title ────────────────────────────────────────────────────
    useEffect(() => {
        if (selectedMatches.length === 0) return;

        const dateStr = matchDate
            ? new Date(matchDate + "T12:00:00").toLocaleDateString("fr-FR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
            })
            : "";

        const leagues = [...new Set(selectedMatches.map((m) => m.league))];
        const tips = [...new Set(selectedMatches.map((m) => tipOverrides[`${m.home}|${m.away}`] ?? m.tip))];

        let base = "";

        if (selectedMatches.length === 1) {
            base = `${leagues[0]} – Tip ${tips[0]}`;
        } else if (leagues.length === 1) {
            base = `${leagues[0]} – Combiné x${selectedMatches.length}`;
        } else {
            base = `Mix – Combiné x${selectedMatches.length}`;
        }

        setTitle(`${base} – ${dateStr}`);
    }, [selectedMatches, tipOverrides, matchDate]);

    // ── Seed tip overrides when entering step 2 ────────────────────────────────
    const goToStep2 = () => {
        const init: Record<string, string> = {};
        allMatches
            .filter((m) => selected.has(`${m.home}|${m.away}`))
            .forEach((m) => { init[`${m.home}|${m.away}`] = m.tip; });
        setTipOverrides(init);
        setStep(2);
    };

    // ── Toggle single match ────────────────────────────────────────────────────
    const toggleMatch = (m: ScrapedMatch) => {
        const key = `${m.home}|${m.away}`;
        setSelected((prev) => {
            const next = new Set(prev);
            next.has(key) ? next.delete(key) : next.add(key);
            return next;
        });
    };

    // ── Toggle all visible ─────────────────────────────────────────────────────
    const toggleAll = () => {
        const visibleKeys = new Set(filteredMatches.map((m) => `${m.home}|${m.away}`));
        const allSelected = filteredMatches.every((m) => selected.has(`${m.home}|${m.away}`));
        setSelected((prev) => {
            const next = new Set(prev);
            if (allSelected) {
                visibleKeys.forEach((k) => next.delete(k));
            } else {
                visibleKeys.forEach((k) => next.add(k));
            }
            return next;
        });
    };

    // ── Save pick to DB ────────────────────────────────────────────────────────
    const handleSave = async () => {
        if (!title.trim() || selectedMatches.length === 0) return;
        setSaving(true);
        setSaveError(null);

        const payload = {
            title: title.trim(),
            price,
            total_odds: totalOdds,
            match_date: matchDate,
            league,
            outcome: "PENDING",
            is_published: isPublished,
            pickType: "SIMPLE",
            matches: selectedMatches.map((m) => {
                const tip = tipOverrides[`${m.home}|${m.away}`] ?? m.tip;
                return {
                    prediction: `${m.home} vs ${m.away} – ${tip}`,  // ← e.g. "Bayern vs Dortmund – 1"
                    outcome: "PENDING",
                };
            }),
        };

        try {
            const res = await fetch("/api/picks", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);

            const created: CreatedPick = data.pick || data.data || data;
            onPickCreated(created);
            onClose();
        } catch (e: unknown) {
            setSaveError(e instanceof Error ? e.message : "Erreur lors de la sauvegarde");
        } finally {
            setSaving(false);
        }
    };

    // ─── Shared styles ─────────────────────────────────────────────────────────
    const iStyle: React.CSSProperties = {
        background: C.dark4, border: `1px solid ${C.border}`, borderRadius: 8,
        color: C.text, fontSize: 13, padding: "10px 12px", width: "100%",
        fontFamily: "inherit", outline: "none",
    };
    const lStyle: React.CSSProperties = {
        fontSize: 10, letterSpacing: "1.5px", color: C.muted,
        textTransform: "uppercase", fontWeight: 600, display: "block", marginBottom: 6,
    };

    const scrapedLeagues = Object.keys(byLeague).sort();
    const ALL_TIPS = ["1", "X", "2", "1X", "X2", "12", "BTTS", "O 2.5", "U 2.5", "O 1.5", "U 1.5", "DNB"];

    // ─── Render ────────────────────────────────────────────────────────────────
    return (
        <div
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: 16, backdropFilter: "blur(6px)" }}
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div style={{ background: C.dark2, border: `1px solid ${C.border}`, borderRadius: 16, width: "100%", maxWidth: 680, maxHeight: "94vh", display: "flex", flexDirection: "column" }}>

                {/* ── Header ────────────────────────────────────────────────────────── */}
                <div style={{ padding: "20px 24px 16px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                            <div style={{ fontSize: 10, letterSpacing: "2px", color: C.gold, textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>
                                ⚽ SoccerVital
                            </div>
                            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: C.text, letterSpacing: 1 }}>
                                Importer des Prédictions
                            </div>
                            {scrapedAt && (
                                <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>
                                    Données du {new Date(scrapedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                                    {allMatches.length > 0 && ` · ${allMatches.length} matchs disponibles`}
                                </div>
                            )}
                        </div>
                        <button
                            onClick={onClose}
                            style={{ background: C.dark4, border: `1px solid ${C.border}`, borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.muted, flexShrink: 0 }}
                        >
                            ✕
                        </button>
                    </div>
                    {!loading && !error && <Steps current={step} />}
                </div>

                {/* ── Body ──────────────────────────────────────────────────────────── */}
                <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>

                    {/* Loading */}
                    {loading && (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 0", gap: 16 }}>
                            <div style={{ width: 44, height: 44, border: `4px solid ${C.border}`, borderTopColor: C.gold, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                            <div style={{ fontSize: 12, color: C.muted, letterSpacing: "1px" }}>Récupération des prédictions…</div>
                            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                        </div>
                    )}

                    {/* Error */}
                    {!loading && error && (
                        <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 10, padding: 20, textAlign: "center" }}>
                            <div style={{ fontSize: 13, color: C.red, marginBottom: 12 }}>{error}</div>
                            <button
                                onClick={() => window.location.reload()}
                                style={{ background: C.dark4, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: "8px 16px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
                            >
                                Réessayer
                            </button>
                        </div>
                    )}

                    {/* ── STEP 1: Match Selection ──────────────────────────────────────── */}
                    {!loading && !error && step === 1 && (
                        <div>
                            {/* Filters */}
                            <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                                <input
                                    style={{ ...iStyle, flex: 1, minWidth: 140, fontSize: 12, padding: "8px 12px" }}
                                    placeholder="Rechercher un match…"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                />
                                <select
                                    style={{ ...iStyle, width: "auto", fontSize: 12, padding: "8px 12px", cursor: "pointer" }}
                                    value={leagueFilter}
                                    onChange={(e) => setLeagueFilter(e.target.value)}
                                >
                                    <option value="ALL">Toutes les ligues ({allMatches.length})</option>
                                    {scrapedLeagues.map((l) => (
                                        <option key={l} value={l}>{l} ({byLeague[l]?.length ?? 0})</option>
                                    ))}
                                </select>
                            </div>

                            {/* Select all row */}
                            {filteredMatches.length > 0 && (
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, padding: "6px 12px", background: C.dark3, borderRadius: 8, border: `1px solid ${C.border}` }}>
                                    <span style={{ fontSize: 11, color: C.muted }}>
                                        {selected.size} sélectionné{selected.size !== 1 ? "s" : ""} · {filteredMatches.length} affiché{filteredMatches.length !== 1 ? "s" : ""}
                                    </span>
                                    <button
                                        onClick={toggleAll}
                                        style={{ background: "none", border: "none", color: C.gold, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}
                                    >
                                        {filteredMatches.every((m) => selected.has(`${m.home}|${m.away}`)) ? "Tout désélectionner" : "Tout sélectionner"}
                                    </button>
                                </div>
                            )}

                            {filteredMatches.length === 0 && (
                                <div style={{ textAlign: "center", color: C.muted, fontSize: 13, padding: "40px 0" }}>
                                    Aucun match trouvé.
                                </div>
                            )}

                            {/* Grouped by league */}
                            {(() => {
                                const grouped: Record<string, ScrapedMatch[]> = {};
                                for (const m of filteredMatches) {
                                    if (!grouped[m.league]) grouped[m.league] = [];
                                    grouped[m.league].push(m);
                                }
                                return Object.entries(grouped).map(([lg, matches]) => (
                                    <div key={lg} style={{ marginBottom: 16 }}>
                                        <div style={{ fontSize: 9, letterSpacing: "2px", color: C.gold, textTransform: "uppercase", fontWeight: 700, padding: "4px 0 8px", borderBottom: `1px solid ${C.border}`, marginBottom: 6 }}>
                                            {lg} · {matches.length} match{matches.length !== 1 ? "s" : ""}
                                        </div>
                                        {matches.map((m) => {
                                            const key = `${m.home}|${m.away}`;
                                            const isSelected = selected.has(key);
                                            return (
                                                <button
                                                    key={key}
                                                    onClick={() => toggleMatch(m)}
                                                    style={{
                                                        display: "grid",
                                                        gridTemplateColumns: "24px 1fr auto auto auto",
                                                        alignItems: "center",
                                                        gap: 10,
                                                        width: "100%",
                                                        background: isSelected ? "rgba(201,168,76,0.07)" : C.dark4,
                                                        border: `1px solid ${isSelected ? C.goldDark : C.border}`,
                                                        borderLeft: `3px solid ${isSelected ? C.gold : C.border}`,
                                                        borderRadius: 8,
                                                        padding: "10px 12px",
                                                        marginBottom: 6,
                                                        cursor: "pointer",
                                                        textAlign: "left",
                                                        fontFamily: "inherit",
                                                        transition: "all 0.12s",
                                                    }}
                                                >
                                                    {/* Checkbox */}
                                                    <div style={{
                                                        width: 18, height: 18, borderRadius: 4, border: `1.5px solid ${isSelected ? C.gold : C.faint}`,
                                                        background: isSelected ? C.gold : "transparent",
                                                        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                                                    }}>
                                                        {isSelected && <span style={{ color: C.dark, fontSize: 10, fontWeight: 900 }}>✓</span>}
                                                    </div>

                                                    {/* Match name */}
                                                    <div>
                                                        <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>
                                                            {m.home} <span style={{ color: C.muted, fontWeight: 400 }}>vs</span> {m.away}
                                                        </div>
                                                        <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{m.time}</div>
                                                    </div>

                                                    {/* Tip badge */}
                                                    <div style={{
                                                        background: `${tipColor(m.tip)}18`, border: `1px solid ${tipColor(m.tip)}40`,
                                                        color: tipColor(m.tip), fontSize: 10, fontWeight: 700, letterSpacing: "1px",
                                                        padding: "3px 8px", borderRadius: 4, whiteSpace: "nowrap",
                                                    }}>
                                                        {m.tip}
                                                    </div>

                                                    {/* Goals badge */}
                                                    {m.goals && (
                                                        <div style={{ fontSize: 10, color: C.muted, background: C.dark3, border: `1px solid ${C.border}`, borderRadius: 4, padding: "3px 7px", whiteSpace: "nowrap" }}>
                                                            {m.goals === "O" ? "O 2.5" : m.goals === "U" ? "U 2.5" : m.goals}
                                                        </div>
                                                    )}

                                                    {/* Odds */}
                                                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                                                        <div style={{ fontSize: 10, color: C.muted }}>
                                                            <span style={{ color: C.green }}>{m.odd1}</span>
                                                            {" / "}
                                                            <span style={{ color: C.gold }}>{m.oddX}</span>
                                                            {" / "}
                                                            <span style={{ color: C.red }}>{m.odd2}</span>
                                                        </div>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                ));
                            })()}
                        </div>
                    )}

                    {/* ── STEP 2: Configure Pick ───────────────────────────────────────── */}
                    {!loading && !error && step === 2 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

                            {/* Editable match tips */}
                            <div>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                                    <label style={{ ...lStyle, marginBottom: 0 }}>
                                        Matchs & Pronostics ({selectedMatches.length})
                                    </label>
                                    <span style={{ fontSize: 10, color: C.muted }}>
                                        Cliquez sur un pronostic pour le changer
                                    </span>
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                    {selectedMatches.map((m) => {
                                        const key = `${m.home}|${m.away}`;
                                        const activeTip = effectiveTip(m);
                                        return (
                                            <div
                                                key={key}
                                                style={{
                                                    background: C.dark4, border: `1px solid ${C.border}`,
                                                    borderLeft: `3px solid ${tipColor(activeTip)}`,
                                                    borderRadius: 8, padding: "10px 12px",
                                                }}
                                            >
                                                {/* Match header */}
                                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 8 }}>
                                                    <div style={{ minWidth: 0 }}>
                                                        <div style={{ fontSize: 12, fontWeight: 600, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                                            {m.home} <span style={{ color: C.muted, fontWeight: 400 }}>vs</span> {m.away}
                                                        </div>
                                                        <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                                                            {m.league} · {m.time}
                                                            {" · "}
                                                            <span style={{ color: C.green }}>{m.odd1}</span>
                                                            {" / "}
                                                            <span style={{ color: C.gold }}>{m.oddX}</span>
                                                            {" / "}
                                                            <span style={{ color: C.red }}>{m.odd2}</span>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => toggleMatch(m)}
                                                        style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 13, padding: "2px 4px", flexShrink: 0, opacity: 0.7 }}
                                                        title="Retirer ce match"
                                                    >
                                                        ✕
                                                    </button>
                                                </div>

                                                {/* Tip selector */}
                                                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
                                                    {ALL_TIPS.map((t) => {
                                                        const isActive = activeTip === t;
                                                        const isScraped = m.tip === t;
                                                        const col = tipColor(t);
                                                        return (
                                                            <button
                                                                key={t}
                                                                onClick={() => setTipOverrides((prev) => ({ ...prev, [key]: t }))}
                                                                style={{
                                                                    padding: "4px 10px", borderRadius: 5, fontSize: 11,
                                                                    fontWeight: 700, letterSpacing: "0.5px", cursor: "pointer",
                                                                    fontFamily: "inherit", transition: "all 0.1s",
                                                                    background: isActive ? col : `${col}12`,
                                                                    color: isActive ? C.dark : col,
                                                                    border: `1.5px solid ${isActive ? col : `${col}40`}`,
                                                                    position: "relative",
                                                                }}
                                                                title={isScraped && !isActive ? `Pronostic SoccerVital: ${t}` : undefined}
                                                            >
                                                                {t}
                                                                {isScraped && !isActive && (
                                                                    <span style={{
                                                                        position: "absolute", top: 2, right: 2,
                                                                        width: 4, height: 4, borderRadius: "50%",
                                                                        background: col, opacity: 0.7,
                                                                    }} />
                                                                )}
                                                            </button>
                                                        );
                                                    })}
                                                    {/* Cote for active tip */}
                                                    <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
                                                        <span style={{ fontSize: 10, color: C.muted }}>Cote:</span>
                                                        <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, color: tipColor(activeTip), letterSpacing: 0.5 }}>
                                                            {oddForTip(m, activeTip).toFixed(2)}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Title — auto-generated but editable */}
                            <div>
                                <label style={lStyle}>Titre du Pick *</label>
                                <input
                                    style={iStyle}
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    placeholder="Titre généré automatiquement…"
                                    autoFocus
                                />
                            </div>

                            {/* League + Date */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                                <div>
                                    <label style={lStyle}>Catégorie / Ligue</label>
                                    <select style={{ ...iStyle, cursor: "pointer" }} value={league} onChange={(e) => setLeague(e.target.value)}>
                                        {LEAGUES.map((l) => <option key={l} value={l}>{l}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={lStyle}>Date du Match</label>
                                    <input type="date" style={iStyle} value={matchDate} onChange={(e) => setMatchDate(e.target.value)} />
                                </div>
                            </div>

                            {/* Price + Odds */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                                <div>
                                    <label style={lStyle}>Prix (FCFA)</label>
                                    <input type="number" style={iStyle} value={price} min={0} step={500} onChange={(e) => setPrice(Number(e.target.value))} />
                                </div>
                                <div>
                                    <label style={lStyle}>Cotes Totales (auto-calculées)</label>
                                    <input type="number" style={iStyle} value={totalOdds} min={1} step={0.01} onChange={(e) => setTotalOdds(Number(e.target.value))} />
                                </div>
                            </div>

                            {/* Publish toggle */}
                            <div>
                                <label style={lStyle}>Statut de publication</label>
                                <button
                                    onClick={() => setIsPublished((v) => !v)}
                                    style={{
                                        ...iStyle, cursor: "pointer", textAlign: "left",
                                        color: isPublished ? C.green : C.muted,
                                        border: `1px solid ${isPublished ? "rgba(34,197,94,0.4)" : C.border}`,
                                        display: "flex", alignItems: "center", gap: 8,
                                    }}
                                >
                                    <div style={{ width: 12, height: 12, borderRadius: "50%", background: isPublished ? C.green : C.faint, flexShrink: 0 }} />
                                    {isPublished ? "Publier immédiatement" : "Sauvegarder comme brouillon"}
                                </button>
                            </div>

                            {/* Save error */}
                            {saveError && (
                                <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: C.red }}>
                                    {saveError}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* ── Footer ────────────────────────────────────────────────────────── */}
                {!loading && !error && (
                    <div style={{ padding: "14px 24px 20px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 10, flexShrink: 0 }}>
                        {step === 1 ? (
                            <>
                                <button
                                    onClick={onClose}
                                    style={{ flex: 1, background: C.dark4, border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, padding: "11px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                                >
                                    Annuler
                                </button>
                                <button
                                    onClick={goToStep2}
                                    disabled={selected.size === 0}
                                    style={{
                                        flex: 2, background: selected.size > 0 ? C.gold : C.dark4,
                                        border: "none", color: selected.size > 0 ? C.dark : C.muted,
                                        borderRadius: 8, padding: "11px", fontSize: 12, fontWeight: 700,
                                        cursor: selected.size > 0 ? "pointer" : "not-allowed",
                                        fontFamily: "inherit", letterSpacing: "0.5px",
                                        opacity: selected.size === 0 ? 0.5 : 1,
                                    }}
                                >
                                    Suivant → {selected.size > 0 && `(${selected.size} match${selected.size !== 1 ? "s" : ""})`}
                                </button>
                            </>
                        ) : (
                            <>
                                <button
                                    onClick={() => setStep(1)}
                                    style={{ flex: 1, background: C.dark4, border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, padding: "11px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                                >
                                    ← Retour
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={saving || !title.trim() || selectedMatches.length === 0}
                                    style={{
                                        flex: 2,
                                        background: saving || !title.trim() ? C.goldDark : C.gold,
                                        border: "none", color: C.dark, borderRadius: 8, padding: "11px",
                                        fontSize: 12, fontWeight: 700,
                                        cursor: saving || !title.trim() ? "not-allowed" : "pointer",
                                        fontFamily: "inherit", letterSpacing: "0.5px",
                                        opacity: (!title.trim() || selectedMatches.length === 0) ? 0.5 : 1,
                                    }}
                                >
                                    {saving ? "Sauvegarde…" : `Créer le Pick${isPublished ? " & Publier" : ""}`}
                                </button>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}