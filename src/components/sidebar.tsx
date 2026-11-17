"use client";

import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Grid2x2, Search } from "lucide-react";
import type { Role } from "@/lib/types";
import type { Entity } from "@/lib/entities";
import type { SavedView } from "@/lib/types-shell";
import { MOBILE, navFor, navGroupLabel, navKey, navLabel } from "@/lib/nav";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { ScopeSwitcher } from "./scope-switcher";
import { NotificationBell } from "./shell/bell";
import { SavedViews } from "./shell/saved-views";
import { UserMenu } from "./shell/user-menu";

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
  const active = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));
  const mobile = all.filter((i) => MOBILE.includes(i.href));
  const short = (href: string, label: string) => {
    const k = `${navKey(href)}.short`;
    const s = t(k);
    return s === k ? label : s;
  };

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
        <nav className="flex flex-1 flex-col overflow-y-auto px-3 pb-3" aria-label={t("nav.main")}>
          {groups.map((g) => (
            <div key={g.id} className="mt-3">
              <p className="px-2.5 pb-1 text-[11px] font-medium text-slate-400">{navGroupLabel(t, g)}</p>
              {g.items.map((it) => {
                const on = active(it.href);
                const badge = badges[it.href];
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    aria-current={on ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] transition-colors",
                      on ? "bg-slate-100 font-medium text-ink" : "text-slate-600 hover:bg-slate-50 hover:text-ink",
                    )}
                  >
                    <it.icon className={cn("size-4 shrink-0", on ? "text-brand-500" : "text-slate-400")} strokeWidth={on ? 2.2 : 1.8} />
                    <span className="flex-1 truncate">{navLabel(t, it)}</span>
                    {!!badge && <span className="min-w-5 rounded-full bg-accent-500 px-1.5 text-center text-[10.5px] font-semibold leading-[18px] text-white tabular-nums">{badge > 99 ? "99+" : badge}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
          <Suspense>
            <SavedViews views={views} />
          </Suspense>
        </nav>
        <div className="border-t border-line px-2 py-2">
          <UserMenu name={name} role={role} job={job} />
        </div>
      </aside>

      {/* Mobile : barre du haut */}
      <header className="no-print sticky top-0 z-20 flex items-center gap-1.5 border-b border-line bg-white/95 px-3 py-2 backdrop-blur lg:hidden">
        <Link href="/" className="shrink-0" aria-label={t("nav.home")}>
          <Image src="/logo.png" alt="Moov'Up" width={473} height={136} priority className="h-auto max-h-7 w-auto max-w-[80px] object-contain" />
        </Link>
        <div className="min-w-0 flex-1">
          <ScopeSwitcher current={current} allowed={allowed} compact />
        </div>
        <button type="button" onClick={() => window.dispatchEvent(new Event("open-palette"))} className="grid size-9 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-slate-100" aria-label={t("top.search")}>
          <Search className="size-[18px]" />
        </button>
        <NotificationBell />
        <UserMenu name={name} role={role} job={job} compact />
      </header>

      {/* Mobile : barre du bas */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-line bg-white/95 px-1 pb-[max(env(safe-area-inset-bottom),6px)] pt-1 backdrop-blur lg:hidden" aria-label={t("nav.main")}>
        {mobile.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active(it.href) ? "page" : undefined}
            className={cn("relative flex min-w-14 flex-col items-center gap-0.5 rounded-md px-2 py-1.5 text-[10.5px] font-medium", active(it.href) ? "text-brand-600" : "text-slate-400")}
          >
            <it.icon className="size-5" strokeWidth={active(it.href) ? 2.2 : 1.8} />
            {short(it.href, navLabel(t, it))}
            {!!badges[it.href] && <span className="absolute end-2.5 top-1 size-1.5 rounded-full bg-accent-500" />}
          </Link>
        ))}
        <Link href="/plus" aria-current={path === "/plus" ? "page" : undefined} className={cn("flex min-w-14 flex-col items-center gap-0.5 rounded-md px-2 py-1.5 text-[10.5px] font-medium", path === "/plus" ? "text-brand-600" : "text-slate-400")}>
          <Grid2x2 className="size-5" strokeWidth={1.8} />
          {t("nav.menu")}
        </Link>
      </nav>
    </>
  );
}
