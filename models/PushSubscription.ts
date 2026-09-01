import mongoose, { Schema, Document, Model, Types } from "mongoose";

// One document per browser subscription (the PushManager endpoint URL is
// unique per browser+origin). Not tied to a User — any visitor, logged
// in or not, can enable notifications, matching how the chat widget
// already treats anonymous visitors as first-class.
export interface IPushSubscription extends Document {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  // Set when the subscribing browser belongs to a logged-in session —
  // optional, purely informational (e.g. for future targeted pushes).
  user: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const PushSubscriptionSchema = new Schema<IPushSubscription>(
  {
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

const PushSubscriptionModel: Model<IPushSubscription> =
  mongoose.models.PushSubscription ||
  mongoose.model<IPushSubscription>("PushSubscription", PushSubscriptionSchema, "pushsubscriptions");

export default PushSubscriptionModel;
