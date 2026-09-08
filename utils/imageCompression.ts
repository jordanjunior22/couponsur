// Client-side image downscale + re-encode, shared by every place in this
// app that lets someone attach a photo before it ever reaches the server
// (group chat messages, admin news posts) — keeps the request small and
// keeps MongoDB storage (which the admin panel reports on and can clear)
// from ballooning on full-resolution phone photos. Pure browser-API code,
// no React — safe to import from any client component.
export interface CompressImageOptions {
  maxDimension?: number; // longest side, in px, after downscaling
  maxBytes?: number; // must match the server's own validation for wherever this is posted to
}

const DEFAULT_MAX_DIMENSION = 1280;
const DEFAULT_MAX_BYTES = 1_500_000;

export function compressImageToDataUri(file: File, options: CompressImageOptions = {}): Promise<string> {
  const maxDimension = options.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Le navigateur ne supporte pas le traitement d'image")); return; }
      ctx.drawImage(img, 0, 0, w, h);

      let quality = 0.82;
      let dataUri = canvas.toDataURL("image/jpeg", quality);
      let tries = 0;
      while (dataUri.length * 0.75 > maxBytes && tries < 5) {
        quality = Math.max(0.3, quality - 0.15);
        dataUri = canvas.toDataURL("image/jpeg", quality);
        tries++;
      }
      if (dataUri.length * 0.75 > maxBytes) {
        reject(new Error("Image trop volumineuse, même après compression"));
        return;
      }
      resolve(dataUri);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Impossible de charger cette image")); };
    img.src = url;
  });
}
