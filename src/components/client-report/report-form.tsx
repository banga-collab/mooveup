"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, FileBarChart, Loader2, Search, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonClass, Input, Select } from "@/components/ui";
import { findReportClients, type ClientHit } from "@/actions/client-report";
import { PERIOD_OPTIONS, type PeriodId } from "./period";

type Picked = Pick<ClientHit, "id" | "full_name" | "phone">;

/**
 * Choix du rapport : un client, une sélection (recherche + cases) ou tous ;
 * période (raccourcis ou dates) ; établissement. Le rapport s'affiche dessous (URL partageable).
 */
export function ClientReportForm({
  initialAll,
  initialSelected,
  period,
  from,
  to,
  etab,
  entities,
}: {
  initialAll: boolean;
  initialSelected: Picked[];
  period: PeriodId;
  from: string;
  to: string;
  etab: string | null;
  entities: { id: string; short: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [all, setAll] = useState(initialAll);
  const [picked, setPicked] = useState<Picked[]>(initialSelected);
  const [per, setPer] = useState<PeriodId>(period);
  const [du, setDu] = useState(from);
  const [au, setAu] = useState(to);
  const [ent, setEnt] = useState(etab ?? "");

  /* Recherche de clients (action serveur, différée) */
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<ClientHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    const n = ++seq.current;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await findReportClients(term);
        if (n === seq.current) {
          setHits(res);
          setHi(0);
        }
      } finally {
        if (n === seq.current) setSearching(false);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const isPicked = (id: string) => picked.some((p) => p.id === id);
  const toggle = (c: Picked) => setPicked((l) => (l.some((p) => p.id === c.id) ? l.filter((p) => p.id !== c.id) : [...l, { id: c.id, full_name: c.full_name, phone: c.phone }]));
  const addAllHits = () => setPicked((l) => [...l, ...hits.filter((h) => !l.some((p) => p.id === h.id)).map((h) => ({ id: h.id, full_name: h.full_name, phone: h.phone }))]);

  const ready = all || picked.length > 0;
  const submit = () => {
    if (!ready) return;
    const sp = new URLSearchParams();
    if (all) sp.set("tous", "1");
    else if (picked.length === 1) sp.set("client", picked[0]!.id);
    else sp.set("clients", picked.map((p) => p.id).join(","));
    if (per !== "mois") sp.set("periode", per);
    if (per === "perso") {
      sp.set("du", du);
      sp.set("au", au);
    }
    if (ent) sp.set("etab", ent);
    start(() => router.push(`/rapports-clients?${sp.toString()}`));
  };

  const seg = (on: boolean) =>
    cn(
      "inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 [&_svg]:size-4",
      on ? "bg-white text-ink shadow-sm" : "text-slate-600 hover:text-ink",
    );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-4 rounded-xl border border-line bg-white p-4 sm:p-5"
    >
      {/* Clients */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-ink">Clients</p>
          <div className="inline-flex rounded-lg bg-slate-100 p-0.5" role="radiogroup" aria-label="Clients du rapport">
            <button type="button" role="radio" aria-checked={!all} onClick={() => setAll(false)} className={seg(!all)}>
              <Search /> Choisir
            </button>
            <button type="button" role="radio" aria-checked={all} onClick={() => setAll(true)} className={seg(all)}>
              <Users /> Tous les clients
            </button>
          </div>
        </div>

        {all ? (
          <p className="text-[13px] text-muted">Tous les clients actifs sur la période (achat, entrée, rendez-vous ou abonnement en cours), triés par montant dépensé.</p>
        ) : (
          <>
            <div ref={box} className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setHi((h) => Math.min(h + 1, hits.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setHi((h) => Math.max(h - 1, 0));
                  } else if (e.key === "Enter" && open && hits[hi]) {
                    e.preventDefault();
                    toggle(hits[hi]!);
                  } else if (e.key === "Escape") setOpen(false);
                }}
                placeholder="Nom, téléphone ou e-mail du client…"
                className="h-10 pl-9"
                role="combobox"
                aria-expanded={open && hits.length > 0}
                aria-controls="client-report-hits"
                aria-label="Rechercher un client"
                autoComplete="off"
              />
              {searching && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-slate-400" />}
              {open && q.trim().length >= 2 && (
                <div className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-line bg-white shadow-pop">
                  {hits.length ? (
                    <>
                      <ul id="client-report-hits" role="listbox" aria-multiselectable className="max-h-72 overflow-y-auto py-1">
                        {hits.map((h, i) => {
                          const on = isPicked(h.id);
                          return (
                            <li key={h.id} role="option" aria-selected={on}>
                              <button
                                type="button"
                                onMouseEnter={() => setHi(i)}
                                onClick={() => toggle(h)}
                                className={cn("flex min-h-10 w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px]", i === hi && "bg-slate-50")}
                              >
                                <span className={cn("grid size-4 shrink-0 place-items-center rounded border", on ? "border-brand-500 bg-brand-500 text-white" : "border-slate-300 bg-white")}>
                                  {on && <Check className="size-3" strokeWidth={3} />}
                                </span>
                                <span className="min-w-0 flex-1 truncate font-medium text-ink">{h.full_name}</span>
                                {h.phone && <span className="shrink-0 tabular-nums text-xs text-muted">{h.phone}</span>}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                      {hits.length > 1 && (
                        <div className="flex items-center justify-between border-t border-line px-3 py-1.5 text-xs">
                          <button type="button" onClick={addAllHits} className="font-medium text-brand-600 hover:underline">
                            Cocher les {hits.length} résultats
                          </button>
                          <button type="button" onClick={() => setOpen(false)} className="text-muted hover:text-ink">
                            Fermer
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="px-3 py-3 text-[13px] text-muted">{searching ? "Recherche…" : "Aucun client trouvé. Essayez le téléphone ou une partie du nom."}</p>
                  )}
                </div>
              )}
            </div>
            {picked.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {picked.map((p) => (
                  <span key={p.id} className="inline-flex h-8 max-w-full items-center gap-1 rounded-full border border-line bg-slate-50 pl-3 pr-1 text-[13px] text-ink">
                    <span className="truncate">{p.full_name}</span>
                    <button type="button" onClick={() => toggle(p)} className="grid size-6 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-slate-200 hover:text-ink" aria-label={`Retirer ${p.full_name}`}>
                      <X className="size-3.5" />
                    </button>
                  </span>
                ))}
                {picked.length > 1 && (
                  <button type="button" onClick={() => setPicked([])} className="h-8 px-2 text-xs font-medium text-slate-500 hover:text-ink">
                    Tout retirer
                  </button>
                )}
              </div>
            ) : (
              <p className="text-[13px] text-muted">Cherchez puis cochez un ou plusieurs clients.</p>
            )}
          </>
        )}
      </div>

      {/* Période + établissement */}
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3 border-t border-line pt-4">
        <fieldset className="min-w-0">
          <legend className="mb-1.5 text-sm font-semibold text-ink">Période</legend>
          <div className="flex flex-wrap gap-1.5">
            {PERIOD_OPTIONS.map((o) => (
              <button
                key={o.id}
                type="button"
                aria-pressed={per === o.id}
                onClick={() => setPer(o.id)}
                className={cn(
                  "h-9 rounded-full border px-3 text-[13px] font-medium transition",
                  per === o.id ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line bg-white text-slate-600 hover:border-slate-300 hover:text-ink",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </fieldset>
        {per === "perso" && (
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-[13px] text-muted">
              Du
              <Input type="date" value={du} onChange={(e) => setDu(e.target.value)} className="mt-1 h-9 w-40" required />
            </label>
            <label className="text-[13px] text-muted">
              Au
              <Input type="date" value={au} onChange={(e) => setAu(e.target.value)} min={du} className="mt-1 h-9 w-40" required />
            </label>
          </div>
        )}
        {entities.length > 1 && (
          <label className="text-[13px] text-muted">
            Établissement
            <Select value={ent} onChange={(e) => setEnt(e.target.value)} className="mt-1 h-9 w-48">
              <option value="">Tous</option>
              {entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.short}
                </option>
              ))}
            </Select>
          </label>
        )}
        <button type="submit" disabled={!ready || pending} className={buttonClass("brand", "ml-auto h-10")}>
          {pending ? <Loader2 className="animate-spin" /> : <FileBarChart />}
          Générer le rapport
        </button>
      </div>
    </form>
  );
}
