// Shared gate for both group chat rooms:
//   - "premium": an ADMIN, or a USER whose subscription is currently ACTIVE
//     and not past its expiresAt (same "still active" definition used by
//     /api/subscribe and AuthContext's hasActiveSubscription — the
//     client-side check is just a convenience, this is the actual source
//     of truth).
//   - "global": any logged-in user — no subscription check at all.
import { cookies } from "next/headers";
import UserModel from "@/models/Users";
import { getSettings } from "@/models/Settings";
import { verifyToken } from "@/utils/auth";
import type { GroupRoom } from "@/models/GroupMessage";

export interface GroupChatUser {
  userId: string;
  phone: string;
  role: "USER" | "ADMIN";
  // Muted by an admin — can still view the room (this function still
  // succeeds), just not post. Always false for admins, who can't be
  // blocked. Shared across both rooms (it's an account-level flag, not
  // per-room) — callers that create/edit messages must check this
  // themselves; it's not enforced here since reading isn't affected.
  blocked: boolean;
}

export type GroupChatAccessResult =
  | { user: GroupChatUser }
  | { error: string; status: number };

export async function requireGroupChatAccess(room: GroupRoom = "premium"): Promise<GroupChatAccessResult> {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return { error: "Unauthorized", status: 401 };

  const decoded = verifyToken(token);
  if (!decoded) return { error: "Invalid token", status: 401 };

  const dbUser = await UserModel.findById(decoded.userId).select("phone role subscription groupChatBlocked");
  if (!dbUser) return { error: "Invalid token", status: 401 };

  const isAdmin = dbUser.role === "ADMIN";

  if (room === "premium") {
    const hasActiveSubscription =
      dbUser.subscription?.status === "ACTIVE" &&
      !!dbUser.subscription.expiresAt &&
      dbUser.subscription.expiresAt > new Date();

    if (!isAdmin && !hasActiveSubscription) {
      return { error: "Abonnement premium requis", status: 403 };
    }
  }
  // room === "global": anyone with a valid session passes — no
  // subscription check at all.

  // Admins keep access even while a room is switched off — they're the
  // ones who'd turn it back on, and may need to check on it during an
  // incident. `!== false` because existing Settings docs created before
  // these fields existed come back with them missing entirely, and that
  // should read as "on" (see models/Settings.ts).
  if (!isAdmin) {
    const settings = await getSettings();
    const enabled = room === "premium" ? settings.groupChatEnabled !== false : settings.globalChatEnabled !== false;
    if (!enabled) {
      return {
        error: room === "premium" ? "Le groupe premium est temporairement indisponible" : "Le chat global est temporairement indisponible",
        status: 403,
      };
    }
  }

  return {
    user: {
      userId: dbUser._id.toString(),
      phone: dbUser.phone,
      role: dbUser.role,
      blocked: !isAdmin && dbUser.groupChatBlocked === true,
    },
  };
}
