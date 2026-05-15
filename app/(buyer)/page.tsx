"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import ImageCarouselModal from "@/components/ImageCarouselModal";
import CouponCodeDisplay from "@/components/CouponCodeDisplay";
import { groupPicksByDate } from "@/utils/pickHelpers";

// ─── Interfaces ────────────────────────────────────────────────────────────────
interface Match {
  _id: string;
  teams?: {
    home: string;
    away: string;
  };
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

interface PickItem {
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

// ─── Colors ────────────────────────────────────────────────────────────────────
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

// ─── Helpers ───────────────────────────────────────────────────────────────────
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

// ─── Badges ────────────────────────────────────────────────────────────────────
function Badge({ outcome }: { outcome: "PENDING" | "WIN" | "LOSS" }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    WIN: { bg: "rgba(34,197,94,0.12)", color: C.green, label: "WIN" },
    LOSS: { bg: "rgba(239,68,68,0.12)", color: C.red, label: "LOSS" },
    PENDING: { bg: "rgba(201,168,76,0.1)", color: C.gold, label: "EN COURS" },
  };
  const s = map[outcome] || map["PENDING"];
  return (
    <span style={{
      background: s.bg, color: s.color, border: `1px solid ${s.color}40`,
      fontSize: 9, letterSpacing: "1.2px", fontWeight: 700,
      padding: "3px 8px", borderRadius: 4, textTransform: "uppercase", whiteSpace: "nowrap",
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
      background: s.bg, color: s.color, border: `1px solid ${s.color}40`,
      fontSize: 9, letterSpacing: "1px", fontWeight: 600,
      padding: "3px 8px", borderRadius: 4, textTransform: "uppercase",
    }}>
      {s.label}
    </span>
  );
}

// ─── Match Rows ────────────────────────────────────────────────────────────────
function MatchRows({
  matches, isLocked, sliceCount,
}: {
  matches: Match[];
  isLocked: boolean;
  sliceCount?: number;
}) {
  const shown = sliceCount ? matches.slice(0, sliceCount) : matches;
  const hidden = sliceCount ? Math.max(0, matches.length - sliceCount) : 0;

  return (
    <div style={{ position: "relative", marginBottom: 12 }}>
      <div style={{
        background: C.dark4, borderRadius: 8, padding: 10, fontSize: 12,
        filter: isLocked ? "blur(5px)" : "none",
        userSelect: isLocked ? "none" : "auto",
        transition: "filter 0.2s",
      }}>
        <div style={{ color: C.muted, marginBottom: 6 }}>
          {matches.length} sélection{matches.length > 1 ? "s" : ""}
        </div>
        {shown.map((m, i) => (
          <div key={i} style={{ fontSize: 11, marginBottom: 6, display: "flex", flexDirection: "column", gap: 2 }}>
            {m.teams && (
              <span style={{ fontWeight: 600, color: C.text }}>
                {m.teams.home} <span style={{ color: C.muted }}>vs</span> {m.teams.away}
              </span>
            )}
            <span style={{ color: C.gold }}>→ {m.prediction}</span>
          </div>
        ))}
        {hidden > 0 && (
          <div style={{ fontSize: 11, color: C.muted }}>
            +{hidden} autre{hidden > 1 ? "s" : ""}
          </div>
        )}
      </div>
      {isLocked && (
        <div style={{
          position: "absolute", inset: 0, display: "flex",
          alignItems: "center", justifyContent: "center", borderRadius: 8,
        }}>
          <span style={{
            fontSize: 11, color: C.muted, background: C.dark3,
            padding: "4px 10px", borderRadius: 6,
          }}>
            🔒 Débloque pour voir
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Price & Odds ──────────────────────────────────────────────────────────────
function PriceOdds({ price, odds, isLocked }: { price: number; odds: number; isLocked: boolean }) {
  return (
    <div style={{ position: "relative", marginBottom: 12 }}>
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8,
        filter: isLocked ? "blur(5px)" : "none",
        userSelect: isLocked ? "none" : "auto",
        transition: "filter 0.2s",
      }}>
        <div style={{ background: C.dark4, borderRadius: 6, padding: 8, textAlign: "center" }}>
          <div style={{ fontSize: 10, color: C.muted, marginBottom: 4, textTransform: "uppercase" }}>Prix</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.gold }}>{formatCFA(price)}</div>
        </div>
        <div style={{ background: C.dark4, borderRadius: 6, padding: 8, textAlign: "center" }}>
          <div style={{ fontSize: 10, color: C.muted, marginBottom: 4, textTransform: "uppercase" }}>Cotes</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.gold }}>{odds.toFixed(2)}</div>
        </div>
      </div>
      {isLocked && <div style={{ position: "absolute", inset: 0, borderRadius: 6 }} />}
    </div>
  );
}

