// Who may see a pick's actual selections.
//
// A coupon that is still LIVE (outcome PENDING) is the paid product: its tips,
// odds and confidence must only reach someone who has paid for it (bought it,
// is subscribed) or is staff. The list endpoints used to send everything to
// everyone and rely on the screen to blur it - so the tips of unpaid live
// coupons were readable in the network response. This masks them on the
// SERVER for everyone who hasn't earned them.
//
// Finished coupons (WIN / LOSS / REFUNDED) stay fully visible - that's the
// public track record on the history pages.
import { cookies } from "next/headers";
import { verifyToken } from "@/utils/auth";
import UserModel from "@/models/Users";

export interface PickViewer {
  isAdmin: boolean;
  isSubscribed: boolean;
  unlocked: Set<string>;
}

/** The signed-in viewer's entitlements, or null for a visitor. Never throws. */
export async function resolveViewer(): Promise<PickViewer | null> {
  try {
    const token = (await cookies()).get("token")?.value;
    const decoded = token ? verifyToken(token) : null;
    if (!decoded) return null;

    const user = await UserModel.findById(decoded.userId).select("role subscription unlockedPickIds").lean();
    if (!user) return null;

    const isSubscribed =
      user.subscription?.status === "ACTIVE" &&
      !!user.subscription.expiresAt &&
      new Date(user.subscription.expiresAt) > new Date();

    return {
      isAdmin: user.role === "ADMIN",
      isSubscribed,
      unlocked: new Set((user.unlockedPickIds ?? []).map((id) => id.toString())),
    };
  } catch {
    return null;
  }
}

interface MaskableMatch {
  home: string;
  away: string;
  league?: string | null;
  outcome: string;
  kickoff?: string | null;
  date?: Date | string | null;
}

interface MaskablePick {
  _id: { toString(): string };
  outcome: string;
  matches?: MaskableMatch[];
}

export function canSeeSelections(pick: MaskablePick, viewer: PickViewer | null): boolean {
  if (pick.outcome !== "PENDING") return true;
  if (!viewer) return false;
  return viewer.isAdmin || viewer.isSubscribed || viewer.unlocked.has(pick._id.toString());
}

/**
 * Returns the pick as this viewer may see it. A locked live coupon keeps its
 * title, league, total odds, kickoff times and the TEAMS (the screen shows
 * "you can see the matches, unlock for the tips") but loses every selection
 * detail.
 */
export function maskPickForViewer<T extends MaskablePick>(pick: T, viewer: PickViewer | null): T {
  if (canSeeSelections(pick, viewer)) return pick;
  return {
    ...pick,
    matches: (pick.matches ?? []).map((m) => ({
      home: m.home,
      away: m.away,
      league: m.league,
      outcome: m.outcome,
      kickoff: m.kickoff ?? null,
      date: m.date ?? null,
      // Selection details deliberately blank.
      tip: "",
      odd: 0,
    })),
  } as T;
}
