import mongoose, { Schema, Document, Model } from "mongoose";

// Historical hardcoded tip options (from the pick form + SoccerVital import
// modal) merged into one list — kept as the default so existing installs
// see exactly the same choices they always had, with nothing dropped.
export const DEFAULT_TIP_OPTIONS = [
  "1", "X", "2", "1X", "X2", "12", "BTTS", "O 2.5", "U 2.5", "O 1.5", "U 1.5", "DNB",
];

export type MatchGeneratorAccess = "EVERYONE" | "PREMIUM";

// Kept as a local, hardcoded list (like DEFAULT_TIP_OPTIONS above) rather
// than importing Market from lib/predictionengine.ts — models/ shouldn't
// need to depend on lib/ for a small fixed set of string keys.
export const MATCH_GENERATOR_MARKETS = ["1X2", "DC", "BTTS", "OU15", "OU25", "OU35"] as const;
export type MatchGeneratorMarket = typeof MATCH_GENERATOR_MARKETS[number];

// Same default as matchGeneratorAccess ("PREMIUM") so adding this field
// doesn't silently open any market up for existing installs — an admin has
// to deliberately loosen a market to EVERYONE.
const DEFAULT_MARKET_ACCESS: Record<MatchGeneratorMarket, MatchGeneratorAccess> = {
  "1X2": "PREMIUM", DC: "PREMIUM", BTTS: "PREMIUM", OU15: "PREMIUM", OU25: "PREMIUM", OU35: "PREMIUM",
};

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
  /** Who can OPEN the generator once enabled: every logged-in user, or only
   *  those with an active subscription. This is the outer gate — a market
   *  set to EVERYONE below still requires passing this first. */
  matchGeneratorAccess: MatchGeneratorAccess;
  /** Finer-grained gate WITHIN the generator: which markets require an
   *  active subscription vs are open to anyone who already passed
   *  matchGeneratorAccess. Existing settings docs created before this field
   *  existed come back with it missing entirely (Mongoose defaults only
   *  apply on document creation, not to already-stored docs) — every
   *  reader of this field falls back to "PREMIUM" per market, same as the
   *  schema default, so an un-migrated install behaves exactly as before. */
  matchGeneratorMarketAccess: Record<MatchGeneratorMarket, MatchGeneratorAccess>;
  /** How many matches a single generation produces. */
  matchGeneratorMatchCount: number;
  /** Master switch for the premium group chat (admins + active
   *  subscribers). On by default — unlike the match generator, this ships
   *  already requested and meant to be live; an admin can still flip it
   *  off (e.g. during moderation or an incident) without touching code. */
  groupChatEnabled: boolean;
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
    matchGeneratorMarketAccess: { type: Schema.Types.Mixed, default: () => ({ ...DEFAULT_MARKET_ACCESS }) },
    matchGeneratorMatchCount: { type: Number, default: 3, min: 1, max: 10 },
    groupChatEnabled: { type: Boolean, default: true },
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