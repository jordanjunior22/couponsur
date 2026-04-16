import mongoose, { Schema, Document, Model } from "mongoose";

export enum UserRole {
  USER = "USER",
  ADMIN = "ADMIN",
}

export interface IUser extends Document {
  phone: string;
  password: string;
  role: UserRole;
  unlockedPickIds: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
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
    unlockedPickIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "Pick",
      },
    ],
  },
  {
    timestamps: true,
  }
);

const UserModel: Model<IUser> =
  mongoose.models.User ||
  mongoose.model<IUser>("User", UserSchema, "users");

export default UserModel;