"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsUpDown, CircleHelp, Keyboard, Loader2, LogOut, Monitor, Moon, Rocket, Sun } from "lucide-react";
import { signOut } from "@/app/(auth)/actions";
import { setLang } from "@/actions/preferences";
import { useLang, useT } from "@/lib/i18n/client";
import type { Lang } from "@/lib/i18n/core";
import type { Role } from "@/lib/types";
import type { Theme } from "@/lib/types-shell";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui";
import { applyTheme, currentTheme } from "./prefs";

/** Menu utilisateur : thème, langue, aide, déconnexion */
export function UserMenu({ name, role, job, compact }: { name: string; role: Role; job?: string | null; compact?: boolean }) {
  const t = useT();
  const lang = useLang();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [theme, setThemeState] = useState<Theme>("light");
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setThemeState(currentTheme()), []);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  // Thème « système » : suivre le réglage de l'appareil en direct
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => applyTheme("system");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [theme]);

  const chooseTheme = (v: Theme) => {
    applyTheme(v);
    setThemeState(v);
  };
  const chooseLang = (v: Lang) => v !== lang && start(() => setLang(v));
  const sub = job || t(`role.${role}`);

  const THEMES: [Theme, typeof Sun][] = [
    ["light", Sun],
    ["dark", Moon],
    ["system", Monitor],
  ];

  return (
    <div ref={ref} className="relative">
      {compact ? (
        <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label={t("user.menu")} className="grid size-9 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40">
          <Avatar name={name || "?"} size={30} />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={open}
          className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-start transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
        >
          <Avatar name={name || "?"} size={32} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-ink">{name || t("user.account")}</span>
            <span className="block truncate text-xs text-muted">{sub}</span>
          </span>
          <ChevronsUpDown className="size-4 text-slate-400" aria-hidden />
        </button>
      )}

      {open && (
        <div role="menu" className={cn("absolute z-50 w-64 rounded-xl border border-line bg-white p-1.5 shadow-pop animate-fade-up", compact ? "end-0 top-full mt-2" : "bottom-full start-0 mb-2")}>
          {compact && (
            <div className="border-b border-line px-2.5 pb-2 pt-1">
              <p className="truncate text-[13px] font-medium text-ink">{name || t("user.account")}</p>
              <p className="truncate text-xs text-muted">{sub}</p>
            </div>
          )}

          <p className="px-2.5 pb-1 pt-2 text-[11px] font-medium text-slate-400">{t("user.theme")}</p>
          <div className="mx-1 grid grid-cols-3 gap-0.5 rounded-lg bg-slate-100 p-0.5" role="radiogroup" aria-label={t("user.theme")}>
            {THEMES.map(([v, Icon]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={theme === v}
                onClick={() => chooseTheme(v)}
                className={cn("inline-flex h-8 items-center justify-center gap-1 rounded-md text-xs font-medium transition", theme === v ? "bg-white text-ink shadow-sm" : "text-slate-500 hover:text-ink")}
              >
                <Icon className="size-3.5" aria-hidden />
                {t(`theme.${v}`)}
              </button>
            ))}
          </div>

          <p className="px-2.5 pb-1 pt-3 text-[11px] font-medium text-slate-400">{t("user.lang")}</p>
          <div className="mx-1 grid grid-cols-2 gap-0.5 rounded-lg bg-slate-100 p-0.5" role="radiogroup" aria-label={t("user.lang")}>
            {(
              [
                ["fr", "Français"],
                ["ar", "العربية"],
              ] as [Lang, string][]
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={lang === v}
                lang={v}
                disabled={pending}
                onClick={() => chooseLang(v)}
                className={cn("inline-flex h-8 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition disabled:opacity-60", lang === v ? "bg-white text-ink shadow-sm" : "text-slate-500 hover:text-ink")}
              >
                {pending && lang !== v && <Loader2 className="size-3 animate-spin" aria-hidden />}
                {label}
              </button>
            ))}
          </div>

          <div className="my-1.5 h-px bg-line" />
          <MenuLink href="/demarrer" icon={Rocket} label={t("user.onboarding")} />
          <MenuLink href="/aide" icon={CircleHelp} label={t("user.help")} />
          <button type="button" role="menuitem" onClick={() => { setOpen(false); window.dispatchEvent(new Event("open-shortcuts")); }} className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13px] text-slate-700 hover:bg-slate-50 hover:text-ink">
            <Keyboard className="size-4 text-slate-400" aria-hidden />
            <span className="flex-1 text-start">{t("user.shortcuts")}</span>
            <kbd className="rounded border border-line px-1.5 text-[11px] text-slate-400">?</kbd>
          </button>
          <div className="my-1.5 h-px bg-line" />
          <form action={signOut}>
            <button type="submit" role="menuitem" className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13px] text-red-600 hover:bg-red-50">
              <LogOut className="size-4" aria-hidden />
              {t("user.logout")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function MenuLink({ href, icon: Icon, label }: { href: string; icon: typeof Sun; label: string }) {
  return (
    <Link href={href} role="menuitem" className="flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13px] text-slate-700 hover:bg-slate-50 hover:text-ink">
      <Icon className="size-4 text-slate-400" aria-hidden />
      {label}
    </Link>
  );
}
