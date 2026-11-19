"use client";

import { createContext, useCallback, useContext } from "react";
import { t as translate, type Lang } from "./core";

const LangContext = createContext<Lang>("fr");

/** À placer une fois dans le layout : <LangProvider lang={lang}> */
export function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

/** const t = useT(); t("nav.caisse") */
export function useT() {
  const lang = useContext(LangContext);
  return useCallback((key: string, vars?: Record<string, string | number>) => translate(lang, key, vars), [lang]);
}

export const useLang = () => useContext(LangContext);
