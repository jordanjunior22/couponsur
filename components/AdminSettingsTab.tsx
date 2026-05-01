"use client";

import { useState, useEffect, useMemo } from "react";

// ─── Types ────────────────────────────────────────────────────
interface SubscriptionPlan {
  _id: string;
  name: string;
  durationDays: number;
  basePrice: number;
  discountPercent: number;
  finalPrice: number;
  description: string;
  isActive: boolean;
}

interface BetType {
  _id: string;
  code: string;
  label: string;
  description: string;
  category: "MATCH_RESULT" | "GOALS" | "PLAYERS" | "OTHER";
  predictions: string[];
  isActive: boolean;
}

// ─── Colors ───────────────────────────────────────────────────
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

// ─── Styles ────────────────────────────────────────────────────
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

// ─── Icons ────────────────────────────────────────────────────
const Icons = {
  plus: () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M7 2v10M2 7h10"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  ),
  edit: () => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path
        d="M9 2l2 2L4 11H2V9L9 2z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  trash: () => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path
        d="M2 4h9M5 4V2.5h3V4M4 4l.5 7h4l.5-7"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  close: () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M3 3l8 8M11 3l-8 8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  ),
  check: () => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path
        d="M2 6l3 3 5-5"
        stroke="#22C55E"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
};

