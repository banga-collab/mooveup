"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Grid2x2, LogOut } from "lucide-react";
import type { Role } from "@/lib/types";
import type { Entity } from "@/lib/entities";
import { MOBILE, navFor } from "@/lib/nav";
import { ROLE_LABEL, cn } from "@/lib/utils";
import { Avatar } from "./ui";
import { ScopeSwitcher } from "./scope-switcher";
import { signOut } from "@/app/(auth)/actions";

export function Sidebar({
  name,
  role,
  job,
  badges = {},
  current,
  allowed,
}: {
  name: string;
  role: Role;
  job?: string | null;
  badges?: Record<string, number>;
  current: Entity | null;
  allowed: Entity[];
}) {
  const path = usePathname();
  const groups = navFor(role);
  const all = groups.flatMap((g) => g.items);
  const active = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));
  const mobile = all.filter((i) => MOBILE.includes(i.href));

  return (
    <>
      {/* Bureau */}
      <aside className="no-print sticky top-0 hidden h-dvh w-[264px] shrink-0 flex-col border-r border-line bg-white lg:flex">
        <div className="px-6 pb-3 pt-6">
          <Link href="/" className="flex items-end gap-2">
            <Image src="/logo.png" alt="Moov'Up" width={473} height={136} priority className="h-auto max-h-12 w-auto max-w-[150px] object-contain" />
            <span className="mb-0.5 rounded-md bg-accent-500 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white">CRM</span>
          </Link>
        </div>
        <div className="px-3 pb-1">
          <ScopeSwitcher current={current} allowed={allowed} />
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-3">
          {groups.map((g) => (
            <div key={g.label} className="mb-1">
              <p className="px-3 pb-1.5 pt-4 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-400">{g.label}</p>
              {g.items.map((it) => {
                const on = active(it.href);
                const badge = badges[it.href];
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] font-medium transition-colors",
                      on ? "bg-brand-50 text-brand-600" : "text-slate-500 hover:bg-canvas hover:text-ink",
                    )}
                  >
                    {on && <span className="absolute -left-3 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-accent-500" />}
                    <it.icon className={cn("size-[18px] shrink-0", on ? "text-brand-500" : "text-slate-400 group-hover:text-ink")} strokeWidth={on ? 2.2 : 1.9} />
                    <span className="flex-1">{it.label}</span>
                    {!!badge && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent-500 px-1.5 text-[10.5px] font-bold text-white">{badge > 99 ? "99+" : badge}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="m-3 mt-0 flex items-center gap-3 rounded-2xl border border-line p-3">
          <Avatar name={name || "?"} size={38} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{name || "Mon compte"}</p>
            <p className="truncate text-xs text-muted">{job || ROLE_LABEL[role]}</p>
          </div>
          <form action={signOut}>
            <button className="grid size-9 place-items-center rounded-lg text-muted transition hover:bg-red-50 hover:text-red-600" title="Se déconnecter" aria-label="Se déconnecter">
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </aside>

      {/* Mobile : barre du haut */}
      <header className="no-print sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-white/90 px-4 py-2 backdrop-blur lg:hidden">
        <Image src="/logo.png" alt="Moov'Up" width={473} height={136} priority className="h-auto max-h-8 w-auto max-w-[92px] object-contain" />
        <div className="min-w-0 flex-1">
          <ScopeSwitcher current={current} allowed={allowed} compact />
        </div>
        <form action={signOut}>
          <button className="grid size-9 place-items-center rounded-lg text-muted hover:bg-canvas" aria-label="Se déconnecter">
            <LogOut className="size-4" />
          </button>
        </form>
      </header>

      {/* Mobile : barre du bas */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-line bg-white/95 px-1 pb-[max(env(safe-area-inset-bottom),6px)] pt-1.5 backdrop-blur lg:hidden">
        {mobile.map((it) => (
          <Link key={it.href} href={it.href} className={cn("relative flex min-w-14 flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[10.5px] font-semibold", active(it.href) ? "text-brand-500" : "text-slate-400")}>
            <it.icon className="size-5" />
            {it.label.replace("Tableau de bord", "Accueil").replace("Clients & contacts", "Clients")}
            {!!badges[it.href] && <span className="absolute right-2 top-0.5 size-2 rounded-full bg-accent-500" />}
          </Link>
        ))}
        <Link href="/plus" className={cn("flex min-w-14 flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[10.5px] font-semibold", path === "/plus" ? "text-brand-500" : "text-slate-400")}>
          <Grid2x2 className="size-5" />
          Plus
        </Link>
      </nav>
    </>
  );
}
