import mongoose, { Schema, Document, Model } from "mongoose";

// Historical hardcoded tip options (from the pick form + SoccerVital import
// modal) merged into one list — kept as the default so existing installs
// see exactly the same choices they always had, with nothing dropped.
export const DEFAULT_TIP_OPTIONS = [
  "1", "X", "2", "1X", "X2", "12", "BTTS", "O 2.5", "U 2.5", "O 1.5", "U 1.5", "DNB",
];

export type MatchGeneratorAccess = "EVERYONE" | "PREMIUM";

export interface ISettings extends Document {
  key: string; // singleton, always "global"
  subscriptionMonthlyPrice: number;
  /** Admin-manageable list of selectable tip/market labels (1, X, 2, 1X, …)
   *  offered when adding a selection to a pick. Optional with a default so
   *  existing settings docs (and existing picks, which just store the tip
   *  as a free string) are unaffected. */
  tipOptions: string[];
  /** Master switch for the buyer-facing "AI match generator" (ephemeral,
   *  not saved to the DB — see app/api/generate-matches/route.ts). Off by
   *  default so it has to be deliberately turned on. */
  matchGeneratorEnabled: boolean;
  /** Who can use the generator once enabled: every logged-in user, or only
   *  those with an active subscription. */
  matchGeneratorAccess: MatchGeneratorAccess;
  /** How many matches a single generation produces. */
  matchGeneratorMatchCount: number;
  updatedAt: Date;
  createdAt: Date;
}

const SettingsSchema = new Schema<ISettings>(
  {
    key: { type: String, required: true, unique: true, default: "global" },
    subscriptionMonthlyPrice: { type: Number, required: true, default: 5000 },
    tipOptions: { type: [String], default: DEFAULT_TIP_OPTIONS },
    matchGeneratorEnabled: { type: Boolean, default: false },
    matchGeneratorAccess: { type: String, enum: ["EVERYONE", "PREMIUM"], default: "PREMIUM" },
    matchGeneratorMatchCount: { type: Number, default: 3, min: 1, max: 10 },
  },
  { timestamps: true }
);

const SettingsModel: Model<ISettings> =
  mongoose.models.Settings || mongoose.model<ISettings>("Settings", SettingsSchema, "settings");

export default SettingsModel;

/** Fetches the singleton settings doc, creating it with defaults if it doesn't exist yet. */
export async function getSettings(): Promise<ISettings> {
  let settings = await SettingsModel.findOne({ key: "global" });
  if (!settings) {
    settings = await SettingsModel.create({ key: "global" });
  }
  return settings;
}