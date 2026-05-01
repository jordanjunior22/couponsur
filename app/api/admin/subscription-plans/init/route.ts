import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import { getSessionUser } from "@/utils/session";
import UserModel from "@/models/Users";
import SubscriptionPlanModel from "@/models/SubscriptionPlan";

const STANDARD_PLANS = [
  {
    name: "1 Mois",
    durationDays: 30,
    basePrice: 80000,
    discountPercent: 0,
    finalPrice: 80000,
    description: "Accès complet à tous les pronostics et sélections",
    displayOrder: 1,
    isActive: true,
  },
  {
    name: "3 Mois",
    durationDays: 90,
    basePrice: 240000,
    discountPercent: 20,
    finalPrice: 192000,
    description: "Accès complet à tous les pronostics. Économisez 20%",
    displayOrder: 2,
    isActive: true,
  },
  {
    name: "6 Mois",
    durationDays: 180,
    basePrice: 480000,
    discountPercent: 25,
    finalPrice: 360000,
    description: "Accès complet à tous les pronostics. Économisez 25%",
    displayOrder: 3,
    isActive: true,
  },
  {
    name: "1 An",
    durationDays: 365,
    basePrice: 960000,
    discountPercent: 30,
    finalPrice: 672000,
    description: "Accès complet à tous les pronostics. Économisez 30%",
    displayOrder: 4,
    isActive: true,
  },
];

export async function POST(req: NextRequest) {
  try {
    const sessionUser = await getSessionUser(req);
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const user = await UserModel.findById(sessionUser._id);

    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Check if plans already exist
    const existingCount = await SubscriptionPlanModel.countDocuments();
    if (existingCount > 0) {
      return NextResponse.json({
        success: false,
        message: "Subscription plans already initialized. Delete existing ones first.",
      });
    }

    // Create all standard plans
    const created = await SubscriptionPlanModel.insertMany(STANDARD_PLANS);

    return NextResponse.json({
      success: true,
      message: `${created.length} standard subscription plans initialized`,
      data: created,
    });
  } catch (error: any) {
    console.error("Initialize subscription plans error:", error);
    return NextResponse.json(
      { error: "Failed to initialize subscription plans" },
      { status: 500 }
    );
  }
}
