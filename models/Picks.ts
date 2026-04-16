import mongoose, { Schema, Document, Model } from "mongoose";

// ─── Enums ───────────────────────────────────────────────
export enum Outcome {
  PENDING = "PENDING",
  WIN = "WIN",
  LOSS = "LOSS",
}

// ─── Match Interface ─────────────────────────────────────
export interface IMatch {
  prediction: string;
  outcome: Outcome;
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
  matches: IMatch[];
  createdAt: Date;
  updatedAt: Date;
}

// ─── Match Schema (Subdocument) ──────────────────────────
const MatchSchema = new Schema<IMatch>(
  {
    prediction: {
      type: String,
      required: true,
      trim: true,
    },
    outcome: {
      type: String,
      enum: Object.values(Outcome),
      default: Outcome.PENDING,
    },
  },
  { _id: false } // ← MongoDB will not try to cast or create _id on subdocs
);

// ─── Pick Schema ─────────────────────────────────────────
const PickSchema = new Schema<IPick>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    price: {
      type: Number,
      required: true,
    },
    total_odds: {
      type: Number,
      required: true,
    },
    match_date: {
      type: Date,
      required: true,
    },
    league: {
      type: String,
      required: true,
      trim: true,
    },
    outcome: {
      type: String,
      enum: Object.values(Outcome),
      default: Outcome.PENDING,
    },
    is_published: {
      type: Boolean,
      default: false,
    },
    matches: {
      type: [MatchSchema],
      required: true,
      validate: {
        validator: (val: IMatch[]) => val.length > 0,
        message: "At least one match is required",
      },
    },
  },
  {
    timestamps: true, // adds createdAt & updatedAt
  }
);

// ─── Indexes (for performance) ───────────────────────────
PickSchema.index({ match_date: -1 });
PickSchema.index({ league: 1 });
PickSchema.index({ outcome: 1 });
PickSchema.index({ is_published: 1 });

// ─── Model Export (IMPORTANT: collection = "picks") ──────
const PickModel: Model<IPick> =
  mongoose.models.Pick ||
  mongoose.model<IPick>("Pick", PickSchema, "picks");

export default PickModel;