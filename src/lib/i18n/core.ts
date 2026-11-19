/** Dictionnaires et traduction (utilisable côté serveur ET navigateur) */
import { fr } from "./fr";
import { ar } from "./ar";
import { en } from "./en";

export type Lang = "fr" | "ar" | "en";
export type Dict = Record<string, string>;
export const DICTS: Record<Lang, Dict> = { fr, ar, en };

/** Langues proposées (ordre d'affichage) avec leur nom dans leur propre langue */
export const LANGS: { id: Lang; label: string }[] = [
  { id: "fr", label: "Français" },
  { id: "ar", label: "العربية" },
  { id: "en", label: "English" },
];

/** Valeur de cookie → langue (français par défaut) */
export const parseLang = (v: string | null | undefined): Lang => (v === "ar" || v === "en" ? v : "fr");

/** Texte traduit ; retombe sur le français puis sur la clé. Variables : t(lang, "x", { n: 3 }) avec « {n} » dans le texte */
export function t(lang: Lang, key: string, vars?: Record<string, string | number>) {
  let s = DICTS[lang]?.[key] ?? fr[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export const dir = (lang: Lang) => (lang === "ar" ? "rtl" : "ltr");

/** Locale Intl (dates, nombres) */
export const locale = (lang: Lang) => (lang === "ar" ? "ar-MA" : lang === "en" ? "en-GB" : "fr-FR");
