"use client";

import { useMemo, useRef, useState } from "react";
import { Check, Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type SupplierOption = { id: string; name: string; hint: string | null };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * Choix du fournisseur d'une dépense : recherche dans le répertoire,
 * ou création rapide d'une fiche avec le nom saisi.
 * Champs envoyés : `supplier_id` (fiche existante) ou `supplier_new` (nouvelle fiche).
 */
export function SupplierPicker({ options, defaultId }: { options: SupplierOption[]; defaultId?: string | null }) {
  const initial = options.find((o) => o.id === defaultId) ?? null;
  const [picked, setPicked] = useState<SupplierOption | null>(initial);
  const [fresh, setFresh] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const n = norm(q);
    const list = n ? options.filter((o) => norm(`${o.name} ${o.hint ?? ""}`).includes(n)) : options;
    return list.slice(0, 8);
  }, [q, options]);
  const exact = options.some((o) => norm(o.name) === norm(q));
  const canCreate = q.trim().length >= 2 && !exact;
  const total = matches.length + (canCreate ? 1 : 0);

  const choose = (i: number) => {
    if (i < matches.length) {
      setPicked(matches[i]!);
      setFresh(null);
    } else if (canCreate) {
      setFresh(q.trim());
      setPicked(null);
    }
    setQ("");
    setOpen(false);
  };
  const reset = () => {
    setPicked(null);
    setFresh(null);
    setTimeout(() => input.current?.focus(), 0);
  };

  if (picked || fresh) {
    return (
      <div className="flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm">
        {picked ? <Check className="size-4 shrink-0 text-emerald-600" /> : <Plus className="size-4 shrink-0 text-brand-600" />}
        <span className="min-w-0 flex-1 truncate text-ink">
          {picked?.name ?? fresh}
          {fresh && <span className="ml-1.5 text-xs text-muted">nouvelle fiche</span>}
        </span>
        <button type="button" onClick={reset} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-ink" aria-label="Changer de fournisseur">
          <X className="size-3.5" />
        </button>
        {picked && <input type="hidden" name="supplier_id" value={picked.id} />}
        {fresh && <input type="hidden" name="supplier_new" value={fresh} />}
      </div>
    );
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
      <input
        ref={input}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setHi(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!open || !total) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHi((h) => (h + 1) % total);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHi((h) => (h - 1 + total) % total);
          } else if (e.key === "Enter") {
            e.preventDefault();
            choose(hi);
          } else if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Rechercher ou créer…"
        role="combobox"
        aria-expanded={open}
        aria-controls="supplier-options"
        aria-autocomplete="list"
        className="h-10 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-sm text-ink outline-none placeholder:text-slate-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-500/15"
      />
      {open && total > 0 && (
        <ul id="supplier-options" role="listbox" className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-lg border border-line bg-white py-1 text-sm shadow-sm">
          {matches.map((o, i) => (
            <li key={o.id} role="option" aria-selected={hi === i}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(i)}
                onMouseEnter={() => setHi(i)}
                className={cn("flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left", hi === i && "bg-slate-50")}
              >
                <span className="truncate text-ink">{o.name}</span>
                {o.hint && <span className="shrink-0 truncate text-xs text-muted">{o.hint}</span>}
              </button>
            </li>
          ))}
          {canCreate && (
            <li role="option" aria-selected={hi === matches.length}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(matches.length)}
                onMouseEnter={() => setHi(matches.length)}
                className={cn("flex w-full items-center gap-2 border-t border-line px-3 py-2 text-left font-medium text-brand-600", hi === matches.length && "bg-slate-50")}
              >
                <Plus className="size-4" /> Créer « {q.trim()} »
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
