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
import { getPredictions, buildComboForTargetOdds, type PredictionPick } from "@/lib/predictionengine";

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

// Sane bounds for a user-supplied target odds — below 1.1 it's not really a
// combo, above 100 it stops being a realistic ask and just skews selection.
const MIN_TARGET_ODDS = 1.1;
const MAX_TARGET_ODDS = 100;

export async function GET(req: NextRequest) {
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

    if (settings.matchGeneratorAccess === "PREMIUM") {
      const dbUser = await UserModel.findById(decoded.userId).select("subscription").lean();
      const isPremium = !!(
        dbUser?.subscription?.status === "ACTIVE" &&
        dbUser.subscription.expiresAt &&
        new Date(dbUser.subscription.expiresAt) > new Date()
      );
      if (!isPremium) {
        return NextResponse.json(
          { success: false, message: "Le générateur est réservé aux abonnés premium.", requiresPremium: true },
          { status: 403 }
        );
      }
    }

    const count = settings.matchGeneratorMatchCount || 3;

    // Optional: the visitor can ask for a specific total odds instead of
    // just letting the pool pick itself.
    const { searchParams } = new URL(req.url);
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

    const allPicks = await getPredictions();
    const qualified = allPicks
      .filter((p) => (p.market === "1X2" || p.market === "DC") && p.confidence >= MIN_CONFIDENCE)
      .sort((a, b) => b.confidence - a.confidence);

    if (qualified.length === 0) {
      return NextResponse.json({
        success: true,
        matches: [],
        totalOdds: null,
        message: "Aucun match ne remplit les critères de confiance aujourd'hui. Réessayez plus tard.",
        disclaimer: DISCLAIMER,
      });
    }

    let selected: PredictionPick[];
    let totalOdds: number;
    let targetMissed = false;

    if (targetOdds !== null) {
      const combo = buildComboForTargetOdds(qualified, count, targetOdds);
      if (!combo) {
        return NextResponse.json({
          success: true,
          matches: [],
          totalOdds: null,
          message: "Impossible d'approcher cette cote aujourd'hui avec des matchs suffisamment fiables. Réessayez avec une autre cote.",
          disclaimer: DISCLAIMER,
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
      requestedOdds: targetOdds,
      targetMissed,
      disclaimer: DISCLAIMER,
    });
  } catch (error) {
    console.error("GENERATE MATCHES ERROR:", error);
    return NextResponse.json(
      { success: false, message: "Erreur lors de la génération des matchs." },
      { status: 500 }
    );
  }
}
