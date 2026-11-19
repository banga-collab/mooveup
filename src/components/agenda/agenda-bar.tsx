"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type BarDay = { key: string; wd: string; num: number; count: number | null; href: string; active: boolean; today: boolean };
export type BarTab = { id: "jour" | "semaine" | "mois" | "liste"; label: string; href: string };
export type BarPeriod = { label: string; href: string; active: boolean };
export type BarSelect = { param: string; label: string; value: string | null; options: { value: string; label: string; count?: number }[] };

/**
 * En-tête compact de l'agenda, sur une seule ligne :
 * ‹ date › (jour, semaine, mois ou période selon la vue), Aujourd'hui, Jour / Semaine / Mois / Liste, recherche,
 * listes déroulantes (établissement, praticien, statut). Tout est synchronisé avec l'URL.
 */
export function AgendaBar({
  view,
  title,
  date,
  prevHref,
  nextHref,
  prevWeekHref,
  nextWeekHref,
  todayHref,
  tabs,
  week,
  selects,
  du,
  au,
  periods,
}: {
  view: BarTab["id"];
  title: string;
  date: string;
  /** Période de la vue liste (incluse) */
  du: string;
  au: string;
  /** Raccourcis de période (cette semaine, ce mois…) */
  periods: BarPeriod[];
  prevHref: string;
  nextHref: string;
  prevWeekHref: string;
  nextWeekHref: string;
  /** null quand on affiche déjà aujourd'hui */
  todayHref: string | null;
  tabs: BarTab[];
  week: BarDay[];
  selects: BarSelect[];
}) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const first = useRef(true);
  const popRef = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState({ du, au });
  useEffect(() => setRange({ du, au }), [du, au]);

  const push = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    next.delete("sel");
    const qs = next.toString();
    start(() => router.replace(qs ? `${path}?${qs}` : path, { scroll: false }));
  };

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => push({ q: q.trim() || null }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => popRef.current && !popRef.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const unit = view === "jour" ? "Jour" : view === "semaine" ? "Semaine" : view === "mois" ? "Mois" : "Période";
  const fem = view === "semaine" || view === "liste";
  const iconBtn = "grid size-9 shrink-0 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 [&_svg]:size-4";
  const activeFilters = selects.filter((s) => s.value).length;

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-line bg-white p-1.5" data-agenda-bar>
      {/* Date */}
      <div className="flex items-center">
        <Link href={prevHref} scroll={false} className={iconBtn} aria-label={`${unit} précédent${fem ? "e" : ""}`} title={`${unit} précédent${fem ? "e" : ""}`}>
          <ChevronLeft className="rtl:-scale-x-100" />
        </Link>
        <div ref={popRef} className="relative">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold capitalize text-ink transition hover:bg-slate-100"
          >
            {pending ? <Loader2 className="size-4 animate-spin text-brand-500" /> : <CalendarDays className="size-4 text-slate-400" />}
            <span className="whitespace-nowrap">{title}</span>
            <ChevronDown className={cn("size-3.5 text-slate-400 transition", open && "rotate-180")} />
          </button>
          {open && (
            <div className="absolute start-0 top-full z-40 mt-1.5 max-h-[min(80vh,640px)] w-[min(calc(100vw-2rem),360px)] overflow-y-auto rounded-xl border border-line bg-white p-3 shadow-pop animate-fade-up" role="dialog" aria-label="Choisir une date">
              <div className="mb-2 flex items-center justify-between">
                <Link href={prevWeekHref} scroll={false} onClick={() => setOpen(false)} className={iconBtn} aria-label="Semaine précédente" title="Semaine précédente">
                  <ChevronsLeft className="rtl:-scale-x-100" />
                </Link>
                <span className="text-xs font-medium text-muted">Semaine</span>
                <Link href={nextWeekHref} scroll={false} onClick={() => setOpen(false)} className={iconBtn} aria-label="Semaine suivante" title="Semaine suivante">
                  <ChevronsRight className="rtl:-scale-x-100" />
                </Link>
              </div>
              <div className="grid grid-cols-7 gap-1">
                {week.map((d) => (
                  <Link
                    key={d.key}
                    href={d.href}
                    scroll={false}
                    onClick={() => setOpen(false)}
                    aria-current={d.active ? "date" : undefined}
                    className={cn(
                      "flex min-w-0 flex-col items-center rounded-lg py-1.5 transition",
                      d.active ? "bg-brand-500 text-white" : "text-slate-600 hover:bg-slate-50",
                    )}
                  >
                    <span className={cn("text-[11px] capitalize", d.active ? "text-white/80" : "text-muted")}>{d.wd}</span>
                    <span className={cn("text-base font-semibold leading-tight tabular-nums", d.today && !d.active && "text-accent-600")}>{d.num}</span>
                    <span className={cn("text-[10.5px] tabular-nums", d.active ? "text-white/80" : d.count ? "text-slate-500" : "text-slate-300")}>{d.count ?? "·"}</span>
                  </Link>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
                <input
                  type="date"
                  defaultValue={date}
                  aria-label="Aller à la date"
                  onChange={(e) => {
                    if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) {
                      setOpen(false);
                      push({ date: e.target.value });
                    }
                  }}
                  className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-white px-2.5 text-[13px] text-ink focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/15"
                />
                {todayHref && (
                  <Link href={todayHref} scroll={false} onClick={() => setOpen(false)} className="inline-flex h-9 items-center rounded-lg border border-line px-3 text-[13px] font-medium text-ink hover:bg-slate-50">
                    Aujourd&apos;hui
                  </Link>
                )}
              </div>

              {/* Période → vue liste */}
              <div className="mt-3 border-t border-line pt-3">
                <p className="mb-2 text-xs font-medium text-muted">Période (liste des rendez-vous)</p>
                <div className="flex flex-wrap gap-1">
                  {periods.map((p) => (
                    <Link
                      key={p.label}
                      href={p.href}
                      scroll={false}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "inline-flex h-8 items-center rounded-md border px-2.5 text-[13px] font-medium transition",
                        p.active ? "border-brand-300 bg-brand-50 text-brand-700" : "border-line text-slate-600 hover:border-slate-300 hover:text-ink",
                      )}
                    >
                      {p.label}
                    </Link>
                  ))}
                </div>
                <form
                  className="mt-2 grid grid-cols-[1fr_1fr_auto] items-end gap-1.5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!range.du || !range.au) return;
                    setOpen(false);
                    push({ vue: "liste", du: range.du, au: range.au, date: null });
                  }}
                >
                  <label className="min-w-0">
                    <span className="mb-0.5 block text-[11px] text-muted">Du</span>
                    <input
                      type="date"
                      required
                      value={range.du}
                      onChange={(e) => setRange((r) => ({ ...r, du: e.target.value }))}
                      className="h-9 w-full min-w-0 rounded-lg border border-line bg-white px-2 text-[13px] text-ink focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/15"
                    />
                  </label>
                  <label className="min-w-0">
                    <span className="mb-0.5 block text-[11px] text-muted">Au</span>
                    <input
                      type="date"
                      required
                      min={range.du || undefined}
                      value={range.au}
                      onChange={(e) => setRange((r) => ({ ...r, au: e.target.value }))}
                      className="h-9 w-full min-w-0 rounded-lg border border-line bg-white px-2 text-[13px] text-ink focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/15"
                    />
                  </label>
                  <button type="submit" className="h-9 rounded-lg bg-brand-500 px-3 text-[13px] font-medium text-white hover:bg-brand-600">
                    Voir
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
        <Link href={nextHref} scroll={false} className={iconBtn} aria-label={`${unit} suivant${fem ? "e" : ""}`} title={`${unit} suivant${fem ? "e" : ""}`}>
          <ChevronRight className="rtl:-scale-x-100" />
        </Link>
      </div>

      {todayHref && (
        <Link href={todayHref} scroll={false} className="inline-flex h-9 items-center rounded-lg border border-line px-3 text-[13px] font-medium text-ink transition hover:bg-slate-50">
          Aujourd&apos;hui
        </Link>
      )}

      {/* Jour / Semaine / Mois / Liste */}
      <nav className="inline-flex gap-0.5 rounded-lg bg-slate-100 p-0.5" aria-label="Vue">
        {tabs.map((it) => (
          <Link
            key={it.id}
            href={it.href}
            scroll={false}
            aria-current={view === it.id ? "page" : undefined}
            className={cn("inline-flex h-8 items-center rounded-md px-2.5 text-[13px] font-medium transition sm:px-3", view === it.id ? "bg-white text-ink shadow-sm" : "text-slate-500 hover:text-ink")}
          >
            {it.label}
          </Link>
        ))}
      </nav>

      {/* Recherche */}
      <div className="relative min-w-[180px] flex-1 basis-[180px]">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setQ("")}
          placeholder="Client, téléphone, prestation…"
          aria-label="Rechercher un rendez-vous"
          className="h-9 w-full rounded-lg border border-line bg-white pe-8 ps-9 text-[13px] placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/15"
        />
        {q && (
          <button type="button" onClick={() => setQ("")} className="absolute end-1.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded text-slate-400 hover:text-ink" aria-label="Effacer la recherche">
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {/* Listes déroulantes */}
      <div className="grid w-full grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-1.5 sm:flex sm:w-auto">
        {selects.map((s) => (
          <label key={s.param} className="relative block min-w-0">
            <span className="sr-only">{s.label}</span>
            <select
              value={s.value ?? ""}
              onChange={(e) => push({ [s.param]: e.target.value || null })}
              className={cn(
                "h-9 w-full appearance-none truncate rounded-lg border pe-8 ps-2.5 text-[13px] font-medium transition focus:outline-none focus:ring-2 focus:ring-brand-500/15 sm:w-auto sm:max-w-[190px]",
                s.value ? "border-brand-300 bg-brand-50 text-brand-700" : "border-line bg-white text-slate-600 hover:border-slate-300",
              )}
            >
              <option value="">{s.label}</option>
              {s.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                  {o.count !== undefined ? ` (${o.count})` : ""}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute end-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
          </label>
        ))}
        {(activeFilters > 0 || sp.get("q")) && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              push(Object.fromEntries([["q", null], ...selects.map((s) => [s.param, null])]));
            }}
            className="h-9 rounded-lg px-2.5 text-[13px] font-medium text-slate-500 hover:bg-slate-100 hover:text-ink"
          >
            Effacer
          </button>
        )}
      </div>
    </div>
  );
}
