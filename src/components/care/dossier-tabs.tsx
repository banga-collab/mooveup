"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Onglets internes du dossier (sans rechargement) */
export function DossierTabs({ tabs, initial }: { tabs: { id: string; label: string; count?: number; alert?: boolean; content: ReactNode }[]; initial?: string }) {
  const [active, setActive] = useState(initial ?? tabs[0]?.id);
  const current = tabs.find((t) => t.id === active) ?? tabs[0];
  return (
    <div className="space-y-4">
      <div className="-mx-1 overflow-x-auto px-1">
        <div role="tablist" className="inline-flex gap-0.5 rounded-lg bg-slate-100 p-0.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={t.id === current?.id}
              onClick={() => setActive(t.id)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-[13px] font-medium transition",
                t.id === current?.id ? "bg-white text-ink shadow-sm" : "text-slate-500 hover:text-ink",
              )}
            >
              {t.label}
              {t.count !== undefined && <span className={cn("text-xs tabular-nums", t.alert ? "text-accent-600" : "text-slate-400")}>{t.count}</span>}
            </button>
          ))}
        </div>
      </div>
      <div role="tabpanel">{current?.content}</div>
    </div>
  );
}
