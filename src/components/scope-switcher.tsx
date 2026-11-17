"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { setScope } from "@/app/(app)/scope-actions";
import type { Entity } from "@/lib/entities";
import { cn } from "@/lib/utils";
import { EntityMark } from "./entity-icon";

/** Sélecteur d'établissement : filtre toutes les pages du CRM */
export function ScopeSwitcher({ current, allowed, compact }: { current: Entity | null; allowed: Entity[]; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const choose = (id: string) => {
    setOpen(false);
    start(() => setScope(id));
  };
  const single = allowed.length === 1;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={single}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-2xl border border-line bg-white text-left shadow-card transition hover:border-brand-200 disabled:cursor-default disabled:hover:border-line",
          compact ? "h-10 px-2" : "h-11 px-2.5",
        )}
      >
        <EntityMark id={current?.id} size={compact ? 26 : 30} />
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate font-semibold text-ink", compact ? "text-[13px]" : "text-sm")}>{current ? current.short : "Tout le groupe"}</span>
          {!compact && <span className="block truncate text-[11px] text-muted">{current ? current.tagline : `${allowed.length} établissements`}</span>}
        </span>
        {pending ? <Loader2 className="size-4 animate-spin text-brand-500" /> : !single && <ChevronsUpDown className="size-4 text-slate-400" />}
      </button>
      {open && (
        <div className="absolute left-0 right-0 z-40 mt-2 min-w-[260px] overflow-hidden rounded-2xl border border-line bg-white p-1.5 shadow-pop animate-fade-up">
          <Option label="Tout le groupe" sub={`${allowed.length} établissements`} on={!current} onClick={() => choose("all")} />
          <div className="my-1 h-px bg-line" />
          {allowed.map((e) => (
            <Option key={e.id} id={e.id} label={e.short} sub={e.tagline} on={current?.id === e.id} onClick={() => choose(e.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function Option({ id, label, sub, on, onClick }: { id?: string; label: string; sub: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn("flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition", on ? "bg-brand-50" : "hover:bg-canvas")}>
      <EntityMark id={id} size={30} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-ink">{label}</span>
        <span className="block truncate text-[11px] text-muted">{sub}</span>
      </span>
      {on && <Check className="size-4 text-brand-500" />}
    </button>
  );
}
