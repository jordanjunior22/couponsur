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
