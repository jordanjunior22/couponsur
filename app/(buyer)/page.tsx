"use client";
import PremiumPicksPage from "@/components/PremiumPicksPage";

// The brand mark + account access now live in the shared BuyerTopBar
// (app/(buyer)/layout.tsx), present on every buyer tab — this screen is
// just the picks feed itself.
function BuyerPage() {
  return <PremiumPicksPage />;
}

export default BuyerPage;
