"use client";

import { useLang } from "@/lib/i18n/client";
import { mt, type MKey } from "./i18n";

/** Textes de l'espace adhérent côté navigateur : const t = useMt(); t("m.nav.home") */
export function useMt() {
  const lang = useLang();
  return (key: MKey, vars?: Record<string, string | number>) => mt(lang, key, vars);
}
