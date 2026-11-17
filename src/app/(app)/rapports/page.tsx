import Link from "next/link";
import type { ReactNode } from "react";
import { BarChart3, CalendarX, CircleDollarSign, Crown, Filter, Receipt, Trophy, UserPlus } from "lucide-react";
import { getScope, requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { byId, monthKey } from "@/lib/data";
import type { Appointment, CatalogItem, CatalogKind, Contact, Lead, PayMethod, Sale, SaleItem } from "@/lib/types";
import { CATALOG_KIND_LABEL, PAY_LABEL, SOURCE_LABEL, addDaysKey, agadirToIso, cn, dayKey, fmtDate, mad, madShort, pct } from "@/lib/utils";
import { SolidTile } from "@/components/stat-tile";
import { Button, Card, CardHeader, Empty, Input, PageHeader, tableClass } from "@/components/ui";
import { ListToolbar } from "@/components/list-toolbar";
import { ContactLink } from "@/components/quick-view/contact-link";
import { matchesQuery } from "@/lib/search-match";
import { one } from "@/components/data-table/match";
import { SortTh } from "@/components/reports/sort-th";
import { NoResults, clearHref, readSort, sortRows } from "@/components/reports/list-kit";
import { EntityBadge, EntityDots } from "@/components/entity-icon";
import { AreaTrend, ConversionBars, Donut, HBars, StackedRevenue, type Slice } from "@/components/reports/charts";

export const metadata = { title: "Rapports" };

/* Palette sobre (bleu → gris) pour les répartitions qui ne sont pas par établissement */
const KIND_COLOR: Record<CatalogKind | "autre", string> = { abonnement: "#1a6d8e", prestation: "#74b2ca", produit: "#94a3b8", pack: "#12495f", autre: "#cbd5e1" };

function Panel({ title, subtitle, children, className }: { title: string; subtitle?: string; children: ReactNode; className?: string }) {
  return (
    <Card className={cn("min-w-0", className)}>
      <CardHeader title={title} subtitle={subtitle} />
      <div className="px-3 pb-5 sm:px-5">{children}</div>
    </Card>
  );
}

type SP = Record<string, string | string[] | undefined>;
type Month = { key: string; label: string };

const PERIODS = [
  { value: "mois", label: "Ce mois" },
  { value: "trimestre", label: "Trimestre" },
  { value: "annee", label: "Année" },
  { value: "12", label: "12 mois" },
  { value: "perso", label: "Personnalisée" },
];

const isDay = (v: string | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/** Mois (clé AAAA-MM) couverts par [from, to] inclus, 36 au plus */
function monthsBetween(from: string, to: string): Month[] {
  const out: Month[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const end = to.slice(0, 7);
  while (out.length < 36) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    const d = new Date(Date.UTC(y, m - 1, 15));
    out.push({ key, label: new Intl.DateTimeFormat("fr-FR", { month: "short", ...(from.slice(0, 4) !== to.slice(0, 4) && m === 1 ? { year: "2-digit" } : {}) }).format(d).replace(".", "") });
    if (key >= end) break;
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

/** Période demandée → bornes (jours inclus) + mois des graphiques */
function readPeriod(sp: SP, today: string) {
  const legacy = one(sp.mois) === "12" ? "12" : undefined;
  const id = PERIODS.some((p) => p.value === one(sp.periode)) ? one(sp.periode)! : (legacy ?? "6");
  const y = today.slice(0, 4);
  const mo = Number(today.slice(5, 7));
  let from: string;
  let to = today;
  let label: string;
  if (id === "mois") {
    from = `${today.slice(0, 7)}-01`;
    label = fmtDate(today, { month: "long", year: "numeric" });
  } else if (id === "trimestre") {
    const q = Math.floor((mo - 1) / 3);
    from = `${y}-${String(q * 3 + 1).padStart(2, "0")}-01`;
    label = `${q + 1}${q ? "e" : "er"} trimestre ${y}`;
  } else if (id === "annee") {
    from = `${y}-01-01`;
    label = `Année ${y}`;
  } else if (id === "perso") {
    const du = one(sp.du);
    const au = one(sp.au);
    from = isDay(du) ? du : `${today.slice(0, 7)}-01`;
    to = isDay(au) && au >= from ? au : today;
    label = `du ${fmtDate(from)} au ${fmtDate(to)}`;
  } else {
    const n = id === "12" ? 12 : 6;
    const d = new Date(Date.UTC(Number(y), mo - 1 - (n - 1), 1));
    from = d.toISOString().slice(0, 10);
    label = `${n} derniers mois`;
  }
  const months = monthsBetween(from, to);
  return { id, from, to, label, months, toExclusive: addDaysKey(to, 1) };
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const [sp] = await Promise.all([searchParams, requireManager()]);
  const scope = await getScope();
  const today = dayKey();
  const period = readPeriod(sp, today);
  const months = period.months;
  const n = months.length;
  const from = period.from;
  const fromIso = agadirToIso(from, "00:00");
  const toIso = agadirToIso(period.toExclusive, "00:00");
  const scopeEnts = scope.allowed.filter((e) => scope.ids.includes(e.id));
  const etab = scopeEnts.find((e) => e.id === one(sp.etab))?.id;
  const ids = etab ? [etab] : scope.ids;
  const ents = scopeEnts.filter((e) => ids.includes(e.id));
  const q = one(sp.q);
  const supabase = await createClient();

  const [{ data: salesRaw }, { data: catalogRaw }, { data: contactsRaw }, { data: leadsRaw }, { data: apptRaw }] = await Promise.all([
    supabase.from("sales").select("*").in("entity_id", ids).gte("sold_at", fromIso).lt("sold_at", toIso),
    supabase.from("catalog_items").select("*").in("entity_id", ids),
    supabase.from("contacts").select("*").overlaps("entity_ids", ids),
    supabase.from("leads").select("*").in("entity_id", ids),
    supabase.from("appointments").select("*").in("entity_id", ids).gte("starts_at", fromIso).lt("starts_at", toIso).lte("starts_at", new Date().toISOString()),
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
  const byPay = [...payMap.entries()].map(([k, v]) => ({ name: PAY_LABEL[k], value: v })).sort((a, b) => b.value - a.value);

  /* Nouveaux contacts */
  const inRange = (iso: string) => iso >= fromIso && iso < toIso;
  const newContacts = months.map((m) => ({ label: m.label, value: contacts.filter((c) => inRange(c.created_at) && monthKey(c.created_at) === m.key).length }));
  const newTotal = newContacts.reduce((a, m) => a + m.value, 0);

  /* Conversion des prospects par source (clôturés sur la période) */
  const closed = leads.filter((l) => (l.stage === "gagne" || l.stage === "perdu") && l.updated_at >= from && l.updated_at < toIso);
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
      return { name: e.short, value: pct(abs, done.length), hint: `${abs} absence${abs > 1 ? "s" : ""} sur ${done.length} RDV`, n: done.length };
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
  const topItems = [...topMap.values()].filter((t) => matchesQuery(q, t.label)).sort((a, b) => b.value - a.value).slice(0, 10);
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
  const clientSort = readSort(sp, ["client", "achats", "ca"] as const, "ca", "desc");
  const ranked = [...clientMap.entries()]
    .map(([id, v]) => ({ id, ...v, contact: contactById.get(id) }))
    .filter((c) => matchesQuery(q, c.contact?.full_name, c.contact?.phone, c.contact?.email))
    .sort((a, b) => (clientSort.key === "achats" ? b.count - a.count || b.value - a.value : b.value - a.value))
    .slice(0, 10);
  const topClients = clientSort.key === "client" ? sortRows(ranked, (c) => c.contact?.full_name ?? "", clientSort.dir) : clientSort.dir === "asc" ? [...ranked].reverse() : ranked;
  const filtersActive = !!(q || etab || one(sp.periode));
  const multi = byEntity.length > 1;

  return (
    <div className="space-y-5">
      <PageHeader title="Rapports" subtitle={`${etab ? ents[0]!.name : scope.current ? scope.current.name : `Groupe · ${ents.length} établissements`} · ${period.label}`} />

      <div className="space-y-2.5">
        <ListToolbar
          className="mb-0"
          placeholder="Client ou prestation (tops)…"
          filters={[
            { param: "periode", label: "6 mois", options: PERIODS },
            ...(scopeEnts.length > 1 ? [{ param: "etab", label: "Tous", options: scopeEnts.map((e) => ({ value: e.id, label: e.short })) }] : []),
          ]}
        />
        {period.id === "perso" && (
          <form action="/rapports" className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="periode" value="perso" />
            {etab && <input type="hidden" name="etab" value={etab} />}
            {q && <input type="hidden" name="q" value={q} />}
            <label className="text-[13px] text-muted">
              Du
              <Input type="date" name="du" defaultValue={period.from} max={today} className="mt-1 h-9 w-40" required />
            </label>
            <label className="text-[13px] text-muted">
              Au
              <Input type="date" name="au" defaultValue={period.to} max={today} className="mt-1 h-9 w-40" required />
            </label>
            <Button type="submit" variant="brand" className="h-9">
              Appliquer
            </Button>
          </form>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 [&>*]:min-w-0">
        <SolidTile
          label={period.id === "mois" ? "CA du mois" : `CA · ${period.label}`}
          value={madShort(total)}
          sub={`Ce mois ${madShort(lastM)}`}
          icon={<CircleDollarSign />}
          series={byMonth}
          trendLabel={prevM ? `${lastM >= prevM ? "+" : ""}${Math.round(((lastM - prevM) / prevM) * 100)} %` : undefined}
          trendUp={prevM ? lastM >= prevM : null}
        />
        <SolidTile label="Ventes" value={sales.length} sub={`Panier moyen ${mad(avgTicket)}`} icon={<Receipt />} />
        <SolidTile label="Nouveaux contacts" value={newTotal} sub={n > 1 ? `${Math.round(newTotal / n)} par mois` : period.label} icon={<UserPlus />} series={newContacts.map((m) => m.value)} />
        <SolidTile label="Prospects convertis" value={`${pct(won, closed.length)} %`} sub={`${won} gagnés sur ${closed.length}`} icon={<Filter />} />
      </div>

      {sales.length === 0 ? (
        <Card>
          <Empty
            icon={<BarChart3 />}
            title={filtersActive ? "Aucune vente sur cette période" : "Pas encore de ventes sur la période"}
            text="Les graphiques se rempliront dès les premiers encaissements."
            action={
              <Link href="/caisse" className="text-[13px] font-medium text-brand-600 hover:underline">
                Ouvrir la caisse
              </Link>
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr] [&>*]:min-w-0">
            <Panel title="Chiffre d'affaires mensuel" subtitle={ents.length > 1 ? "Par établissement" : undefined}>
              <StackedRevenue data={stacked} series={ents.map((e) => ({ key: e.id, name: e.short, color: e.color }))} />
            </Panel>
            {multi ? (
              <Panel title="Répartition du CA" subtitle="Part de chaque établissement">
                <Donut data={byEntity} centerLabel={n > 1 ? `${n} mois` : "ce mois"} muted />
              </Panel>
            ) : (
              <Panel title="CA par type" subtitle="Abonnements, prestations, produits, packs">
                <Donut data={byKind} centerLabel="vendus" />
              </Panel>
            )}
          </div>

          <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
            {multi && (
              <Panel title="CA par type" subtitle="Abonnements, prestations, produits, packs">
                <Donut data={byKind} centerLabel="vendus" />
              </Panel>
            )}
            <Panel title="Modes de paiement" subtitle="Montant encaissé par moyen" className={multi ? undefined : "lg:col-span-2"}>
              <HBars data={byPay} />
            </Panel>
          </div>
        </>
      )}

      <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
        <Panel title="Nouveaux contacts" subtitle="Clients et prospects créés chaque mois">
          <AreaTrend data={newContacts} name="Nouveaux contacts" />
        </Panel>
        <Panel title="Conversion des prospects" subtitle={`Gagnés et perdus par source · ${pct(won, closed.length)} % au total`}>
          {conversion.length ? <ConversionBars data={conversion} /> : <Empty icon={<Filter />} title="Aucun prospect clôturé" />}
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
        <Panel title="Absences aux rendez-vous" subtitle={apptDone.length ? `${noShowAll} % des RDV passés · par établissement` : "Part des RDV passés sans le client"}>
          {noShow.length ? <HBars data={noShow} unit="pct" color="#94a3b8" /> : <Empty icon={<CalendarX />} title="Aucun rendez-vous passé" />}
        </Panel>

        <Panel title="Top 10 des ventes" subtitle="Prestations et articles qui rapportent le plus">
          {topItems.length ? (
            <ol className="space-y-3">
              {topItems.map((t, i) => (
                <li key={t.label + i} className="flex items-center gap-3">
                  <span className="w-5 shrink-0 text-right text-xs font-medium tabular-nums text-slate-400">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-ink">
                        {t.entity && <EntityDots ids={[t.entity]} />}
                        <span className="truncate">{t.label}</span>
                      </p>
                      <p className="shrink-0 text-[13px] font-semibold tabular-nums">{mad(t.value)}</p>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="h-1 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <span className="block h-full rounded-full bg-brand-500" style={{ width: `${(t.value / topItemMax) * 100}%` }} />
                      </span>
                      <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted">× {t.qty}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            q ? <NoResults q={q} href={clearHref("/rapports", sp, ["q"])} what="article" /> : <Empty icon={<Trophy />} title="Aucune vente détaillée" />
          )}
        </Panel>
      </div>

      <Card className="overflow-hidden">
        <CardHeader title="Top 10 des clients" subtitle={`Chiffre d'affaires · ${period.label}`} />
        {topClients.length ? (
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className="w-10">#</th>
                  <SortTh col="client" label="Client" />
                  <th className="hidden sm:table-cell">Établissement</th>
                  <SortTh col="achats" label="Achats" align="right" first="desc" />
                  <SortTh col="ca" label="CA" align="right" first="desc" def defDir="desc" />
                </tr>
              </thead>
              <tbody>
                {topClients.map((c, i) => (
                  <tr key={c.id}>
                    <td className="tabular-nums text-slate-400">{i + 1}</td>
                    <td className="max-w-[220px]">
                      <ContactLink id={c.id} name={c.contact?.full_name ?? "Client"} className="block truncate" />
                    </td>
                    <td className="hidden sm:table-cell">{c.contact?.entity_ids[0] && <EntityBadge id={c.contact.entity_ids[0]} />}</td>
                    <td className="text-right tabular-nums text-slate-600">{c.count}</td>
                    <td className="whitespace-nowrap text-right font-semibold tabular-nums">{mad(c.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          q ? <NoResults q={q} href={clearHref("/rapports", sp, ["q"])} what="client" /> : <Empty icon={<Crown />} title="Aucun client sur la période" />
        )}
      </Card>
    </div>
  );
}
