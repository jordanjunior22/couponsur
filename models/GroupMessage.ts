import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type GroupSender = "USER" | "ADMIN";

// Snapshot of the message being replied to, captured at reply time so
// rendering a reply never needs a second lookup and a later edit/delete of
// the original doesn't retroactively change what the reply displays.
export interface IGroupReplyPreview {
  messageId: Types.ObjectId;
  user: Types.ObjectId; // lets the client color the quote the same as that sender's other messages
  role: GroupSender;
  phone: string; // full, unmasked — masked the same way as the parent message on the way out
  text: string; // truncated preview, see REPLY_PREVIEW_LENGTH below
}

export type GroupRoom = "premium" | "global";

// One flat collection, two rooms: the original premium group chat, and
// "Chat Global" (open to any logged-in user). Unlike Conversation (one
// document per visitor thread), every message here lives in one of two
// streams distinguished by `room`, ordered by createdAt.
export interface IGroupMessage extends Document {
  // Absent on every document written before this field existed — those are
  // all premium-room messages (the only room that existed then). Every
  // reader of this field (queries, API routes) treats "missing" the same
  // as "premium" rather than backfilling every old document; see the group
  // chat API routes for the exact query shape this requires.
  room?: GroupRoom;
  user: Types.ObjectId;
  // Denormalized at send time so history renders without a join, and so a
  // deleted/renamed account doesn't blank out old messages. Stored in full
  // (unmasked) — masking happens only where it's displayed, see
  // utils/maskPhone.ts — so admins can still trace a message back to an
  // account from the DB if moderation ever needs it.
  phone: string;
  // Snapshot of the sender's role at send time, so the UI can label a
  // message "Admin" even if that admin's role changes later.
  role: GroupSender;
  text: string;
  // A single attached image, stored inline as a data URI ("data:image/...")
  // — compressed/downscaled client-side before upload. This is a deliberate
  // trade-off (see conversation with the user): no external storage
  // provider is configured for this project, and keeping images in the
  // message doc is exactly what lets the admin panel report "storage used"
  // and offer a one-click "clear all chats" to reclaim it.
  image: string | null;
  // Decoded byte size of `image`, computed once at write time so storage
  // stats don't have to re-decode base64 for every message on every read.
  imageBytes: number;
  replyTo: IGroupReplyPreview | null;
  // Admin-only moderation flag — surfaces the message in the pinned strip
  // at the top of the room. Not per-user (that's `star`, kept client-side).
  pinned: boolean;
  createdAt: Date;
  editedAt?: Date | null;
}

const GroupReplyPreviewSchema = new Schema<IGroupReplyPreview>(
  {
    messageId: { type: Schema.Types.ObjectId, required: true },
    user: { type: Schema.Types.ObjectId, required: true },
    role: { type: String, enum: ["USER", "ADMIN"], required: true },
    phone: { type: String, required: true },
    text: { type: String, required: true },
  },
  { _id: false }
);

const GroupMessageSchema = new Schema<IGroupMessage>(
  {
    // No `default` here on purpose — every write after this change sets it
    // explicitly (see app/api/group-chat/route.ts's POST), so a default
    // would only ever paper over a bug that forgot to pass it.
    room: { type: String, enum: ["premium", "global"] },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    phone: { type: String, required: true },
    role: { type: String, enum: ["USER", "ADMIN"], required: true },
    // Not `required` — an image-only message (no caption) is valid; the
    // pre-validate hook below is what actually enforces "text or image".
    text: { type: String, default: "", trim: true, maxlength: 2000 },
    image: { type: String, default: null },
    imageBytes: { type: Number, default: 0 },
    replyTo: { type: GroupReplyPreviewSchema, default: null },
    pinned: { type: Boolean, default: false },
    editedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// A text-less, image-less message is meaningless — but an image-only
// message (no caption) is a normal thing to send, so text can't just be
// `required` on its own the way Conversation's chat messages are. Enforced
// at the API layer (POST /api/group-chat rejects an empty text+image body
// before this schema is ever touched) rather than here, to sidestep
// Mongoose's pre-validate hook typing friction for no real benefit — this
// model is only ever written to through that one route.

// Messages are always fetched newest-window in createdAt order, scoped to
// one room at a time.
GroupMessageSchema.index({ createdAt: 1 });
GroupMessageSchema.index({ pinned: 1 });
GroupMessageSchema.index({ room: 1, createdAt: 1 });

const GroupMessageModel: Model<IGroupMessage> =
  mongoose.models.GroupMessage ||
  mongoose.model<IGroupMessage>("GroupMessage", GroupMessageSchema, "groupmessages");

export default GroupMessageModel;
