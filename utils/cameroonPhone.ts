// Client-side input validation + display formatting for a Cameroon mobile
// number, used by every auth form (Profil tab's login/signup). Extracted
// from the old UserMenu dropdown so it isn't copy-pasted wherever a phone
// field shows up next.
//
// NOT the same job as utils/normalizeUserPhone.ts — that's the server-side
// canonical-identity helper (digits only, no messages/formatting) applied
// at signup/login time. This one only validates and formats what's typed
// into the form itself.
//
// Valid Cameroon numbers:
//   Mobile: 6XX XXX XXX (MTN, Orange, Nexttel, Camtel Mobile)
//   Starts with 6 followed by 5, 7, 8, or 9 (MTN), 9 (Orange), 6 (Nexttel), 5/55 (Camtel)
//   Accepts with or without country code: +237 or 237
export function validateCameroonPhone(raw: string): { valid: boolean; message: string } {
  const cleaned = raw.replace(/[\s\-().]/g, "");

  // Strip country code if present
  let local = cleaned;
  if (cleaned.startsWith("+237")) local = cleaned.slice(4);
  else if (cleaned.startsWith("237")) local = cleaned.slice(3);

  if (!local) return { valid: false, message: "Entrez votre numéro de téléphone" };
  if (!/^\d+$/.test(local)) return { valid: false, message: "Le numéro ne doit contenir que des chiffres" };
  if (local.length !== 9) return { valid: false, message: "Le numéro camerounais doit avoir 9 chiffres" };
  if (!local.startsWith("6")) return { valid: false, message: "Les numéros mobiles camerounais commencent par 6" };

  const prefix = local.slice(0, 2);
  const validPrefixes = ["65", "67", "68", "69", "66", "62", "63", "64", "61", "60"];
  if (!validPrefixes.includes(prefix)) {
    return { valid: false, message: `Préfixe "${prefix}" non reconnu au Cameroun` };
  }

  return { valid: true, message: "" };
}

export function formatCameroonPhone(raw: string): string {
  const cleaned = raw.replace(/\D/g, "");
  let local = cleaned;
  if (cleaned.startsWith("237") && cleaned.length > 9) local = cleaned.slice(3);
  // Format: 6XX XXX XXX
  if (local.length <= 3) return local;
  if (local.length <= 6) return `${local.slice(0, 3)} ${local.slice(3)}`;
  return `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6, 9)}`;
}
