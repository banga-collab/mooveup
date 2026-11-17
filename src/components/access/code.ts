/** Codes de carte membre : « MU-7K3P-9QXA » (sans 0/O, 1/I/L pour éviter les confusions) */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Met en forme 8 caractères en « MU-XXXX-XXXX » */
export function formatCode(core: string) {
  return `MU-${core.slice(0, 4)}-${core.slice(4, 8)}`;
}

/**
 * Reconnaît un code de carte saisi ou scanné (« mu 7k3p 9qxa », « MU7K3P9QXA »,
 * ou une URL de carte …/carte/MU-7K3P-9QXA) et renvoie sa forme normalisée.
 */
export function parseCode(input: string): string | null {
  const s = input.trim().toUpperCase();
  const fromUrl = s.match(/MU-?[A-Z0-9]{4}-?[A-Z0-9]{4}(?![A-Z0-9])/);
  const raw = (fromUrl ? fromUrl[0] : s).replace(/[^A-Z0-9]/g, "");
  if (!/^MU[A-Z0-9]{8}$/.test(raw)) return null;
  return formatCode(raw.slice(2));
}
