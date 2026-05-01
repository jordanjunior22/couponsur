import mongoose, { Schema, Document, Model } from "mongoose";

export enum UserRole {
  USER = "USER",
  ADMIN = "ADMIN",
}

export interface ISubscription {
  planId: mongoose.Types.ObjectId;
  startDate: Date;
  endDate: Date;
  status: "active" | "cancelled" | "expired";
}

export interface IUser extends Document {
  phone: string;
  password: string;
  role: UserRole;
  subscription?: ISubscription;
  unlockedPickIds: mongoose.Types.ObjectId[]; // Legacy: kept for backward compatibility
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;

  // Helper methods
  hasActiveSubscription(): boolean;
}

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
    subscription: {
      type: {
        planId: {
          type: Schema.Types.ObjectId,
          ref: "SubscriptionPlan",
          required: true,
        },
        startDate: { type: Date, required: true },
        endDate: { type: Date, required: true },
        status: {
          type: String,
          enum: ["active", "cancelled", "expired"],
          default: "active",
        },
      },
      required: false,
      default: null,
    },
    unlockedPickIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "Pick",
      },
    ],
    lastLoginAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  }
);

// Helper method to check active subscription
UserSchema.methods.hasActiveSubscription = function (): boolean {
  if (!this.subscription) return false;
  return (
    this.subscription.status === "active" &&
    new Date() < this.subscription.endDate
  );
};

const UserModel: Model<IUser> =
  mongoose.models.User ||
  mongoose.model<IUser>("User", UserSchema, "users");

export default UserModel;