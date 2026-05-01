import mongoose, { Schema, Document, Model } from "mongoose";

export interface ISubscriptionPlan extends Document {
  name: string; // "1 Month", "3 Months", etc.
  durationDays: number; // 30, 90, 180, 365
  basePrice: number; // Prix en FCFA sans réduction
  discountPercent: number; // 0, 20, 25, 30
  finalPrice: number; // Calculé: basePrice * (1 - discountPercent/100)
  description: string; // "Full access to all picks"
  displayOrder: number; // Pour trier l'affichage: 1, 2, 3, 4
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionPlanSchema = new Schema<ISubscriptionPlan>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    durationDays: {
      type: Number,
      required: true,
      enum: [30, 90, 180, 365], // Strict: only these durations allowed
    },
    basePrice: {
      type: Number,
      required: true,
      min: 0,
    },
    discountPercent: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
      default: 0,
    },
    finalPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    description: {
      type: String,
      required: false,
      trim: true,
      default: "",
    },
    displayOrder: {
      type: Number,
      default: 1,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Pre-save hook to calculate finalPrice
SubscriptionPlanSchema.pre<ISubscriptionPlan>("save", function () {
  this.finalPrice = this.basePrice * (1 - this.discountPercent / 100);
});

// Index for sorting
SubscriptionPlanSchema.index({ displayOrder: 1 });
SubscriptionPlanSchema.index({ isActive: 1 });

const SubscriptionPlanModel: Model<ISubscriptionPlan> =
  mongoose.models.SubscriptionPlan ||
  mongoose.model<ISubscriptionPlan>(
    "SubscriptionPlan",
    SubscriptionPlanSchema,
    "subscription_plans"
  );

export default SubscriptionPlanModel;
