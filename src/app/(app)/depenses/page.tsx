import Link from "next/link";
import { ChevronLeft, ChevronRight, Paperclip, Percent, Plus, TrendingUp, Truck, Wallet, Receipt, X } from "lucide-react";
import { requireManager, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { monthKey } from "@/lib/data";
import { entity } from "@/lib/entities";
import { agadirToIso, cn, dayKey, fmtDate, mad, pct } from "@/lib/utils";
import type { Sale } from "@/lib/types";
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABEL, EXPENSE_METHOD_LABEL, type ExpenseCategory } from "@/lib/types-finance";
import type { ExpenseRow, SupplierFull } from "@/lib/types-business";
import { SupplierPicker } from "@/components/finance/supplier-picker";
import { norm } from "@/lib/search-match";
import { createExpense, deleteExpense } from "@/actions/finance";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { ImageInput } from "@/components/image-input";
import { Card, CardHeader, Empty, Field, Input, LinkButton, PageHeader, Select, Textarea, tableClass } from "@/components/ui";
import { SolidTile } from "@/components/stat-tile";
import { EntityBadge } from "@/components/entity-icon";
import { MarginChart } from "@/components/finance/margin-chart";
import { DeleteIconButton } from "@/components/finance/controls";
import { ListToolbar } from "@/components/list-toolbar";
import { matchesQuery } from "@/lib/search-match";
import { NoResults, ResultCount, clearHref, entityFilter, readSort, sortRows } from "@/components/reports/list-kit";
import { SortTh } from "@/components/reports/sort-th";

export const metadata = { title: "Dépenses & marge" };

function shiftMonth(m: string, n: number) {
  const [y, mo] = m.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, mo - 1 + n, 1)).toISOString().slice(0, 7);
}
const monthName = (m: string, opts: Intl.DateTimeFormatOptions = { month: "long", year: "numeric" }) =>
  new Intl.DateTimeFormat("fr-FR", { ...opts, timeZone: "UTC" }).format(new Date(`${m}-15T00:00:00Z`));

function trend(cur: number, prev: number) {
  if (!prev) return undefined;
  const d = Math.round(((cur - prev) / Math.abs(prev)) * 100);
  return `${d > 0 ? "+" : ""}${d} %`;
}

