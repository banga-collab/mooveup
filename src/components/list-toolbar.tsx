"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronDown, Loader2, Search, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Barre de recherche + filtres d'une page de liste, synchronisée avec l'URL
 * (le filtrage se fait côté serveur en lisant `searchParams`).
 * - recherche instantanée (300 ms) dans le paramètre `param` (défaut `q`)
 * - filtres regroupés dans un bouton « Filtres » (panneau compact, compteur des filtres actifs) ;
 *   les filtres actifs restent visibles en ligne sous forme de puces retirables d'un clic
 * - `inline` : garde les puces visibles (par défaut quand il n'y a qu'un seul petit groupe)
 * - « Effacer » remet tout à zéro
 */
export type FilterGroup = {
  param: string;
  /** Libellé de l'option « tous » (ex. « Tous les statuts ») */
  label?: string;
  /** Titre du groupe dans le panneau (déduit de `label` si absent) */
  title?: string;
  options: { value: string; label: string; count?: number }[];
};

/** « Tous les praticiens » → « Praticiens » */
function groupTitle(f: FilterGroup) {
  if (f.title) return f.title;
  const m = f.label?.match(/^(?:tous|toutes)\s+(?:les\s+)?(.+)$/i);
  if (m?.[1]) return m[1].charAt(0).toUpperCase() + m[1].slice(1);
  return null;
}

export function ListToolbar({
  placeholder = "Rechercher…",
  param = "q",
  filters = [],
  right,
  className,
  inline,
}: {
  placeholder?: string;
  param?: string;
  filters?: FilterGroup[];
  right?: React.ReactNode;
  className?: string;
  /** Puces toujours visibles (sans bouton « Filtres ») ; par défaut : un seul groupe d'au plus 3 options */
  inline?: boolean;
}) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get(param) ?? "");
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const first = useRef(true);
  const boxRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

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

  /* Fermeture du panneau : clic à l'extérieur, Échap */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const groups = filters.filter((f) => f.options.length > 0);
  const showInline = inline ?? (groups.length === 1 && groups[0]!.options.length <= 3);
  const activeChips = groups.flatMap((f) => {
    const cur = sp.get(f.param);
    if (!cur) return [];
    const o = f.options.find((x) => x.value === cur);
    return [{ param: f.param, title: groupTitle(f), label: o?.label ?? cur }];
  });
  const active = activeChips.length > 0 || !!sp.get(param);

  return (
    <div className={cn("mb-4 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center", className)} data-list-toolbar>
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

      {showInline ? (
        groups.map((f) => {
          const cur = sp.get(f.param) ?? "";
          const chip = (on: boolean) =>
            cn("inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-md px-2.5 text-[13px] font-medium transition", on ? "bg-white text-ink shadow-sm" : "text-slate-500 hover:text-ink");
          return (
            <div key={f.param} className="-mx-1 overflow-x-auto px-1">
              <div className="inline-flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5" role="group" aria-label={groupTitle(f) ?? f.label}>
                <button type="button" onClick={() => push({ [f.param]: null })} className={chip(!cur)} aria-pressed={!cur}>
                  {f.label ?? "Tous"}
                </button>
                {f.options.map((o) => (
                  <button key={o.value} type="button" onClick={() => push({ [f.param]: cur === o.value ? null : o.value })} className={chip(cur === o.value)} aria-pressed={cur === o.value}>
                    {o.label}
                    {o.count !== undefined && <span className="text-xs tabular-nums text-slate-400">{o.count}</span>}
                  </button>
                ))}
              </div>
            </div>
          );
        })
      ) : groups.length > 0 ? (
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <div ref={boxRef} className="relative">
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-controls={panelId}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium transition",
                activeChips.length ? "border-brand-300 bg-brand-50 text-brand-700" : "border-line bg-white text-slate-600 hover:border-slate-300 hover:text-ink",
              )}
            >
              <SlidersHorizontal className="size-4" />
              Filtres
              {activeChips.length > 0 && <span className="min-w-5 rounded-full bg-brand-500 px-1.5 text-center text-[11px] font-semibold leading-[18px] text-white tabular-nums">{activeChips.length}</span>}
              <ChevronDown className={cn("size-3.5 text-slate-400 transition", open && "rotate-180")} />
            </button>
            {open && (
              <div
                id={panelId}
                role="dialog"
                aria-label="Filtres"
                className="absolute start-0 top-full z-40 mt-1.5 max-h-[min(70vh,520px)] w-[min(calc(100vw-2rem),440px)] overflow-y-auto rounded-xl border border-line bg-white p-3 shadow-pop animate-fade-up"
              >
                <div className="space-y-3">
                  {groups.map((f) => {
                    const title = groupTitle(f);
                    const cur = sp.get(f.param) ?? "";
                    return (
                      <div key={f.param} role="group" aria-label={title ?? f.label}>
                        {title && <p className="mb-1.5 text-xs font-medium text-muted">{title}</p>}
                        <div className="flex flex-wrap gap-1">
                          <PanelChip on={!cur} onClick={() => push({ [f.param]: null })}>
                            {f.label ?? "Tous"}
                          </PanelChip>
                          {f.options.map((o) => (
                            <PanelChip key={o.value} on={cur === o.value} onClick={() => push({ [f.param]: cur === o.value ? null : o.value })}>
                              {o.label}
                              {o.count !== undefined && <span className={cn("text-xs tabular-nums", cur === o.value ? "text-brand-600" : "text-slate-400")}>{o.count}</span>}
                            </PanelChip>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-line pt-2.5">
                  <button
                    type="button"
                    disabled={!activeChips.length}
                    onClick={() => push(Object.fromEntries(groups.map((f) => [f.param, null])))}
                    className="h-8 rounded-md px-2 text-[13px] font-medium text-slate-500 hover:bg-slate-100 hover:text-ink disabled:opacity-40"
                  >
                    Réinitialiser
                  </button>
                  <button type="button" onClick={() => setOpen(false)} className="h-8 rounded-md bg-brand-500 px-3 text-[13px] font-medium text-white hover:bg-brand-600">
                    Fermer
                  </button>
                </div>
              </div>
            )}
          </div>
          {activeChips.map((c) => (
            <button
              key={c.param}
              type="button"
              onClick={() => push({ [c.param]: null })}
              className="group inline-flex h-8 max-w-[240px] items-center gap-1 rounded-md border border-brand-200 bg-brand-50 pe-1.5 ps-2.5 text-[13px] font-medium text-brand-700 transition hover:border-brand-300"
              title={`Retirer le filtre${c.title ? ` « ${c.title} »` : ""}`}
            >
              {c.title && <span className="hidden shrink-0 font-normal opacity-75 sm:inline">{c.title} :</span>}
              <span className="truncate">{c.label}</span>
              <X className="size-3.5 shrink-0 opacity-60 group-hover:opacity-100" aria-hidden />
            </button>
          ))}
        </div>
      ) : null}

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

function PanelChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 text-[13px] font-medium transition",
        on ? "border-brand-300 bg-brand-50 text-brand-700" : "border-line bg-white text-slate-600 hover:border-slate-300 hover:text-ink",
      )}
    >
      {on && <Check className="size-3.5" />}
      {children}
    </button>
  );
}

/** Pour filtrer côté serveur, importer `matchesQuery` depuis "@/lib/search-match" (ce fichier est « use client »). */
export { matchesQuery } from "@/lib/search-match";
