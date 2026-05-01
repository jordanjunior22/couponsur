"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import InfoConfirmDialog from "@/components/InfoConfirmDialog";

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

const S = {
  container: {
    minHeight: "100vh",
    background: "#0A0C0F",
    color: "#E8EAF0",
    fontFamily: "'DM Sans', sans-serif",
  } as React.CSSProperties,
  section: {
    maxWidth: "1200px",
    margin: "0 auto",
    padding: "60px 20px",
  } as React.CSSProperties,
  title: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 42,
    letterSpacing: 2,
    marginBottom: 12,
    color: "#C9A84C",
  } as React.CSSProperties,
  subtitle: {
    fontSize: 16,
    color: "#7A8399",
    marginBottom: 40,
    maxWidth: 500,
  } as React.CSSProperties,
  plansGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 24,
    marginBottom: 40,
  } as React.CSSProperties,
  planCard: (featured: boolean, selected: boolean): React.CSSProperties => ({
    background: featured ? "rgba(201,168,76,0.08)" : "#1A1F26",
    border: selected ? "2px solid #C9A84C" : featured ? "2px solid #C9A84C" : "1px solid #2A3140",
    borderRadius: 16,
    padding: 32,
    position: "relative",
    overflow: "hidden",
    cursor: "pointer",
    transition: "all 0.3s ease",
    opacity: selected ? 1 : 0.8,
  }),
  badgeFeatured: {
    position: "absolute",
    top: 16,
    right: 16,
    background: "#C9A84C",
    color: "#0A0C0F",
    padding: "6px 12px",
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: "uppercase",
  } as React.CSSProperties,
  planName: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 24,
    letterSpacing: 1,
    marginBottom: 8,
    color: "#E8EAF0",
  } as React.CSSProperties,
  planDuration: {
    fontSize: 12,
    color: "#7A8399",
    marginBottom: 16,
  } as React.CSSProperties,
  priceSection: {
    marginBottom: 24,
    paddingBottom: 24,
    borderBottom: "1px solid #2A3140",
  } as React.CSSProperties,
  basePrice: (hasDiscount: boolean): React.CSSProperties => ({
    fontSize: 14,
    color: hasDiscount ? "#EF4444" : "#C9A84C",
    textDecoration: hasDiscount ? "line-through" : "none",
    marginBottom: hasDiscount ? 6 : 0,
  }),
  finalPrice: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 36,
    letterSpacing: 1,
    color: "#C9A84C",
    marginBottom: 4,
  } as React.CSSProperties,
  discount: {
    fontSize: 12,
    color: "#22C55E",
    fontWeight: 700,
  } as React.CSSProperties,
  description: {
    fontSize: 13,
    color: "#7A8399",
    lineHeight: 1.6,
    marginBottom: 24,
  } as React.CSSProperties,
  button: (disabled: boolean): React.CSSProperties => ({
    width: "100%",
    padding: 16,
    background: disabled ? "#2A3140" : "#C9A84C",
    color: disabled ? "#7A8399" : "#0A0C0F",
    border: "none",
    borderRadius: 10,
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 14,
    letterSpacing: 1.5,
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
    transition: "all 0.3s",
    textTransform: "uppercase",
  }),
};

const C = {
  dark: "#0A0C0F",
  dark3: "#1A1F26",
  dark4: "#222830",
  border: "#2A3140",
  text: "#E8EAF0",
  muted: "#7A8399",
  gold: "#C9A84C",
  goldDark: "#8A6A2A",
  red: "#EF4444",
  green: "#22C55E",
};

