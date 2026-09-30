import mongoose, { Schema, Document, Model } from "mongoose";

export type PayoutStatus = "REQUESTED" | "PROCESSING" | "PAID" | "REJECTED" | "FAILED";

// A payout is settled by the super admin triggering a real Fapshi
// disbursement (see utils/fapshiPayout.ts + app/api/admin/payouts/[id]/decide)
// — that call is async, so REQUESTED -> PROCESSING happens the moment Fapshi
// accepts the transfer, and PROCESSING -> PAID/FAILED happens later, when
// Fapshi's webhook (app/api/payout/webhook) confirms the outcome. FAILED is
// retriable — the super admin can hit "Payer via Fapshi" again from there.
export interface IPayout extends Document {
  adminId: mongoose.Types.ObjectId;
  amount: number;
  status: PayoutStatus;
  note?: string | null;
  fapshiTransId?: string | null;
  fapshiStatus?: string | null;
  // Fapshi doesn't publish a flat fee rate — the mobile money operator's
  // cut varies per transaction and only becomes known once the transfer
  // actually completes, reported via the webhook's `revenue` field
  // ("amount received when Fapshi fees have been deducted"). operatorFee =
  // amount - netAmount, captured on PAID only — never estimated upfront.
  operatorFee?: number | null;
  netAmount?: number | null;
  decidedAt?: Date | null;
  decidedBy?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const PayoutSchema = new Schema<IPayout>(
  {
    adminId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
    },
    status: {
      type: String,
      enum: ["REQUESTED", "PROCESSING", "PAID", "REJECTED", "FAILED"],
      default: "REQUESTED",
    },
    note: { type: String, default: null },
    // Set once Fapshi accepts the /payout call — the id the webhook uses to
    // find this record back (app/api/payout/webhook/route.ts).
    fapshiTransId: { type: String, default: null, index: true },
    // Last raw status word Fapshi reported (e.g. "FAILED", "EXPIRED") — kept
    // for support/debugging, distinct from our own `status` above.
    fapshiStatus: { type: String, default: null },
    operatorFee: { type: Number, default: null },
    netAmount: { type: Number, default: null },
    decidedAt: { type: Date, default: null },
    decidedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

PayoutSchema.index({ adminId: 1, status: 1 });

const PayoutModel: Model<IPayout> =
  mongoose.models.Payout || mongoose.model<IPayout>("Payout", PayoutSchema, "payouts");

export default PayoutModel;
