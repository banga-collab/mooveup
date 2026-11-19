"use client";

import Link from "next/link";
import { CalendarPlus, Search, ShoppingCart, UserPlus } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { buttonClass, Kbd } from "./ui";
import { NotificationBell } from "./shell/bell";
import { TabletToggle, ThemeToggle } from "./shell/header-toggles";

/** Barre du haut (bureau) : recherche universelle (Ctrl+K), 3 actions fréquentes, mode sombre, mode tablette, cloche */
export function Topbar() {
  const t = useT();
  return (
    <div className="no-print mb-6 hidden items-center gap-2 lg:flex">
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event("open-palette"))}
        className="flex h-9 w-full max-w-sm items-center gap-2.5 rounded-lg border border-line bg-white px-3 text-start text-[13px] text-slate-400 transition hover:border-slate-300"
      >
        <Search className="size-4" aria-hidden />
        <span className="flex-1 truncate">{t("top.searchPlaceholder")}</span>
        <span dir="ltr">
          <Kbd>Ctrl K</Kbd>
        </span>
      </button>
      <div className="ms-auto flex items-center gap-2">
        <Link href="/contacts/nouveau" className={buttonClass("ghost")} title={t("top.shortcutHint", { key: "N" })}>
          <UserPlus /> {t("top.client")}
        </Link>
        <Link href="/agenda/nouveau" className={buttonClass("ghost")} title={t("top.shortcutHint", { key: "R" })}>
          <CalendarPlus /> {t("top.rdv")}
        </Link>
        <span className="mx-0.5 h-5 w-px bg-line" aria-hidden />
        <ThemeToggle />
        <TabletToggle />
        <NotificationBell />
        <Link href="/caisse" className={buttonClass("primary")} title={t("top.shortcutHint", { key: "V" })}>
          <ShoppingCart /> {t("top.sell")}
        </Link>
      </div>
    </div>
  );
}
