"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { setScope } from "@/app/(app)/scope-actions";
import type { Entity } from "@/lib/entities";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { EntityMark } from "./entity-icon";

/** Sélecteur d'établissement : filtre toutes les pages du CRM */
export function ScopeSwitcher({ current, allowed, compact }: { current: Entity | null; allowed: Entity[]; compact?: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, []);

  const choose = (id: string) => {
    setOpen(false);
    start(() => setScope(id));
  };
  const single = allowed.length === 1;
  const tagline = (e: Entity) => {
    const k = `entity.${e.id}.tagline`;
    const s = t(k);
    return s === k ? e.tagline : s;
  };
  const count = t("scope.count", { n: allowed.length });

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={single}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("scope.label", { name: current ? current.short : t("scope.all") })}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg border border-line bg-white text-start transition hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 disabled:cursor-default disabled:hover:border-line",
          compact ? "h-9 px-1.5" : "h-11 px-2",
        )}
      >
        <EntityMark id={current?.id} size={compact ? 24 : 28} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-ink">{current ? current.short : t("scope.all")}</span>
          {!compact && <span className="block truncate text-[11px] text-muted">{current ? tagline(current) : count}</span>}
        </span>
        {pending ? <Loader2 className="size-4 animate-spin text-brand-500" /> : !single && <ChevronsUpDown className="size-4 text-slate-400" />}
      </button>
      {open && (
        <div role="listbox" className="absolute inset-x-0 z-40 mt-2 min-w-[260px] overflow-hidden rounded-xl border border-line bg-white p-1 shadow-pop">
          <Option label={t("scope.all")} sub={count} on={!current} onClick={() => choose("all")} />
          <div className="my-1 h-px bg-line" />
          {allowed.map((e) => (
            <Option key={e.id} id={e.id} label={e.short} sub={tagline(e)} on={current?.id === e.id} onClick={() => choose(e.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function Option({ id, label, sub, on, onClick }: { id?: string; label: string; sub: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={on}
      onClick={onClick}
      className={cn("flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-start transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40", on ? "bg-slate-100" : "hover:bg-slate-50")}
    >
      <EntityMark id={id} size={28} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-ink">{label}</span>
        <span className="block truncate text-[11px] text-muted">{sub}</span>
      </span>
      {on && <Check className="size-4 text-brand-500" />}
    </button>
  );
}
