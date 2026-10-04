// ─── app/api/generate-matches/route.ts ───────────────────────────────────────
// Ephemeral "AI match generator" for logged-in buyers. Runs the existing
// prediction engine (lib/predictionengine.ts) on demand and hands back a
// combo — nothing here is written to the database. It's a free-to-play
// preview of the engine, not a purchasable Pick.
//
// Gated by admin/settings (see models/Settings.ts):
//   - matchGeneratorEnabled     → master on/off switch, off by default
//   - matchGeneratorAccess      → "EVERYONE" (any logged-in user) or
//                                 "PREMIUM" (active subscribers only)
//   - matchGeneratorMatchCount  → how many legs a single generation returns
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import { cookies } from "next/headers";
import { verifyToken } from "@/utils/auth";
import UserModel from "@/models/Users";
import { getSettings } from "@/models/Settings";
import { claimCooldown, reserveCredit, refundCredit, UNLIMITED_USAGE, type GeneratorUsage } from "@/lib/generatorQuota";
import { getPredictions, buildVariedComboForTargetOdds, comboSignature, type PredictionPick, type Market } from "@/lib/predictionengine";

export const dynamic = "force-dynamic";

// Same confidence floor the morning-picks cron uses for its combo pool —
// keeps the free generator from handing out picks the paid engine itself
// wouldn't consider good enough to sell.
const MIN_CONFIDENCE = 45;

export const DISCLAIMER =
  "Ces matchs sont générés automatiquement par une intelligence artificielle à partir de statistiques et peuvent contenir des erreurs d'analyse. Il ne s'agit pas d'un conseil de pari, aucun résultat n'est garanti — pariez de façon responsable.";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Market selection ──────────────────────────────────────────────────────
const ALL_MARKETS: Market[] = ["1X2", "DC", "BTTS", "OU15", "OU25", "OU35"];
// Preserves the exact pre-existing behavior for any caller that doesn't
// pass ?markets= at all.
const DEFAULT_MARKETS: Market[] = ["1X2", "DC"];

function isMarket(v: string): v is Market {
  return (ALL_MARKETS as string[]).includes(v);
}

// One match can now qualify under several selected markets at once (e.g. a
// "1" tip AND a "BTTS" tip for the same fixture) — a combo must never carry
// two legs riding on the same game's variance, so collapse to the single
// highest-confidence leg per unique match before any combo is built.
function dedupeByMatch(picks: PredictionPick[]): PredictionPick[] {
  const bestByMatch = new Map<string, PredictionPick>();
  for (const p of picks) {
    const key = `${p.league}|${p.home}|${p.away}`;
    const existing = bestByMatch.get(key);
    if (!existing || p.confidence > existing.confidence) {
      bestByMatch.set(key, p);
    }
  }
  return [...bestByMatch.values()];
}

// A run that produced nothing is refunded, so report the usage as it stands
// after that refund rather than the number reserved a moment ago.
function refundedUsage(u: GeneratorUsage): GeneratorUsage {
  if (u.unlimited || u.limit === null) return u;
  const used = Math.max(0, u.used - 1);
  return { ...u, used, remaining: u.limit - used };
}

// Sane bounds for a user-supplied target odds — below 1.1 it's not really a
// combo, above 100 it stops being a realistic ask and just skews selection.
const MIN_TARGET_ODDS = 1.1;
const MAX_TARGET_ODDS = 100;

