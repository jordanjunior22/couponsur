import mongoose, { Schema, Document, Model, Types } from "mongoose";
import type { GroupRoom } from "@/models/GroupMessage";

// One document per (room, user), upserted on every GET /api/group-chat poll
// (see that route) — the room-chat equivalent of models/UserPresence.ts,
// but scoped to a room instead of the whole site, and on a much shorter
// freshness window (see ONLINE_WINDOW_MS there) since it rides the chat's
// own 3s poll (components/GroupChatRoom.tsx) instead of a dedicated
// heartbeat: a backgrounded tab stops polling and naturally drops out of
// the "online" count within seconds, which a multi-minute window couldn't
// reflect. Bounded in size by (distinct users) × (rooms) — no cleanup job
// needed.
export interface IGroupPresence extends Document {
  room: GroupRoom;
  user: Types.ObjectId;
  lastSeenAt: Date;
}

const GroupPresenceSchema = new Schema<IGroupPresence>({
  room: { type: String, enum: ["premium", "global"], required: true },
  user: { type: Schema.Types.ObjectId, ref: "User", required: true },
  lastSeenAt: { type: Date, required: true },
});

GroupPresenceSchema.index({ room: 1, user: 1 }, { unique: true });
GroupPresenceSchema.index({ room: 1, lastSeenAt: 1 });

const GroupPresenceModel: Model<IGroupPresence> =
  mongoose.models.GroupPresence ||
  mongoose.model<IGroupPresence>("GroupPresence", GroupPresenceSchema, "grouppresence");

export default GroupPresenceModel;
