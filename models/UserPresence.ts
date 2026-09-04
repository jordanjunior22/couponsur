import mongoose, { Schema, Document, Model, Types } from "mongoose";

// Exactly ONE document per user, upserted on every activity ping (see
// app/api/activity/ping/route.ts) — never grows past the user count,
// unlike a naive one-row-per-ping log. Powers "online now" in the admin
// dashboard: count where lastPingAt is within the last few minutes (see
// ONLINE_WINDOW_MS in the analytics route). The historical pattern (when
// users are typically active) lives separately in ActivityHourBucket —
// this collection only ever answers "who's here right now".
export interface IUserPresence extends Document {
  userId: Types.ObjectId;
  lastPingAt: Date;
}

const UserPresenceSchema = new Schema<IUserPresence>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  lastPingAt: { type: Date, required: true },
});

const UserPresenceModel: Model<IUserPresence> =
  mongoose.models.UserPresence ||
  mongoose.model<IUserPresence>("UserPresence", UserPresenceSchema, "userpresence");

export default UserPresenceModel;
