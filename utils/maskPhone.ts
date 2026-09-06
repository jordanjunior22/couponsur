// Masks the middle of a phone number so it can be shown in a shared/public
// context (e.g. the premium group chat's member list) without exposing the
// full number. Cameroon mobile numbers are 9 digits (e.g. "696395810"); this
// keeps the first 3 and last 2 visible and masks what's between —
// "696395810" -> "696****10" — degrading gracefully for anything
// shorter/longer or still carrying spaces/a country code.
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return "*".repeat(digits.length);

  const visibleStart = 3;
  const visibleEnd = 2;
  const maskedLength = digits.length - visibleStart - visibleEnd;
  if (maskedLength <= 0) return digits;

  return digits.slice(0, visibleStart) + "*".repeat(maskedLength) + digits.slice(-visibleEnd);
}
