import { redirect } from "next/navigation";
import { CalendarCheck, CircleDollarSign, FileBarChart, LogIn, Wallet } from "lucide-react";
import { getProfile, getScope } from "@/lib/auth";
import { entity } from "@/lib/entities";
import { fmtDate, mad, madShort } from "@/lib/utils";
import { Card, CardHeader, Empty, PageHeader } from "@/components/ui";
import { SolidTile } from "@/components/stat-tile";
import { DataTable, type DataColumn, type DataRow } from "@/components/data-table";
import { ExportMenu } from "@/components/data-table/export-menu";
import { ContactLink } from "@/components/quick-view/contact-link";
import { ClientReportForm } from "@/components/client-report/report-form";
import { ClientCard } from "@/components/client-report/client-card";
import { loadClientReport } from "@/components/client-report/load";
import { PDF_MAX_CLIENTS, sessionsLeft } from "@/components/client-report/doc";
import { readClientParams, toQuery } from "@/components/client-report/params";

export const metadata = { title: "Rapports clients" };

type SP = Record<string, string | string[] | undefined>;

/** Rapports détaillés (cartes) affichés à l'écran ; le PDF les contient tous */
const CARDS_MAX = 20;

const COLUMNS: DataColumn[] = [
  { key: "client", label: "Client", card: "title" },
  { key: "revenue", label: "Dépensé", numeric: true, exportKind: "money", card: "right" },
  { key: "purchases", label: "Achats", numeric: true, exportKind: "int" },
  { key: "visits", label: "Entrées", numeric: true, exportKind: "int" },
  { key: "honored", label: "RDV honorés", numeric: true, exportKind: "int" },
  { key: "absent", label: "Absences", numeric: true, exportKind: "int" },
  { key: "subs", label: "Abonnements actifs", numeric: true, exportKind: "int", hidden: true },
  { key: "sessions", label: "Séances restantes", numeric: true, exportKind: "int", hidden: true },
  { key: "due", label: "Reste dû", numeric: true, exportKind: "money" },
  { key: "points", label: "Points", numeric: true, exportKind: "int" },
  { key: "phone", label: "Téléphone", hidden: true },
];

