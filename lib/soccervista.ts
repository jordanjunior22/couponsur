// ─── lib/soccervista.ts ──────────────────────────────────────────────────────
// Scrapes SoccerVista for cross-validation of tips
// soccervista.com has predicted results we can compare against our tips
// ─────────────────────────────────────────────────────────────────────────────

import * as cheerio from "cheerio";

export interface SoccerVistaPrediction {
  home: string;
  away: string;
  tip: string;       // "1", "X", "2", "1X", "X2", "12"
  confidence: number; // 0–100 from their percentage
}

// Normalise a team name for fuzzy matching (lowercase, strip accents, short words)
function normName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\b(fc|cf|sc|ac|as|us|1\.|afc|bsc|fk)\b/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

function teamMatch(a: string, b: string): boolean {
  const na = normName(a);
  const nb = normName(b);
  if (na === nb) return true;
  // Partial: one contains the other (handles "Man United" vs "Manchester United")
  const shortest = na.length < nb.length ? na : nb;
  const longest  = na.length < nb.length ? nb : na;
  return shortest.length >= 4 && longest.includes(shortest);
}

let _cache: { data: SoccerVistaPrediction[]; ts: number } | null = null;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

/**
 * Fetch and parse SoccerVista predictions for today.
 * Results are cached in-memory for 30 min to avoid hammering.
 */
export async function getSoccerVistaPredictions(): Promise<SoccerVistaPrediction[]> {
  if (_cache && Date.now() - _cache.ts < CACHE_TTL) return _cache.data;

  try {
    const res = await fetch("https://www.soccervista.com/", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        Accept: "text/html,application/xhtml+xml",
      },
      next: { revalidate: 1800 },
    });

    if (!res.ok) return [];

    const html = await res.text();
    const $ = cheerio.load(html);
    const predictions: SoccerVistaPrediction[] = [];

    // SoccerVista table: each row = one match
    $("table.maintable tr, table tr").each((_, row) => {
      const cells = $(row).find("td");
      if (cells.length < 5) return;

      const homeText  = $(cells[0]).text().trim();
      const awayText  = $(cells[1]).text().trim();
      const tipText   = $(cells[2]).text().trim().replace(/\s+/g, "");
      const confText  = $(cells[3]).text().trim().replace(/[^0-9]/g, "");

      if (!homeText || !awayText || !tipText) return;

      const tip = normalizeTip(tipText);
      if (!tip) return;

      predictions.push({
        home:       homeText,
        away:       awayText,
        tip,
        confidence: confText ? parseInt(confText, 10) : 50,
      });
    });

    _cache = { data: predictions, ts: Date.now() };
    return predictions;
  } catch (e) {
    console.warn("SoccerVista scrape failed:", e);
    return [];
  }
}

function normalizeTip(raw: string): string | null {
  const t = raw.toUpperCase().replace(/\s/g, "");
  const valid = ["1", "X", "2", "1X", "X2", "12"];
  return valid.includes(t) ? t : null;
}

/**
 * Returns true if SoccerVista has a prediction for this match
 * that agrees with the given tip.
 */
export function crossValidate(
  homeName: string,
  awayName: string,
  tip: string,
  predictions: SoccerVistaPrediction[]
): boolean {
  for (const p of predictions) {
    if (teamMatch(p.home, homeName) && teamMatch(p.away, awayName)) {
      // Tips agree directly, or one includes the other
      return tipsCompatible(tip.toUpperCase(), p.tip.toUpperCase());
    }
  }
  return false;
}

// "1" is compatible with "1X", "1X" is compatible with "1", "1X" is compatible with "1X"
function tipsCompatible(a: string, b: string): boolean {
  if (a === b) return true;
  if ((a === "1"  && b === "1X") || (b === "1"  && a === "1X")) return true;
  if ((a === "2"  && b === "X2") || (b === "2"  && a === "X2")) return true;
  return false;
}