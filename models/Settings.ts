import mongoose, { Schema, Document, Model } from "mongoose";

export interface ISettings extends Document {
  key: string; // singleton, always "global"
  subscriptionMonthlyPrice: number;
  updatedAt: Date;
  createdAt: Date;
}

const SettingsSchema = new Schema<ISettings>(
  {
    key: { type: String, required: true, unique: true, default: "global" },
    subscriptionMonthlyPrice: { type: Number, required: true, default: 5000 },
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