export default async function ClientReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const [sp, me] = await Promise.all([searchParams, getProfile()]);
  if (me.role === "staff") redirect("/");
  const scope = await getScope();
  const usp = new URLSearchParams(toQuery(sp));
  const p = readClientParams(usp, scope);
  const data = p.mode ? await loadClientReport(scope, p) : null;
  const scopeEnts = scope.allowed.filter((e) => scope.ids.includes(e.id));
  const where = p.etab ? (entity(p.etab)?.short ?? "") : scope.current ? scope.current.short : scopeEnts.length > 1 ? `${scopeEnts.length} établissements` : (scopeEnts[0]?.short ?? "");

  const reports = data?.reports ?? [];
  const s = data?.summary;
  const multi = reports.length > 1;
  const qs = usp.toString();

  // Lien « rapport de ce client seul » (même période et établissement)
  const singleHref = (id: string) => {
    const n = new URLSearchParams(usp);
    n.delete("clients");
    n.delete("tous");
    n.set("client", id);
    return `/rapports-clients?${n.toString()}`;
  };

  const rows: DataRow[] = reports.map((r) => {
    const purchases = r.purchases.filter((x) => x.status !== "remboursee").length;
    const subs = r.subs.filter((x) => x.status === "actif").length;
    const left = sessionsLeft(r);
    return {
      id: r.contact.id,
      href: singleHref(r.contact.id),
      cells: {
        client: <ContactLink id={r.contact.id} name={r.contact.full_name} />,
        revenue: mad(r.revenue),
        purchases,
        visits: r.visits,
        honored: r.appts.honored,
        absent: r.appts.absent || null,
        subs: subs || null,
        sessions: left || null,
        due: r.due ? <span className="font-medium text-red-600">{mad(r.due)}</span> : null,
        points: r.loyalty.balance || null,
        phone: r.contact.phone,
      },
      values: {
        client: r.contact.full_name,
        revenue: Math.round(r.revenue),
        purchases,
        visits: r.visits,
        honored: r.appts.honored,
        absent: r.appts.absent,
        subs,
        sessions: left,
        due: Math.round(r.due),
        points: r.loyalty.balance,
        phone: r.contact.phone ?? "",
      },
    };
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Rapports clients"
        subtitle={p.mode ? `${p.period.label} · ${where}` : "Un client, une sélection ou tous, sur la période de votre choix"}
        actions={
          p.mode && reports.length ? (
            <ExportMenu href={`/rapports-clients/export?${qs}`} formats={["pdf", "xlsx", "csv"]} title="PDF : un rapport par client (sauts de page) · Excel : une feuille par rubrique" />
          ) : undefined
        }
      />

      <ClientReportForm
        key={qs}
        initialAll={p.mode === "tous"}
        initialSelected={p.mode === "un" || p.mode === "selection" ? reports.map((r) => ({ id: r.contact.id, full_name: r.contact.full_name, phone: r.contact.phone })) : []}
        period={p.period.id}
        from={p.period.from}
        to={p.period.to}
        etab={p.etab}
        entities={scopeEnts.map((e) => ({ id: e.id, short: e.short }))}
      />

      {!p.mode ? (
        <Card>
          <Empty
            icon={<FileBarChart />}
            title="Choisissez un ou plusieurs clients"
            text="Le rapport réunit identité, abonnements et séances restantes, entrées, rendez-vous, achats, reste dû, points de fidélité, prospects et notes. Export PDF (un rapport par client) et Excel."
          />
        </Card>
      ) : !reports.length ? (
        <Card>
          <Empty
            icon={<FileBarChart />}
            title={p.mode === "tous" ? "Aucun client actif sur cette période" : "Client introuvable dans votre périmètre"}
            text={p.mode === "tous" ? "Élargissez la période ou choisissez « Tous » les établissements." : "Vérifiez l'établissement sélectionné en haut de l'écran."}
          />
        </Card>
      ) : (
        <>
          {multi && s && (
            <>
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 [&>*]:min-w-0">
                <SolidTile label="Chiffre d'affaires" value={madShort(s.revenue)} sub={`${s.salesCount} achats · panier ${mad(s.basket)}`} icon={<CircleDollarSign />} />
                <SolidTile label="Fréquentation" value={s.visits} sub={`${reports.length} clients · ${Math.round((s.visits / reports.length) * 10) / 10} entrées / client`} icon={<LogIn />} />
                <SolidTile label="RDV honorés" value={s.honored} sub={`${s.absent} absences (${s.absentRate} %)${s.upcoming ? ` · ${s.upcoming} à venir` : ""}`} icon={<CalendarCheck />} />
                <SolidTile label="Reste dû" value={madShort(s.due)} sub={`${s.activeSubs} abonnements actifs · ${s.points} points`} icon={<Wallet />} />
              </div>

              <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr] [&>*]:min-w-0">
                <Card>
                  <CardHeader title="Top clients" subtitle={`Montant dépensé · ${p.period.label}`} />
                  {s.top.length ? (
                    <ol className="space-y-2.5 px-5 pb-5">
                      {s.top.map((r, i) => (
                        <li key={r.contact.id} className="flex items-center gap-3 text-[13px]">
                          <span className="w-5 shrink-0 text-right text-xs tabular-nums text-slate-400">{i + 1}</span>
                          <span className="min-w-0 flex-1 truncate">
                            <ContactLink id={r.contact.id} name={r.contact.full_name} />
                          </span>
                          <span className="shrink-0 text-xs tabular-nums text-muted">{r.visits} entrées</span>
                          <span className="w-24 shrink-0 text-right font-semibold tabular-nums">{mad(r.revenue)}</span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="px-5 pb-5 text-[13px] text-muted">Aucun achat sur la période.</p>
                  )}
                </Card>
                <Card>
                  <CardHeader title="Par établissement" subtitle="CA et entrées des clients du rapport" />
                  {s.byEntity.length ? (
                    <ul className="space-y-3 px-5 pb-5">
                      {s.byEntity.map((e) => {
                        const max = Math.max(1, ...s.byEntity.map((x) => x.revenue));
                        return (
                          <li key={e.id} className="text-[13px]">
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="flex min-w-0 items-center gap-2 truncate text-ink">
                                <span className="size-2 shrink-0 rounded-full" style={{ background: e.color }} />
                                {e.name}
                              </span>
                              <span className="shrink-0 tabular-nums">
                                <span className="font-semibold">{mad(e.revenue)}</span> <span className="text-xs text-muted">· {e.visits} entrées</span>
                              </span>
                            </div>
                            <span className="mt-1 block h-1 overflow-hidden rounded-full bg-slate-100">
                              <span className="block h-full rounded-full bg-brand-500" style={{ width: `${(e.revenue / max) * 100}%` }} />
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="px-5 pb-5 text-[13px] text-muted">Aucune activité sur la période.</p>
                  )}
                </Card>
              </div>

              <DataTable
                id="rapports-clients"
                columns={COLUMNS}
                rows={rows}
                unit={["client", "clients"]}
                exportName="rapport-clients"
                exportTitle={`Rapport clients — ${p.period.label}`}
                exportFilters={[
                  { label: "Période", value: `du ${fmtDate(`${p.period.from}T12:00:00Z`)} au ${fmtDate(`${p.period.to}T12:00:00Z`)}` },
                  ...(p.etab ? [{ label: "Établissement", value: entity(p.etab)?.short ?? p.etab }] : []),
                ]}
                selectable
              />
            </>
          )}

          <div className="space-y-3">
            {multi && (
              <p className="text-[13px] text-muted">
                Détail des {Math.min(CARDS_MAX, reports.length)} premiers clients (par montant dépensé)
                {reports.length > CARDS_MAX ? ` · les ${Math.min(reports.length, PDF_MAX_CLIENTS)} rapports individuels sont dans l'export PDF` : ""}.
              </p>
            )}
            {reports.slice(0, CARDS_MAX).map((r) => (
              <ClientCard key={r.contact.id} r={r} open={!multi} href={singleHref(r.contact.id)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
