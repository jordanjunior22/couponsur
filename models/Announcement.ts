import mongoose, { Schema, Document, Model } from "mongoose";

export type AnnouncementType = "INFO" | "WARNING" | "SUCCESS";

export interface IAnnouncement extends Document {
  title: string;
  body: string;
  type: AnnouncementType;
  isActive: boolean;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const AnnouncementSchema = new Schema<IAnnouncement>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    body: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    type: {
      type: String,
      enum: ["INFO", "WARNING", "SUCCESS"],
      default: "INFO",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Optional — an announcement with no expiresAt stays visible until an
    // admin deactivates or deletes it.
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const AnnouncementModel: Model<IAnnouncement> =
  mongoose.models.Announcement ||
  mongoose.model<IAnnouncement>("Announcement", AnnouncementSchema, "announcements");

export default AnnouncementModel;
