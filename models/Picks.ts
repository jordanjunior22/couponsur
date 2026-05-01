import mongoose, { Schema, Document, Model } from "mongoose";

// ─── Enums ───────────────────────────────────────────────
export enum Outcome {
  PENDING = "PENDING",
  WIN = "WIN",
  LOSS = "LOSS",
}

export enum PickType {
  SIMPLE = "SIMPLE",
  COMBINÉ = "COMBINÉ",
  IMAGE = "IMAGE",
}

export enum PickCategory {
  GROSSES_COTES = "GROSSES_COTES",
  MONTANTES = "MONTANTES",
  SAFE = "SAFE",
}

// ─── Match Interface ─────────────────────────────────────
export interface IMatch {
  matchId: string; // "PSG_vs_Lyon_2026-05-10" or unique identifier
  teams?: {
    home: string;
    away: string;
  };
  betTypeCode: string; // Reference to BetType code (e.g., "1X2", "BTTS")
  prediction: string; // The actual prediction (e.g., "1", "YES", "1X")
  odds?: number; // Optional: the odds for this specific prediction
  outcome: Outcome;
}

// ─── Coupon Code Interface ───────────────────────────────
export interface ICouponCode {
  code: string; // The actual coupon code
  broker: string; // "1xbet", "linebet", "bet365", etc.
}

// ─── Pick Image Interface ────────────────────────────────
export interface IPickImage {
  data: Buffer; // Binary image data
  contentType: string; // "image/jpeg", "image/png", etc.
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
  pickType: PickType; // SIMPLE, COMBINÉ, or IMAGE
  category?: PickCategory; // GROSSES_COTES, MONTANTES, or SAFE (optional)
  matchup?: string; // "PSG vs Lyon" - for display/IMAGE type
  oddsValue?: number; // The odds value for the pick
  matches?: IMatch[]; // Matches (required for SIMPLE/COMBINÉ, optional for IMAGE)
  images?: IPickImage[]; // Multiple images for IMAGE type
  isImageRestricted?: boolean; // If true, only subscribed users or those who unlocked see images
  couponCode?: ICouponCode; // { code: "ABC123", broker: "1xbet" }
  createdAt: Date;
  updatedAt: Date;
}

// ─── Match Schema (Subdocument) ──────────────────────────
const MatchSchema = new Schema<IMatch>(
  {
    matchId: {
      type: String,
      required: true,
      trim: true,
    },
    teams: {
      type: {
        home: { type: String, required: true },
        away: { type: String, required: true },
      },
      required: false,
    },
    betTypeCode: {
      type: String,
      required: true,
      trim: true,
    },
    prediction: {
      type: String,
      required: true,
      trim: true,
    },
    odds: {
      type: Number,
      required: false,
      min: 1.0,
    },
    outcome: {
      type: String,
      enum: Object.values(Outcome),
      default: Outcome.PENDING,
    },
  },
  { _id: false }
);

// ─── Coupon Code Schema ──────────────────────────────────
const CouponCodeSchema = new Schema<ICouponCode>(
  {
    code: {
      type: String,
      required: true,
      trim: true,
    },
    broker: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { _id: false }
);

// ─── Pick Image Schema ───────────────────────────────────
const PickImageSchema = new Schema<IPickImage>(
  {
    data: {
      type: Buffer,
      required: true,
    },
    contentType: {
      type: String,
      required: true,
    },
  },
  { _id: false }
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
    pickType: {
      type: String,
      enum: Object.values(PickType),
      default: PickType.SIMPLE,
    },
    category: {
      type: String,
      enum: Object.values(PickCategory),
      required: false,
    },
    matchup: {
      type: String,
      required: false,
      trim: true,
    },
    oddsValue: {
      type: Number,
      required: false,
      min: 1.0,
    },
    matches: {
      type: [MatchSchema],
      required: false,
      default: [],
    },
    images: {
      type: [PickImageSchema],
      required: false,
      default: [],
    },
    isImageRestricted: {
      type: Boolean,
      default: false,
    },
    couponCode: {
      type: CouponCodeSchema,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

// ─── Indexes (for performance) ───────────────────────────
PickSchema.index({ match_date: -1 });
PickSchema.index({ league: 1 });
PickSchema.index({ outcome: 1 });
PickSchema.index({ is_published: 1 });
PickSchema.index({ pickType: 1 });
PickSchema.index({ category: 1 });
PickSchema.index({ outcome: 1, is_published: 1 }); // For filtering "WIN" picks

// ─── Model Export (IMPORTANT: collection = "picks") ──────
const PickModel: Model<IPick> =
  mongoose.models.Pick ||
  mongoose.model<IPick>("Pick", PickSchema, "picks");

export default PickModel;
