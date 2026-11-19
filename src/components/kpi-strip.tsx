"use client";

import Link from "next/link";
import { useSyncExternalStore, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { SolidTile } from "./stat-tile";

export type KpiItem = {
  label: string;
  value: ReactNode;
  sub?: string;
  icon: ReactNode;
  trendLabel?: string;
  trendUp?: boolean | null;
  series?: number[];
  href?: string;
  /** Valeur mise en évidence (rouge) dans la ligne compacte */
  alert?: boolean;
};

const KEY = (id: string) => `moovup.kpi.${id}`;
const EVENT = "moovup:kpi";

function read(id: string): "0" | "1" | null {
  try {
    const v = localStorage.getItem(KEY(id));
    return v === "0" || v === "1" ? v : null;
  } catch {
    return null;
  }
}
function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/**
 * Rangée d'indicateurs repliable : tuiles `SolidTile` dépliées, ou une seule ligne compacte.
 * La préférence est mémorisée sur l'appareil (par `id`).
 */
export function KpiStrip({ id, items, defaultCollapsed = false, className }: { id: string; items: KpiItem[]; defaultCollapsed?: boolean; className?: string }) {
  const pref = useSyncExternalStore(subscribe, () => read(id), () => null);
  const collapsed = pref === null ? defaultCollapsed : pref === "1";
  const toggle = () => {
    try {
      localStorage.setItem(KEY(id), collapsed ? "0" : "1");
    } catch {
      /* stockage indisponible : la préférence ne sera pas mémorisée */
    }
    window.dispatchEvent(new Event(EVENT));
  };

  if (collapsed)
    return (
      <div className={cn("flex min-w-0 items-center gap-1 rounded-xl border border-line bg-white py-1 pe-1 ps-1", className)} data-kpi-strip="collapsed">
        <div className="flex min-w-0 flex-1 items-center gap-x-1 overflow-x-auto [scrollbar-width:none]">
          {items.map((it, i) => {
            const body = (
              <>
                <span className="text-slate-400 [&_svg]:size-3.5">{it.icon}</span>
                <span className="text-muted">{it.label}</span>
                <span className={cn("font-semibold tabular-nums", it.alert ? "text-red-600" : "text-ink")}>{it.value}</span>
                {it.trendLabel && <span className={cn("text-xs font-medium", it.trendUp == null ? "text-slate-500" : it.trendUp ? "text-emerald-600" : "text-red-600")}>{it.trendLabel}</span>}
              </>
            );
            const cls = "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[13px]";
            return (
              <span key={it.label} className="inline-flex shrink-0 items-center">
                {i > 0 && <span className="mx-0.5 h-4 w-px bg-line" aria-hidden />}
                {it.href ? (
                  <Link href={it.href} className={cn(cls, "transition hover:bg-slate-50")}>
                    {body}
                  </Link>
                ) : (
                  <span className={cls}>{body}</span>
                )}
              </span>
            );
          })}
        </div>
        <button type="button" onClick={toggle} className="grid size-8 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-ink" aria-label="Afficher les indicateurs" title="Afficher les indicateurs">
          <ChevronDown className="size-4" />
        </button>
      </div>
    );

  return (
    <div className={cn("relative", className)} data-kpi-strip="open">
      <div className={cn("grid grid-cols-2 gap-3 [&>*]:min-w-0", items.length >= 4 ? "xl:grid-cols-4" : items.length === 3 ? "sm:grid-cols-3" : "")}>
        {items.map((it) => (
          <SolidTile key={it.label} label={it.label} value={it.value} sub={it.sub} icon={it.icon} trendLabel={it.trendLabel} trendUp={it.trendUp} series={it.series} href={it.href} />
        ))}
      </div>
      <button
        type="button"
        onClick={toggle}
        className="absolute -top-2 end-0 grid size-6 translate-x-1/3 place-items-center rounded-full border border-line bg-white text-slate-400 transition hover:text-ink rtl:-translate-x-1/3"
        aria-label="Réduire les indicateurs en une ligne"
        title="Réduire les indicateurs"
      >
        <ChevronUp className="size-3.5" />
      </button>
    </div>
  );
}
