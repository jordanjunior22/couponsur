import mongoose, { Schema, Document, Model } from "mongoose";

export interface IPayment extends Document {
  pickId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId; // ← added
  phone: string;
  amount: number;
  fapshiTransId: string;
  status: "PENDING" | "SUCCESSFUL" | "FAILED" | "EXPIRED"; // ← added EXPIRED
  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema = new Schema<IPayment>(
  {
    pickId: {
      type: Schema.Types.ObjectId,
      ref: "Pick",
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true, // always tied to a session from now on
      index: true,
    },
    phone: {
      type: String,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    fapshiTransId: {
      type: String,
      required: true,
      unique: true, // ← upgraded from index to unique (no duplicate transIds)
    },
    status: {
      type: String,
      enum: ["PENDING", "SUCCESSFUL", "FAILED", "EXPIRED"],
      default: "PENDING",
    },
  },
  { timestamps: true }
);

// Compound index: fast duplicate-payment lookup in /api/pay
PaymentSchema.index({ pickId: 1, userId: 1, status: 1 });

export default (mongoose.models.Payment as Model<IPayment>) ||
  mongoose.model<IPayment>("Payment", PaymentSchema);