/**
 * Préférences côté navigateur : thème, mémoire locale (derniers éléments consultés,
 * étapes de prise en main, infobulles déjà vues). Tout accès à localStorage est protégé.
 */
import type { SearchResult, Theme } from "@/lib/types-shell";

export function readLocal<T>(key: string, fallback: T): T {
  try {
    const v = window.localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeLocal(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // stockage indisponible (navigation privée) : on ignore
  }
}

/* ---------- Thème ---------- */
export function currentTheme(): Theme {
  const t = typeof document !== "undefined" ? document.documentElement.dataset.theme : undefined;
  return t === "dark" || t === "system" ? t : "light";
}

export function applyTheme(theme: Theme) {
  const d = document.documentElement;
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  d.dataset.theme = theme;
  d.classList.toggle("dark", dark);
  d.style.colorScheme = dark ? "dark" : "light";
  document.cookie = `theme=${theme}; path=/; max-age=31536000; samesite=lax`;
}

/* ---------- Étapes de prise en main réalisées dans le navigateur ---------- */
const FLAGS = "mu:onboarding";
export type LocalFlag = "palette" | "raccourcis";
export function setFlag(f: LocalFlag) {
  const cur = readLocal<string[]>(FLAGS, []);
  if (!cur.includes(f)) {
    writeLocal(FLAGS, [...cur, f]);
    window.dispatchEvent(new Event("mu-flags"));
  }
}
export const getFlags = () => readLocal<string[]>(FLAGS, []);

/* ---------- Derniers éléments consultés (palette Ctrl+K) ---------- */
const RECENT = "mu:recent";
export type Recent = Pick<SearchResult, "id" | "group" | "label" | "sub" | "href" | "contact_id">;
export const getRecent = () => readLocal<Recent[]>(RECENT, []);
export function pushRecent(r: Recent) {
  const list = getRecent().filter((x) => x.href !== r.href);
  writeLocal(RECENT, [r, ...list].slice(0, 8));
}
export const clearRecent = () => writeLocal(RECENT, []);