// ─── Pick Card ─────────────────────────────────────────────────────────────────
function PickCard({
  pick,
  isLocked,
  showUnlockButton,
  unlocking,
  onUnlock,
  onOpenImages,
  user,
}: {
  pick: PickItem;
  isLocked: boolean;
  showUnlockButton: boolean;
  unlocking: string | null;
  onUnlock: (id: string, price: number) => void;
  onOpenImages: (images: PickImage[]) => void;
  user: any;
}) {
  return (
    <div style={{
      background: C.dark3,
      border: `1px solid ${C.border}`,
      borderLeft: `3px solid ${pick.outcome === "WIN" ? C.green : pick.outcome === "LOSS" ? C.red : C.gold}`,
      borderRadius: 12, padding: 16, overflow: "hidden",
    }}>
      {/* Image for IMAGE type */}
      {pick.pickType === "IMAGE" && pick.images && pick.images.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {isLocked && pick.isImageRestricted ? (
            <div style={{
              width: "100%", height: 180, borderRadius: 8,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: C.dark4, border: `1px dashed ${C.border}`,
              color: C.muted, fontSize: 13, textAlign: "center", padding: 16,
            }}>
              🔒 Déverrouille pour voir l'image du coupon
            </div>
          ) : (
            <div
              onClick={() => onOpenImages(pick.images!)}
              style={{
                width: "100%", height: 180, borderRadius: 8,
                overflow: "hidden", background: C.dark4,
                cursor: "pointer", transition: "opacity 0.2s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
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

      {/* Header */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <Badge outcome={pick.outcome} />
          {pick.category && <CategoryBadge category={pick.category} />}
        </div>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: 0, marginBottom: 8 }}>
          {pick.title}
        </h3>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>
          {pick.league} · {formatDate(pick.match_date)}
        </div>
        {/* Coupon Code — only for unlocked/subscribed */}
        {pick.couponCode && !isLocked && (
          <CouponCodeDisplay code={pick.couponCode.code} broker={pick.couponCode.broker} />
        )}
      </div>

      {/* Matches */}
      {pick.pickType === "SIMPLE" && pick.matches && pick.matches.length > 0 && (
        <MatchRows matches={pick.matches} isLocked={isLocked} sliceCount={2} />
      )}

      {/* Price & Odds */}
      <PriceOdds price={pick.price} odds={pick.total_odds} isLocked={isLocked} />

      {/* CTA for logged-out users */}
      {!user && (
        <a
          href="/billing"
          style={{
            display: "block", fontSize: 11, color: C.gold, textAlign: "center",
            padding: 10, background: "rgba(201,168,76,0.1)", borderRadius: 6,
            border: `1px solid ${C.gold}40`, textDecoration: "none", fontWeight: 600,
          }}
        >
          Souscris pour voir tous les picks
        </a>
      )}

      {/* Unlock button for logged-in non-subscribers */}
      {showUnlockButton && (
        <button
          onClick={() => onUnlock(pick._id, pick.price)}
          disabled={unlocking === pick._id}
          style={{
            width: "100%",
            background: unlocking === pick._id ? C.goldDark : C.gold,
            color: C.dark, border: "none", borderRadius: 6, padding: 10,
            fontSize: 11, fontWeight: 600, textTransform: "uppercase",
            letterSpacing: "0.5px",
            cursor: unlocking === pick._id ? "not-allowed" : "pointer",
          }}
        >
          {unlocking === pick._id ? "Déverrouillage..." : `Débloquer - ${formatCFA(pick.price)}`}
        </button>
      )}
    </div>
  );
}

// ─── Picks Grid ────────────────────────────────────────────────────────────────
function PicksGrid({
  picks,
  isLockedFn,
  showUnlockFn,
  unlocking,
  onUnlock,
  onOpenImages,
  user,
}: {
  picks: PickItem[];
  isLockedFn: (pick: PickItem) => boolean;
  showUnlockFn: (pick: PickItem) => boolean;
  unlocking: string | null;
  onUnlock: (id: string, price: number) => void;
  onOpenImages: (images: PickImage[]) => void;
  user: any;
}) {
  return (
    <>
      {groupPicksByDate(picks).map((group) => (
        <div key={group.date} style={{ marginBottom: 32 }}>
          <h3 style={{
            fontSize: 14, fontWeight: 600, color: C.gold, marginBottom: 12,
            textTransform: "uppercase", letterSpacing: "0.5px",
          }}>
            • {group.displayDate}
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
            {group.picks.map((pick) => {
              const p = pick as PickItem;
              return (
                <PickCard
                  key={p._id}
                  pick={p}
                  isLocked={isLockedFn(p)}
                  showUnlockButton={showUnlockFn(p)}
                  unlocking={unlocking}
                  onUnlock={onUnlock}
                  onOpenImages={onOpenImages}
                  user={user}
                />
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function BuyerPage() {
  const { user, loading: authLoading } = useAuth();
  const [picks, setPicks] = useState<PickItem[]>([]);
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
        const res = await fetch(`/api/picks?${query.toString()}`, { credentials: "include" });
        const data = await res.json();
        if (data.data) setPicks(data.data);
      } catch (e) {
        console.error("Failed to fetch picks:", e);
      } finally {
        setLoading(false);
      }
    };

    if (!authLoading) {
      fetchPicks();
      if (user) setUnlockedPicks(user.unlockedPickIds || []);
    }
  }, [authLoading, user]);

  const handleUnlock = async (pickId: string, price: number) => {
    if (!user) return;
    setUnlocking(pickId);
    try {
      const res = await fetch(`/api/picks/unlock`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pickId, price }),
      });
      if (res.ok) setUnlockedPicks((prev) => [...prev, pickId]);
      else alert("Erreur lors du déverrouillage du pick");
    } catch (e) {
      console.error("Error unlocking pick:", e);
      alert("Erreur lors du déverrouillage");
    } finally {
      setUnlocking(null);
    }
  };

  // Subscribers see all; others see PENDING + top 5 WIN
  const displayedPicks = (() => {
    let filtered = picks;
    if (!user || !user.hasActiveSubscription) {
      const pending = picks.filter((p) => p.outcome === "PENDING");
      const wins = picks.filter((p) => p.outcome === "WIN").slice(0, 5);
      filtered = [...pending, ...wins];
    }
    if (activeTab === "daily" && selectedCategory) {
      filtered = filtered.filter((p) => p.category === selectedCategory);
    }
    return filtered;
  })();

  const isPickLocked = (pick: PickItem): boolean =>
    pick.outcome === "PENDING" && !user?.hasActiveSubscription && !unlockedPicks.includes(pick._id);

  const showUnlockButton = (pick: PickItem): boolean =>
    !!user && !user.hasActiveSubscription && !unlockedPicks.includes(pick._id) && pick.outcome === "PENDING";

  const pendingPicks = picks.filter((p) => p.outcome === "PENDING");
  const resultPicks = picks.filter((p) => p.outcome !== "PENDING");

  if (authLoading || loading) {
    return (
      <div style={{ minHeight: "100vh", background: C.dark, display: "flex", alignItems: "center", justifyContent: "center" }}>
        
        <div style={{ width: 40, height: 40, border: `4px solid ${C.border}`, borderTopColor: C.gold, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: C.dark }} className="buyer-page">
      <Navbar />
      <div style={{ padding: 24 }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>

          {/* Header */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 10, letterSpacing: "2px", color: C.gold, textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>
              Pronostics
            </div>
            <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 40, color: C.text, letterSpacing: 1, margin: 0 }}>
              {user?.hasActiveSubscription ? "Tous les picks" : "Picks du moment"}
            </h1>
          </div>

          {/* ── SUBSCRIBER VIEW ─────────────────────────────────────────────── */}
          {user?.hasActiveSubscription && (
            <>
              {/* Tabs */}
              <div style={{ display: "flex", gap: 12, marginBottom: 24, borderBottom: `1px solid ${C.border}`, paddingBottom: 12, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                {(["all", "daily"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => { setActiveTab(tab); setSelectedCategory(null); }}
                    style={{
                      background: activeTab === tab ? "rgba(201,168,76,0.1)" : "transparent",
                      color: activeTab === tab ? C.gold : C.muted,
                      border: `1px solid ${activeTab === tab ? C.gold : "transparent"}`,
                      borderRadius: 6, padding: "8px 14px", fontSize: 12,
                      fontWeight: activeTab === tab ? 700 : 400,
                      cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", flexShrink: 0,
                    }}
                  >
                    {tab === "all" ? "Tous les picks" : "Pronostics du jour"}
                  </button>
                ))}
              </div>

              {/* Category filter */}
              {activeTab === "daily" && (
                <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
                  {(["GROSSES_COTES", "MONTANTES", "SAFE"] as const).map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
                      style={{
                        background: selectedCategory === cat ? C.gold : C.dark4,
                        color: selectedCategory === cat ? C.dark : C.text,
                        border: `1px solid ${selectedCategory === cat ? C.gold : C.border}`,
                        borderRadius: 6, padding: "8px 12px", fontSize: 11, fontWeight: 600,
                        cursor: "pointer", fontFamily: "inherit", textTransform: "uppercase",
                        letterSpacing: "0.5px", whiteSpace: "nowrap", flexShrink: 0,
                      }}
                    >
                      {cat === "GROSSES_COTES" ? "Grosses cotes" : cat === "MONTANTES" ? "Montantes" : "Safe"}
                    </button>
                  ))}
                </div>
              )}

              {displayedPicks.length === 0 ? (
                <div style={{ textAlign: "center", padding: 40, color: C.muted }}>Aucun pick disponible</div>
              ) : (
                <PicksGrid
                  picks={displayedPicks}
                  isLockedFn={() => false}
                  showUnlockFn={() => false}
                  unlocking={unlocking}
                  onUnlock={handleUnlock}
                  onOpenImages={setModalImages}
                  user={user}
                />
              )}
            </>
          )}

          {/* ── NON-SUBSCRIBER VIEW ─────────────────────────────────────────── */}
          {(!user || !user.hasActiveSubscription) && (
            <>
              {picks.length === 0 && (
                <div style={{ textAlign: "center", padding: 40, color: C.muted }}>Aucun pick disponible</div>
              )}

              {/* PENDING picks — blurred with unlock button */}
              {pendingPicks.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 10, letterSpacing: "2px", color: C.gold, textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>
                      🔥 En direct
                    </div>
                    <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: C.text, letterSpacing: 1, margin: 0 }}>
                      Picks en cours
                    </h2>
                  </div>
                  <PicksGrid
                    picks={pendingPicks}
                    isLockedFn={isPickLocked}
                    showUnlockFn={showUnlockButton}
                    unlocking={unlocking}
                    onUnlock={handleUnlock}
                    onOpenImages={setModalImages}
                    user={user}
                  />
                </div>
              )}

              {/* WIN/LOSS picks — fully visible as social proof */}
              {resultPicks.length > 0 && (
                <div style={{ marginTop: 40, paddingTop: 40, borderTop: `2px solid ${C.border}` }}>
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 10, letterSpacing: "2px", color: C.gold, textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>
                      Résultats
                    </div>
                    <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: C.text, letterSpacing: 1, margin: 0 }}>
                      Picks avec résultats
                    </h2>
                  </div>
                  <PicksGrid
                    picks={resultPicks}
                    isLockedFn={() => false}
                    showUnlockFn={() => false}
                    unlocking={unlocking}
                    onUnlock={handleUnlock}
                    onOpenImages={setModalImages}
                    user={user}
                  />
                </div>
              )}
            </>
          )}

        </div>
      </div>

      <Footer />

      {modalImages && (
        <ImageCarouselModal
          images={modalImages}
          title="Images du coupon"
          onClose={() => setModalImages(null)}
        />
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @media (max-width: 639px) {
          .buyer-page > div { padding: 16px !important; }
          .buyer-page h1 { font-size: 28px !important; }
          .buyer-page h2 { font-size: 22px !important; }
        }
      `}</style>
    </div>
  );
}