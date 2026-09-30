/**
 * lib/adminEarnings.ts
 *
 * Computes what a secondary admin has earned and what's still available to
 * request as a payout. Always derived fresh from real SUCCESSFUL Payment
 * records (never a cached/stored number, never a client-supplied amount) —
 * this is money, so the source of truth is the payment ledger + the pick
 * authorship record, recomputed on every read.
 *
 * Rules (see the "Admin revenue-share & manual payout system" plan):
 *  - Only Payments dated on/after the admin's revenueShare.effectiveFrom
 *    count — set once, the first time the super admin configures that
 *    admin's shares. Nothing is retroactive.
 *  - Subscription revenue is split by subscriptionPercent, full stop — it
 *    isn't tied to any specific pick or admin.
 *  - Pick revenue only counts for picks that admin personally created
 *    (Pick.createdBy) — automated/scraped picks have no author and are
 *    never included, matching the "house keeps 100% of those" decision.
 *  - A payout in REQUESTED, PROCESSING or PAID status reserves that amount
 *    out of the available balance so it can't be requested twice; REJECTED
 *    and FAILED free it back up (FAILED is retriable, see
 *    app/api/admin/payouts/[id]/decide.ts — the transfer never landed).
 */
import PaymentModel from "@/models/Payment";
import PickModel from "@/models/Picks";
import PayoutModel from "@/models/Payout";
import UserModel, { IUser } from "@/models/Users";

export interface AdminEarnings {
  adminId: string;
  subscriptionEarnings: number;
  pickEarnings: number;
  totalEarned: number;
  reserved: number;
  availableBalance: number;
  effectiveFrom: Date | null;
}

function zeroEarnings(adminId: string, effectiveFrom: Date | null): AdminEarnings {
  return {
    adminId,
    subscriptionEarnings: 0,
    pickEarnings: 0,
    totalEarned: 0,
    reserved: 0,
    availableBalance: 0,
    effectiveFrom,
  };
}

