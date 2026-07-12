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
  prediction?: string;
  outcome: Outcome;
  fixtureId?: number | null;
  tip?: string | null;
  odd?: number | null;
  score?: string | null;
  home: string;
  away: string;
  league?: string | null;
  confidence?: number | null;
  sources?: string[];
  /** The calendar date this specific match was played/scheduled on.
   *  Defaults to the pick's match_date at creation time — combo legs are
   *  always same-day, so this is safe to derive there. Used by
   *  grade-picks to disambiguate re-matches (same two teams playing
   *  again later) instead of matching on team names alone. */
  date?: Date | null;
}
// ─── Pick Interface ──────────────────────────────────────
export interface IPick extends Document {
  title: string;
  price: number;
  total_odds: number;
  is_estimated_odds?: boolean;
  match_date: Date;
  league: string;
  outcome: Outcome;
  is_published: boolean;
  is_automated?: boolean;
  tier?: PickTier | null;
  avg_confidence?: number | null;
  is_manually_graded?: boolean;
  graded_at?: Date | null;
  matches: IMatch[];
  createdAt: Date;
  updatedAt: Date;
}

// ─── Match Schema (Subdocument) ──────────────────────────
const MatchSchema = new Schema<IMatch>(
  {
    prediction: { type: String, trim: true, default: null },
    outcome: {
      type: String,
      enum: Object.values(Outcome),
      default: Outcome.PENDING,
    },
    fixtureId:  { type: Number, default: null },
    tip:        { type: String, default: null },
    odd:        { type: Number, default: null },
    score:      { type: String, default: null },
    home:       { type: String, required: true, trim: true },
    away:       { type: String, required: true, trim: true },
    league:     { type: String, default: null },
    confidence: { type: Number, default: null },
    sources:    { type: [String], default: undefined },
    date:       { type: Date, default: null },
  },
  { _id: false }
);
// ─── Pick Schema ─────────────────────────────────────────
const PickSchema = new Schema<IPick>(
  {
    title:      { type: String, required: true, trim: true },
    price:      { type: Number, required: true },
    total_odds: { type: Number, required: true },
    is_estimated_odds: { type: Boolean, default: false },
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
    is_manually_graded: { type: Boolean, default: false },
    graded_at: { type: Date, default: null },
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