import type { Metadata } from "next";
import OnboardingClient from "@/components/OnboardingClient";

// Standalone ad-landing route — deliberately not wired into BottomTabBar
// or any other nav (see conversation this was built from). Its own
// metadata (rather than inheriting the root layout's) since this is what
// an ad's link preview / share card actually shows.
export const metadata: Metadata = {
  title: "Coupon Sûr — Installez l'application",
  description:
    "Pronostics sportifs vérifiés, Pronostic IA, Actus et Chat en direct. Installez Coupon Sûr sur votre téléphone en quelques secondes, sans passer par un app store.",
};

export default function OnboardingPage() {
  return <OnboardingClient />;
}
