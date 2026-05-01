import mongoose, { Schema, Document, Model } from "mongoose";

export interface ISubscriptionPayment extends Document {
  userId: mongoose.Types.ObjectId;
  planId: mongoose.Types.ObjectId;
  phone: string;
  amount: number; // finalPrice of the plan
  fapshiTransId: string;
  status: "PENDING" | "SUCCESSFUL" | "FAILED" | "EXPIRED";
  subscriptionStartDate?: Date;
  subscriptionEndDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionPaymentSchema = new Schema<ISubscriptionPayment>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    planId: {
      type: Schema.Types.ObjectId,
      ref: "SubscriptionPlan",
      required: true,
      index: true,
    },
    phone: {
      type: String,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    fapshiTransId: {
      type: String,
      required: true,
      unique: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "SUCCESSFUL", "FAILED", "EXPIRED"],
      default: "PENDING",
    },
    subscriptionStartDate: { type: Date },
    subscriptionEndDate: { type: Date },
  },
  { timestamps: true }
);

// Compound index for fast lookups
SubscriptionPaymentSchema.index({ planId: 1, userId: 1, status: 1 });

const SubscriptionPaymentModel: Model<ISubscriptionPayment> =
  mongoose.models.SubscriptionPayment ||
  mongoose.model<ISubscriptionPayment>(
    "SubscriptionPayment",
    SubscriptionPaymentSchema,
    "subscription_payments"
  );

export default SubscriptionPaymentModel;
