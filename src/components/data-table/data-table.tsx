"use client";

import { isValidElement, useMemo, useState, useSyncExternalStore, useTransition, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, Check, Columns3, Download, Loader2, X } from "lucide-react";
import { cn, dayKey } from "@/lib/utils";
import { Empty, buttonClass, tableClass } from "@/components/ui";
import { showToast } from "@/components/toaster";
import { NoResults } from "./no-results";
import type { BulkAction, CellValue, DataColumn, DataRow } from "./types";

/**
 * Tableau intelligent (lignes déjà filtrées côté serveur) :
 * tri par colonne mémorisé dans l'URL (`?tri=col&ordre=asc`), colonnes visibles
 * mémorisées par tableau (localStorage), export CSV de la vue, « Afficher plus »,
 * sélection multiple + actions groupées, cartes sous 640 px, lignes cliquables,
 * en-tête collant.
 */
export function DataTable({
  id,
  columns,
  rows,
  pageSize = 50,
  bulkActions,
  selectable,
  query,
  filtered,
  clearHref,
  empty,
  minWidth,
  sortParam = "tri",
  orderParam = "ordre",
  exportName,
  unit = ["résultat", "résultats"],
  total,
  toolbar,
  className,
}: {
  /** Identifiant stable du tableau (mémorisation des colonnes, nom du fichier CSV) */
  id: string;
  columns: DataColumn[];
  rows: DataRow[];
  /** Lignes affichées avant « Afficher plus » */
  pageSize?: number;
  bulkActions?: BulkAction[];
  /** Cases à cocher même sans action groupée (export de la sélection) */
  selectable?: boolean;
  /** Recherche en cours (pour l'état vide) */
  query?: string | null;
  /** Une recherche ou un filtre est actif */
  filtered?: boolean;
  /** Lien « Effacer » de l'état vide (défaut : la page sans paramètres) */
  clearHref?: string;
  /** État vide sans filtre */
  empty?: ReactNode;
  /** Largeur minimale du tableau (px) avant défilement horizontal */
  minWidth?: number;
  sortParam?: string;
  orderParam?: string;
  /** Préfixe du fichier exporté (défaut : id) */
  exportName?: string;
  /** Unité du compteur : [singulier, pluriel] */
  unit?: [string, string];
  /** Nombre total de lignes si le serveur n'en a envoyé qu'une partie (affiche « affinez la recherche ») */
  total?: number;
  /** Contenu complémentaire de la barre du tableau */
  toolbar?: ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();

  /* ----- Colonnes visibles (localStorage, par tableau) ----- */
  const storageKey = `moovup.table.${id}.hidden`;
  const stored = useSyncExternalStore(subscribeStorage, () => readStorage(storageKey), () => null);
  const hidden = useMemo(() => {
    let keys: string[] | null = null;
    if (stored) {
      try {
        const v = JSON.parse(stored);
        if (Array.isArray(v)) keys = v.filter((x): x is string => typeof x === "string");
      } catch {
        /* valeur illisible : colonnes par défaut */
      }
    }
    return new Set(keys ?? columns.filter((c) => c.hidden).map((c) => c.key));
  }, [stored, columns]);
  const canHide = (c: DataColumn, i: number) => (c.hideable ?? i > 0) && !c.srOnly;
  const visible = columns.filter((c, i) => !canHide(c, i) || !hidden.has(c.key));
  const setHidden = (next: Set<string>) => writeStorage(storageKey, JSON.stringify([...next]));

  /* ----- Tri (URL) ----- */
  const sortKey = sp.get(sortParam);
  const sortCol = columns.find((c) => c.key === sortKey && c.sortable !== false && !c.srOnly);
  const dir: "asc" | "desc" = sp.get(orderParam) === "desc" ? "desc" : "asc";
  const sorted = useMemo(() => {
    if (!sortCol) return rows;
    const k = sortCol.key;
    const sign = dir === "asc" ? 1 : -1;
    return rows
      .map((r, i) => ({ r, i, v: valueOf(r, k) }))
      .sort((a, b) => {
        const ea = isBlank(a.v);
        const eb = isBlank(b.v);
        if (ea || eb) return ea === eb ? a.i - b.i : ea ? 1 : -1; // vides toujours en dernier
        return compare(a.v, b.v) * sign || a.i - b.i; // tri stable
      })
      .map((x) => x.r);
  }, [rows, sortCol, dir]);

  const setSort = (key: string) => {
    const next = new URLSearchParams(sp.toString());
    if (sortCol?.key !== key) {
      next.set(sortParam, key);
      next.set(orderParam, "asc");
    } else if (dir === "asc") next.set(orderParam, "desc");
    else {
      next.delete(sortParam);
      next.delete(orderParam);
    }
    const qs = next.toString();
    // Pas d'aller-retour serveur : les lignes sont déjà chargées
    window.history.replaceState(null, "", qs ? `${path}?${qs}` : path);
  };

  /* ----- Pagination légère ----- */
  const [limit, setLimit] = useState(pageSize);
  const shown = sorted.slice(0, limit);
  const rest = sorted.length - shown.length;

  /* ----- Sélection ----- */
  const withSelect = !!(selectable || bulkActions?.length);
  const [sel, setSel] = useState<Set<string>>(() => new Set());
  const selected = sorted.filter((r) => sel.has(r.id)).map((r) => r.id);
  const allOn = selected.length > 0 && selected.length === sorted.length;
  const toggle = (rid: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(rid)) n.delete(rid);
      else n.add(rid);
      return n;
    });
  const [pending, start] = useTransition();
  const say = (m: string, error?: boolean) => showToast(m, error ? "error" : "success");

  const runBulk = (a: BulkAction) => {
    const ids = selected.filter((x) => !a.ids || a.ids.includes(x));
    if (!ids.length) return;
    if (a.confirm && !window.confirm(a.confirm.replace("{n}", String(ids.length)))) return;
    start(async () => {
      try {
        if (a.run) await a.run(ids);
        else if (a.each) for (const x of ids) await a.each(x);
        setSel(new Set());
        say((a.done ?? "{n} ligne(s) mise(s) à jour").replace("{n}", String(ids.length)));
        router.refresh();
      } catch {
        say("L'action n'a pas pu aboutir. Réessayez ou rechargez la page.", true);
      }
    });
  };

  /* ----- Export CSV ----- */
  const exportCsv = (only?: string[]) => {
    const cols = visible.filter((c) => !c.noExport && !c.srOnly);
    const list = only ? sorted.filter((r) => only.includes(r.id)) : sorted;
    const lines = [cols.map((c) => csvCell(c.label)).join(";"), ...list.map((r) => cols.map((c) => csvCell(exportValue(r, c.key))).join(";"))];
    const blob = new Blob(["﻿" + lines.join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${exportName ?? id}_${dayKey()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    say(`${list.length} ligne${list.length > 1 ? "s" : ""} exportée${list.length > 1 ? "s" : ""}`);
  };

  /* ----- Ligne cliquable ----- */
  const open = (r: DataRow, e: MouseEvent | KeyboardEvent) => {
    if (!r.href) return;
    const t = e.target as HTMLElement;
    if (t.closest("a,button,input,select,textarea,label,summary,form,[data-no-row]")) return;
    if (window.getSelection()?.toString()) return; // sélection de texte
    if ("metaKey" in e && (e.metaKey || e.ctrlKey)) window.open(r.href, "_blank");
    else router.push(r.href);
  };
  const onKey = (r: DataRow, e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Enter" && e.target === e.currentTarget && r.href) router.push(r.href);
  };

  /* ----- Rendu ----- */
  const titleCol = visible.find((c) => c.card === "title") ?? visible[0];
  const cardRight = visible.find((c) => c.card === "right" && c !== titleCol);
  const cardSub = visible.filter((c) => c.card === "subtitle" && c !== titleCol);
  const cardFooter = visible.filter((c) => c.card === "footer");
  const cardLines = visible.filter((c) => c !== titleCol && c !== cardRight && !c.card);
  const hideables = columns.filter(canHide);

  return (
    <div className={cn("rounded-xl border border-line bg-white", className)}>
      {/* Barre du tableau */}
      <div className="flex min-h-12 flex-wrap items-center gap-2 border-b border-line px-4 py-2">
        {withSelect && selected.length > 0 ? (
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[13px] font-medium text-ink">
              <span className="tabular-nums">{selected.length}</span> sélectionné{selected.length > 1 ? "s" : ""}
            </span>
            {bulkActions?.map((a) => {
              const n = selected.filter((x) => !a.ids || a.ids.includes(x)).length;
              return (
                <button key={a.label} type="button" disabled={pending || !n} onClick={() => runBulk(a)} className={buttonClass(a.variant ?? "secondary", "h-8 px-2.5")}>
                  {a.icon}
                  {a.label}
                  {a.ids && <span className="text-xs tabular-nums opacity-70">{n}</span>}
                </button>
              );
            })}
            <button type="button" onClick={() => exportCsv(selected)} className={buttonClass("secondary", "h-8 px-2.5")}>
              <Download /> Exporter
            </button>
            <button type="button" onClick={() => setSel(new Set())} className={buttonClass("ghost", "h-8 px-2")} aria-label="Désélectionner tout">
              <X /> <span className="hidden sm:inline">Désélectionner</span>
            </button>
            {pending && <Loader2 className="size-4 animate-spin text-brand-500" aria-label="En cours" />}
          </div>
        ) : (
          <p className="min-w-0 flex-1 text-[13px] text-muted" aria-live="polite">
            <span className="font-semibold tabular-nums text-ink">{total ?? rows.length}</span> {(total ?? rows.length) > 1 ? unit[1] : unit[0]}
            {total !== undefined && total > rows.length && <span className="tabular-nums"> · {rows.length} premiers chargés, affinez la recherche</span>}
            {rest > 0 && <span className="tabular-nums"> · {shown.length} affichés</span>}
            {sortCol && (
              <span className="hidden sm:inline">
                {" "}
                · trié par {sortCol.label.toLowerCase()} ({dir === "asc" ? "croissant" : "décroissant"})
              </span>
            )}
          </p>
        )}
        <div className="flex items-center gap-1">
          {toolbar}
          {hideables.length > 0 && <ColumnsMenu columns={hideables} hidden={hidden} onChange={setHidden} onReset={() => writeStorage(storageKey, null)} />}
          <button type="button" onClick={() => exportCsv()} disabled={!rows.length} className={buttonClass("ghost", "h-8 px-2.5")} title="Exporter la vue en CSV (colonnes visibles, lignes filtrées)">
            <Download /> <span className="hidden sm:inline">CSV</span>
            <span className="sr-only sm:hidden">Exporter en CSV</span>
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        filtered ? (
          <NoResults query={query} clearHref={clearHref ?? path} />
        ) : (
          (empty ?? <Empty icon={<Columns3 />} title="Aucune donnée pour l'instant" />)
        )
      ) : (
        <>
          {/* ≥ 640 px : tableau à en-tête collant */}
          <div className="hidden max-h-[calc(100dvh-9rem)] overflow-auto overscroll-x-contain sm:block">
            <table className={tableClass} style={minWidth ? { minWidth } : undefined}>
              <thead>
                <tr>
                  {withSelect && (
                    <th className={cn(stickyTh, "w-10 !pr-0")}>
                      <input
                        type="checkbox"
                        className="size-4 cursor-pointer align-middle"
                        aria-label="Tout sélectionner"
                        checked={allOn}
                        ref={(el) => {
                          if (el) el.indeterminate = selected.length > 0 && !allOn;
                        }}
                        onChange={() => setSel(allOn ? new Set() : new Set(sorted.map((r) => r.id)))}
                      />
                    </th>
                  )}
                  {visible.map((c) => {
                    const active = sortCol?.key === c.key;
                    const right = c.numeric || c.align === "right";
                    return (
                      <th
                        key={c.key}
                        scope="col"
                        aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}
                        className={cn(stickyTh, right && "!text-right", c.align === "center" && "!text-center", c.headClassName)}
                      >
                        {c.srOnly ? (
                          <span className="sr-only">{c.label}</span>
                        ) : c.sortable === false ? (
                          c.label
                        ) : (
                          <button
                            type="button"
                            onClick={() => setSort(c.key)}
                            title={`Trier par ${c.label.toLowerCase()}`}
                            className={cn(
                              "group/sort -mx-1 inline-flex h-7 items-center gap-1 rounded px-1 font-medium transition hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40",
                              right && "flex-row-reverse",
                              active && "text-ink",
                            )}
                          >
                            {c.label}
                            {active ? (
                              dir === "asc" ? (
                                <ArrowUp className="size-3.5 text-brand-600" />
                              ) : (
                                <ArrowDown className="size-3.5 text-brand-600" />
                              )
                            ) : (
                              <ArrowUpDown className="size-3.5 text-slate-300 opacity-0 transition group-hover/sort:opacity-100 group-focus-visible/sort:opacity-100" />
                            )}
                          </button>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr
                    key={r.id}
                    onClick={r.href ? (e) => open(r, e) : undefined}
                    onKeyDown={r.href ? (e) => onKey(r, e) : undefined}
                    tabIndex={r.href ? 0 : undefined}
                    className={cn(r.href && "cursor-pointer focus-visible:bg-slate-50 focus-visible:outline-none", sel.has(r.id) && "bg-brand-50/50", r.className)}
                  >
                    {withSelect && (
                      <td className="w-10 !pr-0" data-no-row>
                        <input type="checkbox" className="size-4 cursor-pointer align-middle" aria-label="Sélectionner la ligne" checked={sel.has(r.id)} onChange={() => toggle(r.id)} />
                      </td>
                    )}
                    {visible.map((c) => (
                      <td
                        key={c.key}
                        className={cn(
                          (c.numeric || c.align === "right") && "text-right",
                          c.numeric && "whitespace-nowrap tabular-nums",
                          c.align === "center" && "text-center",
                          c.className,
                        )}
                      >
                        {r.cells[c.key] ?? <span className="text-slate-300">–</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* < 640 px : cartes */}
          <ul className="divide-y divide-line sm:hidden">
            {shown.map((r) => (
              <li
                key={r.id}
                onClick={r.href ? (e) => open(r, e) : undefined}
                onKeyDown={r.href ? (e) => onKey(r, e) : undefined}
                tabIndex={r.href ? 0 : undefined}
                className={cn("flex items-start gap-3 px-4 py-3", r.href && "cursor-pointer active:bg-slate-50", sel.has(r.id) && "bg-brand-50/50", r.className)}
              >
                {withSelect && (
                  <input type="checkbox" className="mt-1 size-4 shrink-0 cursor-pointer" aria-label="Sélectionner" checked={sel.has(r.id)} onChange={() => toggle(r.id)} />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 text-sm">{titleCol ? r.cells[titleCol.key] : null}</div>
                    {cardRight && <div className={cn("shrink-0 text-sm", cardRight.numeric && "font-semibold tabular-nums text-ink")}>{r.cells[cardRight.key]}</div>}
                  </div>
                  {cardSub.map((c) =>
                    r.cells[c.key] === null || r.cells[c.key] === undefined ? null : (
                      <div key={c.key} className="mt-1 min-w-0 text-xs text-muted">
                        {r.cells[c.key]}
                      </div>
                    ),
                  )}
                  {cardLines.length > 0 && (
                    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs [&>*]:min-w-0">
                      {cardLines.map((c) => (
                        <div key={c.key}>
                          <dt className="text-muted">{c.label}</dt>
                          <dd className={cn("mt-0.5 truncate text-ink", c.numeric && "tabular-nums")}>{r.cells[c.key] ?? <span className="text-slate-300">–</span>}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  {cardFooter.map((c) => (
                    <div key={c.key} className="mt-2.5" data-no-row>
                      {r.cells[c.key]}
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>

          {rest > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-2 border-t border-line px-4 py-3">
              <button type="button" onClick={() => setLimit((l) => l + pageSize)} className={buttonClass("secondary")}>
                Afficher plus <span className="tabular-nums text-muted">({rest} restant{rest > 1 ? "s" : ""})</span>
              </button>
              {rest > pageSize && (
                <button type="button" onClick={() => setLimit(sorted.length)} className={buttonClass("ghost")}>
                  Tout afficher
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const stickyTh = "sticky top-0 z-10 bg-white shadow-[inset_0_-1px_0_var(--color-line)]";

/* ---------- Menu « Colonnes » ---------- */
function ColumnsMenu({ columns, hidden, onChange, onReset }: { columns: DataColumn[]; hidden: Set<string>; onChange: (s: Set<string>) => void; onReset: () => void }) {
  const [openMenu, setOpen] = useState(false);
  const n = columns.filter((c) => !hidden.has(c.key)).length;
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={openMenu} aria-haspopup="true" className={buttonClass("ghost", "h-8 px-2.5")} title="Choisir les colonnes affichées">
        <Columns3 /> <span className="hidden sm:inline">Colonnes</span>
        <span className="sr-only sm:hidden">Colonnes</span>
      </button>
      {openMenu && (
        <>
          <button type="button" aria-hidden tabIndex={-1} className="fixed inset-0 z-30 cursor-default" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="absolute right-0 top-full z-40 mt-1 w-60 rounded-xl border border-line bg-white p-1.5 shadow-pop"
            onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
          >
            <p className="px-2 pb-1 pt-1 text-xs text-muted">
              Colonnes affichées <span className="tabular-nums">({n}/{columns.length})</span>
            </p>
            {columns.map((c) => {
              const on = !hidden.has(c.key);
              return (
                <button
                  key={c.key}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={on}
                  onClick={() => {
                    const next = new Set(hidden);
                    if (on) next.add(c.key);
                    else next.delete(c.key);
                    onChange(next);
                  }}
                  className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2 text-left text-[13px] text-ink hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none"
                >
                  <span className={cn("grid size-4 shrink-0 place-items-center rounded border", on ? "border-brand-500 bg-brand-500 text-white" : "border-slate-300 bg-white")}>
                    {on && <Check className="size-3" strokeWidth={3} />}
                  </span>
                  {c.label}
                </button>
              );
            })}
            <div className="mt-1 border-t border-line pt-1">
              <button type="button" onClick={onReset} className="h-8 w-full rounded-lg px-2 text-left text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-ink">
                Rétablir les colonnes par défaut
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- Utilitaires ---------- */
const EVT = "moovup-table-columns";
function subscribeStorage(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVT, cb);
  };
}
function readStorage(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* stockage indisponible (navigation privée) */
  }
  window.dispatchEvent(new Event(EVT));
}

const collator = new Intl.Collator("fr", { numeric: true, sensitivity: "base" });

function isBlank(v: CellValue) {
  return v === null || v === undefined || v === "";
}
function compare(a: CellValue, b: CellValue) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return collator.compare(String(a), String(b));
}

function valueOf(r: DataRow, key: string): CellValue {
  if (r.values && key in r.values) return r.values[key];
  const c = r.cells[key];
  if (typeof c === "string" || typeof c === "number") return c;
  return nodeText(c) || null;
}

function exportValue(r: DataRow, key: string): CellValue {
  if (r.values && key in r.values) return r.values[key];
  return nodeText(r.cells[key]);
}

/** Texte lisible d'un contenu React (pour l'export quand aucune valeur brute n'est fournie) */
function nodeText(n: ReactNode): string {
  if (n === null || n === undefined || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(nodeText).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  if (isValidElement(n)) {
    const p = n.props as { children?: ReactNode; name?: unknown; label?: unknown; title?: unknown };
    if (p.children !== undefined) return nodeText(p.children);
    for (const k of ["name", "label", "title"] as const) if (typeof p[k] === "string") return p[k] as string;
  }
  return "";
}

function csvCell(v: CellValue) {
  if (v === null || v === undefined) return "";
  let s = typeof v === "number" ? String(Math.round(v * 100) / 100).replace(".", ",") : typeof v === "boolean" ? (v ? "Oui" : "Non") : String(v);
  if (typeof v === "string" && /^[=@]|^[+-](?![\d\s])/.test(s)) s = "'" + s; // pas de formule involontaire dans Excel
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
