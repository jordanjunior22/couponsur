import mongoose, { Schema, Document, Model } from "mongoose";

// ─── Enums ───────────────────────────────────────────────
export enum Outcome {
  PENDING = "PENDING",
  WIN = "WIN",
  LOSS = "LOSS",
}

export type PickTier = "safe" | "value" | "bold";

// ─── Match Interface ─────────────────────────────────────
export interface IMatch {
  prediction: string;
  outcome: Outcome;
  fixtureId?: number | null;
  tip?: string | null;
  score?: string | null;
}

// ─── Pick Interface ──────────────────────────────────────
export interface IPick extends Document {
  title: string;
  price: number;
  total_odds: number;
  match_date: Date;
  league: string;
  outcome: Outcome;
  is_published: boolean;
  is_automated?: boolean;
  /** Combo tier: safe | value | bold (only set on automated picks) */
  tier?: PickTier | null;
  /** Average confidence score (0–100) across all matches in this pick */
  avg_confidence?: number | null;
  matches: IMatch[];
  createdAt: Date;
  updatedAt: Date;
}

// ─── Match Schema (Subdocument) ──────────────────────────
const MatchSchema = new Schema<IMatch>(
  {
    prediction: { type: String, required: true, trim: true },
    outcome: {
      type: String,
      enum: Object.values(Outcome),
      default: Outcome.PENDING,
    },
    fixtureId: { type: Number, default: null },
    tip:       { type: String, default: null },
    score:     { type: String, default: null },
  },
  { _id: false }
);

// ─── Pick Schema ─────────────────────────────────────────
const PickSchema = new Schema<IPick>(
  {
    title:      { type: String, required: true, trim: true },
    price:      { type: Number, required: true },
    total_odds: { type: Number, required: true },
    match_date: { type: Date,   required: true },
    league:     { type: String, required: true, trim: true },
    outcome: {
      type:    String,
      enum:    Object.values(Outcome),
      default: Outcome.PENDING,
    },
    is_published:   { type: Boolean, default: false },
    is_automated:   { type: Boolean, default: false },
    tier: {
      type:    String,
      enum:    ["safe", "value", "bold", null],
      default: null,
    },
    avg_confidence: { type: Number, default: null },
    matches: {
      type:     [MatchSchema],
      required: true,
      validate: {
        validator: (val: IMatch[]) => val.length > 0,
        message: "At least one match is required",
      },
    },
  },
  { timestamps: true }
);

// ─── Indexes ─────────────────────────────────────────────
PickSchema.index({ match_date: -1 });
PickSchema.index({ league: 1 });
PickSchema.index({ outcome: 1 });
PickSchema.index({ is_published: 1 });
PickSchema.index({ is_automated: 1 });
PickSchema.index({ tier: 1 });

// ─── Model Export ─────────────────────────────────────────
const PickModel: Model<IPick> =
  mongoose.models.Pick || mongoose.model<IPick>("Pick", PickSchema, "picks");

export default PickModel;