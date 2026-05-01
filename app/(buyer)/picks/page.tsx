"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";
import ImageCarouselModal from "@/components/ImageCarouselModal";
import CouponCodeDisplay from "@/components/CouponCodeDisplay";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

interface Match {
  _id: string;
  prediction: string;
  betTypeCode?: string;
  outcome: "PENDING" | "WIN" | "LOSS";
}

interface PickImage {
  data: string;
  contentType: string;
}

interface CouponCode {
  code: string;
  broker: string;
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
  pickType: "SIMPLE" | "IMAGE";
  category?: "GROSSES_COTES" | "MONTANTES" | "SAFE";
  matches?: Match[];
  images?: PickImage[];
  isImageRestricted?: boolean;
  couponCode?: CouponCode;
  createdAt?: string;
  updatedAt?: string;
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
  goldLight: "#E8C97A",
  goldDark: "#8A6A2A",
  green: "#22C55E",
  red: "#EF4444",
  blue: "#3B82F6",
};

function formatDate(d: string) {
  if (!d) return "—";
  const dateOnly = d.split("T")[0];
  return new Date(dateOnly + "T12:00:00").toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatCFA(n: number) {
  return n.toLocaleString("fr-FR") + " FCFA";
}

function Badge({ outcome }: { outcome: "PENDING" | "WIN" | "LOSS" }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    WIN: { bg: "rgba(34,197,94,0.12)", color: C.green, label: "WIN" },
    LOSS: { bg: "rgba(239,68,68,0.12)", color: C.red, label: "LOSS" },
    PENDING: { bg: "rgba(201,168,76,0.1)", color: C.gold, label: "EN COURS" },
  };
  const s = map[outcome] || map["PENDING"];
  return (
    <span style={{
      background: s.bg,
      color: s.color,
      border: `1px solid ${s.color}40`,
      fontSize: 9,
      letterSpacing: "1.2px",
      fontWeight: 700,
      padding: "3px 8px",
      borderRadius: 4,
      textTransform: "uppercase",
      whiteSpace: "nowrap",
    }}>
      {s.label}
    </span>
  );
}

function CategoryBadge({ category }: { category?: string }) {
  if (!category) return null;
  const map: Record<string, { bg: string; color: string; label: string }> = {
    GROSSES_COTES: { bg: "rgba(201,168,76,0.12)", color: C.gold, label: "Grosses cotes" },
    MONTANTES: { bg: "rgba(59,130,246,0.12)", color: C.blue, label: "Montantes" },
    SAFE: { bg: "rgba(34,197,94,0.12)", color: C.green, label: "Safe" },
  };
  const s = map[category] || { bg: "transparent", color: C.muted, label: category };
  return (
    <span style={{
      background: s.bg,
      color: s.color,
      border: `1px solid ${s.color}40`,
      fontSize: 9,
      letterSpacing: "1px",
      fontWeight: 600,
      padding: "3px 8px",
      borderRadius: 4,
      textTransform: "uppercase",
    }}>
      {s.label}
    </span>
  );
}

