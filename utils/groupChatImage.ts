// Server-side guard for images posted to the premium group chat. The
// client already downscales/compresses to a JPEG before upload (see
// GroupChatRoom.tsx), but the server never trusts that — this re-validates
// shape and size on every POST.
export const MAX_GROUP_IMAGE_BYTES = 1_500_000; // ~1.5MB decoded, after client-side compression

const DATA_URI_RE = /^data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/]+=*)$/;

export function parseImageDataUri(value: string): { bytes: number } | null {
  const match = DATA_URI_RE.exec(value);
  if (!match) return null;

  const base64 = match[2];
  // Standard base64 expansion: every 4 chars encode 3 bytes, minus padding.
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  const bytes = Math.floor((base64.length * 3) / 4) - padding;
  return { bytes };
}
