"use client";

import { useState, useRef, useCallback } from "react";

// ─── Types ─────────────────────────────────────────────────────────────────────
interface Match {
  _id: string;
  teamA: string;
  teamB: string;
  prediction: string;
  betTypeCode?: string;
  outcome: "PENDING" | "WIN" | "LOSS";
}

interface Pick {
  _id: string;
  title: string;
  price: number;
  total_odds: number;
  match_date: string;
  league: string;
  outcome: "PENDING" | "WIN" | "LOSS";
  is_published: boolean;
  pickType?: "SIMPLE" | "COMBINÉ" | "IMAGE";
  matches: Match[];
  images?: { data: string; contentType: string }[];
  isImageRestricted?: boolean;
  couponCode?: { code: string; broker: string };
  imageUrl?: string;
  mode?: "simple" | "image";
}

// ─── Constants ─────────────────────────────────────────────────────────────────
const LEAGUES = [
  "Premier League", "Ligue 1", "La Liga", "Serie A",
  "Bundesliga", "UCL", "MLS", "Eredivisie", "Mix",
];

const BET_TYPES = [
  { code: "1X2", label: "Résultat final (1X2)", options: ["Victoire équipe A", "Match Nul", "Victoire équipe B"] },
  { code: "DC", label: "Double chance", options: ["1X (A ou Nul)", "12 (A ou B)", "X2 (Nul ou B)"] },
  { code: "BTTS", label: "Les deux équipes marquent", options: ["Les deux marquent (Oui)", "Les deux marquent (Non)"] },
  { code: "OU25", label: "Plus / Moins de 2.5 buts", options: ["Plus de 2.5 buts", "Moins de 2.5 buts"] },
  { code: "OU35", label: "Plus / Moins de 3.5 buts", options: ["Plus de 3.5 buts", "Moins de 3.5 buts"] },
  { code: "AH", label: "Handicap asiatique", options: ["Handicap A (-1)", "Handicap B (+1)", "Handicap A (-2)", "Handicap B (+2)"] },
  { code: "CS", label: "Score exact", options: ["1-0", "2-0", "2-1", "0-1", "0-2", "1-2", "1-1", "2-2", "0-0"] },
  { code: "HT", label: "Mi-temps / Fin de match", options: ["1/1", "1/X", "1/2", "X/1", "X/X", "X/2", "2/1", "2/X", "2/2"] },
  { code: "CUSTOM", label: "Pari personnalisé", options: [] },
];

const C = {
  dark: "#0A0C0F", dark2: "#111418", dark3: "#1A1F26", dark4: "#222830",
  border: "#2A3140", faint: "#3A4455", text: "#E8EAF0", muted: "#7A8399",
  gold: "#C9A84C", goldLight: "#E8C97A", goldDark: "#8A6A2A",
  green: "#22C55E", red: "#EF4444", blue: "#3B82F6",
};

function genId() { return Math.random().toString(36).slice(2, 9); }

// ─── Sub-components ────────────────────────────────────────────────────────────
function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <div style={{ fontSize: 10, letterSpacing: "2px", color: C.muted, textTransform: "uppercase", fontWeight: 600, marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
      {children}
      {required && <span style={{ color: C.gold, fontSize: 12, lineHeight: 1 }}>*</span>}
    </div>
  );
}

function Input({ style, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{
        background: C.dark4, border: `1px solid ${C.border}`, borderRadius: 8,
        color: C.text, fontSize: 13, padding: "9px 12px", fontFamily: "inherit",
        outline: "none", width: "100%", boxSizing: "border-box",
        transition: "border-color 0.15s",
        ...style,
      }}
      onFocus={(e) => { e.currentTarget.style.borderColor = C.gold; props.onFocus?.(e); }}
      onBlur={(e) => { e.currentTarget.style.borderColor = C.border; props.onBlur?.(e); }}
    />
  );
}

function Select({ style, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      style={{
        background: C.dark4, border: `1px solid ${C.border}`, borderRadius: 8,
        color: C.text, fontSize: 13, padding: "9px 12px", fontFamily: "inherit",
        outline: "none", width: "100%", boxSizing: "border-box", cursor: "pointer",
        ...style,
      }}
    />
  );
}

