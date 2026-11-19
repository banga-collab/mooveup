import Link from "next/link";
import { CalendarClock, Plus, Trophy, Truck, Wallet } from "lucide-react";
import { requireManager, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addDaysKey, dayKey, fmtDate, mad } from "@/lib/utils";
import { norm, matchesQuery } from "@/lib/search-match";
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABEL, type ExpenseCategory } from "@/lib/types-finance";
import type { PurchaseOrder } from "@/lib/types-ops";
import type { ExpenseRow, SupplierFull } from "@/lib/types-business";
import { createSupplierFromName } from "@/actions/suppliers";
import { Badge, Card, CardHeader, Empty, LinkButton, PageHeader, Segmented, tableClass } from "@/components/ui";
import { SolidTile } from "@/components/stat-tile";
import { EntityDots } from "@/components/entity-icon";
import { ListToolbar } from "@/components/list-toolbar";
import { NoResults, ResultCount, clearHref, entityFilter, readSort, sortRows } from "@/components/reports/list-kit";
import { SortTh } from "@/components/reports/sort-th";
import { PERIODS, periodStart, type PeriodId } from "@/components/finance/supplier-period";

export const metadata = { title: "Fournisseurs" };

type SP = { q?: string; etab?: string; cat?: string; statut?: string; periode?: string; tri?: string; ordre?: string };

