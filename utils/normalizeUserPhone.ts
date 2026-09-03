// Canonical form for the User.phone identity field: digits only, no leading
// country code. Existing accounts (196/202 as of this writing) are already
// stored this way (e.g. "696395810"); a handful of legacy ones picked up a
// "+237"/"237" prefix or stray spaces because login/signup used to do exact
// string matching with no cleanup, which silently created duplicate
// accounts for the same real phone number. Applying this at every
// read/write of User.phone (signup, login) closes that gap.
//
// NOT the same as the normalizePhone() helpers in /api/subscribe and
// /api/pay — those produce the "237"-prefixed international format Fapshi
// expects for a *payment* destination, not the account identity key.
export function normalizeUserPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length > 9 && digits.startsWith("237") ? digits.slice(3) : digits;
}

// A valid Cameroon mobile number in the canonical form above: exactly 9
// digits, starting with 6 (the MTN/Orange mobile prefix — the only two
// operators this app's payment flow supports, see /api/subscribe and
// /api/pay's own "+237" + this-number construction). Used to REJECT bad
// input at the one place phone is ever written (signup) — deliberately not
// applied to login or to any existing stored record, since a handful of
// legacy accounts predate this check (e.g. an 8-digit number, one with a
// foreign leading-0 format) and must stay reachable for whoever owns them.
const CAMEROON_MOBILE_RE = /^6\d{8}$/;

export function isValidCameroonMobile(normalizedPhone: string): boolean {
  return CAMEROON_MOBILE_RE.test(normalizedPhone);
}
