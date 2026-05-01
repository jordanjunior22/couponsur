"use client";

import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";

/**
 * Wrapper component that redirects users without active subscription to /billing
 * Use this to wrap pages that require a subscription
 */
export function SubscriptionGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Only check after auth is loaded
    if (loading) return;

    // If user is admin, allow access
    if (user && user.role === "ADMIN") {
      return;
    }

    // If user exists but doesn't have subscription, redirect to billing
    if (user && !user.hasActiveSubscription) {
      router.push("/billing");
      return;
    }

    // If not logged in, redirect to home (middleware should catch this, but just in case)
    if (!user && !loading) {
      router.push("/");
      return;
    }
  }, [user, loading, router]);

  // Show nothing while loading or redirecting
  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 14, color: "#7A8399" }}>Chargement...</div>
        </div>
      </div>
    );
  }

  // Only render children if user has subscription (or is admin)
  if (user && (user.hasActiveSubscription || user.role === "ADMIN")) {
    return <>{children}</>;
  }

  // Fallback (shouldn't reach here due to redirects above)
  return null;
}
