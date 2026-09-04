import mongoose, { Schema, Document, Model, Types } from "mongoose";

// Retention window for the historical activity pattern — old enough to see
// real week-over-week rhythm, bounded so the collection self-prunes
// instead of growing forever. Exported so the analytics route's own
// "last N days" queries can't drift out of sync with what's actually kept.
export const ACTIVITY_RETENTION_DAYS = 180;

// At most ONE document per user per hour (upserted, `pings` incremented on
// repeat activity within that same hour — see app/api/activity/ping/route.ts).
// This is the pre-aggregated source for both the day×hour heatmap and the
// daily trend line in the admin dashboard's Users → Activité view — kept
// separate from UserPresence (which only ever answers "online right now")
// so the "when are my users usually active" picture actually accumulates
// over time instead of being a single overwritten snapshot.
export interface IActivityHourBucket extends Document {
  userId: Types.ObjectId;
  /** The hour this bucket covers, truncated to the hour, in WAT (UTC+1) —
   *  see truncateToHourWAT() in app/api/activity/ping/route.ts. */
  hourStart: Date;
  pings: number;
}

const ActivityHourBucketSchema = new Schema<IActivityHourBucket>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  hourStart: { type: Date, required: true },
  pings: { type: Number, required: true, default: 0 },
});

// Upsert target for the ping route — one doc per user per hour.
ActivityHourBucketSchema.index({ userId: 1, hourStart: 1 }, { unique: true });
// TTL: MongoDB deletes a document once hourStart + ACTIVITY_RETENTION_DAYS
// has passed — self-pruning, no cleanup cron needed.
ActivityHourBucketSchema.index({ hourStart: 1 }, { expireAfterSeconds: ACTIVITY_RETENTION_DAYS * 24 * 60 * 60 });

const ActivityHourBucketModel: Model<IActivityHourBucket> =
  mongoose.models.ActivityHourBucket ||
  mongoose.model<IActivityHourBucket>("ActivityHourBucket", ActivityHourBucketSchema, "activityhourbuckets");

export default ActivityHourBucketModel;
