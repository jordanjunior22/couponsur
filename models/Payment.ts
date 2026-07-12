import mongoose, { Schema, Document, Model } from "mongoose";
export interface IPayment extends Document {
  pickId?: mongoose.Types.ObjectId | null;
  userId: mongoose.Types.ObjectId;
  paymentType: "PICK" | "SUBSCRIPTION";
  phone: string;
  amount: number;
  fapshiTransId: string;
  status: "PENDING" | "SUCCESSFUL" | "FAILED" | "EXPIRED";
  // ── Captured at initiation time for server-side Conversions API ──────────
  clientIp?: string | null;
  userAgent?: string | null;
  fbc?: string | null; // _fbc cookie
  fbp?: string | null; // _fbp cookie
  sourceUrl?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema = new Schema<IPayment>(
  {
    pickId: {
      type: Schema.Types.ObjectId,
      ref: "Pick",
      required: false,
    },
    paymentType: {
      type: String,
      enum: ["PICK", "SUBSCRIPTION"],
      default: "PICK",
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
    clientIp:  { type: String, default: null },
    userAgent: { type: String, default: null },
    fbc:       { type: String, default: null },
    fbp:       { type: String, default: null },
    sourceUrl: { type: String, default: null },
  },
  { timestamps: true }
);

// Compound index: fast duplicate-payment lookup in /api/pay
PaymentSchema.index({ pickId: 1, userId: 1, status: 1 });

export default (mongoose.models.Payment as Model<IPayment>) ||
  mongoose.model<IPayment>("Payment", PaymentSchema);