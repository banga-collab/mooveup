"use client";

import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Grid2x2, Search } from "lucide-react";
import type { Role } from "@/lib/types";
import type { Entity } from "@/lib/entities";
import type { SavedView } from "@/lib/types-shell";
import { MOBILE, navFor, navGroupLabel, navKey, navLabel, type NavItem } from "@/lib/nav";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { ScopeSwitcher } from "./scope-switcher";
import { NotificationBell } from "./shell/bell";
import { SavedViews } from "./shell/saved-views";
import { UserMenu } from "./shell/user-menu";
import { TabletToggle, ThemeToggle } from "./shell/header-toggles";
import { readLocal, writeLocal } from "./shell/prefs";

/** Sections ouvertes par défaut (la section de la page affichée s'ouvre toujours en plus) */
const DEFAULT_OPEN = ["quotidien"];
const OPEN_KEY = "mu:nav-open";
const SCROLL_KEY = "mu:nav-scroll";
/** Deux clics sur deux liens différents en moins de ce délai : le second est ignoré (double clic involontaire) */
const DOUBLE_CLICK_MS = 700;

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));

/**
 * Lien actif : le plus précis l'emporte (« /parametres/sauvegarde » n'allume pas aussi « /parametres »).
 * Pendant un chargement, c'est le lien cliqué qui est allumé (retour visuel immédiat).
 */
function activeHref(items: NavItem[], path: string, pending: string | null) {
  if (pending) return pending;
  let best: string | null = null;
  for (const it of items) if (isActive(path, it.href) && (!best || it.href.length > best.length)) best = it.href;
  return best;
}

