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

export interface IUser extends Document {
  phone: string;
  password: string;
  role: UserRole;
  unlockedPickIds: mongoose.Types.ObjectId[];
  subscription: ISubscription;
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
    unlockedPickIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "Pick",
      },
    ],
    subscription: { type: SubscriptionSchema, default: () => ({}) },
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