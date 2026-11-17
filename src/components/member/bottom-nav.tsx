"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Gift, House, Ticket, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMt } from "./use-mt";
import type { MKey } from "./i18n";

const ITEMS: { href: string; key: MKey; icon: typeof House; also?: string[] }[] = [
  { href: "/espace", key: "m.nav.home", icon: House },
  { href: "/espace/rdv", key: "m.nav.rdv", icon: CalendarDays },
  { href: "/espace/abonnements", key: "m.nav.subs", icon: Ticket, also: ["/espace/paiement"] },
  { href: "/espace/fidelite", key: "m.nav.loyalty", icon: Gift },
  { href: "/espace/profil", key: "m.nav.profile", icon: UserRound, also: ["/espace/achats", "/espace/avis"] },
];

function isActive(path: string, it: (typeof ITEMS)[number]) {
  if (it.href === "/espace") return path === "/espace";
  return [it.href, ...(it.also ?? [])].some((h) => path === h || path.startsWith(`${h}/`));
}

/** Navigation de l'espace adhérent : barre en bas sur mobile, onglets en haut sur grand écran */
export function MemberNav({ variant }: { variant: "bottom" | "top" }) {
  const path = usePathname();
  const t = useMt();
  if (variant === "top") {
    return (
      <nav aria-label="Mon espace" className="hidden items-center gap-0.5 sm:flex">
        {ITEMS.map((it) => {
          const active = isActive(path, it);
          return (
            <Link
              key={it.href}
              href={it.href}
              aria-current={active ? "page" : undefined}
              className={cn("inline-flex h-9 items-center rounded-lg px-3 text-[13px] font-medium transition", active ? "bg-brand-50 text-brand-700" : "text-slate-500 hover:bg-slate-100 hover:text-ink")}
            >
              {t(it.key)}
            </Link>
          );
        })}
      </nav>
    );
  }
  return (
    <nav aria-label="Mon espace" className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] sm:hidden">
      <ul className="mx-auto grid max-w-xl grid-cols-5">
        {ITEMS.map((it) => {
          const active = isActive(path, it);
          const Icon = it.icon;
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={cn("flex h-16 flex-col items-center justify-center gap-1 text-[10.5px] font-medium tracking-tight transition", active ? "text-brand-600" : "text-slate-500")}
              >
                <Icon className={cn("size-5", active ? "text-brand-500" : "text-slate-400")} strokeWidth={active ? 2.2 : 1.8} />
                <span className="max-w-full truncate">{t(it.key)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