export default function BillingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [error, setError] = useState("");
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [paymentRejected, setPaymentRejected] = useState(false);
  const [transId, setTransId] = useState<string | null>(null);
  const [showLoginDialog, setShowLoginDialog] = useState(false);

  // Fetch subscription plans
  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const res = await fetch("/api/subscription-plans");
        const data = await res.json();
        setPlans(data.data || []);
      } catch (err) {
        console.error("Failed to fetch plans:", err);
      } finally {
        setPlansLoading(false);
      }
    };

    fetchPlans();
  }, []);

  // Redirect if user already has active subscription
  useEffect(() => {
    if (!loading && user && user.hasActiveSubscription) {
      router.push("/");
    }
  }, [user, loading, router]);

  const handleSelectPlan = (planId: string) => {
    if (!user) {
      setShowLoginDialog(true);
      return;
    }
    setSelectedPlanId(planId);
    setError("");
    setPhone("");
  };

  const handleCloseModal = () => {
    setSelectedPlanId(null);
    setPhone("");
    setError("");
    setPaymentSuccess(false);
    setPaymentRejected(false);
  };

  const confirmSubscription = async (transId: string, planId: string) => {
    try {
      const res = await fetch("/api/subscription/confirm", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transId,
          planId,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setPaymentSuccess(true);
      } else {
        setPaymentRejected(true);
        setError(data.message || "Impossible de confirmer l'abonnement");
      }
      setPaymentLoading(false);
    } catch (err: any) {
      setPaymentRejected(true);
      setError("Erreur lors de la confirmation de l'abonnement");
      setPaymentLoading(false);
    }
  };

  const checkPaymentStatus = async (transId: string, planId: string, maxAttempts = 30) => {
    let attempts = 0;

    const poll = async () => {
      attempts++;
      try {
        const res = await fetch(`/api/payment/status?transId=${transId}`);
        const data = await res.json();

        if (data.status === "SUCCESSFUL") {
          // Confirmation de l'abonnement auprès du serveur
          await confirmSubscription(transId, planId);
          return;
        } else if (data.status === "FAILED" || data.status === "EXPIRED") {
          setPaymentRejected(true);
          setError(data.status === "EXPIRED" ? "Le délai de paiement a expiré" : "Le paiement a été rejeté");
          setPaymentLoading(false);
          return;
        }

        // Retry after 2 seconds if still pending
        if (attempts < maxAttempts) {
          setTimeout(poll, 2000);
        } else {
          setError("Délai d'attente dépassé. Veuillez vérifier le statut de votre paiement.");
          setPaymentLoading(false);
        }
      } catch (err) {
        console.error("Status check error:", err);
        if (attempts < maxAttempts) {
          setTimeout(poll, 2000);
        } else {
          setError("Erreur lors de la vérification du statut du paiement");
          setPaymentLoading(false);
        }
      }
    };

    poll();
  };

  const handlePayment = async () => {
    if (!phone.trim()) {
      setError("Veuillez entrer votre numéro de téléphone");
      return;
    }

    setPaymentLoading(true);
    setError("");

    try {
      const res = await fetch("/api/subscription/pay", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: selectedPlanId,
          phone: phone.trim(),
        }),
      });

      const data = await res.json();

      if (!data.success) {
        setError(data.error || "Erreur lors du paiement");
        setPaymentLoading(false);
        return;
      }

      // Paiement initié, maintenant on vérifie le statut
      setTransId(data.transId);
      checkPaymentStatus(data.transId, selectedPlanId!);
    } catch (err: any) {
      setError(err.message || "Erreur réseau");
      setPaymentLoading(false);
    }
  };

  const sortedPlans = [...plans].sort((a, b) => a.finalPrice - b.finalPrice);
  const featuredPlanIndex = Math.floor(sortedPlans.length / 2);
  const selectedPlan = plans.find(p => p._id === selectedPlanId);

  if (loading) {
    return (
      <div style={S.container}>
        <Navbar />
        <div style={S.section}>
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <div style={{ fontSize: 16, color: C.muted }}>Chargement...</div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div style={S.container}>
      <Navbar />

      <div style={S.section}>
        <div style={{ marginBottom: 60 }}>
          <h1 style={S.title}>Choisissez votre forfait</h1>
          <p style={S.subtitle}>
            Accès illimité à tous les pronostics et analyses. Annulation possible
            à tout moment.
          </p>
        </div>

        {plansLoading ? (
          <div style={{ textAlign: "center", padding: "40px" }}>
            Chargement des plans...
          </div>
        ) : (
          <div style={S.plansGrid}>
            {sortedPlans.map((plan, idx) => (
              <div
                key={plan._id}
                style={S.planCard(idx === featuredPlanIndex, selectedPlanId === plan._id)}
                onClick={() => handleSelectPlan(plan._id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSelectPlan(plan._id);
                }}
                role="button"
                tabIndex={0}
              >
                {idx === featuredPlanIndex && (
                  <div style={S.badgeFeatured}>RECOMMANDÉ</div>
                )}

                <div style={S.planName}>{plan.name}</div>
                <div style={S.planDuration}>
                  {plan.durationDays === 30
                    ? "1 mois"
                    : plan.durationDays === 90
                      ? "3 mois"
                      : plan.durationDays === 180
                        ? "6 mois"
                        : "1 an"}
                </div>

                <div style={S.priceSection}>
                  {plan.discountPercent > 0 && (
                    <>
                      <div style={S.basePrice(true)}>
                        {plan.basePrice.toLocaleString("fr-FR")} FCFA
                      </div>
                      <div style={S.discount}>
                        -{plan.discountPercent}%
                      </div>
                    </>
                  )}
                  <div style={S.finalPrice}>
                    {plan.finalPrice.toLocaleString("fr-FR")}
                  </div>
                  <div style={{ fontSize: 12, color: "#7A8399" }}>FCFA</div>
                </div>

                <p style={S.description}>{plan.description}</p>

                <button
                  style={{
                    ...S.button(selectedPlanId !== plan._id),
                  }}
                  onClick={() => handleSelectPlan(plan._id)}
                >
                  {selectedPlanId === plan._id ? "✓ Sélectionné" : "Sélectionner"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Payment Modal */}
      {selectedPlanId && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.7)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          padding: 20,
        }}>
          <div style={{
            background: C.dark3,
            border: `1px solid ${C.border}`,
            borderRadius: 16,
            padding: 32,
            maxWidth: 500,
            width: "100%",
            maxHeight: "90vh",
            overflow: "auto",
            position: "relative",
          }}>
            {/* Close button */}
            <button
              onClick={handleCloseModal}
              disabled={paymentLoading}
              style={{
                position: "absolute",
                top: 16,
                right: 16,
                background: "none",
                border: "none",
                color: C.muted,
                fontSize: 24,
                cursor: paymentLoading ? "not-allowed" : "pointer",
                opacity: paymentLoading ? 0.5 : 1,
              }}
            >
              ×
            </button>

            {/* Modal content */}
            {paymentSuccess ? (
              <div style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                minHeight: 300,
                textAlign: "center",
              }}>
                <div style={{
                  width: 56,
                  height: 56,
                  background: "rgba(34,197,94,0.1)",
                  border: `2px solid ${C.green}`,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 24,
                }}>
                  <div style={{
                    fontSize: 32,
                    color: C.green,
                  }}>
                    ✓
                  </div>
                </div>
                <div style={{
                  fontSize: 18,
                  fontWeight: 600,
                  color: C.text,
                  marginBottom: 8,
                }}>
                  Paiement confirmé
                </div>
                <div style={{
                  fontSize: 13,
                  color: C.muted,
                  marginBottom: 32,
                  lineHeight: 1.6,
                }}>
                  Votre abonnement est maintenant actif. Vous pouvez accéder à tous les pronostics.
                </div>
                <button
                  onClick={() => {
                    handleCloseModal();
                    router.push("/");
                  }}
                  style={{
                    width: "100%",
                    padding: 14,
                    background: C.gold,
                    color: C.dark,
                    border: "none",
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  Continuer
                </button>
              </div>
            ) : paymentRejected ? (
              <div style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                minHeight: 300,
                textAlign: "center",
              }}>
                <div style={{
                  width: 56,
                  height: 56,
                  background: "rgba(239,68,68,0.1)",
                  border: `2px solid ${C.red}`,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 24,
                }}>
                  <div style={{
                    fontSize: 32,
                    color: C.red,
                  }}>
                    ✕
                  </div>
                </div>
                <div style={{
                  fontSize: 18,
                  fontWeight: 600,
                  color: C.text,
                  marginBottom: 8,
                }}>
                  Paiement rejeté
                </div>
                <div style={{
                  fontSize: 13,
                  color: C.muted,
                  marginBottom: 32,
                  lineHeight: 1.6,
                }}>
                  {error || "Votre paiement n'a pas pu être traité. Veuillez réessayer."}
                </div>
                <button
                  onClick={handleCloseModal}
                  style={{
                    width: "100%",
                    padding: 14,
                    background: C.gold,
                    color: C.dark,
                    border: "none",
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  Réessayer
                </button>
              </div>
            ) : paymentLoading ? (
              <div style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                minHeight: 300,
                textAlign: "center",
              }}>
                <div style={{
                  width: 48,
                  height: 48,
                  border: `4px solid ${C.border}`,
                  borderTopColor: C.gold,
                  borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                  marginBottom: 24,
                }} />
                <div style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: C.text,
                  marginBottom: 8,
                }}>
                  Traitement du paiement
                </div>
                <div style={{
                  fontSize: 13,
                  color: C.muted,
                }}>
                  Veuillez patienter...
                </div>
              </div>
            ) : (
              <>
                <h2 style={{
                  fontSize: 20,
                  fontWeight: 600,
                  color: C.text,
                  marginBottom: 24,
                }}>
                  Confirmer le paiement
                </h2>

                {/* Plan summary */}
                {selectedPlan && (
                  <div style={{
                    background: C.dark4,
                    borderRadius: 8,
                    padding: 16,
                    marginBottom: 24,
                  }}>
                    <div style={{ marginBottom: 12 }}>
                      <div style={{
                        fontSize: 12,
                        color: C.muted,
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                        marginBottom: 4,
                      }}>
                        Plan sélectionné
                      </div>
                      <div style={{
                        fontSize: 16,
                        fontWeight: 600,
                        color: C.gold,
                      }}>
                        {selectedPlan.name}
                      </div>
                    </div>
                    <div style={{
                      borderTop: `1px solid ${C.border}`,
                      paddingTop: 12,
                    }}>
                      <div style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: 14,
                        fontWeight: 600,
                        color: C.text,
                      }}>
                        <span>Total</span>
                        <span>{selectedPlan.finalPrice.toLocaleString("fr-FR")} FCFA</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Phone input */}
                <div style={{ marginBottom: 24 }}>
                  <label style={{
                    display: "block",
                    fontSize: 12,
                    color: C.muted,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                    marginBottom: 8,
                    fontWeight: 600,
                  }}>
                    Numéro de téléphone
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Ex: +237 6XX XXX XXX"
                    style={{
                      width: "100%",
                      padding: 14,
                      background: "#111418",
                      border: `1px solid ${C.border}`,
                      borderRadius: 8,
                      color: C.text,
                      fontSize: 14,
                      fontFamily: "inherit",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                {/* Error message */}
                {error && (
                  <div style={{
                    background: "rgba(239,68,68,0.1)",
                    border: `1px solid rgba(239,68,68,0.3)`,
                    color: C.red,
                    padding: 12,
                    borderRadius: 8,
                    fontSize: 13,
                    marginBottom: 24,
                  }}>
                    {error}
                  </div>
                )}

                {/* Buttons */}
                <div style={{ display: "flex", gap: 12 }}>
                  <button
                    onClick={handleCloseModal}
                    style={{
                      flex: 1,
                      padding: 14,
                      background: C.dark4,
                      color: C.text,
                      border: `1px solid ${C.border}`,
                      borderRadius: 8,
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: "pointer",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handlePayment}
                    disabled={!phone.trim()}
                    style={{
                      flex: 1,
                      padding: 14,
                      background: !phone.trim() ? C.border : C.gold,
                      color: !phone.trim() ? C.muted : C.dark,
                      border: "none",
                      borderRadius: 8,
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: !phone.trim() ? "not-allowed" : "pointer",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    Valider le paiement
                  </button>
                </div>
              </>
            )}
          </div>

          <style>{`
            @keyframes spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      )}

      {/* Login Required Dialog */}
      <InfoConfirmDialog
        isOpen={showLoginDialog}
        type="info"
        title="Connexion requise"
        message="Vous devez vous connecter ou créer un compte pour accéder aux plans d'abonnement."
        buttons={[
          {
            label: "Se connecter",
            onClick: () => {
              setShowLoginDialog(false);
              router.push("/");
            },
            style: "primary",
          },
          {
            label: "Fermer",
            onClick: () => setShowLoginDialog(false),
            style: "secondary",
          },
        ]}
        onClose={() => setShowLoginDialog(false)}
      />

      <Footer />
    </div>
  );
}
