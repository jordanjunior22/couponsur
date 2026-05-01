import mongoose, { Schema, Document, Model } from "mongoose";

export interface IBetType extends Document {
  code: string; // "1X2", "BTTS", "DOUBLE_CHANCE", etc.
  label: string; // "Match Winner", "Both Teams Score", etc.
  description: string; // Explication pour les users
  category: "MATCH_RESULT" | "GOALS" | "PLAYERS" | "OTHER";
  predictions: string[]; // Les valeurs possibles: ["1", "X", "2"] ou ["YES", "NO"]
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const BetTypeSchema = new Schema<IBetType>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      enum: ["MATCH_RESULT", "GOALS", "PLAYERS", "OTHER"],
      default: "MATCH_RESULT",
    },
    predictions: {
      type: [String],
      required: true,
      validate: {
        validator: (val: string[]) => val.length > 0,
        message: "At least one prediction option is required",
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Index for faster queries (code: 1 is already created by unique: true)
BetTypeSchema.index({ isActive: 1 });

const BetTypeModel: Model<IBetType> =
  mongoose.models.BetType ||
  mongoose.model<IBetType>("BetType", BetTypeSchema, "bet_types");

export default BetTypeModel;
