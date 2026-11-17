/**
 * Filtres côté serveur (module sans "use client" : utilisable dans les pages serveur).
 * NB : `matchesQuery` exporté par `list-toolbar.tsx` est une référence client et
 * ne peut PAS être appelé depuis un composant serveur ; utilisez celui-ci.
 */

/** Texte normalisé : sans accents, sans casse */
export function norm(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/**
 * Vrai si l'un des champs contient la recherche (sans accents ni casse ;
 * comparaison sur les chiffres seuls pour les téléphones et montants).
 * Plusieurs mots : chacun doit apparaître dans au moins un champ.
 */
export function matchesQuery(q: string | undefined | null, ...fields: (string | number | null | undefined | false | (string | null | undefined)[])[]) {
  const n = norm(q ?? "");
  if (!n) return true;
  const flat: string[] = [];
  for (const f of fields) {
    if (f === null || f === undefined || f === false) continue;
    if (Array.isArray(f)) {
      for (const x of f) if (x) flat.push(String(x));
    } else flat.push(String(f));
  }
  const hay = flat.map(norm);
  const digits = (q ?? "").replace(/\D/g, "");
  const local = digits.startsWith("212") && digits.length > 9 ? "0" + digits.slice(3) : digits;
  if (local.length >= 3 && /^[\d\s+().-]+$/.test((q ?? "").trim())) {
    if (flat.some((s) => s.replace(/\D/g, "").includes(local) || s.replace(/\D/g, "").includes(digits))) return true;
  }
  const words = n.split(/\s+/).filter(Boolean);
  return words.every((w) => hay.some((h) => h.includes(w)));
}

/** Premier paramètre d'URL en chaîne (vide → undefined) */
export function one(v: string | string[] | undefined) {
  return (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
}
