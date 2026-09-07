import { BuyerTopBar } from "@/components/BuyerTopBar";
import { BottomTabBar } from "@/components/BottomTabBar";

// Shared chrome for every buyer-facing tab (Accueil, Historique, Groupe,
// Pronostic IA, Profil): a top bar (brand + account access) and a bottom
// tab bar (section navigation). Each page reserves its own bottom
// padding/height for the bottom bar (see lib/layoutConstants.ts) rather
// than this layout imposing one blanket wrapper, because the Groupe tab
// needs an exact viewport-minus-both-bars height for its chat room instead
// of extra padding on top of a scrolling page. The top bar is sticky, not
// fixed, so it doesn't need the same treatment.
export default function BuyerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BuyerTopBar />
      {children}
      <BottomTabBar />
    </>
  );
}
