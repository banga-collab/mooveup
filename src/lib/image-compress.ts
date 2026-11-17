/**
 * Compression d'image côté navigateur, sans perte visible :
 *  - redimensionne au maximum à `maxSize` px (côté le plus long, 2400 par défaut : net même en plein écran),
 *  - réencode en WebP qualité 0,9 (visuellement identique à l'original),
 *  - corrige l'orientation (photos de téléphone),
 *  - garde l'original s'il est déjà plus léger.
 * Les PDF et fichiers non-image sont renvoyés tels quels.
 */
export type CompressResult = { file: File; before: number; after: number; width: number; height: number };

export async function compressImage(file: File, opts: { maxSize?: number; quality?: number } = {}): Promise<CompressResult> {
  const { maxSize = 2400, quality = 0.9 } = opts;
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.type === "image/svg+xml") {
    return { file, before: file.size, after: file.size, width: 0, height: 0 };
  }
  // createImageBitmap applique l'orientation EXIF
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions).catch(() => null);
  if (!bitmap) return { file, before: file.size, after: file.size, width: 0, height: 0 };

  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { file, before: file.size, after: file.size, width: bitmap.width, height: bitmap.height };
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/webp", quality));
  if (!blob || blob.size >= file.size) return { file, before: file.size, after: file.size, width, height };
  const name = file.name.replace(/\.[^.]+$/, "") + ".webp";
  return { file: new File([blob], name, { type: "image/webp", lastModified: Date.now() }), before: file.size, after: blob.size, width, height };
}

/** "2,4 Mo" */
export function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`;
}
