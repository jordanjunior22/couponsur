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
  /** How many generations a FREE (non-subscribed) user gets per day (resets
   *  at midnight WAT). Subscribers and admins are unlimited. See
   *  lib/generatorQuota.ts. */
  generatorFreeDailyLimit: number;
  /** Master switch for the premium group chat (admins + active
   *  subscribers). On by default — unlike the match generator, this ships
   *  already requested and meant to be live; an admin can still flip it
   *  off (e.g. during moderation or an incident) without touching code. */
  groupChatEnabled: boolean;
  /** Minimum seconds between two messages from the same (non-admin)
   *  account in either group room. 0 turns the pause off. Default 2 - short
   *  enough that normal chatting never notices it, long enough to stop
   *  flooding. */
  groupChatCooldownSeconds: number;
  /** Master switch for "Chat Global" — same shape as groupChatEnabled, but
   *  gates the room open to every logged-in user rather than just admins +
   *  active subscribers. On by default for the same reason: it ships ready
   *  to use, not as an opt-in beta. */
  globalChatEnabled: boolean;
  /** Master switch for the "Actus" news feed tab — same shape again. */
  newsFeedEnabled: boolean;
  /** Admin-editable ceiling (in MB) used only to draw the System tab's
   *  storage progress bar — MongoDB Atlas doesn't expose "which tier/limit
   *  am I on" over a normal driver connection (`db.stats()` reports usage,
   *  not the plan's cap), so this is a number an admin sets by hand and
   *  updates if they ever change Atlas tier. Defaults to the M0 free
   *  tier's 512 MB. */
  dbStorageLimitMb: number;
  /** Off by default. Vercel's real usage-vs-limit API (`/v1/usage`) only
   *  works on a Pro/Enterprise team — on Hobby it 400s with
   *  `plan_upgrade_required` — so this stays off until an admin
   *  deliberately flips it on from the System tab once VERCEL_API_TOKEN +
   *  VERCEL_PROJECT_ID are set and the team's been upgraded (see
   *  app/api/admin/system/vercel-stats/route.ts). Project/deployment info
   *  works on Hobby already and isn't gated by this flag. */
  vercelSyncEnabled: boolean;
  /** Pre-fills the "Créer un administrateur" form's share fields — purely a
   *  UI default, not enforced anywhere. The super admin can still type any
   *  value per admin (see models/Users.ts revenueShare). */
  defaultSubscriptionSharePercent: number;
  defaultPickSharePercent: number;
  /** Withheld from an admin payout BEFORE it's sent via Fapshi — e.g. 3
   *  means a 2,500 XAF payout actually transfers 2,425 XAF, and the 75 XAF
   *  difference is recorded/shown as the "operator transaction fee" (see
   *  app/api/admin/payouts/[id]/decide/route.ts). A flat, admin-set rate —
   *  Fapshi doesn't publish one, so this isn't derived from anything they
   *  report. */
  payoutOperatorFeePercent: number;
  /** Master switch for the daily morning-picks cron (the 3 automated Safe /
   *  Value / Bold tips — see app/api/cron/morning-picks/route.ts). On by
   *  default so existing installs keep generating tips exactly as before;
   *  existing settings docs without the field read as "on" too. Only stops
   *  the automatic generation — picks created by hand are unaffected. */
  dailyTipsCronEnabled: boolean;
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
    generatorFreeDailyLimit: { type: Number, default: 5, min: 0, max: 100 },
    groupChatEnabled: { type: Boolean, default: true },
    groupChatCooldownSeconds: { type: Number, default: 2, min: 0, max: 60 },
    globalChatEnabled: { type: Boolean, default: true },
    newsFeedEnabled: { type: Boolean, default: true },
    dbStorageLimitMb: { type: Number, default: 512, min: 1 },
    vercelSyncEnabled: { type: Boolean, default: false },
    defaultSubscriptionSharePercent: { type: Number, default: 30, min: 0, max: 100 },
    defaultPickSharePercent: { type: Number, default: 100, min: 0, max: 100 },
    payoutOperatorFeePercent: { type: Number, default: 3, min: 0, max: 100 },
    dailyTipsCronEnabled: { type: Boolean, default: true },
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
// The settings doc is read on almost every request (chat access checks, the
// generator, ...) but changes a few times a month. A short in-memory cache
// removes that database round-trip from the hot paths. Read-only use only -
// code that needs to MODIFY settings must use getSettings() above. An admin
// save clears it immediately on the instance that handled it; other warm
// instances catch up within SETTINGS_CACHE_MS.
const SETTINGS_CACHE_MS = 15_000;
let cachedSettings: { value: ISettings; at: number } | null = null;

export async function getSettingsCached(): Promise<ISettings> {
  if (cachedSettings && Date.now() - cachedSettings.at < SETTINGS_CACHE_MS) return cachedSettings.value;
  const value = await getSettings();
  cachedSettings = { value, at: Date.now() };
  return value;
}

export function invalidateSettingsCache() {
  cachedSettings = null;
}