/** Assumes the caller already called connectDB(). */
export async function getAdminEarnings(admin: Pick<IUser, "_id" | "revenueShare">): Promise<AdminEarnings> {
  const adminId = String(admin._id);
  const effectiveFrom = admin.revenueShare?.effectiveFrom ?? null;

  if (!effectiveFrom) return zeroEarnings(adminId, null);

  const dateFilter = { createdAt: { $gte: effectiveFrom } };

  const [subscriptionAgg, ownPickIds] = await Promise.all([
    PaymentModel.aggregate([
      { $match: { paymentType: "SUBSCRIPTION", status: "SUCCESSFUL", ...dateFilter } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    PickModel.find({ createdBy: admin._id }).select("_id").lean(),
  ]);

  const subscriptionGross = subscriptionAgg[0]?.total ?? 0;
  const subscriptionEarnings = Math.round(subscriptionGross * ((admin.revenueShare?.subscriptionPercent ?? 0) / 100));

  let pickGross = 0;
  if (ownPickIds.length > 0) {
    const pickAgg = await PaymentModel.aggregate([
      {
        $match: {
          paymentType: "PICK",
          status: "SUCCESSFUL",
          pickId: { $in: ownPickIds.map((p) => p._id) },
          ...dateFilter,
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    pickGross = pickAgg[0]?.total ?? 0;
  }
  const pickEarnings = Math.round(pickGross * ((admin.revenueShare?.pickPercent ?? 0) / 100));

  const totalEarned = subscriptionEarnings + pickEarnings;

  const reservedAgg = await PayoutModel.aggregate([
    { $match: { adminId: admin._id, status: { $in: ["REQUESTED", "PROCESSING", "PAID"] } } },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);
  const reserved = reservedAgg[0]?.total ?? 0;

  return {
    adminId,
    subscriptionEarnings,
    pickEarnings,
    totalEarned,
    reserved,
    availableBalance: Math.max(0, totalEarned - reserved),
    effectiveFrom,
  };
}

/** Convenience for callers that only have an id, not the loaded doc. */
export async function getAdminEarningsById(adminId: string): Promise<AdminEarnings | null> {
  const admin = await UserModel.findById(adminId).select("revenueShare");
  if (!admin) return null;
  return getAdminEarnings(admin);
}

export interface EarningsDayPoint {
  date: string; // "YYYY-MM-DD"
  subscriptionEarnings: number;
  pickEarnings: number;
  total: number;
}

export interface AdminEarningsReport {
  periodFrom: Date;
  periodTo: Date;
  subscriptionEarnings: number;
  pickEarnings: number;
  totalEarned: number;
  trend: EarningsDayPoint[];
}

function zeroReport(from: Date, to: Date): AdminEarningsReport {
  return { periodFrom: from, periodTo: to, subscriptionEarnings: 0, pickEarnings: 0, totalEarned: 0, trend: [] };
}

/**
 * Date-scoped reporting view, separate on purpose from getAdminEarnings()
 * above — this is for the "Mes revenus" trend chart / period breakdown
 * ONLY, never for the withdrawable balance (which must always stay the
 * full all-time figure since effectiveFrom, or a payout could be requested
 * against a balance that's really just "this week's"). The requested
 * window is clamped so nothing before effectiveFrom is ever counted,
 * matching getAdminEarnings' own rule.
 */
export async function getAdminEarningsReport(
  admin: Pick<IUser, "_id" | "revenueShare">,
  dateFrom: Date,
  dateTo: Date
): Promise<AdminEarningsReport> {
  const effectiveFrom = admin.revenueShare?.effectiveFrom ?? null;
  if (!effectiveFrom) return zeroReport(dateFrom, dateTo);

  const from = effectiveFrom > dateFrom ? effectiveFrom : dateFrom;
  const to = dateTo;
  if (from > to) return zeroReport(from, to);

  const dateFilter = { createdAt: { $gte: from, $lte: to } };
  const subPercent = admin.revenueShare?.subscriptionPercent ?? 0;
  const pickPercent = admin.revenueShare?.pickPercent ?? 0;

  const ownPickIds = (await PickModel.find({ createdBy: admin._id }).select("_id").lean()).map((p) => p._id);

  const [subByDay, pickByDay] = await Promise.all([
    PaymentModel.aggregate([
      { $match: { paymentType: "SUBSCRIPTION", status: "SUCCESSFUL", ...dateFilter } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, total: { $sum: "$amount" } } },
    ]),
    ownPickIds.length > 0
      ? PaymentModel.aggregate([
          { $match: { paymentType: "PICK", status: "SUCCESSFUL", pickId: { $in: ownPickIds }, ...dateFilter } },
          { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, total: { $sum: "$amount" } } },
        ])
      : Promise.resolve([]),
  ]);

  const subMap = new Map<string, number>(subByDay.map((r) => [r._id, r.total]));
  const pickMap = new Map<string, number>(pickByDay.map((r) => [r._id, r.total]));
  const allDays = new Set([...subMap.keys(), ...pickMap.keys()]);

  const trend: EarningsDayPoint[] = [...allDays].sort().map((date) => {
    const subscriptionEarnings = Math.round((subMap.get(date) ?? 0) * (subPercent / 100));
    const pickEarnings = Math.round((pickMap.get(date) ?? 0) * (pickPercent / 100));
    return { date, subscriptionEarnings, pickEarnings, total: subscriptionEarnings + pickEarnings };
  });

  const subscriptionEarnings = trend.reduce((s, d) => s + d.subscriptionEarnings, 0);
  const pickEarnings = trend.reduce((s, d) => s + d.pickEarnings, 0);

  return {
    periodFrom: from,
    periodTo: to,
    subscriptionEarnings,
    pickEarnings,
    totalEarned: subscriptionEarnings + pickEarnings,
    trend,
  };
}
