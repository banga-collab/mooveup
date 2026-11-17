"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Barre de recherche + filtres d'une page de liste, synchronisée avec l'URL
 * (le filtrage se fait côté serveur en lisant `searchParams`).
 * - recherche instantanée (300 ms) dans le paramètre `param` (défaut `q`)
 * - filtres en puces : chaque groupe écrit sa valeur dans son paramètre
 * - « Effacer » remet tout à zéro
 */
export type FilterGroup = { param: string; label?: string; options: { value: string; label: string; count?: number }[] };

export function ListToolbar({
  placeholder = "Rechercher…",
  param = "q",
  filters = [],
  right,
  className,
}: {
  placeholder?: string;
  param?: string;
  filters?: FilterGroup[];
  right?: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get(param) ?? "");
  const [pending, start] = useTransition();
  const first = useRef(true);

  const push = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    next.delete("page");
    const qs = next.toString();
    start(() => router.replace(qs ? `${path}?${qs}` : path, { scroll: false }));
  };

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => push({ [param]: q.trim() || null }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const active = filters.some((f) => sp.get(f.param)) || !!sp.get(param);

  return (
    <div className={cn("mb-4 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center", className)}>
      <div className="relative min-w-0 sm:w-72">
        {pending ? (
          <Loader2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-brand-500" />
        ) : (
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        )}
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setQ("")}
          placeholder={placeholder}
          aria-label={placeholder}
          className="h-9 w-full rounded-lg border border-line bg-white pl-9 pr-8 text-[13px] placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/15"
        />
        {q && (
          <button type="button" onClick={() => setQ("")} className="absolute right-1.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded text-slate-400 hover:text-ink" aria-label="Effacer la recherche">
            <X className="size-3.5" />
          </button>
        )}
      </div>
      {filters.map((f) => {
        const cur = sp.get(f.param) ?? "";
        return (
          <div key={f.param} className="-mx-1 overflow-x-auto px-1">
            <div className="inline-flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5" role="group" aria-label={f.label}>
              <button
                type="button"
                onClick={() => push({ [f.param]: null })}
                className={cn("h-8 whitespace-nowrap rounded-md px-2.5 text-[13px] font-medium transition", !cur ? "bg-white text-ink shadow-sm" : "text-slate-500 hover:text-ink")}
              >
                {f.label ?? "Tous"}
              </button>
              {f.options.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => push({ [f.param]: cur === o.value ? null : o.value })}
                  className={cn("inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-md px-2.5 text-[13px] font-medium transition", cur === o.value ? "bg-white text-ink shadow-sm" : "text-slate-500 hover:text-ink")}
                >
                  {o.label}
                  {o.count !== undefined && <span className="text-xs tabular-nums text-slate-400">{o.count}</span>}
                </button>
              ))}
            </div>
          </div>
        );
      })}
      {active && (
        <button
          type="button"
          onClick={() => {
            setQ("");
            push(Object.fromEntries([[param, null], ...filters.map((f) => [f.param, null])]));
          }}
          className="h-8 self-start rounded-md px-2 text-[13px] font-medium text-slate-500 hover:bg-slate-100 hover:text-ink sm:self-auto"
        >
          Effacer
        </button>
      )}
      {right && <div className="flex items-center gap-2 sm:ml-auto">{right}</div>}
    </div>
  );
}

/** Pour filtrer côté serveur, importer `matchesQuery` depuis "@/lib/search-match" (ce fichier est « use client »). */
export { matchesQuery } from "@/lib/search-match";
