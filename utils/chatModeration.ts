// Auto-moderation for the premium group chat: catches an attempt to move
// the conversation off-platform by sharing a phone number or a
// WhatsApp/Telegram link — including the obvious tricks (spacing digits
// out, sprinkling punctuation/letters between them, spelling digits out as
// words). Not run for admins (see the call sites) — they're already
// trusted.
//
// Deliberately built from a handful of SPECIFIC digit-grouping shapes
// rather than "strip every separator and search the whole message for 9
// digits in a row": this app's own chat content is full of legitimate
// short number sequences close together (odds like "1.90 2.10 6.35 9.15
// 8.10", scores, dates), and a generic collapse-everything approach would
// eventually stitch unrelated numbers into something that happens to look
// like "6xxxxxxxx". Requiring one of a few actual phone-number shapes
// keeps that from happening while still catching real obfuscation.
import { normalizeUserPhone, isValidCameroonMobile } from "@/utils/normalizeUserPhone";

export type ModerationReason = "phone" | "contact_platform";

function containsCameroonNumber(digits: string): boolean {
  // Slides a 9..12-digit window (bare local number, or with a 237/+237
  // prefix) across the candidate digit string.
  for (let len = 9; len <= Math.min(12, digits.length); len++) {
    for (let i = 0; i + len <= digits.length; i++) {
      if (isValidCameroonMobile(normalizeUserPhone(digits.slice(i, i + len)))) return true;
    }
  }
  return false;
}

// A single "filler" character between digits — punctuation/space for the
// grouped shapes, or (for the fully spaced-out shape only) a single
// letter too, since spelling a number out one digit at a time with a
// random letter between each ("6a9b6c3d9e5f8g1h0") is the classic dodge.
const P = `[ .\\-_]`; // punctuation/space filler
const PL = `[ .\\-_a-zA-Z]`; // punctuation/space/single-letter filler
const PREFIX = `(?:\\+?237${P}?)?`; // optional "+237"/"237" country code

const PHONE_PATTERNS: RegExp[] = [
  new RegExp(`${PREFIX}6\\d{8}\\b`), // 696395810
  new RegExp(`${PREFIX}6\\d{2}${P}\\d{3}${P}\\d{3}\\b`), // 696 395 810 / 696-395-810 / 696.395.810
  new RegExp(`${PREFIX}6${P}\\d{2}${P}\\d{2}${P}\\d{2}${P}\\d{2}\\b`), // 6 96 39 58 10
  // Digit-by-digit, each one separated individually — the "add characters
  // in between" trick — allowing a single letter as well as punctuation.
  new RegExp(`${PREFIX}6(?:${PL}\\d){8}\\b`),
];

// Words that spell out a single digit, French (this app's language) and
// English, in case either gets used to dodge a plain digit filter.
const DIGIT_WORDS: Record<string, string> = {
  "zéro": "0", zero: "0",
  un: "1", one: "1",
  deux: "2", two: "2",
  trois: "3", three: "3",
  quatre: "4", four: "4",
  cinq: "5", five: "5",
  six: "6",
  sept: "7", seven: "7",
  huit: "8", eight: "8",
  neuf: "9", nine: "9",
};

// Decodes every maximal run of *consecutive* number-words (no non-number
// word in between) into its digit string. A stray "un" or "deux" in
// normal prose never triggers this — it only fires on a deliberate run of
// nine-plus number-words back to back, which doesn't happen by accident.
function wordNumberRuns(text: string): string[] {
  const words = text.toLowerCase().split(/[^a-zàâäéèêëîïôöùûüç]+/).filter(Boolean);
  const runs: string[] = [];
  let current = "";
  for (const w of words) {
    const d = DIGIT_WORDS[w];
    if (d !== undefined) current += d;
    else if (current) { runs.push(current); current = ""; }
  }
  if (current) runs.push(current);
  return runs;
}

const CONTACT_LINK_RE = /\b(wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com|whatsapp\.com|t\.me|telegram\.me|telegram\.dog|telegram\.org)\b/i;

export function detectProhibitedContact(rawText: string): ModerationReason | null {
  const text = rawText.normalize("NFKC"); // collapses full-width/lookalike digit tricks to plain ASCII
  if (!text.trim()) return null;

  // Link/platform checks run first — a WhatsApp link that happens to
  // contain a phone number (e.g. "wa.me/237696395810") should report as
  // the more informative "contact_platform" reason, not get shadowed by
  // the phone check just because it also matches a digit shape.

  // "wa . me", "t (dot) me", "wa.me" with stray spaces around the dot, etc.
  const dotNormalized = text.toLowerCase()
    .replace(/\s*[[(]?\s*dot\s*[\])]?\s*/g, ".")
    .replace(/\s*\.\s*/g, ".");
  if (CONTACT_LINK_RE.test(dotNormalized)) return "contact_platform";

  // Bare mention of the platform name, however spaced/punctuated —
  // "w h a t s a p p", "what's-app", "tele.gram" all collapse to the same
  // letters-only string.
  const lettersOnly = text.toLowerCase().replace(/[^a-z]/g, "");
  if (lettersOnly.includes("whatsapp") || lettersOnly.includes("telegram")) return "contact_platform";

  if (PHONE_PATTERNS.some((re) => re.test(text))) return "phone";

  for (const run of wordNumberRuns(text)) {
    if (containsCameroonNumber(run)) return "phone";
  }

  return null;
}

export function moderationMessage(reason: ModerationReason): string {
  return reason === "phone"
    ? "Message bloqué : le partage de numéro de téléphone n'est pas autorisé dans le groupe."
    : "Message bloqué : le partage de liens/groupes WhatsApp ou Telegram n'est pas autorisé dans le groupe.";
}
