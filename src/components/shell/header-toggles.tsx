"use client";

import { useEffect, useState } from "react";
import { Moon, Sun, Tablet } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { applyTheme, THEME_EVENT } from "./prefs";

const btn = "grid size-9 shrink-0 place-items-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40";

/** Bouton soleil / lune de l'en-tête : bascule immédiate clair ↔ sombre (« Système » reste dans le menu du compte) */
export function ThemeToggle({ className }: { className?: string }) {
  const t = useT();
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const sync = () => setDark(document.documentElement.classList.contains("dark"));
    sync();
    window.addEventListener(THEME_EVENT, sync);
    return () => window.removeEventListener(THEME_EVENT, sync);
  }, []);

  const label = dark ? t("top.themeLight") : t("top.themeDark");
  return (
    <button type="button" onClick={() => applyTheme(dark ? "light" : "dark")} className={cn(btn, className)} aria-label={label} title={label}>
      {dark ? <Sun className="size-[18px]" aria-hidden /> : <Moon className="size-[18px]" aria-hidden />}
    </button>
  );
}

/** Évènement envoyé sur window quand le mode tablette change */
export const UI_EVENT = "mu-ui";

/** Active / désactive le mode tablette : cookie « ui=tablet » + classe « tablet » sur <html>, sans rechargement */
export function setTabletMode(on: boolean) {
  document.documentElement.classList.toggle("tablet", on);
  document.cookie = on ? "ui=tablet; path=/; max-age=31536000; samesite=lax" : "ui=; path=/; max-age=0; samesite=lax";
  window.dispatchEvent(new Event(UI_EVENT));
}

/** Bouton « Mode tablette » de l'en-tête */
export function TabletToggle({ className }: { className?: string }) {
  const t = useT();
  const [on, setOn] = useState(false);

  useEffect(() => {
    const sync = () => setOn(document.documentElement.classList.contains("tablet"));
    sync();
    window.addEventListener(UI_EVENT, sync);
    return () => window.removeEventListener(UI_EVENT, sync);
  }, []);

  const label = on ? t("top.tabletOff") : t("top.tabletOn");
  return (
    <button
      type="button"
      onClick={() => setTabletMode(!on)}
      aria-pressed={on}
      aria-label={label}
      title={label}
      className={cn(btn, on && "bg-brand-50 text-brand-600 hover:bg-brand-50 hover:text-brand-600", className)}
    >
      <Tablet className="size-[18px]" aria-hidden />
    </button>
  );
}
