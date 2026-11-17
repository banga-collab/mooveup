"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "./ui";

export type PickerContact = { id: string; full_name: string; phone: string | null };

/**
 * Champ de recherche de client (nom ou téléphone).
 * Envoie l'id choisi dans un champ caché `name`.
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
  const ref = useRef<HTMLDivElement>(null);

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
    onChange?.(c);
  };

  return (
    <div ref={ref} className="relative">
      <input type="hidden" name={name} value={selected?.id ?? ""} required={required} />
      {selected ? (
        <div className="flex h-11 items-center gap-2.5 rounded-xl border border-brand-200 bg-brand-50/50 px-2.5">
          <Avatar name={selected.full_name} size={28} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{selected.full_name}</span>
          </span>
          {selected.phone && <span className="hidden text-xs text-muted sm:inline">{selected.phone}</span>}
          <button type="button" onClick={() => choose(null)} className="grid size-7 place-items-center rounded-lg text-muted hover:bg-white hover:text-red-600" aria-label="Retirer">
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <span className="relative block">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            className="h-11 w-full rounded-xl border border-line bg-white pl-10 pr-3.5 text-sm placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-50"
          />
        </span>
      )}
      {open && !selected && (
        <div className="absolute left-0 right-0 z-30 mt-1.5 max-h-72 overflow-y-auto rounded-xl border border-line bg-white p-1 shadow-pop">
          {results.length ? (
            results.map((c) => (
              <button key={c.id} type="button" onClick={() => choose(c)} className={cn("flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-canvas")}>
                <Avatar name={c.full_name} size={28} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.full_name}</span>
                <span className="text-xs text-muted">{c.phone}</span>
              </button>
            ))
          ) : (
            <p className="px-3 py-3 text-sm text-muted">Aucun client trouvé.</p>
          )}
        </div>
      )}
    </div>
  );
}