export async function GET(req: NextRequest) {
  // Set once a FREE user's daily generation has been spent, so every early
  // exit below (no results, error) can hand it back.
  let reserved: { userId: string; day: string } | null = null;
  const refundIfReserved = async () => {
    if (!reserved) return;
    const r = reserved;
    reserved = null;
    await refundCredit(r.userId, r.day).catch((e) => console.error("Refund generation credit failed:", e));
  };

  try {
    await connectDB();
    const settings = await getSettings();

    if (!settings.matchGeneratorEnabled) {
      return NextResponse.json(
        { success: false, message: "Le générateur de matchs n'est pas disponible pour le moment." },
        { status: 403 }
      );
    }

    // Feature always requires a session — even in "EVERYONE" mode this is
    // "every logged-in user", not anonymous visitors, since it runs a live
    // scrape/analysis on request.
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    const decoded = token ? verifyToken(token) : null;

    if (!decoded) {
      return NextResponse.json(
        { success: false, message: "Connectez-vous pour utiliser le générateur.", requiresLogin: true },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);

    // Which markets the visitor wants included (1X2, DC, BTTS, OU15/25/35).
    // Omitted entirely → the original 1X2+DC-only behavior, for backward
    // compatibility with any existing caller.
    const rawMarkets = searchParams.get("markets");
    let selectedMarkets: Market[] = DEFAULT_MARKETS;
    if (rawMarkets !== null) {
      const parsed = rawMarkets.split(",").map((m) => m.trim()).filter(Boolean);
      const invalid = parsed.filter((m) => !isMarket(m));
      if (invalid.length > 0) {
        return NextResponse.json(
          { success: false, message: `Marché(s) invalide(s): ${invalid.join(", ")}` },
          { status: 400 }
        );
      }
      if (parsed.length === 0) {
        return NextResponse.json(
          { success: false, message: "Sélectionnez au moins un marché." },
          { status: 400 }
        );
      }
      selectedMarkets = parsed as Market[];
    }

    // Access level per selected market, falling back to "PREMIUM" for any
    // market missing from the stored settings (un-migrated doc, or a
    // market added after the settings doc was last saved) — same
    // most-restrictive-by-default posture as the schema's own default.
    const marketAccessFor = (m: Market) => settings.matchGeneratorMarketAccess?.[m] ?? "PREMIUM";

    // Subscription status is needed for the market gates AND the daily
    // limit (subscribers + admins are unlimited), so always look it up.
    const dbUser = await UserModel.findById(decoded.userId).select("subscription role").lean();
    const isPremium = !!(
      dbUser?.subscription?.status === "ACTIVE" &&
      dbUser.subscription.expiresAt &&
      new Date(dbUser.subscription.expiresAt) > new Date()
    );
    const isUnlimited = isPremium || dbUser?.role === "ADMIN";

    // Outer gate: can this user open the tool at all.
    if (settings.matchGeneratorAccess === "PREMIUM" && !isPremium) {
      return NextResponse.json(
        { success: false, message: "Le générateur est réservé aux abonnés premium.", requiresPremium: true },
        { status: 403 }
      );
    }

    // Inner gate: which of the SELECTED markets this user is actually
    // allowed to use. A market the admin marked PREMIUM-only is silently
    // dropped (not a hard failure) as long as at least one selected market
    // remains usable — the response flags what got dropped via
    // `restrictedMarkets` so the UI can tell the visitor why their combo
    // is smaller/different than requested.
    const allowedMarkets = selectedMarkets.filter((m) => marketAccessFor(m) === "EVERYONE" || isPremium);
    const restrictedMarkets = selectedMarkets.filter((m) => !allowedMarkets.includes(m));

    if (allowedMarkets.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: `Marché(s) réservé(s) aux abonnés premium: ${restrictedMarkets.join(", ")}.`,
          requiresPremium: true,
          restrictedMarkets,
        },
        { status: 403 }
      );
    }

    const count = settings.matchGeneratorMatchCount || 3;

    // Optional: the visitor can ask for a specific total odds instead of
    // just letting the pool pick itself.
    const rawTarget = searchParams.get("targetOdds");
    let targetOdds: number | null = null;
    if (rawTarget !== null) {
      const parsed = Number(rawTarget);
      if (!Number.isFinite(parsed) || parsed < MIN_TARGET_ODDS || parsed > MAX_TARGET_ODDS) {
        return NextResponse.json(
          { success: false, message: `La cote souhaitée doit être comprise entre ${MIN_TARGET_ODDS} et ${MAX_TARGET_ODDS}.` },
          { status: 400 }
        );
      }
      targetOdds = parsed;
    }

    // ── Usage limits ────────────────────────────────────────────────────────
    // Short pause for everyone (anti-spam), then — free users only — spend
    // one of today's generations. Placed after all validation so a rejected
    // request never costs anything.
    const userId = String(decoded.userId);
    const cooldown = await claimCooldown(userId);
    if (!cooldown.ok) {
      return NextResponse.json(
        { success: false, message: `Patientez ${cooldown.retryAfterSec} seconde${cooldown.retryAfterSec > 1 ? "s" : ""} avant de générer à nouveau.` },
        { status: 429 }
      );
    }

    let usage: GeneratorUsage = UNLIMITED_USAGE;
    if (!isUnlimited) {
      const freeLimit = settings.generatorFreeDailyLimit ?? 5;
      const credit = await reserveCredit(userId, freeLimit);
      if (!credit.ok) {
        return NextResponse.json(
          {
            success: false,
            message: `Tu as utilisé tes ${freeLimit} générations gratuites d'aujourd'hui. Abonne-toi pour générer sans limite, ou reviens demain.`,
            dailyLimitReached: true,
            usage: credit.usage,
          },
          { status: 403 }
        );
      }
      reserved = { userId, day: credit.day };
      usage = credit.usage;
    }

    // Signature of the combo the visitor just saw (see comboSignature), so a
    // repeat click never returns the identical combination when another exists.
    const avoid = searchParams.get("avoid");

    const allPicks = await getPredictions();
    const qualified = dedupeByMatch(
      allPicks.filter((p) => allowedMarkets.includes(p.market) && p.confidence >= MIN_CONFIDENCE)
    ).sort((a, b) => b.confidence - a.confidence);

    if (qualified.length === 0) {
      await refundIfReserved();
      return NextResponse.json({
        success: true,
        matches: [],
        totalOdds: null,
        message: "Aucun match ne remplit les critères de confiance aujourd'hui. Réessayez plus tard.",
        disclaimer: DISCLAIMER,
        restrictedMarkets,
        usage: refundedUsage(usage),
      });
    }

    let selected: PredictionPick[];
    let totalOdds: number;
    let targetMissed = false;

    if (targetOdds !== null) {
      const combo = buildVariedComboForTargetOdds(qualified, count, targetOdds, avoid);
      if (!combo) {
        await refundIfReserved();
        return NextResponse.json({
          success: true,
          matches: [],
          totalOdds: null,
          message: "Impossible d'approcher cette cote aujourd'hui avec des matchs suffisamment fiables. Réessayez avec une autre cote.",
          disclaimer: DISCLAIMER,
          restrictedMarkets,
          usage: refundedUsage(usage),
        });
      }
      selected = combo.selected;
      totalOdds = combo.totalOdds;
      // ±25% is buildComboForTargetOdds' own tolerance band — flag it back to
      // the caller so the UI can be upfront when it couldn't land closer.
      targetMissed = Math.abs(totalOdds - targetOdds) / targetOdds > 0.25;
    } else {
      // No target given — draw from a wider pool of qualified picks rather
      // than always the literal top-N, so this isn't a deterministic carbon
      // copy of whatever the paid automated combos pick every single time.
      const pool = qualified.slice(0, Math.max(count * 3, count));
      selected = shuffle(pool).slice(0, Math.min(count, pool.length));
      // Don't hand back the exact combo the visitor just saw if the pool
      // allows any other draw (a few reshuffles is plenty).
      for (let attempt = 0; attempt < 8 && avoid && comboSignature(selected) === avoid && pool.length > count; attempt++) {
        selected = shuffle(pool).slice(0, Math.min(count, pool.length));
      }
      totalOdds = parseFloat(selected.reduce((acc, s) => acc * s.odd, 1).toFixed(2));
    }

    return NextResponse.json({
      success: true,
      generatedAt: new Date().toISOString(),
      matches: selected.map((s) => ({
        home: s.home,
        away: s.away,
        league: s.league,
        market: s.market,
        tip: s.tip,
        odd: s.odd,
        confidence: s.confidence,
        isEstimatedOdd: s.isEstimatedOdd,
      })),
      totalOdds,
      signature: comboSignature(selected),
      requestedOdds: targetOdds,
      targetMissed,
      restrictedMarkets,
      disclaimer: DISCLAIMER,
      usage,
    });
  } catch (error) {
    await refundIfReserved();
    console.error("GENERATE MATCHES ERROR:", error);
    return NextResponse.json(
      { success: false, message: "Erreur lors de la génération des matchs." },
      { status: 500 }
    );
  }
}
