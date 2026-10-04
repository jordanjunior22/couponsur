import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import { resolveViewer, maskPickForViewer } from "@/utils/pickAccess";
import { loadHomeStats, loadWeeksPage, loadChangedPicks } from "@/utils/pickFeed";

const DEFAULT_FIRST_WEEKS = 3;
const DEFAULT_MORE_WEEKS = 4;
const MAX_WEEKS = 8;

// ─── GET: the home page's picks, a few weeks at a time ──────────────────────
// Query:
//   (none)              the current week + the previous 2, plus anything dated
//                       later, with the global `stats`
//   ?before=YYYY-MM-DD  the next older weeks (pass back `nextBefore`)
//   ?weeks=N            weeks per page (max 8)
//   ?since=<ISO>        only picks that CHANGED after that moment (new pick,
//                       result, edit) + fresh `stats` - the live poll
//
// Public: anyone can read it - but a LIVE coupon's selections are masked unless
// the viewer bought it, is subscribed, or is staff (see utils/pickAccess.ts).
// Only published picks are ever returned here.
export async function GET(req: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const viewer = await resolveViewer();

    const sinceRaw = searchParams.get("since");
    const sinceDate = sinceRaw ? new Date(sinceRaw) : null;
    if (sinceDate && !Number.isNaN(sinceDate.getTime())) {
      const changed = await loadChangedPicks(sinceDate);
      return NextResponse.json({
        success: true,
        picks: changed.map((p) => maskPickForViewer(p, viewer)),
        // Results and edits move the totals - send them along, but only when
        // something actually changed.
        stats: changed.length > 0 ? await loadHomeStats() : null,
      });
    }

    const before = searchParams.get("before");
    if (before !== null && !/^\d{4}-\d{2}-\d{2}$/.test(before)) {
      return NextResponse.json({ success: false, message: "Paramètre invalide" }, { status: 400 });
    }
    const weeksParam = parseInt(searchParams.get("weeks") || "", 10);
    const weeks = Math.min(MAX_WEEKS, Math.max(1, weeksParam || (before ? DEFAULT_MORE_WEEKS : DEFAULT_FIRST_WEEKS)));

    const [page, stats] = await Promise.all([loadWeeksPage(before, weeks), before ? Promise.resolve(null) : loadHomeStats()]);

    return NextResponse.json({
      success: true,
      picks: page.picks.map((p) => maskPickForViewer(p, viewer)),
      windowStart: page.windowStart,
      nextBefore: page.nextBefore,
      stats,
    });
  } catch (error) {
    console.error("GET PICKS FEED ERROR:", error);
    return NextResponse.json({ success: false, message: "Failed to fetch picks" }, { status: 500 });
  }
}
