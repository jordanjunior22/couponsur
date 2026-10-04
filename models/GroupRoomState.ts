import mongoose, { Schema, Document, Model } from "mongoose";
import type { GroupRoom } from "@/models/GroupMessage";

// One tiny document per room, holding the moment its members were last
// notified of new messages - the shared gate that keeps a busy room from
// firing a push for every single message (see lib/groupRoomPush.ts).
export interface IGroupRoomState extends Document {
  room: GroupRoom;
  lastPushAt: Date | null;
}

const GroupRoomStateSchema = new Schema<IGroupRoomState>({
  room: { type: String, enum: ["premium", "global"], required: true, unique: true },
  lastPushAt: { type: Date, default: null },
});

const GroupRoomStateModel: Model<IGroupRoomState> =
  mongoose.models.GroupRoomState ||
  mongoose.model<IGroupRoomState>("GroupRoomState", GroupRoomStateSchema, "grouproomstates");

export default GroupRoomStateModel;
