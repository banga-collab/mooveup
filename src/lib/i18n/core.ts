/** Dictionnaires et traduction (utilisable côté serveur ET navigateur) */
import { fr } from "./fr";
import { ar } from "./ar";

export type Lang = "fr" | "ar";
export type Dict = Record<string, string>;
export const DICTS: Record<Lang, Dict> = { fr, ar };

/** Texte traduit ; retombe sur le français puis sur la clé. Variables : t(lang, "x", { n: 3 }) avec « {n} » dans le texte */
export function t(lang: Lang, key: string, vars?: Record<string, string | number>) {
  let s = DICTS[lang][key] ?? fr[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export const dir = (lang: Lang) => (lang === "ar" ? "rtl" : "ltr");