// ─── Match Row ─────────────────────────────────────────────────────────────────
function MatchRow({
  match, index, onChange, onRemove, canRemove,
}: {
  match: Match;
  index: number;
  onChange: (updated: Match) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const selectedBetType = BET_TYPES.find((b) => b.code === (match.betTypeCode || "1X2")) || BET_TYPES[0];
  const isCustom = selectedBetType.code === "CUSTOM";

  return (
    <div style={{
      background: C.dark3, border: `1px solid ${C.border}`, borderRadius: 12,
      padding: 14, marginBottom: 10,
      borderLeft: `3px solid ${C.gold}`,
      position: "relative",
    }}>
      {/* Match number badge */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{
          fontSize: 9, letterSpacing: "2px", fontWeight: 700, textTransform: "uppercase",
          color: C.gold, background: "rgba(201,168,76,0.1)", border: `1px solid rgba(201,168,76,0.2)`,
          padding: "3px 10px", borderRadius: 4,
        }}>
          Match {index + 1}
        </span>
        {canRemove && (
          <button
            onClick={onRemove}
            style={{
              background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
              borderRadius: 6, color: C.red, fontSize: 11, padding: "4px 10px",
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Retirer
          </button>
        )}
      </div>

      {/* Team A vs Team B */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <div>
          <Label>Équipe A</Label>
          <Input
            placeholder="Ex: Paris SG"
            value={match.teamA || ""}
            onChange={(e) => onChange({ ...match, teamA: e.target.value })}
          />
        </div>
        <div style={{
          fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: "1px",
          marginTop: 20, textAlign: "center", whiteSpace: "nowrap",
        }}>
          VS
        </div>
        <div>
          <Label>Équipe B</Label>
          <Input
            placeholder="Ex: Marseille"
            value={match.teamB || ""}
            onChange={(e) => onChange({ ...match, teamB: e.target.value })}
          />
        </div>
      </div>

      {/* Bet type selector */}
      <div style={{ marginBottom: 10 }}>
        <Label>Type de pari</Label>
        <Select
          value={match.betTypeCode || "1X2"}
          onChange={(e) => onChange({ ...match, betTypeCode: e.target.value, prediction: "" })}
        >
          {BET_TYPES.map((b) => (
            <option key={b.code} value={b.code}>{b.label}</option>
          ))}
        </Select>
      </div>

      {/* Prediction — dropdown for known bet types, free text for CUSTOM */}
      <div>
        <Label required>Pronostic</Label>
        {isCustom ? (
          <Input
            placeholder="Décrivez votre pronostic…"
            value={match.prediction}
            onChange={(e) => onChange({ ...match, prediction: e.target.value })}
          />
        ) : (
          <Select
            value={match.prediction}
            onChange={(e) => onChange({ ...match, prediction: e.target.value })}
          >
            <option value="">— Choisir un pronostic —</option>
            {selectedBetType.options.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </Select>
        )}
      </div>
    </div>
  );
}

// ─── Image data shape stored in state ─────────────────────────────────────────
interface ImageData {
  base64: string;       // full data-URI for preview: "data:image/jpeg;base64,..."
  contentType: string;  // e.g. "image/jpeg"
  previewUrl: string;   // same as base64 for <img src> — kept separate for clarity
}

// ─── Image Upload Zone ──────────────────────────────────────────────────────────
function ImageUploadZone({
  value, onChange,
}: {
  value: ImageData | null;
  onChange: (img: ImageData | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  const processFile = useCallback(async (file: File) => {
    setError("");

    if (!file.type.startsWith("image/")) {
      setError("Fichier invalide — uniquement les images sont acceptées.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Fichier trop lourd — maximum 5 Mo.");
      return;
    }

    setUploading(true);
    setProgress(0);

    // Animate progress bar while FileReader runs
    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 85) { clearInterval(interval); return 85; }
        return p + Math.random() * 20;
      });
    }, 100);

    try {
      // Read file as base64 data-URI entirely in the browser — no upload endpoint needed.
      // The full data-URI is sent to the API as `images[].base64`.
      const dataUri = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Lecture échouée"));
        reader.readAsDataURL(file);
      });

      clearInterval(interval);
      setProgress(100);
      await new Promise((r) => setTimeout(r, 280));

      onChange({
        base64: dataUri,           // full data-URI → sent as `images[].base64`
        contentType: file.type,    // e.g. "image/jpeg" → sent as `images[].contentType`
        previewUrl: dataUri,       // same value used for <img src>
      });
    } catch {
      setError("Échec de la lecture, réessayez.");
    } finally {
      clearInterval(interval);
      setUploading(false);
      setProgress(0);
    }
  }, [onChange]);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    processFile(files[0]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true); };
  const handleDragLeave = () => setDragging(false);

  if (value && !uploading) {
    return (
      <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", border: `1px solid ${C.border}` }}>
        <img src={value.previewUrl} alt="Aperçu du pick" style={{ width: "100%", maxHeight: 220, objectFit: "cover", display: "block" }} />
        <div style={{
          position: "absolute", inset: 0, background: "rgba(10,12,15,0.55)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: 10, opacity: 0, transition: "opacity 0.2s",
        }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "0")}
        >
          <button
            onClick={() => onChange(null)}
            style={{
              background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)",
              borderRadius: 8, color: C.red, fontSize: 12, fontWeight: 600,
              padding: "8px 20px", cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Supprimer l'image
          </button>
          <button
            onClick={() => inputRef.current?.click()}
            style={{
              background: "rgba(201,168,76,0.15)", border: `1px solid ${C.goldDark}`,
              borderRadius: 8, color: C.gold, fontSize: 12, fontWeight: 600,
              padding: "8px 20px", cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Remplacer
          </button>
        </div>
        <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handleFiles(e.target.files)} />
      </div>
    );
  }

  return (
    <div>
      <div
        onClick={() => !uploading && inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        style={{
          border: `2px dashed ${dragging ? C.gold : uploading ? C.goldDark : C.faint}`,
          borderRadius: 12,
          background: dragging ? "rgba(201,168,76,0.06)" : uploading ? "rgba(201,168,76,0.03)" : C.dark3,
          padding: "36px 24px",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: 12, cursor: uploading ? "default" : "pointer",
          transition: "border-color 0.2s, background 0.2s",
          position: "relative", overflow: "hidden",
          userSelect: "none",
        }}
      >
        {/* Upload progress bar along the bottom */}
        {uploading && (
          <div style={{
            position: "absolute", bottom: 0, left: 0, height: 3,
            background: `linear-gradient(90deg, ${C.gold}, ${C.goldLight})`,
            width: `${progress}%`, transition: "width 0.15s ease",
            borderRadius: "0 0 0 0",
          }} />
        )}

        {/* Icon area */}
        {uploading ? (
          <>
            <UploadSpinner />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.gold, marginBottom: 4 }}>
                Téléversement en cours…
              </div>
              <div style={{ fontSize: 11, color: C.muted }}>
                {Math.round(progress)}%
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Cloud upload icon — hand-drawn SVG */}
            <div style={{
              width: 56, height: 56, borderRadius: 16,
              background: dragging ? "rgba(201,168,76,0.15)" : "rgba(201,168,76,0.08)",
              border: `1px solid ${dragging ? C.goldDark : "rgba(201,168,76,0.2)"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.2s",
              transform: dragging ? "scale(1.08)" : "scale(1)",
            }}>
              <svg width="26" height="26" viewBox="0 0 26 26" fill="none" style={{ transition: "transform 0.2s", transform: dragging ? "translateY(-2px)" : "translateY(0)" }}>
                <path d="M8 18a4 4 0 1 1 0-8 6 6 0 1 1 11.94 1A4 4 0 0 1 19 18" stroke={C.gold} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M10 18l3-3m0 0l3 3m-3-3v8" stroke={C.gold} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>

            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: dragging ? C.gold : C.text, marginBottom: 4, transition: "color 0.2s" }}>
                {dragging ? "Déposez l'image ici" : "Glissez une image ou cliquez"}
              </div>
              <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
                PNG, JPG, WEBP — max 5 Mo
              </div>
            </div>

            {!dragging && (
              <div style={{
                fontSize: 11, fontWeight: 600, color: C.gold,
                background: "rgba(201,168,76,0.1)", border: `1px solid rgba(201,168,76,0.25)`,
                borderRadius: 6, padding: "6px 16px", letterSpacing: "0.5px",
              }}>
                Choisir un fichier
              </div>
            )}
          </>
        )}
      </div>

      {error && (
        <div style={{ fontSize: 11, color: C.red, marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
          <span>⚠</span> {error}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}

function UploadSpinner() {
  return (
    <div style={{ position: "relative", width: 56, height: 56, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg width="56" height="56" viewBox="0 0 56 56" style={{ position: "absolute", animation: "pickSpin 1s linear infinite" }}>
        <circle cx="28" cy="28" r="24" fill="none" stroke={C.border} strokeWidth="3" />
        <circle cx="28" cy="28" r="24" fill="none" stroke={C.gold} strokeWidth="3"
          strokeDasharray="40 110" strokeLinecap="round"
        />
      </svg>
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <path d="M6 15l5-5m0 0l5 5m-5-5v9" stroke={C.gold} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4 11A7 7 0 1 1 18 11" stroke={C.goldDark} strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      <style>{`@keyframes pickSpin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Mode Toggle ───────────────────────────────────────────────────────────────
function ModeToggle({ mode, onChange }: { mode: "simple" | "image"; onChange: (m: "simple" | "image") => void }) {
  return (
    <div style={{ display: "flex", background: C.dark, borderRadius: 10, padding: 3, marginBottom: 20 }}>
      {(["simple", "image"] as const).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          style={{
            flex: 1, padding: "8px 0", borderRadius: 8, border: "none", cursor: "pointer",
            fontFamily: "inherit", fontSize: 12, fontWeight: 600, letterSpacing: "0.5px",
            transition: "all 0.18s",
            background: mode === m ? C.gold : "transparent",
            color: mode === m ? C.dark : C.muted,
          }}
        >
          {m === "simple" ? "⚽  Mode Simple" : "🖼️  Mode Image"}
        </button>
      ))}
    </div>
  );
}

// ─── Main Modal ─────────────────────────────────────────────────────────────────
export default function PickFormModal({
  pick,
  onSave,
  onClose,
}: {
  pick: Pick | null;
  onSave: (p: Pick) => void;
  onClose: () => void;
}) {
  const isEdit = !!pick;

  const [mode, setMode] = useState<"simple" | "image">(pick?.mode ?? "simple");
  const [title, setTitle] = useState(pick?.title ?? "");
  const [price, setPrice] = useState<number>(pick?.price ?? 1000);
  const [totalOdds, setTotalOdds] = useState<number>(pick?.total_odds ?? 1.0);
  const [matchDate, setMatchDate] = useState(pick?.match_date?.split("T")[0] ?? "");
  const [league, setLeague] = useState(pick?.league ?? LEAGUES[0]);
  const [outcome, setOutcome] = useState<"PENDING" | "WIN" | "LOSS">(pick?.outcome ?? "PENDING");
  const [isPublished, setIsPublished] = useState(pick?.is_published ?? false);
  const [imageData, setImageData] = useState<ImageData | null>(
    // When editing an IMAGE pick, the API returns images[0].data as base64.
    // Reconstruct an ImageData so the preview works immediately.
    pick?.pickType === "IMAGE" && pick?.images?.[0]
      ? (() => {
          const img = pick.images[0];
          const src = img.data?.startsWith("data:")
            ? img.data
            : `data:${img.contentType ?? "image/jpeg"};base64,${img.data}`;
          return { base64: src, contentType: img.contentType ?? "image/jpeg", previewUrl: src };
        })()
      : null
  );
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

const [matches, setMatches] = useState<Match[]>(
  pick?.matches?.length
    ? pick.matches.map((m) => ({
        ...m,
        teamA: (m as any).teamA ?? (m as any).teams?.home ?? "",
        teamB: (m as any).teamB ?? (m as any).teams?.away ?? "",
      }))
    : [{ _id: genId(), teamA: "", teamB: "", prediction: "", betTypeCode: "1X2", outcome: "PENDING" }]
);

  const addMatch = () => setMatches((prev) => [
    ...prev,
    { _id: genId(), teamA: "", teamB: "", prediction: "", betTypeCode: "1X2", outcome: "PENDING" },
  ]);

  const updateMatch = (id: string, updated: Match) =>
    setMatches((prev) => prev.map((m) => (m._id === id ? updated : m)));

  const removeMatch = (id: string) =>
    setMatches((prev) => prev.filter((m) => m._id !== id));

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = "Titre requis";
    if (!matchDate) e.matchDate = "Date requise";
    if (price <= 0) e.price = "Prix invalide";
    if (totalOdds < 1) e.totalOdds = "Cote minimale : 1.00";
    if (mode === "simple") {
      matches.forEach((m, i) => {
        if (!m.teamA.trim()) e[`match_${i}_teamA`] = `Match ${i + 1}: équipe A requise`;
        if (!m.teamB.trim()) e[`match_${i}_teamB`] = `Match ${i + 1}: équipe B requise`;
        if (!m.prediction) e[`match_${i}_prediction`] = `Match ${i + 1}: pronostic requis`;
      });
    } else {
      if (!imageData) e.imageUrl = "Image requise";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const pickType = mode === "simple" ? "SIMPLE" : "IMAGE";

      // Build the payload exactly as the API expects
      const payload: Record<string, any> = {
        title: title.trim(),
        price,
        total_odds: totalOdds,
        match_date: matchDate,
        league,
        outcome,
        is_published: isPublished,
        pickType,
      };

      if (pickType === "SIMPLE") {
        // Strip client-only _id fields; the server creates its own subdoc IDs
        payload.matches = matches.map(({ _id, ...rest }) => rest);
      } else {
        payload.matches = [];
        // The API expects: images: [{ base64: "<data-uri>", contentType: "image/jpeg" }]
        if (imageData) {
          payload.images = [{ base64: imageData.base64, contentType: imageData.contentType }];
        }
      }

      const url = pick?._id ? `/api/picks/${pick._id}` : "/api/picks";
      const method = pick?._id ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody?.message ?? `HTTP ${res.status}`);
      }

      const data = await res.json();
      // API returns { success: true, data: { ...pick } }
      const saved = data?.data ?? data?.pick ?? data;

      // Merge the saved pick with local state so the parent list updates correctly.
      // For IMAGE picks we keep the local imageData for preview; the DB round-trip
      // handles persistence on the next full reload.
      onSave({
        ...saved,
        _id: saved._id ?? pick?._id ?? genId(),
        // Preserve mode hint for the UI (not persisted in DB but used client-side)
        mode,
      } as Pick);
    } catch (err: any) {
      console.error("Save pick error:", err);
      setErrors((e) => ({ ...e, _general: err.message ?? "Erreur lors de l'enregistrement. Réessayez." }));
    } finally {
      setSaving(false);
    }
  };

  const fieldError = (key: string) =>
    errors[key] ? (
      <div style={{ fontSize: 10, color: C.red, marginTop: 4 }}>⚠ {errors[key]}</div>
    ) : null;

  const iStyle: React.CSSProperties = {
    background: C.dark4, border: `1px solid ${C.border}`, borderRadius: 8,
    color: C.text, fontSize: 13, padding: "9px 12px", fontFamily: "inherit",
    outline: "none", width: "100%", boxSizing: "border-box",
  };

  return (
    <>
      <style>{`
        @keyframes pickFadeIn { from { opacity: 0; transform: scale(0.97) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        .pick-scroll::-webkit-scrollbar { width: 4px; }
        .pick-scroll::-webkit-scrollbar-thumb { background: #2A3140; border-radius: 2px; }
        .pick-input:focus { border-color: ${C.gold} !important; }
      `}</style>

      {/* Overlay */}
      <div
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", backdropFilter: "blur(5px)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
        onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
      >
        <div
          className="pick-scroll"
          style={{
            background: C.dark2, border: `1px solid ${C.border}`, borderRadius: 16,
            width: "100%", maxWidth: 560,
            maxHeight: "92vh", overflowY: "auto",
            animation: "pickFadeIn 0.22s ease",
            display: "flex", flexDirection: "column",
          }}
        >
          {/* Header */}
          <div style={{ padding: "18px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: C.dark2, zIndex: 10, borderRadius: "16px 16px 0 0" }}>
            <div>
              <div style={{ fontSize: 10, letterSpacing: "3px", color: C.muted, textTransform: "uppercase", fontWeight: 600, marginBottom: 2 }}>
                {isEdit ? "Modifier le Pick" : "Nouveau Pick"}
              </div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color: C.text, letterSpacing: 1 }}>
                {title || (isEdit ? pick.title : "Sans titre")}
              </div>
            </div>
            <button
              onClick={() => !saving && onClose()}
              disabled={saving}
              style={{ background: C.dark4, border: `1px solid ${C.border}`, borderRadius: "50%", width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.muted, flexShrink: 0 }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            </button>
          </div>

          {/* Body */}
          <div style={{ padding: "20px", flex: 1 }}>

            {/* Mode toggle */}
            <ModeToggle mode={mode} onChange={setMode} />

            {/* ── Core fields ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <Label required>Titre du pick</Label>
                <input
                  className="pick-input"
                  style={{ ...iStyle, borderColor: errors.title ? C.red : C.border }}
                  placeholder="Ex: PSG gagne ce soir 🔥"
                  value={title}
                  onChange={(e) => { setTitle(e.target.value); setErrors((er) => ({ ...er, title: "" })); }}
                />
                {fieldError("title")}
              </div>

              <div>
                <Label required>Date du match</Label>
                <input
                  type="date"
                  className="pick-input"
                  style={{ ...iStyle, colorScheme: "dark", borderColor: errors.matchDate ? C.red : C.border }}
                  value={matchDate}
                  onChange={(e) => { setMatchDate(e.target.value); setErrors((er) => ({ ...er, matchDate: "" })); }}
                />
                {fieldError("matchDate")}
              </div>

              <div>
                <Label required>Championnat</Label>
                <select style={iStyle} value={league} onChange={(e) => setLeague(e.target.value)}>
                  {LEAGUES.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>

              <div>
                <Label required>Prix (FCFA)</Label>
                <input
                  type="number"
                  className="pick-input"
                  style={{ ...iStyle, borderColor: errors.price ? C.red : C.border }}
                  min={0} step={100}
                  value={price}
                  onChange={(e) => { setPrice(Number(e.target.value)); setErrors((er) => ({ ...er, price: "" })); }}
                />
                {fieldError("price")}
              </div>

              <div>
                <Label required>Cote totale</Label>
                <input
                  type="number"
                  className="pick-input"
                  style={{ ...iStyle, borderColor: errors.totalOdds ? C.red : C.border }}
                  min={1} step={0.01}
                  value={totalOdds}
                  onChange={(e) => { setTotalOdds(Number(e.target.value)); setErrors((er) => ({ ...er, totalOdds: "" })); }}
                />
                {fieldError("totalOdds")}
              </div>
            </div>

            {/* Status row */}
            <div style={{ display: "flex", gap: 10, marginBottom: 20, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 120 }}>
                <Label>Résultat</Label>
                <select style={iStyle} value={outcome} onChange={(e) => setOutcome(e.target.value as any)}>
                  <option value="PENDING">En cours</option>
                  <option value="WIN">WIN ✅</option>
                  <option value="LOSS">LOSS ❌</option>
                </select>
              </div>

              {/* Publish toggle */}
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "9px 14px", background: isPublished ? "rgba(34,197,94,0.08)" : C.dark4, border: `1px solid ${isPublished ? "rgba(34,197,94,0.3)" : C.border}`, borderRadius: 8, userSelect: "none", transition: "all 0.2s", flex: 1, minWidth: 120 }}>
                <div style={{ position: "relative", width: 36, height: 20, background: isPublished ? C.green : C.faint, borderRadius: 10, transition: "background 0.2s", flexShrink: 0 }}>
                  <div style={{ position: "absolute", top: 2, left: isPublished ? 18 : 2, width: 16, height: 16, background: "#fff", borderRadius: "50%", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.4)" }} />
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: isPublished ? C.green : C.muted }}>
                    {isPublished ? "Publié" : "Brouillon"}
                  </div>
                  <div style={{ fontSize: 10, color: C.muted }}>
                    {isPublished ? "Visible pour les utilisateurs" : "Masqué"}
                  </div>
                </div>
                <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} style={{ display: "none" }} />
              </label>
            </div>

            {/* ────────────────────────────────────────────────────────── */}
            {/* MODE: SIMPLE — Match cards */}
            {/* ────────────────────────────────────────────────────────── */}
            {mode === "simple" && (
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <Label>Matchs & Pronostics</Label>
                  <span style={{ fontSize: 10, color: C.muted }}>{matches.length} sélection{matches.length !== 1 ? "s" : ""}</span>
                </div>

                {matches.map((m, i) => (
                  <div key={m._id}>
                    <MatchRow
                      match={m}
                      index={i}
                      onChange={(updated) => updateMatch(m._id, updated)}
                      onRemove={() => removeMatch(m._id)}
                      canRemove={matches.length > 1}
                    />
                    {/* Per-match errors */}
                    {(errors[`match_${i}_teamA`] || errors[`match_${i}_teamB`] || errors[`match_${i}_prediction`]) && (
                      <div style={{ fontSize: 10, color: C.red, marginBottom: 8, marginTop: -4 }}>
                        {errors[`match_${i}_teamA`] || errors[`match_${i}_teamB`] || errors[`match_${i}_prediction`]}
                      </div>
                    )}
                  </div>
                ))}

                <button
                  onClick={addMatch}
                  style={{
                    width: "100%", padding: "10px", borderRadius: 8, border: `1px dashed ${C.faint}`,
                    background: "transparent", color: C.muted, fontSize: 12, fontWeight: 500,
                    cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center",
                    justifyContent: "center", gap: 8, transition: "all 0.15s", marginBottom: 4,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = C.gold; e.currentTarget.style.color = C.gold; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.faint; e.currentTarget.style.color = C.muted; }}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                  Ajouter un match
                </button>
              </div>
            )}

            {/* ────────────────────────────────────────────────────────── */}
            {/* MODE: IMAGE — Upload zone */}
            {/* ────────────────────────────────────────────────────────── */}
            {mode === "image" && (
              <div>
                <Label required>Image du pick</Label>
                <ImageUploadZone value={imageData} onChange={setImageData} />
                {fieldError("imageUrl")}
                {imageData && (
                  <div style={{ fontSize: 10, color: C.green, marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
                    ✓ Image prête
                  </div>
                )}
              </div>
            )}

            {/* General error */}
            {errors._general && (
              <div style={{ fontSize: 12, color: C.red, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, padding: "10px 14px", marginTop: 12 }}>
                ⚠ {errors._general}
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{ padding: "14px 20px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 10, position: "sticky", bottom: 0, background: C.dark2, borderRadius: "0 0 16px 16px" }}>
            <button
              onClick={() => !saving && onClose()}
              disabled={saving}
              style={{ flex: 1, padding: "10px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
            >
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                flex: 2, padding: "10px", borderRadius: 8, border: "none",
                background: saving ? C.goldDark : C.gold, color: C.dark,
                fontSize: 13, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer",
                fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                transition: "background 0.2s",
              }}
            >
              {saving ? (
                <>
                  <div style={{ width: 14, height: 14, border: `2px solid rgba(10,12,15,0.3)`, borderTopColor: C.dark, borderRadius: "50%", animation: "pickSpin 0.7s linear infinite" }} />
                  Enregistrement…
                </>
              ) : (
                isEdit ? "Enregistrer les modifications" : "Créer le Pick"
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}