export default async function FournisseursPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireManager();
  const [sp, scope] = await Promise.all([searchParams, getScope()]);
  const supabase = await createClient();
  const today = dayKey();
  const period: PeriodId = PERIODS.some((p) => p.id === sp.periode) ? (sp.periode as PeriodId) : "12m";
  const from = periodStart(period, today);
  const yearAgo = addDaysKey(today, -365);
  const since = from < yearAgo ? from : yearAgo;

  const [{ data: supRows }, { data: expRows }, { data: poRows }] = await Promise.all([
    supabase.from("suppliers").select("*").order("name"),
    supabase.from("expenses").select("*").in("entity_id", scope.ids).gte("date", since),
    supabase.from("purchase_orders").select("*").in("entity_id", scope.ids).neq("status", "recue"),
  ]);
  const ents = scope.allowed.filter((e) => scope.ids.includes(e.id));
  const all = ((supRows ?? []) as SupplierFull[]).filter((s) => !(s.entity_ids ?? []).length || s.entity_ids.some((e) => scope.ids.includes(e)));
  const byId = new Map(all.map((s) => [s.id, s]));
  const byName = new Map(all.map((s) => [norm(s.name), s]));
  const expenses = (expRows ?? []) as ExpenseRow[];
  const openOrders = (poRows ?? []) as PurchaseOrder[];

  // Agrégats en un seul passage
  type Agg = { total: number; n: number; last: string | null };
  const agg = new Map<string, Agg>();
  const orphans = new Map<string, { name: string; total: number; n: number }>();
  let periodTotal = 0;
  let orphanTotal = 0;
  for (const x of expenses) {
    const s = x.supplier_id ? byId.get(x.supplier_id) : x.supplier ? byName.get(norm(x.supplier)) : undefined;
    const inPeriod = x.date >= from;
    if (inPeriod) periodTotal += Number(x.amount_mad);
    if (!s) {
      if (x.supplier && inPeriod) {
        const k = norm(x.supplier);
        const o = orphans.get(k) ?? { name: x.supplier, total: 0, n: 0 };
        o.total += Number(x.amount_mad);
        o.n += 1;
        orphans.set(k, o);
        orphanTotal += Number(x.amount_mad);
      }
      continue;
    }
    const a = agg.get(s.id) ?? { total: 0, n: 0, last: null };
    if (inPeriod) {
      a.total += Number(x.amount_mad);
      a.n += 1;
    }
    if (!a.last || x.date > a.last) a.last = x.date;
    agg.set(s.id, a);
  }
  const ordersOf = new Map<string, number>();
  for (const o of openOrders) if (o.supplier_id) ordersOf.set(o.supplier_id, (ordersOf.get(o.supplier_id) ?? 0) + 1);

  const statut = sp.statut === "archives" ? "archives" : "actifs";
  const etab = ents.some((e) => e.id === sp.etab) ? sp.etab! : "";
  const cat = EXPENSE_CATEGORIES.some((c) => c.id === sp.cat) ? sp.cat! : "";
  const q = (sp.q ?? "").trim();
  const base = all.filter((s) => (statut === "archives" ? s.active === false : s.active !== false));
  const filtered = base.filter(
    (s) =>
      (!etab || !(s.entity_ids ?? []).length || s.entity_ids.includes(etab as never)) &&
      (!cat || (s.categories ?? []).includes(cat)) &&
      matchesQuery(q, s.name, s.legal_name, s.ice, s.contact_name, s.phone, s.whatsapp, s.email, s.city, s.address, s.notes, (s.categories ?? []).map((c) => EXPENSE_CATEGORY_LABEL[c as ExpenseCategory] ?? c).join(" ")),
  );
  const sort = readSort(sp, ["nom", "total", "dernier"] as const, "total", "desc");
  const rows = sortRows(filtered, (s) => (sort.key === "nom" ? s.name : sort.key === "total" ? (agg.get(s.id)?.total ?? 0) : (agg.get(s.id)?.last ?? "")), sort.dir);
  const filtering = !!(q || etab || cat);

  const top = [...agg.entries()].sort((a, b) => b[1].total - a[1].total)[0];
  const topSup = top ? byId.get(top[0]) : undefined;
  const periodLabel = PERIODS.find((p) => p.id === period)!.label.toLowerCase();
  const orphanList = [...orphans.values()].sort((a, b) => b.total - a.total);
  const keep = (patch: Record<string, string | null>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v) u.set(k, v);
    for (const [k, v] of Object.entries(patch)) {
      if (v) u.set(k, v);
      else u.delete(k);
    }
    const s = u.toString();
    return `/fournisseurs${s ? `?${s}` : ""}`;
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Fournisseurs"
        subtitle={`${base.length} fiche${base.length > 1 ? "s" : ""} · dépenses et bons de commande rattachés`}
        actions={
          <LinkButton href="/fournisseurs/nouveau" variant="brand">
            <Plus /> Nouveau fournisseur
          </LinkButton>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 [&>*]:min-w-0">
        <SolidTile label="Fournisseurs actifs" value={all.filter((s) => s.active !== false).length} sub={`${openOrders.length} commande${openOrders.length > 1 ? "s" : ""} en cours`} icon={<Truck />} />
        <SolidTile label="Payé" value={mad(periodTotal)} sub={periodLabel} icon={<Wallet />} />
        <SolidTile label="Premier fournisseur" value={<span className="block truncate text-base">{topSup?.name ?? "—"}</span>} sub={top ? mad(top[1].total) : periodLabel} icon={<Trophy />} />
        <SolidTile label="Sans fiche" value={mad(orphanTotal)} sub={`${orphanList.length} nom${orphanList.length > 1 ? "s" : ""} saisis à la main`} icon={<CalendarClock />} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented items={PERIODS.map((p) => ({ id: p.id, label: p.label, href: keep({ periode: p.id === "12m" ? null : p.id }) }))} active={period} />
        <Segmented
          items={[
            { id: "actifs", label: "Actifs", href: keep({ statut: null }), count: all.filter((s) => s.active !== false).length },
            { id: "archives", label: "Archivés", href: keep({ statut: "archives" }), count: all.filter((s) => s.active === false).length },
          ]}
          active={statut}
        />
      </div>

      <Card>
        <div className="px-5 pt-4">
          <ListToolbar
            placeholder="Nom, ICE, contact, téléphone, catégorie…"
            filters={[
              ...entityFilter(ents),
              { param: "cat", label: "Toutes catégories", options: EXPENSE_CATEGORIES.map((c) => ({ value: c.id, label: c.label, count: base.filter((s) => (s.categories ?? []).includes(c.id)).length })).filter((o) => o.count > 0 || o.value === cat) },
            ]}
            right={<ResultCount shown={rows.length} total={base.length} filtered={filtering} unit="fournisseur" />}
          />
        </div>
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <thead>
                <tr>
                  <SortTh col="nom" label="Fournisseur" />
                  <th className="hidden md:table-cell">Catégories</th>
                  <th className="hidden sm:table-cell">Contact</th>
                  <SortTh col="total" label={`Payé (${periodLabel})`} align="right" def defDir="desc" first="desc" className="!text-right" />
                  <SortTh col="dernier" label="Dernier achat" first="desc" />
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const a = agg.get(s.id);
                  const po = ordersOf.get(s.id) ?? 0;
                  return (
                    <tr key={s.id}>
                      <td className="min-w-[180px]">
                        <Link href={`/fournisseurs/${s.id}`} className="font-medium text-ink hover:text-brand-600 hover:underline">
                          {s.name}
                        </Link>
                        <span className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                          {(s.entity_ids ?? []).length ? <EntityDots ids={s.entity_ids} /> : "Tout le groupe"}
                          {s.payment_terms && <span>· {s.payment_terms}</span>}
                          {po > 0 && <Badge tone="amber">{po} commande{po > 1 ? "s" : ""}</Badge>}
                        </span>
                      </td>
                      <td className="hidden max-w-[220px] md:table-cell">
                        <span className="line-clamp-2 text-[13px] text-slate-600">{(s.categories ?? []).map((c) => EXPENSE_CATEGORY_LABEL[c as ExpenseCategory] ?? c).join(", ") || "—"}</span>
                      </td>
                      <td className="hidden whitespace-nowrap text-[13px] sm:table-cell">
                        <span className="block text-slate-700">{s.contact_name ?? "—"}</span>
                        <span className="block tabular-nums text-muted">{s.phone ?? s.whatsapp ?? s.email ?? ""}</span>
                      </td>
                      <td className="whitespace-nowrap text-right">
                        <span className="font-semibold tabular-nums text-ink">{a?.total ? mad(a.total) : "—"}</span>
                        {a?.n ? <span className="block text-xs tabular-nums text-muted">{a.n} dépense{a.n > 1 ? "s" : ""}</span> : null}
                      </td>
                      <td className="whitespace-nowrap text-[13px] tabular-nums text-slate-600">{a?.last ? fmtDate(a.last) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : filtering ? (
          <NoResults q={q} href={clearHref("/fournisseurs", sp, ["q", "etab", "cat"])} what="fournisseur" />
        ) : (
          <Empty
            icon={<Truck />}
            title={statut === "archives" ? "Aucun fournisseur archivé" : "Aucun fournisseur"}
            text="Créez les fiches de vos fournisseurs pour suivre ce que vous leur payez, établissement par établissement."
            action={
              <LinkButton href="/fournisseurs/nouveau" variant="brand">
                <Plus /> Nouveau fournisseur
              </LinkButton>
            }
          />
        )}
      </Card>

      {orphanList.length > 0 && statut === "actifs" && (
        <Card>
          <CardHeader title="Noms saisis sans fiche" subtitle={`Dépenses ${periodLabel} · créez la fiche pour les rattacher automatiquement`} />
          <ul className="divide-y divide-line border-t border-line">
            {orphanList.slice(0, 8).map((o) => (
              <li key={o.name} className="flex items-center gap-3 px-5 py-2.5 text-[13px]">
                <span className="min-w-0 flex-1 truncate text-slate-700">
                  {o.name} <span className="text-xs text-muted">· {o.n}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">{mad(o.total)}</span>
                <form action={createSupplierFromName.bind(null, o.name)}>
                  <button type="submit" className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[13px] font-medium text-brand-600 hover:bg-brand-50">
                    <Plus className="size-3.5" /> Créer la fiche
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
