/**
 * lib/groupRoomPush.ts
 *
 * Tells the members of a chat room that something new was said - without
 * turning a lively room into a stream of notifications.
 *
 * Rules:
 *  - At most one broadcast per room every ROOM_PUSH_GAP_MS. The first message
 *    after a quiet spell notifies everyone; the burst that follows doesn't
 *    (they'll see it in the room). One atomic update decides who wins, so
 *    simultaneous messages can't each fire one.
 *  - Never the sender, never anyone currently looking at the room, never
 *    anyone who muted that room in Profil.
 *  - Premium: active subscribers (+ admins). Global: every account that
 *    allowed notifications.
 *  - Admins: a message from a MEMBER alerts admins immediately and every time
 *    (notifyAdminsOfMessage below), so the broadcast skips them then; a
 *    message from an ADMIN has no such alert, so the broadcast includes the
 *    other admins.
 *  - Notifications share one tag per room, so on a phone they replace each
 *    other instead of stacking.
 */
import GroupRoomStateModel from "@/models/GroupRoomState";
import GroupPresenceModel from "@/models/GroupPresence";
import PushSubscriptionModel from "@/models/PushSubscription";
import UserModel from "@/models/Users";
import { connectDB } from "@/utils/ConnectDb";
import { ONLINE_WINDOW_MS } from "@/utils/groupChatPresence";
import { sendPushToUsers } from "@/lib/webpush";
import type { GroupRoom } from "@/models/GroupMessage";

const ROOM_PUSH_GAP_MS = 2 * 60 * 1000;

// True for the one caller that gets to broadcast right now.
async function claimBroadcast(room: GroupRoom): Promise<boolean> {
  const now = Date.now();
  try {
    await GroupRoomStateModel.findOneAndUpdate(
      { room, $or: [{ lastPushAt: null }, { lastPushAt: { $lte: new Date(now - ROOM_PUSH_GAP_MS) } }] },
      { $set: { lastPushAt: new Date(now) } },
      { upsert: true }
    );
    return true;
  } catch (error) {
    // The room's state document already exists and was updated too recently
    // for the filter to match, so the upsert tried to create a duplicate.
    if ((error as { code?: number })?.code === 11000) return false;
    throw error;
  }
}

// Immediate alert to the admins about a message from a member - the team
// watches the rooms, so this is not rate-limited like the broadcast. Skips
// admins who muted the room or are already in it, and shares the room's tag
// so it replaces (never stacks with) the room notification.
export async function notifyAdminsOfMessage(args: {
  room: GroupRoom;
  senderId: string;
  senderLabel: string;
  preview: string;
}) {
  const { room, senderId, senderLabel, preview } = args;
  await connectDB();

  const online = await GroupPresenceModel.find({
    room,
    lastSeenAt: { $gte: new Date(Date.now() - ONLINE_WINDOW_MS) },
  })
    .select("user")
    .lean();
  const skip = [senderId, ...online.map((p) => p.user.toString())];

  const admins = await UserModel.find({
    role: "ADMIN",
    _id: { $nin: skip },
    [`groupPushMuted.${room}`]: { $ne: true },
  })
    .select("_id")
    .lean();
  if (admins.length === 0) return;

  await sendPushToUsers(admins.map((a) => a._id.toString()), {
    title: room === "premium" ? "👑 Groupe Premium" : "🌍 Chat Global",
    body: `${senderLabel} : ${preview}`,
    url: room === "premium" ? "/groupe/premium" : "/groupe/global",
    tag: `group-${room}`,
  });
}

export async function notifyRoomOfNewMessage(args: {
  room: GroupRoom;
  senderId: string;
  senderLabel: string;
  preview: string;
  senderIsAdmin: boolean;
}) {
  const { room, senderId, senderLabel, preview, senderIsAdmin } = args;
  await connectDB();

  if (!(await claimBroadcast(room))) return;

  // Who could possibly receive a push: accounts with a stored subscription.
  const subscribedIds: string[] = (await PushSubscriptionModel.distinct("user", { user: { $ne: null } })).map(String);
  if (subscribedIds.length === 0) return;

  // Anyone currently looking at the room doesn't need telling.
  const online = await GroupPresenceModel.find({
    room,
    lastSeenAt: { $gte: new Date(Date.now() - ONLINE_WINDOW_MS) },
  })
    .select("user")
    .lean();
  const skip = new Set<string>([senderId, ...online.map((p) => p.user.toString())]);

  const subscriber = { "subscription.status": "ACTIVE", "subscription.expiresAt": { $gt: new Date() } };
  const eligibility =
    room === "premium"
      ? senderIsAdmin
        ? { $or: [{ role: "ADMIN" }, subscriber] }
        : { role: { $ne: "ADMIN" }, ...subscriber }
      : senderIsAdmin
        ? {}
        : { role: { $ne: "ADMIN" } };

  const recipients: string[] = [];
  const CHUNK = 1000;
  const candidates = subscribedIds.filter((id) => !skip.has(id));
  for (let i = 0; i < candidates.length; i += CHUNK) {
    const users = await UserModel.find({
      _id: { $in: candidates.slice(i, i + CHUNK) },
      [`groupPushMuted.${room}`]: { $ne: true },
      ...eligibility,
    })
      .select("_id")
      .lean();
    recipients.push(...users.map((u) => u._id.toString()));
  }
  if (recipients.length === 0) return;

  await sendPushToUsers(recipients, {
    title: room === "premium" ? "👑 Groupe Premium" : "🌍 Chat Global",
    body: `${senderLabel} : ${preview}`,
    url: room === "premium" ? "/groupe/premium" : "/groupe/global",
    tag: `group-${room}`,
  });
}
