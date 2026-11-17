import Link from "next/link";
import type { ReactNode } from "react";
import { BarChart3, CalendarX, CircleDollarSign, Crown, Filter, PieChart, Receipt, ShoppingBag, Trophy, UserPlus, Wallet } from "lucide-react";
import { getScope, requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { byId, lastMonths, monthKey } from "@/lib/data";
import type { Appointment, CatalogItem, CatalogKind, Contact, Lead, PayMethod, Sale, SaleItem } from "@/lib/types";
import { CATALOG_KIND_LABEL, PAY_LABEL, SOURCE_LABEL, agadirToIso, cn, mad, madShort, pct } from "@/lib/utils";
import { SolidTile } from "@/components/stat-tile";
import { Avatar, Card, CardHeader, Empty, PageHeader } from "@/components/ui";
import { EntityBadge, EntityMark } from "@/components/entity-icon";
import { AreaTrend, ConversionBars, Donut, HBars, StackedRevenue, type Slice } from "@/components/reports/charts";

export const metadata = { title: "Rapports" };

const KIND_COLOR: Record<CatalogKind | "autre", string> = { abonnement: "#1a6d8e", prestation: "#7c4dcc", produit: "#e8782a", pack: "#059669", autre: "#94a3b8" };
const PAY_COLOR: Record<PayMethod, string> = { especes: "#059669", carte: "#1a6d8e", virement: "#7c4dcc", cheque: "#e9a213", en_ligne: "#e8782a" };

function Panel({ title, subtitle, icon, children, className }: { title: string; subtitle?: string; icon: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={cn("min-w-0 animate-fade-up", className)}>
      <CardHeader title={title} subtitle={subtitle} icon={icon} />
      <div className="px-3 pb-5 sm:px-5">{children}</div>
    </Card>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ mois?: string }> }) {
  const [{ mois }] = await Promise.all([searchParams, requireManager()]);
  const scope = await getScope();
  const n = mois === "12" ? 12 : 6;
  const months = lastMonths(n);
  const from = `${months[0]!.key}-01`;
  const fromIso = agadirToIso(from, "00:00");
  const ents = scope.allowed.filter((e) => scope.ids.includes(e.id));
  const supabase = await createClient();

  const [{ data: salesRaw }, { data: catalogRaw }, { data: contactsRaw }, { data: leadsRaw }, { data: apptRaw }] = await Promise.all([
    supabase.from("sales").select("*").in("entity_id", scope.ids).gte("sold_at", fromIso),
    supabase.from("catalog_items").select("*").in("entity_id", scope.ids),
    supabase.from("contacts").select("*").overlaps("entity_ids", scope.ids),
    supabase.from("leads").select("*").in("entity_id", scope.ids),
    supabase.from("appointments").select("*").in("entity_id", scope.ids).gte("starts_at", fromIso).lte("starts_at", new Date().toISOString()),
  ]);
  const sales = ((salesRaw ?? []) as Sale[]).filter((s) => s.status !== "remboursee");
  const saleIds = sales.map((s) => s.id);
  const { data: itemsRaw } = saleIds.length ? await supabase.from("sale_items").select("*").in("sale_id", saleIds) : { data: [] };
  const items = (itemsRaw ?? []) as SaleItem[];
  const catalog = byId(catalogRaw as CatalogItem[]);
  const contacts = (contactsRaw ?? []) as Contact[];
  const contactById = byId(contacts);
  const leads = (leadsRaw ?? []) as Lead[];
  const appts = (apptRaw ?? []) as Appointment[];
  const saleById = byId(sales);

  /* CA */
  const total = sales.reduce((a, s) => a + Number(s.total_mad), 0);
  const byMonth = months.map((m) => sales.filter((s) => monthKey(s.sold_at) === m.key).reduce((a, s) => a + Number(s.total_mad), 0));
  const stacked = months.map((m) => {
    const row: Record<string, string | number> = { label: m.label };
    for (const e of ents) row[e.id] = sales.filter((s) => s.entity_id === e.id && monthKey(s.sold_at) === m.key).reduce((a, s) => a + Number(s.total_mad), 0);
    return row;
  });
  const byEntity: Slice[] = ents
    .map((e) => ({ name: e.short, color: e.color, value: sales.filter((s) => s.entity_id === e.id).reduce((a, s) => a + Number(s.total_mad), 0) }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);
  const avgTicket = sales.length ? total / sales.length : 0;
  const lastM = byMonth.at(-1) ?? 0;
  const prevM = byMonth.at(-2) ?? 0;

  /* CA par type */
  const kindSum = new Map<CatalogKind | "autre", number>();
  for (const it of items) {
    const k = (it.item_id && catalog.get(it.item_id)?.kind) || "autre";
    kindSum.set(k, (kindSum.get(k) ?? 0) + Number(it.qty) * Number(it.unit_price_mad));
  }
  const byKind: Slice[] = [...kindSum.entries()]
    .map(([k, v]) => ({ name: k === "autre" ? "Autre" : CATALOG_KIND_LABEL[k], value: Math.round(v), color: KIND_COLOR[k] }))
    .sort((a, b) => b.value - a.value);

  /* Modes de paiement */
  const payMap = new Map<PayMethod, number>();
  for (const s of sales) payMap.set(s.method, (payMap.get(s.method) ?? 0) + Number(s.total_mad));
  const byPay: Slice[] = [...payMap.entries()].map(([k, v]) => ({ name: PAY_LABEL[k], value: v, color: PAY_COLOR[k] })).sort((a, b) => b.value - a.value);

  /* Nouveaux contacts */
  const newContacts = months.map((m) => ({ label: m.label, value: contacts.filter((c) => monthKey(c.created_at) === m.key).length }));
  const newTotal = newContacts.reduce((a, m) => a + m.value, 0);

  /* Conversion des prospects par source (clôturés sur la période) */
  const closed = leads.filter((l) => (l.stage === "gagne" || l.stage === "perdu") && l.updated_at >= from);
  const won = closed.filter((l) => l.stage === "gagne").length;
  const sources = [...new Set(closed.map((l) => l.source))];
  const conversion = sources
    .map((s) => {
      const g = closed.filter((l) => l.source === s && l.stage === "gagne").length;
      const p = closed.filter((l) => l.source === s && l.stage === "perdu").length;
      return { source: SOURCE_LABEL[s] ?? s, gagnes: g, perdus: p, taux: pct(g, g + p) };
    })
    .sort((a, b) => b.gagnes + b.perdus - (a.gagnes + a.perdus));

  /* Absences aux RDV */
  const noShow = ents
    .map((e) => {
      const done = appts.filter((a) => a.entity_id === e.id && (a.status === "arrive" || a.status === "termine" || a.status === "absent"));
      const abs = done.filter((a) => a.status === "absent").length;
      return { name: e.short, color: e.color, value: pct(abs, done.length), hint: `${abs} absence${abs > 1 ? "s" : ""} sur ${done.length} RDV`, n: done.length };
    })
    .filter((d) => d.n > 0)
    .sort((a, b) => b.value - a.value);
  const apptDone = appts.filter((a) => ["arrive", "termine", "absent"].includes(a.status));
  const noShowAll = pct(apptDone.filter((a) => a.status === "absent").length, apptDone.length);

  /* Top prestations / articles */
  const topMap = new Map<string, { label: string; qty: number; value: number; entity: string }>();
  for (const it of items) {
    const key = it.item_id ?? it.label;
    const cur = topMap.get(key) ?? { label: it.item_id ? (catalog.get(it.item_id)?.name ?? it.label) : it.label, qty: 0, value: 0, entity: saleById.get(it.sale_id)?.entity_id ?? "" };
    cur.qty += Number(it.qty);
    cur.value += Number(it.qty) * Number(it.unit_price_mad);
    topMap.set(key, cur);
  }
  const topItems = [...topMap.values()].sort((a, b) => b.value - a.value).slice(0, 10);
  const topItemMax = Math.max(1, ...topItems.map((t) => t.value));

  /* Top clients */
  const clientMap = new Map<string, { value: number; count: number }>();
  for (const s of sales) {
    if (!s.contact_id) continue;
    const cur = clientMap.get(s.contact_id) ?? { value: 0, count: 0 };
    cur.value += Number(s.total_mad);
    cur.count += 1;
    clientMap.set(s.contact_id, cur);
  }
  const topClients = [...clientMap.entries()]
    .map(([id, v]) => ({ id, ...v, contact: contactById.get(id) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  const period = (v: 6 | 12) => (
    <Link
      href={`/rapports?mois=${v}`}
      className={cn("inline-flex h-9 items-center rounded-lg px-3 text-sm font-semibold transition", n === v ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink")}
    >
      {v} mois
    </Link>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rapports"
        subtitle={`${scope.current ? scope.current.name : `Groupe · ${ents.length} établissements`} · ${months[0]!.label} à ${months.at(-1)!.label}`}
        actions={
          <div className="flex rounded-xl border border-line bg-canvas p-1">
            {period(6)}
            {period(12)}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0">
        <SolidTile
          tone="brand"
          label={`CA sur ${n} mois`}
          value={madShort(total)}
          sub={`Ce mois-ci : ${mad(lastM)}`}
          icon={<CircleDollarSign />}
          watermark={<CircleDollarSign />}
          series={byMonth}
          trendLabel={prevM ? `${lastM >= prevM ? "+" : ""}${Math.round(((lastM - prevM) / prevM) * 100)} % vs mois dernier` : undefined}
          trendUp={prevM ? lastM >= prevM : null}
        />
        <SolidTile tone="accent" label="Ventes" value={sales.length} sub={`Panier moyen : ${mad(avgTicket)}`} icon={<Receipt />} watermark={<Receipt />} />
        <SolidTile tone="violet" label="Nouveaux contacts" value={newTotal} sub={`${Math.round(newTotal / n)} par mois en moyenne`} icon={<UserPlus />} watermark={<UserPlus />} series={newContacts.map((m) => m.value)} />
        <SolidTile
          tone="green"
          label="Prospects convertis"
          value={`${pct(won, closed.length)} %`}
          sub={`${won} gagnés sur ${closed.length} clôturés`}
          icon={<Filter />}
          watermark={<Filter />}
          trendLabel={apptDone.length ? `${noShowAll} % d'absences RDV` : undefined}
          trendUp={null}
        />
      </div>

      {sales.length === 0 ? (
        <Card>
          <Empty icon={<BarChart3 className="size-6" />} title="Pas encore de ventes sur la période" text="Les graphiques se rempliront dès les premiers encaissements." />
        </Card>
      ) : (
        <>
          <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr] [&>*]:min-w-0">
            <Panel title="Chiffre d'affaires mensuel" subtitle="Par établissement" icon={<BarChart3 className="size-4" />}>
              <StackedRevenue data={stacked} series={ents.map((e) => ({ key: e.id, name: e.short, color: e.color }))} />
            </Panel>
            <Panel title="Répartition du CA" subtitle="Part de chaque établissement" icon={<PieChart className="size-4" />}>
              <Donut data={byEntity} centerLabel={`${n} mois`} />
            </Panel>
          </div>

          <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
            <Panel title="CA par type" subtitle="Abonnements, prestations, produits, packs" icon={<ShoppingBag className="size-4" />}>
              <Donut data={byKind} centerLabel="vendus" />
            </Panel>
            <Panel title="Modes de paiement" subtitle="Montant encaissé par moyen de paiement" icon={<Wallet className="size-4" />}>
              <HBars data={byPay} />
            </Panel>
          </div>
        </>
      )}

      <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <Panel title="Nouveaux contacts" subtitle="Clients et prospects créés chaque mois" icon={<UserPlus className="size-4" />}>
          <AreaTrend data={newContacts} color="#7c4dcc" name="Nouveaux contacts" />
        </Panel>
        <Panel title="Conversion des prospects" subtitle="Gagnés et perdus par source, sur la période" icon={<Filter className="size-4" />}>
          {conversion.length ? <ConversionBars data={conversion} /> : <Empty icon={<Filter className="size-6" />} title="Aucun prospect clôturé" />}
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <Panel title="Absences aux rendez-vous" subtitle="Part des RDV passés où le client n'est pas venu" icon={<CalendarX className="size-4" />}>
          {noShow.length ? <HBars data={noShow} unit="pct" /> : <Empty icon={<CalendarX className="size-6" />} title="Aucun rendez-vous passé" />}
        </Panel>

        <Panel title="Top 10 des ventes" subtitle="Prestations et articles qui rapportent le plus" icon={<Trophy className="size-4" />}>
          {topItems.length ? (
            <ol className="space-y-2.5">
              {topItems.map((t, i) => (
                <li key={t.label + i} className="flex items-center gap-3">
                  <span className={cn("grid size-6 shrink-0 place-items-center rounded-full font-display text-[11px] font-extrabold", i < 3 ? "bg-accent-500 text-white" : "bg-canvas text-slate-500")}>{i + 1}</span>
                  <EntityMark id={t.entity} size={28} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-sm font-semibold">{t.label}</p>
                      <p className="shrink-0 font-display text-[13px] font-bold">{mad(t.value)}</p>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-canvas">
                        <span className="block h-full rounded-full bg-brand-500" style={{ width: `${(t.value / topItemMax) * 100}%` }} />
                      </span>
                      <span className="w-14 shrink-0 text-right text-[11px] text-muted">× {t.qty}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <Empty icon={<Trophy className="size-6" />} title="Aucune vente détaillée" />
          )}
        </Panel>
      </div>

      <Panel title="Top 10 des clients" subtitle={`Chiffre d'affaires sur ${n} mois`} icon={<Crown className="size-4" />}>
        {topClients.length ? (
          <ol className="grid gap-x-8 gap-y-1 md:grid-cols-2 [&>*]:min-w-0">
            {topClients.map((c, i) => (
              <li key={c.id}>
                <Link href={`/contacts/${c.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-canvas">
                  <span className={cn("w-5 shrink-0 text-center font-display text-sm font-extrabold", i < 3 ? "text-accent-500" : "text-slate-400")}>{i + 1}</span>
                  <Avatar name={c.contact?.full_name ?? "?"} size={34} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{c.contact?.full_name ?? "Client"}</p>
                    <p className="flex items-center gap-1.5 truncate text-xs text-muted">
                      {c.contact?.entity_ids[0] && <EntityBadge id={c.contact.entity_ids[0]} className="hidden sm:inline-flex" />}
                      {c.count} achat{c.count > 1 ? "s" : ""}
                    </p>
                  </div>
                  <span className="shrink-0 font-display text-sm font-extrabold text-brand-600">{mad(c.value)}</span>
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <Empty icon={<Crown className="size-6" />} title="Aucun client sur la période" />
        )}
      </Panel>
    </div>
  );
}