export function Sidebar({
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
  const mobile = all.filter((i) => MOBILE.includes(i.href));

  /* ---------- Lien cliqué en attente de chargement ---------- */
  const [pending, setPending] = useState<string | null>(null);
  const lastClick = useRef<{ href: string; at: number } | null>(null);
  useEffect(() => {
    setPending(null);
    lastClick.current = null;
  }, [path]);
  useEffect(() => {
    if (!pending) return;
    const id = window.setTimeout(() => setPending(null), 20_000);
    return () => window.clearTimeout(id);
  }, [pending]);

  const onNav = useCallback(
    (e: React.MouseEvent, href: string) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const now = Date.now();
      const last = lastClick.current;
      // Même lien déjà en cours de chargement, ou second clic trop rapproché sur un autre lien : on ignore
      if (pending === href || (last && last.href !== href && now - last.at < DOUBLE_CLICK_MS)) {
        e.preventDefault();
        return;
      }
      if (path === href) return;
      lastClick.current = { href, at: now };
      setPending(href);
    },
    [pending, path],
  );

  const on = activeHref(all, path, pending);
  const activeGroup = groups.find((g) => g.items.some((i) => i.href === on))?.id;

  /* ---------- Sections repliables (mémorisées dans le navigateur) ---------- */
  const [stored, setStored] = useState<Record<string, boolean> | null>(null);
  const navRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    setStored(readLocal<Record<string, boolean>>(OPEN_KEY, {}));
  }, []);

  // La section de la page affichée s'ouvre (et le reste)
  useEffect(() => {
    if (!stored || !activeGroup || stored[activeGroup] !== false) return;
    const next = { ...stored, [activeGroup]: true };
    setStored(next);
    writeLocal(OPEN_KEY, next);
  }, [activeGroup, stored]);

  const isOpen = (id: string) => stored?.[id] ?? (DEFAULT_OPEN.includes(id) || id === activeGroup);
  const toggle = (id: string) => {
    const next = { ...(stored ?? {}), [id]: !isOpen(id) };
    setStored(next);
    writeLocal(OPEN_KEY, next);
  };

  /* ---------- Position de défilement conservée (navigations et rechargements) ---------- */
  const restored = useRef(false);
  useLayoutEffect(() => {
    if (!stored || restored.current || !navRef.current) return;
    restored.current = true;
    try {
      const y = Number(window.sessionStorage.getItem(SCROLL_KEY) || 0);
      if (y > 0) navRef.current.scrollTop = y;
    } catch {
      // stockage indisponible
    }
  }, [stored]);

  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    let frame = 0;
    const save = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        try {
          window.sessionStorage.setItem(SCROLL_KEY, String(Math.round(el.scrollTop)));
        } catch {
          // stockage indisponible
        }
      });
    };
    el.addEventListener("scroll", save, { passive: true });
    return () => {
      el.removeEventListener("scroll", save);
      cancelAnimationFrame(frame);
    };
  }, []);

  // Page ouverte autrement (recherche, raccourci) : son lien est rendu visible s'il est hors de vue, sans bouger la page
  useEffect(() => {
    const el = navRef.current;
    const link = el?.querySelector<HTMLElement>('a[aria-current="page"]');
    if (!el || !link) return;
    const top = link.offsetTop;
    if (top < el.scrollTop) el.scrollTop = top - 8;
    else if (top + link.offsetHeight > el.scrollTop + el.clientHeight) el.scrollTop = top + link.offsetHeight - el.clientHeight + 8;
  }, [path, stored]);

  const short = (href: string, label: string) => {
    const k = `${navKey(href)}.short`;
    const s = t(k);
    return s === k ? label : s;
  };
  const plusOn = pending ? pending === "/plus" : path === "/plus";

  return (
    <>
      {/* Bureau */}
      <aside className="no-print sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col border-e border-line bg-white lg:flex">
        <div className="flex items-center gap-2 px-5 pb-3 pt-5">
          <Link href="/" className="flex items-center gap-2" aria-label={t("nav.home")}>
            <Image src="/logo.png" alt="Moov'Up" width={473} height={136} priority className="h-auto max-h-9 w-auto max-w-[118px] object-contain" />
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">CRM</span>
          </Link>
        </div>
        <div className="px-3 pb-2">
          <ScopeSwitcher current={current} allowed={allowed} />
        </div>
        <nav ref={navRef} className="relative flex flex-1 flex-col overflow-y-auto overscroll-contain px-3 pb-3" aria-label={t("nav.main")}>
          {groups.map((g) => {
            const open = isOpen(g.id);
            const alerts = open ? 0 : g.items.reduce((n, it) => n + (badges[it.href] ?? 0), 0);
            return (
              <div key={g.id} className="mt-2">
                <button
                  type="button"
                  onClick={() => toggle(g.id)}
                  aria-expanded={open}
                  aria-controls={`nav-${g.id}`}
                  className="flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-start text-[11px] font-medium text-slate-400 transition hover:bg-slate-50 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                >
                  <span className="flex-1 truncate">{navGroupLabel(t, g)}</span>
                  {!!alerts && <span className="size-1.5 rounded-full bg-accent-500" title={t("nav.hasAlerts", { n: alerts })} />}
                  <ChevronDown className={cn("size-3.5 transition-transform", !open && "-rotate-90 rtl:rotate-90")} aria-hidden />
                </button>
                {open && (
                  <div id={`nav-${g.id}`}>
                    {g.items.map((it) => {
                      const act = on === it.href;
                      const loading = act && pending === it.href;
                      const badge = badges[it.href];
                      return (
                        <Link
                          key={it.href}
                          href={it.href}
                          onClick={(e) => onNav(e, it.href)}
                          aria-current={act ? "page" : undefined}
                          aria-busy={loading || undefined}
                          className={cn(
                            "flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] transition-colors",
                            act ? "bg-slate-100 font-medium text-ink" : "text-slate-600 hover:bg-slate-50 hover:text-ink",
                          )}
                        >
                          <it.icon className={cn("size-4 shrink-0", act ? "text-brand-500" : "text-slate-400", loading && "animate-pulse")} strokeWidth={act ? 2.2 : 1.8} />
                          <span className="flex-1 truncate">{navLabel(t, it)}</span>
                          {!!badge && <span className="min-w-5 rounded-full bg-accent-500 px-1.5 text-center text-[10.5px] font-semibold leading-[18px] text-white tabular-nums">{badge > 99 ? "99+" : badge}</span>}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          <Suspense>
            <SavedViews views={views} />
          </Suspense>
        </nav>
        <div className="border-t border-line px-2 py-2">
          <UserMenu name={name} role={role} job={job} />
        </div>
      </aside>

      {/* Mobile / tablette : barre du haut */}
      <header className="no-print sticky top-0 z-20 flex items-center gap-1 border-b border-line bg-white/95 px-3 py-2 backdrop-blur lg:hidden">
        <Link href="/" className="shrink-0" aria-label={t("nav.home")}>
          <Image src="/logo.png" alt="Moov'Up" width={473} height={136} priority className="h-auto max-h-7 w-auto max-w-[72px] object-contain" />
        </Link>
        <div className="min-w-0 flex-1">
          <ScopeSwitcher current={current} allowed={allowed} compact />
        </div>
        <button type="button" onClick={() => window.dispatchEvent(new Event("open-palette"))} className="grid size-9 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-slate-100" aria-label={t("top.search")}>
          <Search className="size-[18px]" />
        </button>
        <ThemeToggle />
        <TabletToggle className="hidden sm:grid" />
        <NotificationBell />
        <UserMenu name={name} role={role} job={job} compact />
      </header>

      {/* Mobile : barre du bas */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-line bg-white/95 px-1 pb-[max(env(safe-area-inset-bottom),6px)] pt-1 backdrop-blur lg:hidden" aria-label={t("nav.main")}>
        {mobile.map((it) => {
          const act = on === it.href;
          return (
            <Link
              key={it.href}
              href={it.href}
              onClick={(e) => onNav(e, it.href)}
              aria-current={act ? "page" : undefined}
              className={cn("relative flex min-w-14 flex-col items-center gap-0.5 rounded-md px-2 py-1.5 text-[10.5px] font-medium", act ? "text-brand-600" : "text-slate-400")}
            >
              <it.icon className="size-5" strokeWidth={act ? 2.2 : 1.8} />
              {short(it.href, navLabel(t, it))}
              {!!badges[it.href] && <span className="absolute end-2.5 top-1 size-1.5 rounded-full bg-accent-500" />}
            </Link>
          );
        })}
        <Link
          href="/plus"
          onClick={(e) => onNav(e, "/plus")}
          aria-current={plusOn ? "page" : undefined}
          className={cn("flex min-w-14 flex-col items-center gap-0.5 rounded-md px-2 py-1.5 text-[10.5px] font-medium", plusOn ? "text-brand-600" : "text-slate-400")}
        >
          <Grid2x2 className="size-5" strokeWidth={1.8} />
          {t("nav.menu")}
        </Link>
      </nav>
    </>
  );
}
