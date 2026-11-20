"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bookmark, Search, ShoppingCart } from "lucide-react";
import type { Role } from "@/lib/types";
import type { Entity } from "@/lib/entities";
import type { SavedView } from "@/lib/types-shell";
import { navFor, navGroupLabel, navLabel, type NavItem } from "@/lib/nav";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { ScopeSwitcher } from "./scope-switcher";
import { buttonClass } from "./ui";
import { NotificationBell } from "./shell/bell";
import { UserMenu } from "./shell/user-menu";
import { TabletToggle, ThemeToggle } from "./shell/header-toggles";

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));
function activeHref(items: NavItem[], path: string) {
  let best: string | null = null;
  for (const it of items) if (isActive(path, it.href) && (!best || it.href.length > best.length)) best = it.href;
  return best;
}

/**
 * Navigation horizontale (bureau) : une ligne de rubriques, une ligne avec les pages de la rubrique choisie.
 * Sobre : texte, soulignement fin pour la page active, icônes discrètes.
 */
export function TopNav({
  name,
  role,
  job,
  badges = {},
  current,
  allowed,
  views = [],
}: {
  name: string;
  role: Role;
  job?: string | null;
  badges?: Record<string, number>;
  current: Entity | null;
  allowed: Entity[];
  views?: SavedView[];
}) {
  const t = useT();
  const path = usePathname();
  const groups = navFor(role);
  const all = groups.flatMap((g) => g.items);
  const on = activeHref(all, path);
  const pageGroup = groups.find((g) => g.items.some((i) => i.href === on))?.id ?? groups[0]?.id;
  const [shown, setShown] = useState(pageGroup);
  useEffect(() => setShown(pageGroup), [pageGroup]);
  const group = groups.find((g) => g.id === shown) ?? groups[0];

  return (
    <header className="no-print sticky top-0 z-30 hidden border-b border-line bg-white/90 backdrop-blur-md lg:block">
      {/* Ligne 1 : logo, rubriques, outils */}
      <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-4 px-6 xl:gap-6 xl:px-8">
        <Link href="/" className="flex shrink-0 items-center" aria-label={t("nav.home")}>
          <Image src="/logo.png" alt="Moov'Up" width={473} height={136} priority className="h-auto max-h-8 w-auto max-w-[104px] object-contain" />
        </Link>
        <nav className="flex min-w-0 items-center gap-1" aria-label={t("nav.main")}>
          {groups.map((g) => {
            const sel = g.id === group?.id;
            const alerts = g.items.reduce((n, it) => n + (badges[it.href] ?? 0), 0);
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => setShown(g.id)}
                aria-pressed={sel}
                className={cn(
                  "relative whitespace-nowrap rounded-md px-2.5 py-1.5 text-[13.5px] transition-colors",
                  sel ? "bg-slate-100 font-medium text-ink" : "text-slate-500 hover:text-ink",
                )}
              >
                {navGroupLabel(t, g)}
                {!!alerts && <span className="absolute end-1 top-1 size-1.5 rounded-full bg-accent-500" aria-label={t("nav.hasAlerts", { n: alerts })} />}
              </button>
            );
          })}
        </nav>
        <div className="ms-auto flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event("open-palette"))}
            aria-label={t("top.search")}
            className="flex h-8 w-8 items-center justify-center gap-2 rounded-md border border-line text-start text-[13px] text-slate-400 transition-colors hover:border-slate-300 xl:w-40 xl:justify-start xl:px-2.5"
          >
            <Search className="size-[15px]" strokeWidth={1.75} aria-hidden />
            <span className="hidden flex-1 truncate xl:inline">{t("top.searchPlaceholder")}</span>
            <kbd className="hidden font-sans text-[11px] text-slate-400 xl:inline" dir="ltr">
              Ctrl K
            </kbd>
          </button>
          <div className="w-36">
            <ScopeSwitcher current={current} allowed={allowed} compact />
          </div>
          {views.length > 0 && <ViewsMenu views={views} />}
          <ThemeToggle />
          <TabletToggle className="hidden 2xl:grid" />
          <NotificationBell />
          <Link href="/caisse" className={buttonClass("primary", "ms-1 h-8 rounded-md px-3")} title={t("top.shortcutHint", { key: "V" })}>
            <ShoppingCart strokeWidth={1.75} /> {t("top.sell")}
          </Link>
          <UserMenu name={name} role={role} job={job} compact />
        </div>
      </div>

      {/* Ligne 2 : pages de la rubrique */}
      <div className="mx-auto flex h-11 max-w-[1280px] items-stretch gap-1 overflow-x-auto px-4 xl:px-6 [scrollbar-width:none]">
        {group?.items.map((it) => {
          const act = on === it.href;
          const badge = badges[it.href];
          return (
            <Link
              key={it.href}
              href={it.href}
              aria-current={act ? "page" : undefined}
              className={cn(
                "group relative flex shrink-0 items-center gap-2 px-2.5 text-[13px] transition-colors",
                act ? "font-medium text-ink" : "text-slate-500 hover:text-ink",
              )}
            >
              <it.icon className={cn("size-[15px]", act ? "text-ink" : "text-slate-400 group-hover:text-slate-600")} strokeWidth={1.75} />
              {navLabel(t, it)}
              {!!badge && <span className="text-[11px] font-semibold tabular-nums text-accent-600">{badge > 99 ? "99+" : badge}</span>}
              <span className={cn("absolute inset-x-2.5 bottom-0 h-[2px] rounded-full transition-colors", act ? "bg-ink" : "bg-transparent")} />
            </Link>
          );
        })}
      </div>
    </header>
  );
}

/** Vues enregistrées du membre (listes filtrées) */
function ViewsMenu({ views }: { views: SavedView[] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback((e: MouseEvent) => {
    if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
  }, []);
  useEffect(() => {
    if (!open) return;
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open, close]);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={t("views.title")} className="flex h-8 items-center gap-1 rounded-md px-2 text-[13px] text-slate-500 hover:bg-slate-100 hover:text-ink">
        <Bookmark className="size-[15px]" strokeWidth={1.75} />
      </button>
      {open && (
        <div className="absolute end-0 top-10 z-40 w-60 rounded-lg border border-line bg-white p-1 shadow-pop">
          <p className="px-2.5 py-1.5 text-[11px] font-medium text-slate-400">{t("views.title")}</p>
          {views.map((v) => (
            <Link key={v.id} href={v.href} onClick={() => setOpen(false)} className="block truncate rounded-md px-2.5 py-1.5 text-[13px] text-slate-600 hover:bg-slate-50 hover:text-ink">
              {v.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
