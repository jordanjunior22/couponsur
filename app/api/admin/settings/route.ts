import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import SettingsModel, { getSettings, MATCH_GENERATOR_MARKETS, type MatchGeneratorMarket } from "@/models/Settings";
import { cookies } from "next/headers";
import { verifyToken } from "@/utils/auth";

async function requireAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return { error: "Unauthorized", status: 401 };
  const decoded = verifyToken(token);
  if (!decoded) return { error: "Invalid token", status: 401 };
  if (decoded.role !== "ADMIN") return { error: "Forbidden", status: 403 };
  return { user: decoded };
}

export async function GET() {
  try {
    await connectDB();
    const settings = await getSettings();
    return NextResponse.json({ success: true, data: settings });
  } catch (error) {
    console.error("GET SETTINGS ERROR:", error);
    return NextResponse.json({ success: false, message: "Failed to fetch settings" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    await connectDB();

    const auth = await requireAdmin();
    if ("error" in auth) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const {
      subscriptionMonthlyPrice,
      tipOptions,
      matchGeneratorEnabled,
      matchGeneratorAccess,
      matchGeneratorMarketAccess,
      matchGeneratorMatchCount,
      groupChatEnabled,
      globalChatEnabled,
    } = body;

    const update: Record<string, unknown> = {};

    if (subscriptionMonthlyPrice !== undefined) {
      if (typeof subscriptionMonthlyPrice !== "number" || subscriptionMonthlyPrice <= 0) {
        return NextResponse.json(
          { success: false, message: "subscriptionMonthlyPrice must be a positive number" },
          { status: 400 }
        );
      }
      update.subscriptionMonthlyPrice = subscriptionMonthlyPrice;
    }

    if (tipOptions !== undefined) {
      if (
        !Array.isArray(tipOptions) ||
        tipOptions.length === 0 ||
        !tipOptions.every((t) => typeof t === "string" && t.trim().length > 0)
      ) {
        return NextResponse.json(
          { success: false, message: "tipOptions must be a non-empty array of non-empty strings" },
          { status: 400 }
        );
      }
      // Trim + dedupe (case-sensitive — "O 2.5" and "o 2.5" are kept distinct
      // on purpose, admins can manage capitalization themselves) while
      // preserving the order the admin arranged them in.
      const seen = new Set<string>();
      update.tipOptions = tipOptions
        .map((t: string) => t.trim())
        .filter((t) => {
          if (seen.has(t)) return false;
          seen.add(t);
          return true;
        });
    }

    if (matchGeneratorEnabled !== undefined) {
      if (typeof matchGeneratorEnabled !== "boolean") {
        return NextResponse.json(
          { success: false, message: "matchGeneratorEnabled must be a boolean" },
          { status: 400 }
        );
      }
      update.matchGeneratorEnabled = matchGeneratorEnabled;
    }

    if (matchGeneratorAccess !== undefined) {
      if (matchGeneratorAccess !== "EVERYONE" && matchGeneratorAccess !== "PREMIUM") {
        return NextResponse.json(
          { success: false, message: "matchGeneratorAccess must be EVERYONE or PREMIUM" },
          { status: 400 }
        );
      }
      update.matchGeneratorAccess = matchGeneratorAccess;
    }

    if (matchGeneratorMarketAccess !== undefined) {
      if (typeof matchGeneratorMarketAccess !== "object" || matchGeneratorMarketAccess === null || Array.isArray(matchGeneratorMarketAccess)) {
        return NextResponse.json(
          { success: false, message: "matchGeneratorMarketAccess must be an object" },
          { status: 400 }
        );
      }
      // Dot-path $set per key (not a single $set on the whole object) so a
      // partial update — e.g. the admin UI toggling just one market —
      // merges into whatever's already stored instead of clobbering the
      // other markets' access levels.
      for (const [market, access] of Object.entries(matchGeneratorMarketAccess)) {
        if (!(MATCH_GENERATOR_MARKETS as readonly string[]).includes(market)) {
          return NextResponse.json(
            { success: false, message: `Unknown market: ${market}` },
            { status: 400 }
          );
        }
        if (access !== "EVERYONE" && access !== "PREMIUM") {
          return NextResponse.json(
            { success: false, message: `matchGeneratorMarketAccess.${market} must be EVERYONE or PREMIUM` },
            { status: 400 }
          );
        }
        update[`matchGeneratorMarketAccess.${market as MatchGeneratorMarket}`] = access;
      }
    }

    if (matchGeneratorMatchCount !== undefined) {
      if (
        typeof matchGeneratorMatchCount !== "number" ||
        !Number.isInteger(matchGeneratorMatchCount) ||
        matchGeneratorMatchCount < 1 ||
        matchGeneratorMatchCount > 10
      ) {
        return NextResponse.json(
          { success: false, message: "matchGeneratorMatchCount must be an integer between 1 and 10" },
          { status: 400 }
        );
      }
      update.matchGeneratorMatchCount = matchGeneratorMatchCount;
    }

    if (groupChatEnabled !== undefined) {
      if (typeof groupChatEnabled !== "boolean") {
        return NextResponse.json(
          { success: false, message: "groupChatEnabled must be a boolean" },
          { status: 400 }
        );
      }
      update.groupChatEnabled = groupChatEnabled;
    }

    if (globalChatEnabled !== undefined) {
      if (typeof globalChatEnabled !== "boolean") {
        return NextResponse.json(
          { success: false, message: "globalChatEnabled must be a boolean" },
          { status: 400 }
        );
      }
      update.globalChatEnabled = globalChatEnabled;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json(
        { success: false, message: "Nothing to update" },
        { status: 400 }
      );
    }

    const updated = await SettingsModel.findOneAndUpdate(
      { key: "global" },
      { $set: update },
      { new: true, upsert: true }
    );

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("UPDATE SETTINGS ERROR:", error);
    return NextResponse.json({ success: false, message: "Failed to update settings" }, { status: 500 });
  }
}