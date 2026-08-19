import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type ChatSender = "USER" | "ADMIN";
export type ConversationStatus = "OPEN" | "RESOLVED";

export interface IChatMessage {
  _id?: Types.ObjectId;
  sender: ChatSender;
  text: string;
  createdAt: Date;
}

export interface IConversation extends Document {
  phone: string;
  user: Types.ObjectId | null;
  status: ConversationStatus;
  messages: IChatMessage[];
  lastMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ChatMessageSchema = new Schema<IChatMessage>(
  {
    sender: { type: String, enum: ["USER", "ADMIN"], required: true },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const ConversationSchema = new Schema<IConversation>(
  {
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    // Set when the visitor is logged in — the more reliable identity to
    // key a conversation on since (unlike phone) it can't be typo'd or
    // reused by someone else. Anonymous visitors leave this null and are
    // keyed on phone instead (see app/api/chat/route.ts).
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    status: {
      type: String,
      enum: ["OPEN", "RESOLVED"],
      default: "OPEN",
    },
    messages: {
      type: [ChatMessageSchema],
      default: [],
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

const ConversationModel: Model<IConversation> =
  mongoose.models.Conversation ||
  mongoose.model<IConversation>("Conversation", ConversationSchema, "conversations");

export default ConversationModel;
