"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "./ui";

export type PickerContact = { id: string; full_name: string; phone: string | null };

/**
 * Champ de recherche de client (nom ou téléphone), utilisable au clavier
 * (flèches, Entrée, Échap). Envoie l'id choisi dans un champ caché `name`.
 */
export function ContactPicker({
  contacts,
  name = "contact_id",
  defaultId,
  required,
  placeholder = "Rechercher un client (nom ou téléphone)…",
  onChange,
}: {
  contacts: PickerContact[];
  name?: string;
  defaultId?: string | null;
  required?: boolean;
  placeholder?: string;
  onChange?: (c: PickerContact | null) => void;
}) {
  const [selected, setSelected] = useState<PickerContact | null>(() => contacts.find((c) => c.id === defaultId) ?? null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const results = useMemo(() => {
    const n = q.trim().toLowerCase();
    const digits = n.replace(/\D/g, "");
    const list = n
      ? contacts.filter((c) => c.full_name.toLowerCase().includes(n) || (digits.length >= 2 && (c.phone ?? "").replace(/\D/g, "").includes(digits)))
      : contacts;
    return list.slice(0, 8);
  }, [q, contacts]);

  const choose = (c: PickerContact | null) => {
    setSelected(c);
    setOpen(false);
    setQ("");
    setHi(0);
    onChange?.(c);
  };

  return (
    <div ref={ref} className="relative">
      <input type="hidden" name={name} value={selected?.id ?? ""} required={required} />
      {selected ? (
        <div className="flex h-10 items-center gap-2.5 rounded-lg border border-line bg-white pl-2 pr-1">
          <Avatar name={selected.full_name} size={26} />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{selected.full_name}</span>
          {selected.phone && <span className="hidden text-xs tabular-nums text-muted sm:inline">{selected.phone}</span>}
          <button
            type="button"
            onClick={() => choose(null)}
            className="grid size-8 place-items-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
            aria-label="Changer de client"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <span className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-label={placeholder}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
              setHi(0);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setOpen(true);
                setHi((h) => Math.min(h + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHi((h) => Math.max(h - 1, 0));
              } else if (e.key === "Enter" && open && results[hi]) {
                e.preventDefault();
                choose(results[hi]!);
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
            placeholder={placeholder}
            className="h-10 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/15"
          />
        </span>
      )}
      {open && !selected && (
        <div id={listId} role="listbox" className="absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-lg border border-line bg-white p-1 shadow-pop">
          {results.length ? (
            results.map((c, i) => (
              <button
                key={c.id}
                type="button"
                role="option"
                aria-selected={i === hi}
                onMouseEnter={() => setHi(i)}
                onClick={() => choose(c)}
                className={cn("flex min-h-9 w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left", i === hi ? "bg-slate-100" : "hover:bg-slate-50")}
              >
                <Avatar name={c.full_name} size={26} />
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{c.full_name}</span>
                <span className="text-xs tabular-nums text-muted">{c.phone}</span>
              </button>
            ))
          ) : (
            <p className="px-3 py-3 text-[13px] text-muted">Aucun client trouvé.</p>
          )}
        </div>
      )}
    </div>
  );
}
