// Limits how many member profiles one account can open per minute, so nobody
// can sweep through everyone's stats. One atomic update per call (no
// read-modify-write), same two-step pattern as lib/generatorQuota.ts.
import UserModel from "@/models/Users";

export const PROFILE_VIEWS_PER_MINUTE = 40;

export async function claimProfileView(userId: string): Promise<boolean> {
  const window = new Date().toISOString().slice(0, 16); // "YYYY-MM-DDTHH:mm"

  // New minute (or first ever): reset the counter. Matches only when the
  // stored window differs, so racing calls can't reset it twice.
  await UserModel.updateOne(
    { _id: userId, "groupProfileViews.window": { $ne: window } },
    { $set: { "groupProfileViews.window": window, "groupProfileViews.count": 0 } }
  );

  const updated = await UserModel.findOneAndUpdate(
    { _id: userId, "groupProfileViews.window": window, "groupProfileViews.count": { $lt: PROFILE_VIEWS_PER_MINUTE } },
    { $inc: { "groupProfileViews.count": 1 } }
  ).select("_id");

  return !!updated;
}