export default async function DepensesPage({ searchParams }: { searchParams: Promise<{ month?: string; cat?: string; q?: string; etab?: string; mode?: string; tri?: string; ordre?: string; fournisseur?: string }> }) {
  await requireManager();
  const [sp, scope] = await Promise.all([searchParams, getScope()]);
  const supabase = await createClient();
  const today = dayKey();
  const current = today.slice(0, 7);
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) && sp.month <= current ? sp.month : current;
  const cat = EXPENSE_CATEGORIES.some((c) => c.id === sp.cat) ? (sp.cat as ExpenseCategory) : null;

  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(month, i - 5));
  const from = `${months[0]}-01`;
  const to = `${shiftMonth(month, 1)}-01`;

  const [{ data: saleRows }, { data: expRows }, { data: supRows }] = await Promise.all([
    supabase.from("sales").select("*").in("entity_id", scope.ids).gte("sold_at", agadirToIso(from, "00:00")).lt("sold_at", agadirToIso(to, "00:00")),
    supabase.from("expenses").select("*").in("entity_id", scope.ids).gte("date", from).lt("date", to).order("date", { ascending: false }),
    supabase.from("suppliers").select("*").order("name"),
  ]);
  const sales = ((saleRows ?? []) as Sale[]).filter((s) => s.status !== "remboursee");
  const expenses = (expRows ?? []) as ExpenseRow[];
  // Répertoire fournisseurs (fiches communes au groupe ou servant un établissement du périmètre)
  const suppliers = ((supRows ?? []) as SupplierFull[]).filter((s) => !(s.entity_ids ?? []).length || s.entity_ids.some((e) => scope.allowed.some((a) => a.id === e)));
  const supplierById = new Map(suppliers.map((s) => [s.id, s]));
  const supplierByName = new Map(suppliers.map((s) => [norm(s.name), s]));
  /** Fiche d'une dépense : lien direct, sinon même nom (anciennes saisies) */
  const supOf = (x: ExpenseRow) => (x.supplier_id ? supplierById.get(x.supplier_id) : x.supplier ? supplierByName.get(norm(x.supplier)) : undefined);

  const caOf = (m: string, e?: string) => sales.filter((s) => monthKey(s.sold_at) === m && (!e || s.entity_id === e)).reduce((a, s) => a + Number(s.total_mad), 0);
  const expOf = (m: string, e?: string) => expenses.filter((x) => x.date.startsWith(m) && (!e || x.entity_id === e)).reduce((a, x) => a + Number(x.amount_mad), 0);

  const ca = caOf(month);
  const dep = expOf(month);
  const marge = ca - dep;
  const prevM = months[4]!;
  const prevMarge = caOf(prevM) - expOf(prevM);
  const rate = ca ? Math.round((marge / ca) * 100) : 0;
  const prevRate = caOf(prevM) ? Math.round((prevMarge / caOf(prevM)) * 100) : 0;

  const chart = months.map((m) => ({ label: monthName(m, { month: "short" }).replace(".", ""), ca: Math.round(caOf(m)), depenses: Math.round(expOf(m)) }));
  const ents = scope.allowed.filter((e) => scope.ids.includes(e.id));
  const rows = ents.map((e) => {
    const c = caOf(month, e.id);
    const d = expOf(month, e.id);
    return { e, ca: c, dep: d, marge: c - d, rate: c ? Math.round(((c - d) / c) * 100) : null };
  });

  const monthExpenses = expenses.filter((x) => x.date.startsWith(month));
  const byCat = EXPENSE_CATEGORIES.map((c) => ({ ...c, total: monthExpenses.filter((x) => x.category === c.id).reduce((a, x) => a + Number(x.amount_mad), 0) }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);
  // Recherche (fournisseur, note, catégorie, montant…) + filtres établissement / catégorie / moyen de paiement
  const q = (sp.q ?? "").trim();
  const etab = ents.some((e) => e.id === sp.etab) ? sp.etab! : "";
  const mode = sp.mode && sp.mode in EXPENSE_METHOD_LABEL ? sp.mode : "";
  const fSup = sp.fournisseur && (sp.fournisseur === "aucun" || supplierById.has(sp.fournisseur)) ? sp.fournisseur : "";
  const searched = monthExpenses.filter(
    (x) =>
      (!etab || x.entity_id === etab) &&
      (!mode || x.method === mode) &&
      (!fSup || (fSup === "aucun" ? !supOf(x) : supOf(x)?.id === fSup)) &&
      matchesQuery(q, x.supplier, x.note, EXPENSE_CATEGORY_LABEL[x.category], x.category, x.amount_mad, mad(Number(x.amount_mad)), EXPENSE_METHOD_LABEL[x.method], entity(x.entity_id)?.short),
  );
  const sort = readSort(sp, ["date", "categorie", "detail", "montant"] as const, "date", "desc");
  const list = sortRows(
    cat ? searched.filter((x) => x.category === cat) : searched,
    (x) => (sort.key === "date" ? x.date : sort.key === "categorie" ? (EXPENSE_CATEGORY_LABEL[x.category] ?? x.category) : sort.key === "detail" ? (x.supplier ?? x.note) : Number(x.amount_mad)),
    sort.dir,
  );
  const filtering = !!(q || etab || mode || cat || fSup);
  const catCounts = EXPENSE_CATEGORIES.map((c) => ({ ...c, n: searched.filter((x) => x.category === c.id).length })).filter((c) => c.n > 0 || c.id === cat);
  const listTotal = list.reduce((a, x) => a + Number(x.amount_mad), 0);
  // Totaux par fournisseur (mois affiché, filtres établissement / paiement / catégorie appliqués)
  const supTotals = new Map<string, { id: string | null; name: string; total: number; n: number }>();
  for (const x of monthExpenses) {
    if ((etab && x.entity_id !== etab) || (mode && x.method !== mode) || (cat && x.category !== cat)) continue;
    const s = supOf(x);
    const key = s?.id ?? (x.supplier ? `txt:${norm(x.supplier)}` : "aucun");
    const cur = supTotals.get(key) ?? { id: s?.id ?? null, name: s?.name ?? x.supplier ?? "Sans fournisseur", total: 0, n: 0 };
    cur.total += Number(x.amount_mad);
    cur.n += 1;
    supTotals.set(key, cur);
  }
  const bySupplier = [...supTotals.values()].sort((a, b) => b.total - a.total);
  const unlinked = monthExpenses.filter((x) => !supOf(x)).length;
  const supplierOptions = suppliers
    .filter((s) => s.active !== false)
    .map((s) => ({ id: s.id, name: s.name, hint: (s.categories ?? []).map((c) => EXPENSE_CATEGORY_LABEL[c as ExpenseCategory] ?? c).slice(0, 2).join(", ") || s.city }));

  const href = (p: { month?: string; cat?: string | null }) => {
    const q = new URLSearchParams();
    const m = p.month ?? month;
    if (m !== current) q.set("month", m);
    const c = p.cat === undefined ? cat : p.cat;
    if (c) q.set("cat", c);
    for (const k of ["q", "etab", "mode", "tri", "ordre", "fournisseur"] as const) if (sp[k]) q.set(k, sp[k]!);
    const s = q.toString();
    return `/depenses${s ? `?${s}` : ""}`;
  };
  const defaultEntity = scope.current?.id ?? ents[0]?.id ?? scope.allowed[0]?.id;
  const supHref = (id: string | null) => {
    const u = new URLSearchParams(href({}).split("?")[1] ?? "");
    if (id) u.set("fournisseur", id);
    else u.delete("fournisseur");
    const qs = u.toString();
    return `/depenses${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dépenses & marge"
        subtitle={scope.current ? scope.current.short : `${ents.length} établissements`}
        actions={
          <>
            <div className="flex items-center rounded-lg border border-line bg-white">
              <Link href={href({ month: shiftMonth(month, -1) })} className="grid size-9 place-items-center text-slate-500 hover:text-ink" aria-label="Mois précédent">
                <ChevronLeft className="size-4" />
              </Link>
              <span className="min-w-[120px] text-center text-[13px] font-medium capitalize text-ink">{monthName(month)}</span>
              {month < current ? (
                <Link href={href({ month: shiftMonth(month, 1) })} className="grid size-9 place-items-center text-slate-500 hover:text-ink" aria-label="Mois suivant">
                  <ChevronRight className="size-4" />
                </Link>
              ) : (
                <span className="grid size-9 place-items-center text-slate-200">
                  <ChevronRight className="size-4" />
                </span>
              )}
            </div>
            <LinkButton href="#nouvelle" variant="brand">
              <Plus /> Ajouter une dépense
            </LinkButton>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 [&>*]:min-w-0">
        <SolidTile label="Chiffre d'affaires" value={mad(ca)} trendLabel={trend(ca, caOf(prevM))} trendUp={caOf(prevM) ? ca >= caOf(prevM) : null} sub="vs mois préc." icon={<TrendingUp />} />
        <SolidTile label="Dépenses" value={mad(dep)} trendLabel={trend(dep, expOf(prevM))} trendUp={expOf(prevM) ? dep <= expOf(prevM) : null} sub="vs mois préc." icon={<Wallet />} />
        <SolidTile label="Marge" value={<span className={cn(marge < 0 && "text-red-600")}>{mad(marge)}</span>} sub="CA − dépenses" icon={<Receipt />} />
        <SolidTile label="Taux de marge" value={`${rate} %`} trendLabel={prevRate || prevMarge ? `${rate - prevRate > 0 ? "+" : ""}${rate - prevRate} pts` : undefined} trendUp={rate === prevRate ? null : rate > prevRate} sub="vs mois préc." icon={<Percent />} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr] [&>*]:min-w-0">
        <Card>
          <CardHeader title="CA et dépenses" subtitle="6 derniers mois" />
          <div className="px-3 pb-4">
            <MarginChart data={chart} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Marge par établissement" subtitle={monthName(month)} />
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th>Établissement</th>
                  <th className="!text-right">CA</th>
                  <th className="!text-right">Dépenses</th>
                  <th className="!text-right">Marge</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.e.id}>
                    <td>
                      <EntityBadge id={r.e.id} />
                    </td>
                    <td className="text-right tabular-nums">{mad(r.ca)}</td>
                    <td className="text-right tabular-nums">{mad(r.dep)}</td>
                    <td className="text-right">
                      <span className={cn("font-semibold tabular-nums", r.marge < 0 ? "text-red-600" : "text-ink")}>{mad(r.marge)}</span>
                      {r.rate !== null && <span className="block text-xs tabular-nums text-muted">{r.rate} %</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              {rows.length > 1 && (
                <tfoot>
                  <tr className="border-t border-line text-sm">
                    <td className="px-4 py-3 font-semibold text-ink">Total</td>
                    <td className="px-4 py-3 text-right tabular-nums">{mad(ca)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{mad(dep)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={cn("font-semibold tabular-nums", marge < 0 ? "text-red-600" : "text-ink")}>{mad(marge)}</span>
                      <span className="block text-xs tabular-nums text-muted">{rate} %</span>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_340px] [&>*]:min-w-0">
        <div className="space-y-5">
          {byCat.length > 0 && (
            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-ink">Répartition</h3>
                {cat && (
                  <Link href={href({ cat: null })} className="text-[13px] font-medium text-brand-600 hover:underline">
                    Toutes les catégories
                  </Link>
                )}
              </div>
              <ul className="space-y-2.5">
                {byCat.map((c) => (
                  <li key={c.id}>
                    <Link href={href({ cat: cat === c.id ? null : c.id })} className={cn("group block rounded-md", cat && cat !== c.id && "opacity-50")}>
                      <div className="flex items-baseline justify-between gap-3 text-[13px]">
                        <span className="truncate text-slate-700 group-hover:text-ink">{c.label}</span>
                        <span className="shrink-0 tabular-nums text-ink">
                          {mad(c.total)} <span className="text-xs text-muted">· {pct(c.total, dep)} %</span>
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-slate-400 group-hover:bg-brand-500" style={{ width: `${Math.max(2, pct(c.total, byCat[0]!.total))}%` }} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {bySupplier.length > 0 && (
            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-ink">Par fournisseur</h3>
                <Link href="/fournisseurs" className="text-[13px] font-medium text-brand-600 hover:underline">
                  Répertoire
                </Link>
              </div>
              <ul className="divide-y divide-line text-[13px]">
                {bySupplier.slice(0, 8).map((r) => {
                  const active = r.id ? fSup === r.id : false;
                  return (
                    <li key={r.id ?? r.name} className="flex items-center gap-3 py-2">
                      <span className="min-w-0 flex-1 truncate">
                        {r.id ? (
                          <Link href={supHref(active ? null : r.id)} className={cn("hover:underline", active ? "font-semibold text-brand-600" : "text-slate-700")}>
                            {r.name}
                          </Link>
                        ) : (
                          <span className="text-muted">{r.name}</span>
                        )}
                        <span className="ml-1.5 text-xs text-muted">· {r.n}</span>
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums text-ink">{mad(r.total)}</span>
                      <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted">{pct(r.total, dep)} %</span>
                    </li>
                  );
                })}
              </ul>
              {unlinked > 0 && (
                <Link href={supHref("aucun")} className="mt-3 block text-xs text-muted hover:text-ink">
                  {unlinked} dépense{unlinked > 1 ? "s" : ""} sans fiche fournisseur →
                </Link>
              )}
            </Card>
          )}

          <Card>
            <CardHeader
              title={cat ? `Dépenses · ${EXPENSE_CATEGORY_LABEL[cat]}` : "Dépenses du mois"}
              subtitle={`${list.length} dépense${list.length > 1 ? "s" : ""} · ${mad(listTotal)}`}
            />
            {monthExpenses.length > 0 && (
              <div className="px-5">
                <ListToolbar
                  placeholder="Fournisseur, note, catégorie, montant…"
                  filters={[
                    ...entityFilter(ents, Object.fromEntries(ents.map((e) => [e.id, monthExpenses.filter((x) => x.entity_id === e.id).length]))),
                    { param: "cat", label: "Toutes catégories", options: catCounts.map((c) => ({ value: c.id, label: c.label, count: c.n })) },
                    { param: "mode", label: "Tous paiements", options: Object.entries(EXPENSE_METHOD_LABEL).map(([k, v]) => ({ value: k, label: v })) },
                  ]}
                  right={<ResultCount shown={list.length} total={monthExpenses.length} filtered={filtering} unit="dépense" />}
                />
                {fSup && (
                  <Link href={supHref(null)} className="mb-3 inline-flex items-center gap-1.5 rounded-md bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100">
                    <Truck className="size-3.5" /> {fSup === "aucun" ? "Sans fiche fournisseur" : supplierById.get(fSup)?.name} <X className="size-3.5" />
                  </Link>
                )}
              </div>
            )}
            {list.length ? (
              <div className="overflow-x-auto">
                <table className={tableClass}>
                  <thead>
                    <tr>
                      <SortTh col="date" label="Date" def defDir="desc" first="desc" />
                      <SortTh col="categorie" label="Catégorie" />
                      <SortTh col="detail" label="Détail" />
                      <SortTh col="montant" label="Montant" align="right" first="desc" className="!text-right" />
                      <th className="w-16" />
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((x) => (
                      <tr key={x.id}>
                        <td className="whitespace-nowrap">
                          <span className="tabular-nums">{fmtDate(x.date, { day: "numeric", month: "short" })}</span>
                          {ents.length > 1 && <span className="mt-0.5 block">{entity(x.entity_id) && <EntityBadge id={x.entity_id} />}</span>}
                        </td>
                        <td className="whitespace-nowrap text-slate-700">{EXPENSE_CATEGORY_LABEL[x.category] ?? x.category}</td>
                        <td className="min-w-[180px]">
                          {supOf(x) ? (
                            <Link href={`/fournisseurs/${supOf(x)!.id}`} className="block text-ink hover:text-brand-600 hover:underline">
                              {supOf(x)!.name}
                            </Link>
                          ) : (
                            <span className="block text-ink">{x.supplier ?? x.note ?? "–"}</span>
                          )}
                          <span className="block text-xs text-muted">
                            {EXPENSE_METHOD_LABEL[x.method] ?? x.method}
                            {x.supplier && x.note ? ` · ${x.note}` : ""}
                          </span>
                        </td>
                        <td className="whitespace-nowrap text-right font-semibold tabular-nums">{mad(Number(x.amount_mad))}</td>
                        <td>
                          <div className="flex items-center justify-end gap-0.5">
                            {x.receipt_url && (
                              <a href={`/depenses/${x.id}/justificatif`} target="_blank" rel="noreferrer" title="Voir le justificatif" className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-ink">
                                <Paperclip className="size-4" />
                              </a>
                            )}
                            <form action={deleteExpense.bind(null, x.id)}>
                              <DeleteIconButton label="Supprimer la dépense" message={`Supprimer cette dépense de ${mad(Number(x.amount_mad))} ?`} />
                            </form>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : filtering && monthExpenses.length ? (
              <NoResults q={q} href={clearHref("/depenses", sp, ["q", "etab", "mode", "cat", "fournisseur"])} what="dépense" />
            ) : (
              <Empty
                icon={<Wallet />}
                title={`Aucune dépense en ${monthName(month, { month: "long" })}`}
                text="Saisissez les loyers, salaires et achats pour suivre la marge réelle de chaque établissement."
                action={
                  <LinkButton href="#nouvelle" variant="brand">
                    <Plus /> Ajouter une dépense
                  </LinkButton>
                }
              />
            )}
          </Card>
        </div>

        <Card id="nouvelle" className="scroll-mt-6 p-5 lg:sticky lg:top-5">
          <h3 className="text-sm font-semibold text-ink">Nouvelle dépense</h3>
          <p className="mt-1 text-[13px] text-muted">Les dépenses en espèces sont déduites de la caisse du jour.</p>
          <ActionForm action={createExpense} className="mt-4 space-y-3.5">
            <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
              <Field label="Montant (MAD)">
                <Input name="amount" inputMode="decimal" required placeholder="0" className="font-semibold tabular-nums" />
              </Field>
              <Field label="Date">
                <Input type="date" name="date" defaultValue={today} max={today} required />
              </Field>
            </div>
            <Field label="Catégorie">
              <Select name="category" defaultValue={cat ?? "fournitures"} required>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>
            {scope.allowed.length > 1 ? (
              <Field label="Établissement">
                <Select name="entity_id" defaultValue={defaultEntity} required>
                  {scope.allowed.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.short}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <input type="hidden" name="entity_id" value={defaultEntity} />
            )}
            <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
              <Field label="Payé par">
                <Select name="method" defaultValue="especes">
                  {Object.entries(EXPENSE_METHOD_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div>
              <span className="mb-1.5 block text-[13px] font-medium text-slate-700">Fournisseur</span>
              <SupplierPicker options={supplierOptions} defaultId={fSup && fSup !== "aucun" ? fSup : null} />
            </div>
            <details className="group">
              <summary className="cursor-pointer list-none text-[13px] font-medium text-brand-600 hover:underline">+ Note et justificatif</summary>
              <div className="mt-3 space-y-3">
                <Textarea name="note" placeholder="Ex. : réparation de la climatisation du vestiaire" className="min-h-[64px]" />
                <ImageInput name="receipt" label="Photo du justificatif" />
              </div>
            </details>
            <SubmitButton variant="brand" className="w-full">
              <Plus className="size-4" /> Enregistrer la dépense
            </SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
