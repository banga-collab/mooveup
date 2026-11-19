import Link from "next/link";
import type { ReactNode } from "react";
import { BarChart3, CalendarX, CircleDollarSign, Crown, Filter, Receipt, Trophy, UserPlus } from "lucide-react";
import { getScope, requireManager } from "@/lib/auth";
import { cn, mad, madShort, pct } from "@/lib/utils";
import { SolidTile } from "@/components/stat-tile";
import { Button, Card, CardHeader, Empty, Input, PageHeader, tableClass } from "@/components/ui";
import { ListToolbar } from "@/components/list-toolbar";
import { ContactLink } from "@/components/quick-view/contact-link";
import { SortTh } from "@/components/reports/sort-th";
import { NoResults, clearHref } from "@/components/reports/list-kit";
import { PERIODS, loadReports } from "@/components/reports/load";
import { ExportMenu } from "@/components/data-table/export-menu";
import { EntityBadge, EntityDots } from "@/components/entity-icon";
import { AreaTrend, ConversionBars, Donut, HBars, StackedRevenue } from "@/components/reports/charts";

export const metadata = { title: "Rapports" };

function Panel({ title, subtitle, children, className }: { title: string; subtitle?: string; children: ReactNode; className?: string }) {
  return (
    <Card className={cn("min-w-0", className)}>
      <CardHeader title={title} subtitle={subtitle} />
      <div className="px-3 pb-5 sm:px-5">{children}</div>
    </Card>
  );
}

type SP = Record<string, string | string[] | undefined>;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const [sp] = await Promise.all([searchParams, requireManager()]);
  const scope = await getScope();
  const {
    today,
    period,
    n,
    etab,
    ents,
    scopeEnts,
    q,
    sales,
    total,
    byMonth,
    stacked,
    byEntity,
    avgTicket,
    lastM,
    prevM,
    byKind,
    byPay,
    newContacts,
    newTotal,
    closed,
    won,
    conversion,
    noShow,
    apptDone,
    noShowAll,
    topItems,
    topItemMax,
    topClients,
    filtersActive,
    multi,
  } = await loadReports(sp, scope);
  const exportQs = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" && v && k !== "tri" && k !== "ordre" ? [[k, v]] : []))).toString();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Rapports"
        subtitle={`${etab ? ents[0]!.name : scope.current ? scope.current.name : `Groupe · ${ents.length} établissements`} · ${period.label}`}
        actions={<ExportMenu href={`/rapports/export${exportQs ? `?${exportQs}` : ""}`} formats={["pdf", "xlsx", "csv"]} title="Exporter le rapport : PDF mis en page (graphiques et tableaux) ou chiffres en Excel" />}
      />

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
