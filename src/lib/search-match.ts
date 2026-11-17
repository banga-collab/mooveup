/**
 * Recherche texte utilisable côté serveur ET navigateur :
 * vrai si l'un des champs contient la recherche (sans accents, sans casse,
 * et chiffres du téléphone : « 0612 » trouve « 06 12 34 56 78 »).
 */
export function matchesQuery(q: string | undefined | null, ...fields: (string | number | null | undefined)[]) {
  const n = norm(q ?? "");
  if (!n) return true;
  const digits = (q ?? "").replace(/\D/g, "");
  return fields.some((f) => {
    if (f === null || f === undefined) return false;
    const s = String(f);
    return norm(s).includes(n) || (digits.length >= 3 && s.replace(/\D/g, "").includes(digits));
  });
}

export function norm(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}
