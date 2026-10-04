import mongoose, { Schema, Document, Model } from "mongoose";

export enum UserRole {
  USER = "USER",
  ADMIN = "ADMIN",
}

export type SubscriptionStatus = "NONE" | "ACTIVE" | "EXPIRED";

export interface ISubscription {
  status: SubscriptionStatus;
  plan: "MONTHLY";
  startedAt: Date | null;
  expiresAt: Date | null;
}

// An admin's cut of revenue — only meaningful for role: ADMIN accounts that
// aren't the super admin. subscriptionPercent/pickPercent are set (and
// changed) by the super admin from the "Administrateurs" dashboard tab.
// effectiveFrom is stamped the FIRST time shares are configured for this
// admin and never moves after that — it's what makes earnings "count from
// the day their share was set up" rather than retroactively, even when the
// percentage itself is edited later (see lib/adminEarnings.ts).
export interface IRevenueShare {
  subscriptionPercent: number;
  pickPercent: number;
  effectiveFrom: Date | null;
}

export interface IUser extends Document {
  phone: string;
  password: string;
  role: UserRole;
  // The one owner account — distinct from a regular ADMIN. Grants access to
  // the "Administrateurs" tab (create admins, set shares, settle payouts).
  // Never set through the app itself; see scripts/bootstrap-super-admin.ts.
  isSuperAdmin: boolean;
  revenueShare: IRevenueShare;
  unlockedPickIds: mongoose.Types.ObjectId[];
  subscription: ISubscription;
  // Muted from the premium group chat by an admin — they can still read
  // it (subscription/admin status is what gates that), just not post.
  // Scoped to this one feature, not a site-wide ban.
  groupChatBlocked: boolean;
  // Admin-only display name for group chat — lets buyers tell one admin
  // apart from another instead of every admin message reading as the same
  // generic "Admin". Meaningless for a USER account (never surfaced there),
  // and null/unset falls back to the plain "Admin" label (see
  // GroupChatRoom's senderLabel).
  nickname?: string | null;
  // Optional profile picture, stored as a small (client-downscaled) JPEG data
  // URI. Excluded from queries by default (select: false) so admin user
  // lists and other bulk reads don't drag every picture along — the routes
  // that serve the signed-in user's own profile opt in with "+avatar".
  avatar?: string | null;
  // AI match generator usage (see lib/generatorQuota.ts): `day` is the WAT
  // calendar day `count` belongs to, `lastAt` backs the short anti-spam pause.
  generator?: { day: string | null; count: number; lastAt: Date | null };
  // When this account last posted in a group chat room - backs the
  // configurable pause between messages (Settings.groupChatCooldownSeconds).
  groupChatLastAt?: Date | null;
  // Privacy: may other group members see this account's coupon stats and
  // history on their profile card? On by default; the owner can hide it from
  // their Profil page. Hidden profiles still appear in member lists.
  groupProfileVisible?: boolean;
  // "Don't send me push notifications for new messages in this room."
  groupPushMuted?: { premium?: boolean; global?: boolean };
  // Throttle for opening other members' profiles (see utils/groupProfileThrottle.ts).
  groupProfileViews?: { window: string | null; count: number };
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionSchema = new Schema<ISubscription>(
  {
    status:    { type: String, enum: ["NONE", "ACTIVE", "EXPIRED"], default: "NONE" },
    plan:      { type: String, enum: ["MONTHLY"], default: "MONTHLY" },
    startedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
  },
  { _id: false }
);

const RevenueShareSchema = new Schema<IRevenueShare>(
  {
    subscriptionPercent: { type: Number, default: 0, min: 0, max: 100 },
    pickPercent:         { type: Number, default: 100, min: 0, max: 100 },
    effectiveFrom:       { type: Date, default: null },
  },
  { _id: false }
);

const UserSchema = new Schema<IUser>(
  {
    phone: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: Object.values(UserRole),
      default: UserRole.USER,
    },
    isSuperAdmin: { type: Boolean, default: false },
    revenueShare: { type: RevenueShareSchema, default: () => ({}) },
    unlockedPickIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "Pick",
      },
    ],
    subscription: { type: SubscriptionSchema, default: () => ({}) },
    groupChatBlocked: { type: Boolean, default: false },
    nickname: { type: String, trim: true, maxlength: 40, default: null },
    avatar: { type: String, default: null, select: false },
    generator: {
      type: new Schema(
        {
          day: { type: String, default: null },
          count: { type: Number, default: 0 },
          lastAt: { type: Date, default: null },
        },
        { _id: false }
      ),
      default: () => ({}),
    },
    groupChatLastAt: { type: Date, default: null },
    groupProfileVisible: { type: Boolean, default: true },
    groupPushMuted: {
      type: new Schema({ premium: { type: Boolean, default: false }, global: { type: Boolean, default: false } }, { _id: false }),
      default: () => ({}),
    },
    groupProfileViews: {
      type: new Schema(
        {
          window: { type: String, default: null },
          count: { type: Number, default: 0 },
        },
        { _id: false }
      ),
      default: () => ({}),
    },
    lastLoginAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  }
);

const UserModel: Model<IUser> =
  mongoose.models.User ||
  mongoose.model<IUser>("User", UserSchema, "users");

export default UserModel;