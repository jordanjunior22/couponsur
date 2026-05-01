"use client";

import { useState, useEffect } from "react";

interface Match {
  _id: string;
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
  matches?: Match[];
  pickType?: "SIMPLE" | "IMAGE";
  category?: "GROSSES_COTES" | "MONTANTES" | "SAFE";
  matchup?: string;
  oddsValue?: number;
}

interface BetType {
  _id: string;
  code: string;
  label: string;
  predictions: string[];
}

const C = {
  dark: "#0A0C0F",
  dark2: "#111418",
  dark3: "#1A1F26",
  dark4: "#222830",
  border: "#2A3140",
  faint: "#3A4455",
  text: "#E8EAF0",
  muted: "#7A8399",
  gold: "#C9A84C",
  goldDark: "#8A6A2A",
  green: "#22C55E",
  red: "#EF4444",
};

const Icons = {
  close: () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  plus: () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
};

function genId() {
  return Math.random().toString(36).slice(2, 9);
}

interface PickFormModalProps {
  pick: Pick | null;
  onSave: (p: Pick) => void;
  onClose: () => void;
}

export default function PickFormModal({ pick, onSave, onClose }: PickFormModalProps) {
  const isNew = !pick;
  const defaultForm = (): Pick => ({
    _id: genId(),
    title: "",
    price: 2000,
    total_odds: 2.0,
    match_date: new Date().toISOString().split("T")[0],
    league: "Premier League",
    outcome: "PENDING",
    is_published: false,
    matches: [],
    pickType: "SIMPLE",
  });

  const [form, setForm] = useState<Pick>(pick || defaultForm());
  const [saving, setSaving] = useState(false);
  const [pickType, setPickType] = useState<"SIMPLE" | "IMAGE">(pick?.pickType === "IMAGE" ? "IMAGE" : "SIMPLE");
  const [betTypes, setBetTypes] = useState<BetType[]>([]);
  const [selectedBetType, setSelectedBetType] = useState<BetType | null>(null);
  const [customBetTypeLabel, setCustomBetTypeLabel] = useState("");
  const [selectedPrediction, setSelectedPrediction] = useState("");
  const [customPredictionLabel, setCustomPredictionLabel] = useState("");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [isImageRestricted, setIsImageRestricted] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [couponBroker, setCouponBroker] = useState("");

  useEffect(() => {
    const fetchBetTypes = async () => {
      try {
        const res = await fetch("/api/bet-types", { credentials: "include" });
        const data = await res.json();
        setBetTypes(data.data || []);
      } catch (e) {
        console.error("Failed to fetch bet types:", e);
      }
    };
    fetchBetTypes();
  }, []);

  useEffect(() => {
    if (pick) {
      setForm(pick);
      const type = pick.pickType === "IMAGE" ? "IMAGE" : "SIMPLE";
      setPickType(type);

      if (type === "IMAGE") {
        // Load images array (new format)
        if ((pick as any).images && Array.isArray((pick as any).images)) {
          const previews = (pick as any).images.map((img: any) => {
            const base64String = img.data;
            const contentType = img.contentType || "image/jpeg";
            return `data:${contentType};base64,${base64String}`;
          });
          setImagePreviews(previews);
          setImageFiles([]); // No files loaded yet
        }

        // Load old image format (backward compatibility)
        if ((pick as any).image && !(pick as any).images) {
          const base64String = (pick as any).image.data;
          const contentType = (pick as any).image.contentType || "image/jpeg";
          const dataUrl = `data:${contentType};base64,${base64String}`;
          setImagePreviews([dataUrl]);
          setImageFiles([]); // No files loaded yet
        }

        // Load coupon code if exists
        if ((pick as any).couponCode) {
          setCouponCode((pick as any).couponCode.code || "");
          setCouponBroker((pick as any).couponCode.broker || "");
        }

        // Load isImageRestricted if exists
        if ((pick as any).isImageRestricted !== undefined) {
          setIsImageRestricted((pick as any).isImageRestricted);
        }
      }
    }
  }, [pick]);

  const set = (key: keyof Pick, val: unknown) => setForm((f) => ({ ...f, [key]: val }));

  const addMatch = () => {
    let betTypeLabel = selectedBetType?.label || "";
    let prediction = selectedPrediction.trim();
    let betTypeCode = selectedBetType?.code || "CUSTOM";

    if (selectedBetType === null && customBetTypeLabel.trim()) {
      betTypeLabel = customBetTypeLabel.trim();
      betTypeCode = "CUSTOM";
      prediction = betTypeLabel;
    } else if (selectedBetType && !selectedPrediction.trim()) {
      alert("Sélectionne une option");
      return;
    } else if (selectedPrediction === "CUSTOM" && customPredictionLabel.trim()) {
      prediction = customPredictionLabel.trim();
    } else if (!selectedBetType && !customBetTypeLabel.trim()) {
      alert("Sélectionne un type de pronostic");
      return;
    }

    setForm((f) => ({
      ...f,
      matches: [
        ...(f.matches || []),
        {
          _id: genId(),
          prediction: prediction,
          betTypeCode: betTypeCode,
          outcome: "PENDING",
        },
      ],
    }));
    setSelectedBetType(null);
    setCustomBetTypeLabel("");
    setSelectedPrediction("");
    setCustomPredictionLabel("");
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const newFiles = Array.from(files);
      setImageFiles((prev) => [...prev, ...newFiles]);

      // Create previews for new files - wait for all to complete
      const previewPromises = newFiles.map((file) => {
        return new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (event) => {
            resolve(event.target?.result as string);
          };
          reader.readAsDataURL(file);
        });
      });

      Promise.all(previewPromises).then((previews) => {
        setImagePreviews((prev) => [...prev, ...previews]);
      });
    }
  };

  const removeImage = (index: number) => {
    setImageFiles((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      alert("Remplis le titre");
      return;
    }

    if (pickType === "IMAGE" && imagePreviews.length === 0) {
      alert("Ajoute au moins une image");
      return;
    }

    if (pickType === "SIMPLE" && (!form.matches || form.matches.length === 0)) {
      alert("Ajoute au moins une sélection");
      return;
    }

    setSaving(true);
    try {
      const method = isNew ? "POST" : "PUT";
      const url = isNew ? "/api/picks" : `/api/picks/${form._id}`;

      let payload: any = {
        ...form,
        pickType,
      };

      if (pickType === "SIMPLE") {
        payload.matches = form.matches?.map(({ _id, ...rest }) => rest) || [];
      } else if (pickType === "IMAGE") {
        // Send images if we have new files
        if (imageFiles.length > 0) {
          payload.images = imageFiles.map((file, i) => ({
            base64: imagePreviews[i],
            contentType: file.type,
          }));
        }
        // Don't override existing images if editing without new files
        // Only send if we added new images
        if (!isNew && imageFiles.length === 0) {
          // In edit mode without new files, don't include images in payload
          // This keeps the existing images on the server
        }

        payload.isImageRestricted = isImageRestricted;
        if (couponCode && couponBroker) {
          payload.couponCode = {
            code: couponCode,
            broker: couponBroker,
          };
        }
        payload.matches = [];
      }

      console.log("🔍 Payload being sent:", {
        pickType,
        imageFilesCount: imageFiles.length,
        imagePreviewsCount: imagePreviews.length,
        isImageRestricted,
        couponCode,
        couponBroker,
        payloadImages: (payload as any).images,
      });

      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      console.log("📥 Response from server:", {
        success: data.success,
        hasImages: (data.data || data.pick)?.images?.length > 0,
        hasCouponCode: !!(data.data || data.pick)?.couponCode,
      });

      if (!res.ok) {
        throw new Error(data.message || data.error || "Erreur lors de la sauvegarde");
      }

      onSave(data.pick || data.data || form);
    } catch (err) {
      console.error("Error saving pick:", err);
      alert("Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  const iStyle: React.CSSProperties = {
    background: C.dark4,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    color: C.text,
    fontSize: 13,
    padding: "10px 12px",
    width: "100%",
    fontFamily: "inherit",
    outline: "none",
  };

  const lStyle: React.CSSProperties = {
    fontSize: 10,
    letterSpacing: "1.5px",
    color: C.muted,
    textTransform: "uppercase",
    fontWeight: 600,
    display: "block",
    marginBottom: 6,
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.88)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
        padding: 16,
        backdropFilter: "blur(4px)",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: C.dark2,
          border: `1px solid ${C.border}`,
          borderRadius: 16,
          width: "100%",
          maxWidth: 600,
          maxHeight: "92vh",
          overflowY: "auto",
          padding: 24,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: "2px", color: C.gold, textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>
              {isNew ? "Nouveau Pick" : "Modifier"}
            </div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color: C.text, letterSpacing: 1 }}>
              {form.title || "Pick"}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: C.dark4,
              border: `1px solid ${C.border}`,
              borderRadius: "50%",
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: C.muted,
            }}
          >
            <Icons.close />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20, borderBottom: `1px solid ${C.border}`, paddingBottom: 12 }}>
          {["SIMPLE", "IMAGE"].map((tab) => (
            <button
              key={tab}
              onClick={() => setPickType(tab as "SIMPLE" | "IMAGE")}
              style={{
                background: pickType === tab ? "rgba(201,168,76,0.1)" : "transparent",
                color: pickType === tab ? C.gold : C.muted,
                border: `1px solid ${pickType === tab ? C.gold : "transparent"}`,
                borderRadius: 6,
                padding: "8px 14px",
                fontSize: 12,
                fontWeight: pickType === tab ? 700 : 400,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Form Fields */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 20 }}>
          {/* Title */}
          <div>
            <label style={lStyle}>Titre</label>
            <input
              style={iStyle}
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Ex: PSG vs Lyon"
            />
          </div>

          {/* League & Date */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={lStyle}>Ligue</label>
              <select style={{ ...iStyle, cursor: "pointer" }} value={form.league} onChange={(e) => set("league", e.target.value)}>
                {["Premier League", "Ligue 1", "La Liga", "Serie A", "Bundesliga", "UCL"].map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={lStyle}>Date</label>
              <input type="date" style={iStyle} value={form.match_date} onChange={(e) => set("match_date", e.target.value)} />
            </div>
          </div>

          {/* Price & Odds */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={lStyle}>Prix (FCFA)</label>
              <input type="number" style={iStyle} value={form.price} onChange={(e) => set("price", Number(e.target.value))} />
            </div>
            <div>
              <label style={lStyle}>Cotes totales</label>
              <input type="number" step="0.1" style={iStyle} value={form.total_odds} onChange={(e) => set("total_odds", Number(e.target.value))} />
            </div>
          </div>

          {/* Result & Status */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={lStyle}>Résultat</label>
              <select style={{ ...iStyle, cursor: "pointer" }} value={form.outcome} onChange={(e) => set("outcome", e.target.value as Pick["outcome"])}>
                <option value="PENDING">En cours</option>
                <option value="WIN">Win</option>
                <option value="LOSS">Loss</option>
              </select>
            </div>
            <div>
              <label style={lStyle}>Statut</label>
              <button
                onClick={() => set("is_published", !form.is_published)}
                style={{
                  ...iStyle,
                  cursor: "pointer",
                  textAlign: "left",
                  color: form.is_published ? C.green : C.muted,
                  border: `1px solid ${form.is_published ? "rgba(34,197,94,0.4)" : C.border}`,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <div style={{ width: 12, height: 12, borderRadius: "50%", background: form.is_published ? C.green : C.faint, flexShrink: 0 }} />
                {form.is_published ? "Publié" : "Brouillon"}
              </button>
            </div>
          </div>

          {/* Category */}
          <div>
            <label style={lStyle}>Catégorie</label>
            <select style={{ ...iStyle, cursor: "pointer" }} value={form.category || ""} onChange={(e) => set("category", e.target.value || undefined)}>
              <option value="">Aucune catégorie</option>
              <option value="GROSSES_COTES">Grosses cotes</option>
              <option value="MONTANTES">Montantes</option>
              <option value="SAFE">Safe</option>
            </select>
          </div>

          {/* Type-Specific Content */}
          {pickType === "SIMPLE" && (
            <div>
              <label style={lStyle}>Sélections ({form.matches?.length || 0})</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8 }}>
                  <div>
                    <select
                      style={{ ...iStyle, cursor: "pointer" }}
                      value={selectedBetType?.code || "CUSTOM"}
                      onChange={(e) => {
                        if (e.target.value === "CUSTOM") {
                          setSelectedBetType(null);
                          setCustomBetTypeLabel("");
                        } else {
                          const bt = betTypes.find((b) => b.code === e.target.value);
                          setSelectedBetType(bt || null);
                        }
                        setSelectedPrediction("");
                      }}
                    >
                      <option value="">Type...</option>
                      {betTypes.map((bt) => (
                        <option key={bt.code} value={bt.code}>
                          {bt.label}
                        </option>
                      ))}
                      <option value="CUSTOM">🔤 Texte libre</option>
                    </select>
                  </div>
                  <div>
                    <select
                      style={{ ...iStyle, cursor: "pointer" }}
                      value={selectedPrediction}
                      onChange={(e) => {
                        setSelectedPrediction(e.target.value);
                        if (e.target.value !== "CUSTOM") {
                          setCustomPredictionLabel("");
                        }
                      }}
                      disabled={!selectedBetType && !customBetTypeLabel.trim()}
                    >
                      <option value="">Option...</option>
                      {selectedBetType?.predictions.map((pred) => (
                        <option key={pred} value={pred}>
                          {pred}
                        </option>
                      ))}
                      {selectedBetType && <option value="CUSTOM">🔤 Texte libre</option>}
                    </select>
                  </div>
                  <button onClick={addMatch} style={{ background: C.gold, color: C.dark, border: "none", borderRadius: 8, padding: "10px 14px", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600 }}>
                    <Icons.plus />
                    Ajouter
                  </button>
                </div>

                {selectedBetType === null && (
                  <input style={iStyle} value={customBetTypeLabel} onChange={(e) => setCustomBetTypeLabel(e.target.value)} placeholder="Type personnalisé..." />
                )}

                {selectedPrediction === "CUSTOM" && (
                  <input style={iStyle} value={customPredictionLabel} onChange={(e) => setCustomPredictionLabel(e.target.value)} placeholder="Option personnalisée..." />
                )}
              </div>

              {/* Matches List */}
              {form.matches?.map((m) => {
                const betType = betTypes.find((bt) => bt.code === m.betTypeCode);
                return (
                  <div key={m._id} style={{ display: "flex", alignItems: "center", gap: 8, background: C.dark4, borderRadius: 8, padding: "8px 12px", marginBottom: 6, border: `1px solid ${C.border}` }}>
                    <div style={{ flex: 1, fontSize: 12, color: C.text }}>
                      <div style={{ fontWeight: 600, color: C.gold, fontSize: 11 }}>{betType?.label || "Texte libre"}</div>
                      <div style={{ color: C.muted, fontSize: 11 }}>{m.prediction}</div>
                    </div>
                    <button onClick={() => setForm((f) => ({ ...f, matches: f.matches?.filter((mx) => mx._id !== m._id) || [] }))} style={{ background: "none", border: "none", cursor: "pointer", color: C.red, padding: 2 }}>
                      <Icons.close />
                    </button>
                  </div>
                );
              })}

              {!form.matches || form.matches.length === 0 ? <div style={{ fontSize: 12, color: C.muted, textAlign: "center", padding: "8px 0" }}>Aucune sélection</div> : null}
            </div>
          )}

          {/* IMAGE Tab */}
          {pickType === "IMAGE" && (
            <div>
              <label style={lStyle}>Images du Coupon (multiples acceptées)</label>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageSelect}
                style={{ ...iStyle, cursor: "pointer" }}
              />

              {/* Image Previews */}
              {imagePreviews.length > 0 && (
                <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
                  {imagePreviews.map((preview, i) => (
                    <div key={i} style={{ position: "relative", borderRadius: 8, overflow: "hidden", border: `1px solid ${C.border}` }}>
                      <img src={preview} alt={`Preview ${i + 1}`} style={{ width: "100%", height: 150, objectFit: "cover" }} />
                      <button
                        onClick={() => removeImage(i)}
                        style={{
                          position: "absolute",
                          top: 4,
                          right: 4,
                          background: "rgba(239, 68, 68, 0.9)",
                          border: "none",
                          borderRadius: "50%",
                          width: 24,
                          height: 24,
                          color: "white",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 12,
                          fontWeight: "bold",
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Image Restriction Checkbox */}
              <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  type="checkbox"
                  checked={isImageRestricted}
                  onChange={(e) => setIsImageRestricted(e.target.checked)}
                  style={{ cursor: "pointer", width: 16, height: 16 }}
                />
                <label style={{ fontSize: 12, color: C.text, cursor: "pointer" }}>
                  Restreindre l'image aux abonnés et déverrouillés
                </label>
              </div>

              {/* Coupon Code */}
              <div style={{ marginTop: 16 }}>
                <label style={lStyle}>Code Coupon (optionnel)</label>
                <input
                  type="text"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value)}
                  placeholder="Ex: ABC123XYZ"
                  style={iStyle}
                />
              </div>

              {/* Coupon Broker */}
              <div style={{ marginTop: 10 }}>
                <label style={lStyle}>Broker / Plateforme</label>
                <input
                  type="text"
                  value={couponBroker}
                  onChange={(e) => setCouponBroker(e.target.value)}
                  placeholder="Ex: 1xbet, linebet, bet365"
                  style={iStyle}
                />
              </div>
            </div>
          )}
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              background: C.dark4,
              border: `1px solid ${C.border}`,
              color: C.muted,
              borderRadius: 8,
              padding: "12px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              flex: 2,
              background: saving ? C.goldDark : C.gold,
              border: "none",
              color: C.dark,
              borderRadius: 8,
              padding: "12px",
              fontSize: 12,
              fontWeight: 700,
              cursor: saving ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              opacity: !form.title.trim() ? 0.5 : 1,
            }}
          >
            {saving ? "Enregistrement…" : isNew ? "Créer le Pick" : "Mettre à jour"}
          </button>
        </div>
      </div>
    </div>
  );
}
