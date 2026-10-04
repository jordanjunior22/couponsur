/**
 * lib/autoDisburse.ts
 *
 * Immediately sends a freshly-requested payout via Fapshi when the payout
 * float can cover it, so the super admin doesn't have to approve each one.
 * If anything prevents it (float too low, balance unreadable, net amount
 * under Fapshi's minimum, Fapshi error) the payout simply stays REQUESTED
 * and shows up in the super admin's manual list as before.
 *
 * Same lifecycle as app/api/admin/payouts/[id]/decide: REQUESTED ->
 * PROCESSING here, then PROCESSING -> PAID/FAILED via app/api/payout/webhook.
 */
import PayoutModel, { IPayout } from "@/models/Payout";
import UserModel from "@/models/Users";
import { getSettings } from "@/models/Settings";
import { makePayout, getBalance, isFapshiError } from "@/utils/fapshiPayout";

export type AutoDisburseResult =
  | { disbursed: true; payout: IPayout }
  | { disbursed: false; reason: string };

/** Assumes the caller already called connectDB(). */
export async function autoDisbursePayout(payoutId: string): Promise<AutoDisburseResult> {
  const payout = await PayoutModel.findById(payoutId);
  if (!payout || payout.status !== "REQUESTED") {
    return { disbursed: false, reason: "Payout not in REQUESTED state" };
  }

  const admin = await UserModel.findById(payout.adminId).select("phone");
  if (!admin) return { disbursed: false, reason: "Admin not found" };

  const settings = await getSettings();
  const feePercent = settings.payoutOperatorFeePercent ?? 0;
  const operatorFee = Math.round(payout.amount * (feePercent / 100));
  const netAmount = payout.amount - operatorFee;

  if (netAmount < 100) return { disbursed: false, reason: "Net amount below Fapshi minimum" };

  // The float must cover the full amount before we try to send anything.
  const balance = await getBalance();
  if (isFapshiError(balance)) return { disbursed: false, reason: `Balance unavailable: ${balance.message}` };
  if (balance.balance < netAmount) return { disbursed: false, reason: "Insufficient Fapshi balance" };

  // Atomic claim: only one concurrent caller can move REQUESTED -> PROCESSING,
  // so the same payout can never be sent twice.
  const claimed = await PayoutModel.findOneAndUpdate(
    { _id: payout._id, status: "REQUESTED" },
    { $set: { status: "PROCESSING", operatorFee, netAmount, decidedAt: new Date(), note: "Paiement automatique" } },
    { new: true }
  );
  if (!claimed) return { disbursed: false, reason: "Payout already being handled" };

  const result = await makePayout({
    amount: netAmount,
    phone: admin.phone,
    userId: String(admin._id),
    externalId: String(payout._id),
    message: "Paiement pronostics",
  });

  if (isFapshiError(result)) {
    // Nothing was sent — hand it back to the manual queue.
    await PayoutModel.updateOne(
      { _id: payout._id, status: "PROCESSING", fapshiTransId: null },
      { $set: { status: "REQUESTED", operatorFee: null, netAmount: null, decidedAt: null, note: null } }
    );
    return { disbursed: false, reason: `Fapshi: ${result.message}` };
  }

  // Targeted update so a fast webhook's status change isn't overwritten.
  const updated = await PayoutModel.findByIdAndUpdate(
    payout._id,
    { $set: { fapshiTransId: result.transId } },
    { new: true }
  );
  return { disbursed: true, payout: updated ?? claimed };
}
