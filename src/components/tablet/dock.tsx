"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { CalendarDays, Grid2x2, Plus, ScanLine, Search, ShoppingCart, UserPlus, Users } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/* ---------- Mode tablette : classe « tablet » sur <html> (posée par l'en-tête, cookie ui=tablet) ---------- */
function subscribeTablet(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => mo.disconnect();
}
const isTablet = () => document.documentElement.classList.contains("tablet");
export const useTabletMode = () => useSyncExternalStore(subscribeTablet, isTablet, () => false);

/* ---------- Action principale de la page (fournie par la page via <TabletAction />) ---------- */
type PageAction = { href: string; label: string; icon?: ReactNode };
let pageAction: PageAction | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
function subscribeAction(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * À placer dans une page : déclare son action principale, affichée dans la barre du mode tablette.
 * <TabletAction href="/agenda/nouveau" label="Nouveau RDV" icon={<CalendarPlus />} />
 */
export function TabletAction({ href, label, icon }: PageAction) {
  const iconRef = useRef(icon);
  useEffect(() => {
    iconRef.current = icon;
  });
  useEffect(() => {
    const a: PageAction = { href, label, icon: iconRef.current };
    pageAction = a;
    emit();
    return () => {
      if (pageAction === a) {
        pageAction = null;
        emit();
      }
    };
  }, [href, label]);
  return null;
}

/** Actions par défaut quand la page n'en déclare pas */
const DEFAULT_ACTIONS: { prefix: string; action: PageAction }[] = [{ prefix: "/contacts", action: { href: "/contacts/nouveau", label: "Nouveau client", icon: <UserPlus /> } }];

/** Barre flottante d'accès rapide, visible seulement en mode tablette */
export function TabletDock() {
  const on = useTabletMode();
  const path = usePathname();
  const t = useT();
  const declared = useSyncExternalStore(subscribeAction, () => pageAction, () => null);
  if (!on || path.startsWith("/tablette")) return null;

  const active = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));
  const label = (key: string, fallback: string) => {
    const v = t(key);
    return v === key ? fallback : v;
  };
  const items = [
    { href: "/acces", label: label("nav.acces.short", "Entrées"), icon: <ScanLine /> },
    { href: "/caisse", label: label("nav.caisse", "Caisse"), icon: <ShoppingCart /> },
    { href: "/agenda", label: label("nav.agenda", "Agenda"), icon: <CalendarDays /> },
    { href: "/contacts", label: label("nav.contacts", "Clients"), icon: <Users /> },
  ];
  const fallback = DEFAULT_ACTIONS.find((d) => path === d.prefix)?.action ?? null;
  const action = declared ?? fallback;
  const itemCls =
    "flex h-14 min-w-12 flex-col items-center justify-center gap-0.5 rounded-xl px-2 text-[11.5px] font-medium transition active:scale-95 sm:min-w-[68px] [&_svg]:size-[22px] [&_svg]:shrink-0";

  return (
    <nav
      aria-label="Accès rapide (mode tablette)"
      className="no-print fixed bottom-[max(env(safe-area-inset-bottom),12px)] left-1/2 z-30 flex max-w-[calc(100vw-16px)] -translate-x-1/2 items-center gap-1 rounded-2xl border border-line bg-white/95 p-1.5 shadow-pop backdrop-blur lg:left-[calc(50%+124px)]"
      data-tablet-dock
    >
      {items.map((it) => {
        const on = active(it.href);
        return (
          <Link key={it.href} href={it.href} aria-current={on ? "page" : undefined} className={cn(itemCls, on ? "bg-brand-50 text-brand-700" : "text-slate-500 hover:bg-slate-50 hover:text-ink")}>
            {it.icon}
            <span className="hidden sm:block">{it.label}</span>
          </Link>
        );
      })}
      <button type="button" onClick={() => window.dispatchEvent(new Event("open-palette"))} className={cn(itemCls, "text-slate-500 hover:bg-slate-50 hover:text-ink")}>
        <Search />
        <span className="hidden sm:block">{label("top.search", "Rechercher")}</span>
      </button>
      <Link href="/plus" aria-current={path === "/plus" ? "page" : undefined} className={cn(itemCls, "lg:hidden", path === "/plus" ? "bg-brand-50 text-brand-700" : "text-slate-500 hover:bg-slate-50 hover:text-ink")}>
        <Grid2x2 />
        <span className="hidden sm:block">{label("nav.menu", "Menu")}</span>
      </Link>
      {action && (
        <Link
          href={action.href}
          className="ms-1 inline-flex h-14 items-center gap-2 rounded-xl bg-brand-500 px-4 text-[15px] font-semibold text-white transition hover:bg-brand-600 active:scale-95 [&_svg]:size-5 [&_svg]:shrink-0"
        >
          {action.icon ?? <Plus />}
          <span className="hidden whitespace-nowrap sm:inline">{action.label}</span>
        </Link>
      )}
    </nav>
  );
}