// ─── Subscription Plans Tab ────────────────────────────────────
function SubscriptionPlansTab() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [formData, setFormData] = useState<Partial<SubscriptionPlan>>({});
  const [initializing, setInitializing] = useState(false);

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      const res = await fetch("/api/admin/subscription-plans", {
        credentials: "include",
      });
      const data = await res.json();
      setPlans(data.data || []);
    } catch (err) {
      console.error("Failed to fetch plans:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.name || !formData.durationDays || !formData.basePrice || formData.basePrice <= 0) {
      alert("Veuillez remplir tous les champs obligatoires (prix > 0)");
      return;
    }

    try {
      const url = editingPlan
        ? `/api/admin/subscription-plans/${editingPlan._id}`
        : "/api/admin/subscription-plans";

      const res = await fetch(url, {
        method: editingPlan ? "PUT" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");

      fetchPlans();
      setEditingPlan(null);
      setFormData({});
    } catch (err) {
      console.error("Error saving plan:", err);
      alert(`Erreur: ${(err as Error).message}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Êtes-vous sûr?")) return;

    try {
      await fetch(`/api/admin/subscription-plans/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      fetchPlans();
    } catch (err) {
      console.error("Error deleting plan:", err);
      alert("Erreur lors de la suppression");
    }
  };

  const handleInitialize = async () => {
    if (!confirm("Initialiser les 4 plans d'abonnement standards?")) return;

    setInitializing(true);
    try {
      const res = await fetch("/api/admin/subscription-plans/init", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Initialization failed");
      alert(`✓ ${data.message}`);
      fetchPlans();
    } catch (err) {
      alert(`Erreur: ${(err as Error).message}`);
    } finally {
      setInitializing(false);
    }
  };

  if (loading) {
    return <div style={{ padding: "40px", textAlign: "center" }}>Chargement...</div>;
  }

  return (
    <div>
      <div style={{ marginBottom: 20, display: "flex", gap: 10 }}>
        <button
          onClick={() => {
            setEditingPlan(null);
            setFormData({ name: "", durationDays: 30, basePrice: 0, discountPercent: 0, description: "" });
          }}
          style={{
            background: C.gold,
            color: C.dark,
            border: "none",
            borderRadius: 8,
            padding: "8px 16px",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Icons.plus /> Nouveau plan
        </button>
        <button
          onClick={handleInitialize}
          disabled={initializing}
          style={{
            background: initializing ? C.muted : "rgba(34,197,94,0.2)",
            color: initializing ? C.dark4 : C.green,
            border: `1px solid ${C.green}40`,
            borderRadius: 8,
            padding: "8px 16px",
            fontSize: 12,
            fontWeight: 700,
            cursor: initializing ? "not-allowed" : "pointer",
          }}
        >
          {initializing ? "Initialisation..." : "Initialiser plans"}
        </button>
      </div>

      {editingPlan || Object.keys(formData).length > 0 ? (
        <div
          style={{
            background: C.dark3,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: 24,
            marginBottom: 24,
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <label style={lStyle}>Nom du plan</label>
              <input
                style={iStyle}
                value={(formData as any).name || ""}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ex: 3 Months"
              />
            </div>
            <div>
              <label style={lStyle}>Durée (jours)</label>
              <select
                style={{ ...iStyle, cursor: "pointer" }}
                value={(formData as any).durationDays || 30}
                onChange={(e) =>
                  setFormData({ ...formData, durationDays: Number(e.target.value) })
                }
              >
                <option value="30">30 jours (1 mois)</option>
                <option value="90">90 jours (3 mois)</option>
                <option value="180">180 jours (6 mois)</option>
                <option value="365">365 jours (1 an)</option>
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <label style={lStyle}>Prix de base (FCFA)</label>
              <input
                style={iStyle}
                type="number"
                value={(formData as any).basePrice || ""}
                onChange={(e) => setFormData({ ...formData, basePrice: Number(e.target.value) })}
                placeholder="80000"
              />
            </div>
            <div>
              <label style={lStyle}>Réduction (%)</label>
              <input
                style={iStyle}
                type="number"
                min="0"
                max="100"
                value={(formData as any).discountPercent || "0"}
                onChange={(e) =>
                  setFormData({ ...formData, discountPercent: Number(e.target.value) })
                }
              />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={lStyle}>Description</label>
            <textarea
              style={{
                ...iStyle,
                minHeight: 60,
                resize: "vertical",
              }}
              value={(formData as any).description || ""}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Full access to all picks..."
            />
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={handleSave}
              style={{
                flex: 1,
                background: C.gold,
                color: C.dark,
                border: "none",
                borderRadius: 8,
                padding: "10px",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Enregistrer
            </button>
            <button
              onClick={() => {
                setEditingPlan(null);
                setFormData({});
              }}
              style={{
                flex: 1,
                background: C.dark4,
                color: C.muted,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                padding: "10px",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Annuler
            </button>
          </div>
        </div>
      ) : null}

      <div style={{ background: C.dark3, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr 1fr auto",
            padding: "10px 16px",
            borderBottom: `1px solid ${C.border}`,
            fontSize: 9,
            letterSpacing: "2px",
            color: C.muted,
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          <span>Nom</span>
          <span>Durée</span>
          <span>Prix final</span>
          <span>Statut</span>
          <span>Actions</span>
        </div>

        {plans.map((plan, i) => (
          <div
            key={plan._id}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr 1fr auto",
              padding: "12px 16px",
              alignItems: "center",
              borderBottom: i < plans.length - 1 ? `1px solid ${C.border}` : "none",
              gap: 8,
            }}
          >
            <div style={{ fontSize: 12, color: C.text, fontWeight: 600 }}>{plan.name}</div>
            <div style={{ fontSize: 11, color: C.muted }}>
              {plan.durationDays === 30
                ? "1 mois"
                : plan.durationDays === 90
                  ? "3 mois"
                  : plan.durationDays === 180
                    ? "6 mois"
                    : "1 an"}
            </div>
            <div style={{ fontFamily: "monospace", fontSize: 11, color: C.gold }}>
              {plan.finalPrice.toLocaleString("fr-FR")} FCFA
            </div>
            <div>
              <span
                style={{
                  fontSize: 9,
                  letterSpacing: "1px",
                  fontWeight: 700,
                  padding: "4px 8px",
                  borderRadius: 4,
                  background: plan.isActive ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
                  color: plan.isActive ? C.green : C.red,
                  textTransform: "uppercase",
                }}
              >
                {plan.isActive ? "Actif" : "Inactif"}
              </span>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => {
                  setEditingPlan(plan);
                  setFormData(plan);
                }}
                style={{
                  background: C.dark4,
                  border: `1px solid ${C.border}`,
                  borderRadius: 6,
                  color: C.muted,
                  width: 30,
                  height: 30,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <Icons.edit />
              </button>
              <button
                onClick={() => handleDelete(plan._id)}
                style={{
                  background: "rgba(239,68,68,0.08)",
                  border: "1px solid rgba(239,68,68,0.25)",
                  borderRadius: 6,
                  color: C.red,
                  width: 30,
                  height: 30,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <Icons.trash />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Bet Types Tab ────────────────────────────────────────────
function BetTypesTab() {
  const [betTypes, setBetTypes] = useState<BetType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [initializing, setInitializing] = useState(false);
  const [editingBetType, setEditingBetType] = useState<BetType | null>(null);
  const [formData, setFormData] = useState<Partial<BetType>>({});
  const [savingBet, setSavingBet] = useState(false);

  useEffect(() => {
    fetchBetTypes();
  }, []);

  const fetchBetTypes = async () => {
    try {
      const res = await fetch("/api/admin/bet-types", {
        credentials: "include",
      });
      const data = await res.json();
      setBetTypes(data.data || []);
    } catch (err) {
      console.error("Failed to fetch bet types:", err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(
    () => betTypes.filter((bt) => bt.code.toLowerCase().includes(search.toLowerCase())),
    [betTypes, search]
  );

  const handleInitialize = async () => {
    if (!confirm("Initialiser les 11 types de pronostics standards?")) return;

    setInitializing(true);
    try {
      const res = await fetch("/api/admin/bet-types/init", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Initialization failed");
      alert(`✓ ${data.message}`);
      fetchBetTypes();
    } catch (err) {
      alert(`Erreur: ${(err as Error).message}`);
    } finally {
      setInitializing(false);
    }
  };

  const handleSaveBetType = async () => {
    if (!formData.code || !formData.label || !formData.predictions?.length) {
      alert("Remplis tous les champs (code, label, au moins une option)");
      return;
    }

    setSavingBet(true);
    try {
      const url = editingBetType
        ? `/api/admin/bet-types/${editingBetType._id}`
        : "/api/admin/bet-types";

      const res = await fetch(url, {
        method: editingBetType ? "PUT" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");

      fetchBetTypes();
      setEditingBetType(null);
      setFormData({});
    } catch (err) {
      alert(`Erreur: ${(err as Error).message}`);
    } finally {
      setSavingBet(false);
    }
  };

  const handleDeleteBetType = async (id: string) => {
    if (!confirm("Êtes-vous sûr?")) return;

    try {
      await fetch(`/api/admin/bet-types/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      fetchBetTypes();
    } catch (err) {
      alert("Erreur lors de la suppression");
    }
  };

  if (loading) {
    return <div style={{ padding: "40px", textAlign: "center" }}>Chargement...</div>;
  }

  return (
    <div>
      <div style={{ marginBottom: 20, display: "flex", gap: 10, alignItems: "center" }}>
        <input
          style={{
            background: C.dark4,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            color: C.text,
            fontSize: 13,
            padding: "10px 12px",
            width: "100%",
            maxWidth: 300,
            fontFamily: "inherit",
            outline: "none",
          }}
          placeholder="Rechercher..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          onClick={() => {
            setEditingBetType(null);
            setFormData({ code: "", label: "", description: "", category: "OTHER", predictions: [""], isActive: true });
          }}
          style={{
            background: C.gold,
            color: C.dark,
            border: "none",
            borderRadius: 8,
            padding: "8px 16px",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Icons.plus /> Nouveau type
        </button>
        <button
          onClick={handleInitialize}
          disabled={initializing}
          style={{
            background: initializing ? C.muted : "rgba(34,197,94,0.2)",
            color: initializing ? C.dark4 : C.green,
            border: `1px solid ${C.green}40`,
            borderRadius: 8,
            padding: "8px 16px",
            fontSize: 12,
            fontWeight: 700,
            cursor: initializing ? "not-allowed" : "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {initializing ? "Init..." : "Initialiser types"}
        </button>
      </div>

      {editingBetType || Object.keys(formData).length > 0 ? (
        <div
          style={{
            background: C.dark3,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: 24,
            marginBottom: 24,
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <label style={lStyle}>Code</label>
              <input
                style={iStyle}
                value={(formData as any).code || ""}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                placeholder="Ex: 1X2"
              />
            </div>
            <div>
              <label style={lStyle}>Label</label>
              <input
                style={iStyle}
                value={(formData as any).label || ""}
                onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                placeholder="Ex: Vainqueur du match"
              />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={lStyle}>Description</label>
            <textarea
              style={{
                ...iStyle,
                minHeight: 60,
                resize: "vertical",
              }}
              value={(formData as any).description || ""}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Description du type de pronostic..."
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={lStyle}>Options de prédiction</label>
            {((formData as any).predictions || []).map((pred: string, idx: number) => (
              <div key={idx} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input
                  style={iStyle}
                  value={pred}
                  onChange={(e) => {
                    const newPreds = [...((formData as any).predictions || [])];
                    newPreds[idx] = e.target.value;
                    setFormData({ ...formData, predictions: newPreds });
                  }}
                  placeholder={`Option ${idx + 1}`}
                />
                {((formData as any).predictions || []).length > 1 && (
                  <button
                    onClick={() => {
                      const newPreds = ((formData as any).predictions || []).filter((_: string, i: number) => i !== idx);
                      setFormData({ ...formData, predictions: newPreds });
                    }}
                    style={{ background: "rgba(239,68,68,0.2)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 8, color: C.red, padding: "10px 12px", cursor: "pointer" }}
                  >
                    <Icons.trash />
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={() => setFormData({ ...formData, predictions: [...((formData as any).predictions || []), ""] })}
              style={{ background: C.dark4, border: `1px solid ${C.border}`, borderRadius: 8, color: C.gold, padding: "8px 12px", fontSize: 12, cursor: "pointer", marginTop: 8 }}
            >
              + Ajouter option
            </button>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => {
                setEditingBetType(null);
                setFormData({});
              }}
              style={{ flex: 1, background: C.dark4, border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, padding: "12px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
            >
              Annuler
            </button>
            <button
              onClick={handleSaveBetType}
              disabled={savingBet}
              style={{ flex: 2, background: savingBet ? C.goldDark : C.gold, border: "none", color: C.dark, borderRadius: 8, padding: "12px", fontSize: 12, fontWeight: 700, cursor: savingBet ? "not-allowed" : "pointer", fontFamily: "inherit" }}
            >
              {savingBet ? "Enregistrement…" : editingBetType ? "Mettre à jour" : "Créer le type"}
            </button>
          </div>
        </div>
      ) : null}

      <div style={{ background: C.dark3, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1.5fr 2fr 1fr auto",
            padding: "10px 16px",
            borderBottom: `1px solid ${C.border}`,
            fontSize: 9,
            letterSpacing: "2px",
            color: C.muted,
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          <span>Code</span>
          <span>Label</span>
          <span>Options de prédiction</span>
          <span>Statut</span>
          <span>Actions</span>
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: "32px", textAlign: "center", color: C.muted }}>
            Aucun type de pronostic trouvé
          </div>
        ) : (
          filtered.map((bt, i) => (
            <div
              key={bt._id}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1.5fr 2fr 1fr auto",
                padding: "12px 16px",
                alignItems: "center",
                borderBottom: i < filtered.length - 1 ? `1px solid ${C.border}` : "none",
                gap: 8,
              }}
            >
              <div style={{ fontFamily: "monospace", fontSize: 11, color: C.gold, fontWeight: 700 }}>
                {bt.code}
              </div>
              <div style={{ fontSize: 12, color: C.text }}>{bt.label}</div>
              <div style={{ fontSize: 11, color: C.muted }}>
                {bt.predictions.join(", ")}
              </div>
              <div>
                <span
                  style={{
                    fontSize: 9,
                    letterSpacing: "1px",
                    fontWeight: 700,
                    padding: "4px 8px",
                    borderRadius: 4,
                    background: bt.isActive ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
                    color: bt.isActive ? C.green : C.red,
                    textTransform: "uppercase",
                  }}
                >
                  {bt.isActive ? "Actif" : "Inactif"}
                </span>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => {
                    setEditingBetType(bt);
                    setFormData(bt);
                  }}
                  style={{
                    background: C.dark4,
                    border: `1px solid ${C.border}`,
                    borderRadius: 6,
                    color: C.muted,
                    width: 30,
                    height: 30,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                  }}
                >
                  <Icons.edit />
                </button>
                <button
                  onClick={() => handleDeleteBetType(bt._id)}
                  style={{
                    background: "rgba(239,68,68,0.08)",
                    border: "1px solid rgba(239,68,68,0.25)",
                    borderRadius: 6,
                    color: C.red,
                    width: 30,
                    height: 30,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                  }}
                >
                  <Icons.trash />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Main Settings Tab Component ──────────────────────────────
export default function AdminSettingsTab() {
  const [subtab, setSubtab] = useState<"plans" | "bettypes">("plans");

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 20, borderBottom: `1px solid ${C.border}`, paddingBottom: 16 }}>
        <button
          onClick={() => setSubtab("plans")}
          style={{
            background: subtab === "plans" ? "rgba(201,168,76,0.1)" : "transparent",
            color: subtab === "plans" ? C.gold : C.muted,
            border: `1px solid ${subtab === "plans" ? C.gold : "transparent"}`,
            borderRadius: 6,
            padding: "8px 14px",
            fontSize: 12,
            fontWeight: subtab === "plans" ? 700 : 400,
            cursor: "pointer",
            fontFamily: "inherit",
            transition: "all 0.15s",
          }}
        >
          Plans d&apos;abonnement
        </button>
        <button
          onClick={() => setSubtab("bettypes")}
          style={{
            background: subtab === "bettypes" ? "rgba(201,168,76,0.1)" : "transparent",
            color: subtab === "bettypes" ? C.gold : C.muted,
            border: `1px solid ${subtab === "bettypes" ? C.gold : "transparent"}`,
            borderRadius: 6,
            padding: "8px 14px",
            fontSize: 12,
            fontWeight: subtab === "bettypes" ? 700 : 400,
            cursor: "pointer",
            fontFamily: "inherit",
            transition: "all 0.15s",
          }}
        >
          Types de pronostics
        </button>
      </div>

      {subtab === "plans" && <SubscriptionPlansTab />}
      {subtab === "bettypes" && <BetTypesTab />}
    </div>
  );
}
