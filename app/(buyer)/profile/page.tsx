"use client";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

interface ProfileData {
  phone: string;
  createdAt: string;
  subscription?: {
    planName: string;
    startDate: string;
    endDate: string;
    status: string;
    durationDays: number;
  };
  hasActiveSubscription: boolean;
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
    month: "long",
    year: "numeric",
  });
}

function formatCFA(n: number) {
  return n.toLocaleString("fr-FR") + " FCFA";
}

function daysUntil(endDate: string) {
  const end = new Date(endDate);
  const now = new Date();
  const diff = end.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export default function ProfilePage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        router.push("/login");
        return;
      }

      const fetchProfile = async () => {
        try {
          const res = await fetch("/api/user/profile", {
            credentials: "include",
          });

          if (res.ok) {
            const data = await res.json();
            setProfile(data.data);
          }
        } catch (e) {
          console.error("Failed to fetch profile:", e);
        } finally {
          setLoading(false);
        }
      };

      fetchProfile();
    }
  }, [isLoading, user, router]);

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

  if (!profile) {
    return (
      <div style={{
        minHeight: "100vh",
        background: C.dark,
        padding: 24,
      }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <div style={{
            textAlign: "center",
            color: C.muted,
            paddingTop: 40,
          }}>
            Impossible de charger les informations du profil
          </div>
        </div>
      </div>
    );
  }

  const daysRemaining = profile.subscription ? daysUntil(profile.subscription.endDate) : 0;

  return (
    <div style={{ minHeight: "100vh", background: C.dark }}>
      <Navbar />
      <div style={{ padding: 24 }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 40 }}>
          <div style={{
            fontSize: 10,
            letterSpacing: "2px",
            color: C.gold,
            textTransform: "uppercase",
            fontWeight: 600,
            marginBottom: 8,
          }}>
            Mon compte
          </div>
          <h1 style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 40,
            color: C.text,
            letterSpacing: 1,
            margin: 0,
          }}>
            Profil
          </h1>
        </div>

        {/* User Information Section */}
        <div style={{
          background: C.dark3,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: 24,
          marginBottom: 20,
        }}>
          <div style={{
            fontSize: 12,
            letterSpacing: "1px",
            color: C.gold,
            textTransform: "uppercase",
            fontWeight: 600,
            marginBottom: 16,
          }}>
            Informations personnelles
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{
              fontSize: 11,
              color: C.muted,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              marginBottom: 6,
            }}>
              Téléphone
            </div>
            <div style={{
              fontSize: 14,
              color: C.text,
              fontWeight: 500,
            }}>
              {profile.phone}
            </div>
          </div>

          <div style={{
            fontSize: 11,
            color: C.muted,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            marginBottom: 6,
          }}>
            Membre depuis
          </div>
          <div style={{
            fontSize: 14,
            color: C.text,
            fontWeight: 500,
          }}>
            {formatDate(profile.createdAt)}
          </div>
        </div>

        {/* Billing Section */}
        <div style={{
          background: C.dark3,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: 24,
          marginBottom: 20,
        }}>
          <div style={{
            fontSize: 12,
            letterSpacing: "1px",
            color: C.gold,
            textTransform: "uppercase",
            fontWeight: 600,
            marginBottom: 16,
          }}>
            Abonnement
          </div>

          {profile.hasActiveSubscription && profile.subscription ? (
            <>
              {/* Status Badge */}
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                marginBottom: 16,
              }}>
                <div style={{
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background: C.green,
                }}></div>
                <span style={{
                  fontSize: 12,
                  color: C.green,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}>
                  Actif
                </span>
              </div>

              {/* Plan Name */}
              <div style={{ marginBottom: 16 }}>
                <div style={{
                  fontSize: 11,
                  color: C.muted,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  marginBottom: 6,
                }}>
                  Plan actuel
                </div>
                <div style={{
                  fontSize: 14,
                  color: C.gold,
                  fontWeight: 600,
                }}>
                  {profile.subscription.planName}
                </div>
              </div>

              {/* Start Date */}
              <div style={{ marginBottom: 16 }}>
                <div style={{
                  fontSize: 11,
                  color: C.muted,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  marginBottom: 6,
                }}>
                  Date de début
                </div>
                <div style={{
                  fontSize: 14,
                  color: C.text,
                  fontWeight: 500,
                }}>
                  {formatDate(profile.subscription.startDate)}
                </div>
              </div>

              {/* Next Payment Date */}
              <div style={{ marginBottom: 16 }}>
                <div style={{
                  fontSize: 11,
                  color: C.muted,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  marginBottom: 6,
                }}>
                  Renouvellement
                </div>
                <div style={{
                  fontSize: 14,
                  color: C.text,
                  fontWeight: 500,
                }}>
                  {formatDate(profile.subscription.endDate)}
                </div>
              </div>

              {/* Days Remaining */}
              <div style={{
                background: C.dark4,
                borderRadius: 8,
                padding: 12,
                textAlign: "center",
              }}>
                <div style={{
                  fontSize: 10,
                  color: C.muted,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  marginBottom: 6,
                }}>
                  Jours restants
                </div>
                <div style={{
                  fontSize: 24,
                  color: C.gold,
                  fontWeight: 700,
                }}>
                  {daysRemaining > 0 ? daysRemaining : "Expiré"}
                </div>
              </div>
            </>
          ) : (
            <>
              {/* No Subscription Status */}
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                marginBottom: 16,
              }}>
                <div style={{
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background: C.muted,
                }}></div>
                <span style={{
                  fontSize: 12,
                  color: C.muted,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}>
                  Pas d'abonnement actif
                </span>
              </div>

              <div style={{
                fontSize: 12,
                color: C.muted,
                marginBottom: 16,
              }}>
                Souscrivez à un plan pour accéder à tous les pronostics exclusifs.
              </div>

              <Link href="/billing">
                <button style={{
                  width: "100%",
                  background: C.gold,
                  color: C.dark,
                  border: "none",
                  borderRadius: 6,
                  padding: 12,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}>
                  Voir les plans
                </button>
              </Link>
            </>
          )}
        </div>
        </div>
      </div>

      <Footer />

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
