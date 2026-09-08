// The buyer app's top bar (components/BuyerTopBar.tsx) — brand mark on one
// side, account access opposite it, present on every buyer tab. Sticky,
// not fixed, so most pages don't need to know its height — the one
// exception is the Groupe tab, whose chat room needs an exact
// viewport-minus-both-bars height (see app/(buyer)/groupe/page.tsx).
export const TOP_BAR_HEIGHT = 56;

// Shared by every piece of chrome that has to agree on the buyer app's
// bottom tab bar (components/BottomTabBar.tsx) so nothing sits underneath
// it or leaves an awkward gap above it: the bar itself, the buyer pages
// that reserve bottom padding for it, and the floating widgets
// (ChatWidget, PWAInstallButton) that used to hug the raw viewport edge.
// The bar itself is a floating glass pill now (not an edge-to-edge strip),
// so this is the pill's own footprint *plus* the small gap it floats above
// the true viewport bottom — the one number every consumer needs, so it's
// rounded up rather than chased to the pixel.
export const BOTTOM_TAB_BAR_HEIGHT = 88;

// CSS length for the safe space to reserve above anything fixed to the
// viewport bottom on a buyer page — the bar's own height plus the iOS
// home-indicator inset (only non-zero in standalone/PWA mode with
// viewport-fit=cover, see the root layout's `viewport` export).
export const BOTTOM_SAFE_OFFSET = `calc(${BOTTOM_TAB_BAR_HEIGHT}px + env(safe-area-inset-bottom))`;