export default function PicksPage() {
  const { user, isLoading } = useAuth();
  const [picks, setPicks] = useState<Pick[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"all" | "daily">("all");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [unlockedPicks, setUnlockedPicks] = useState<string[]>([]);
  const [unlocking, setUnlocking] = useState<string | null>(null);
  const [modalImages, setModalImages] = useState<PickImage[] | null>(null);

  useEffect(() => {
    const fetchPicks = async () => {
      try {
        const query = new URLSearchParams();
        query.append("published", "true");

        const res = await fetch(`/api/picks?${query.toString()}`, {
          credentials: "include",
        });
        const data = await res.json();

        if (data.data) {
          setPicks(data.data);
        }
      } catch (e) {
        console.error("Failed to fetch picks:", e);
      } finally {
        setLoading(false);
      }
    };

    if (!isLoading) {
      fetchPicks();
      // Load user's unlocked picks
      if (user) {
        setUnlockedPicks(user.unlockedPickIds || []);
      }
    }
  }, [isLoading, user]);

  const handleUnlock = async (pickId: string, price: number) => {
    if (!user) return;

    setUnlocking(pickId);
    try {
      const res = await fetch(`/api/picks/unlock`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pickId, price }),
      });

      if (res.ok) {
        setUnlockedPicks([...unlockedPicks, pickId]);
      } else {
        alert("Erreur lors du déverrouillage du pick");
      }
    } catch (e) {
      console.error("Error unlocking pick:", e);
      alert("Erreur lors du déverrouillage");
    } finally {
      setUnlocking(null);
    }
  };

  // Filter picks based on user authentication
  const displayedPicks = (() => {
    let filtered = picks;

    // Non-authenticated or no subscription: only WIN picks, max 5
    if (!user || !user.hasActiveSubscription) {
      filtered = picks.filter((p) => p.outcome === "WIN").slice(0, 5);
    }

    // Filter by tab and category
    if (activeTab === "daily" && selectedCategory) {
      filtered = filtered.filter((p) => p.category === selectedCategory);
    }

    return filtered;
  })();

  if (isLoading || loading) {
    return (
      <div style={{
        minHeight: "100vh",
        background: C.dark,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <div style={{
          width: 40,
          height: 40,
          border: `4px solid ${C.border}`,
          borderTopColor: C.gold,
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: C.dark }}>
      <Navbar />
      <div style={{ padding: 24 }} className="picks-page">
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{
            fontSize: 10,
            letterSpacing: "2px",
            color: C.gold,
            textTransform: "uppercase",
            fontWeight: 600,
            marginBottom: 8,
          }}>
            Pronostics
          </div>
          <h1 style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 40,
            color: C.text,
            letterSpacing: 1,
            margin: 0,
          }}>
            {user?.hasActiveSubscription ? "Tous les picks" : "Derniers picks gagnants"}
          </h1>
        </div>

        {/* Tabs */}
        {user?.hasActiveSubscription && (
          <div style={{
            display: "flex",
            gap: 12,
            marginBottom: 24,
            borderBottom: `1px solid ${C.border}`,
            paddingBottom: 12,
            overflowX: "auto",
            WebkitOverflowScrolling: "touch",
          }}>
            {["all", "daily"].map((tab) => (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab as "all" | "daily");
                  setSelectedCategory(null);
                }}
                style={{
                  background: activeTab === tab ? "rgba(201,168,76,0.1)" : "transparent",
                  color: activeTab === tab ? C.gold : C.muted,
                  border: `1px solid ${activeTab === tab ? C.gold : "transparent"}`,
                  borderRadius: 6,
                  padding: "8px 14px",
                  fontSize: 12,
                  fontWeight: activeTab === tab ? 700 : 400,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                {tab === "all" ? "Tous les picks" : "Pronostics du jour"}
              </button>
            ))}
          </div>
        )}

        {/* Category filter for daily tab */}
        {user?.hasActiveSubscription && activeTab === "daily" && (
          <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
            {["GROSSES_COTES", "MONTANTES", "SAFE"].map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
                style={{
                  background: selectedCategory === cat ? C.gold : C.dark4,
                  color: selectedCategory === cat ? C.dark : C.text,
                  border: `1px solid ${selectedCategory === cat ? C.gold : C.border}`,
                  borderRadius: 6,
                  padding: "8px 12px",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                {cat === "GROSSES_COTES" ? "Grosses cotes" : cat === "MONTANTES" ? "Montantes" : "Safe"}
              </button>
            ))}
          </div>
        )}

        {/* Picks Grid */}
        {displayedPicks.length === 0 ? (
          <div style={{
            textAlign: "center",
            padding: 40,
            color: C.muted,
          }}>
            Aucun pick disponible
          </div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: 16,
          }}>
            {displayedPicks.map((pick) => (
              <div
                key={pick._id}
                style={{
                  background: C.dark3,
                  border: `1px solid ${C.border}`,
                  borderRadius: 12,
                  padding: 16,
                  overflow: "hidden",
                }}
              >
                {/* Image for IMAGE type */}
                {pick.pickType === "IMAGE" && pick.images && pick.images.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    {pick.outcome === "PENDING" && pick.isImageRestricted && !user?.hasActiveSubscription && !unlockedPicks.includes(pick._id) ? (
                      <div style={{
                        width: "100%",
                        height: 180,
                        borderRadius: 8,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: C.dark4,
                        border: `1px dashed ${C.border}`,
                        color: C.muted,
                        fontSize: 13,
                        textAlign: "center",
                        padding: 16,
                      }}>
                        🔒 Déverrouille pour voir l'image du coupon
                      </div>
                    ) : (
                      <div
                        onClick={() => setModalImages(pick.images || null)}
                        style={{
                          width: "100%",
                          height: 180,
                          borderRadius: 8,
                          overflow: "hidden",
                          background: C.dark4,
                          cursor: "pointer",
                          transition: "opacity 0.2s",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.opacity = "0.8";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.opacity = "1";
                        }}
                      >
                        <img
                          src={`data:${pick.images[0].contentType};base64,${pick.images[0].data}`}
                          alt={pick.title}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Content */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                    <Badge outcome={pick.outcome} />
                    {pick.category && <CategoryBadge category={pick.category} />}
                  </div>
                  <h3 style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: C.text,
                    margin: 0,
                    marginBottom: 8,
                  }}>
                    {pick.title}
                  </h3>
                  <div style={{
                    fontSize: 12,
                    color: C.muted,
                    marginBottom: 4,
                  }}>
                    {pick.league} · {formatDate(pick.match_date)}
                  </div>
                  {/* Coupon Code - Show only to subscribers or those who unlocked */}
                  {pick.couponCode && (user?.hasActiveSubscription || unlockedPicks.includes(pick._id)) && (
                    <CouponCodeDisplay code={pick.couponCode.code} broker={pick.couponCode.broker} />
                  )}
                </div>

                {/* Stats */}
                {pick.pickType === "SIMPLE" && pick.matches && pick.matches.length > 0 && (
                  <div style={{
                    background: C.dark4,
                    borderRadius: 8,
                    padding: 10,
                    marginBottom: 12,
                    fontSize: 12,
                  }}>
                    <div style={{ color: C.muted, marginBottom: 6 }}>
                      {pick.matches.length} sélection{pick.matches.length > 1 ? "s" : ""}
                    </div>
                    {pick.matches.slice(0, 2).map((m, i) => (
                      <div key={i} style={{ fontSize: 11, color: C.text, marginBottom: 4 }}>
                        · {m.prediction}
                      </div>
                    ))}
                    {pick.matches.length > 2 && (
                      <div style={{ fontSize: 11, color: C.muted }}>
                        +{pick.matches.length - 2} autre{pick.matches.length - 2 > 1 ? "s" : ""}
                      </div>
                    )}
                  </div>
                )}

                {/* Price & Odds - Only show if has subscription or is unlocked */}
                {(user?.hasActiveSubscription || unlockedPicks.includes(pick._id)) && (
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 8,
                    marginBottom: 12,
                  }}>
                    <div style={{
                      background: C.dark4,
                      borderRadius: 6,
                      padding: 8,
                      textAlign: "center",
                    }}>
                      <div style={{ fontSize: 10, color: C.muted, marginBottom: 4, textTransform: "uppercase" }}>
                        Prix
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: C.gold }}>
                        {formatCFA(pick.price)}
                      </div>
                    </div>
                    <div style={{
                      background: C.dark4,
                      borderRadius: 6,
                      padding: 8,
                      textAlign: "center",
                    }}>
                      <div style={{ fontSize: 10, color: C.muted, marginBottom: 4, textTransform: "uppercase" }}>
                        Cotes
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: C.gold }}>
                        {pick.total_odds.toFixed(2)}
                      </div>
                    </div>
                  </div>
                )}

                {/* Action button */}
                {!user && (
                  <a
                    href="/billing"
                    style={{
                      display: "block",
                      fontSize: 11,
                      color: C.gold,
                      textAlign: "center",
                      padding: 10,
                      background: "rgba(201,168,76,0.1)",
                      borderRadius: 6,
                      border: `1px solid ${C.gold}40`,
                      textDecoration: "none",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Souscris pour voir tous les picks
                  </a>
                )}

                {user && !user.hasActiveSubscription && !unlockedPicks.includes(pick._id) && (
                  <button
                    onClick={() => handleUnlock(pick._id, pick.price)}
                    disabled={unlocking === pick._id}
                    style={{
                      width: "100%",
                      background: unlocking === pick._id ? C.goldDark : C.gold,
                      color: C.dark,
                      border: "none",
                      borderRadius: 6,
                      padding: 10,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: unlocking === pick._id ? "not-allowed" : "pointer",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    {unlocking === pick._id ? "Déverrouillage..." : `Débloquer - ${formatCFA(pick.price)}`}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        </div>
      </div>

      {/* Image Carousel Modal */}
      {modalImages && (
        <ImageCarouselModal
          images={modalImages}
          title="Images du coupon"
          onClose={() => setModalImages(null)}
        />
      )}

      <Footer />

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @media (max-width: 639px) {
          .picks-page {
            padding: 16px !important;
          }

          .picks-page h1 {
            font-size: 28px !important;
          }

          .picks-page > div > div > div:first-child {
            margin-bottom: 20px !important;
          }

          [class*="pick-card"] {
            padding: 12px !important;
            border-radius: 8px !important;
          }

          [class*="image-container"] {
            height: 140px !important;
          }
        }
      `}</style>
    </div>
  );
}
