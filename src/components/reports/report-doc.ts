import { entity } from "@/lib/entities";
import { mad, madShort, pct } from "@/lib/utils";
import type { ExportFilter, ReportDoc } from "@/lib/export/types";
import type { ReportsData } from "./load";

/** Rapport /rapports → document d'export (PDF mis en page + Excel des chiffres) */
export function reportsDoc(d: ReportsData): ReportDoc {
  const filters: ExportFilter[] = [{ label: "Période", value: d.period.label }];
  if (d.etab) filters.push({ label: "Établissement", value: d.ents[0]?.name ?? d.etab });
  if (d.q) filters.push({ label: "Recherche (tops)", value: `« ${d.q} »` });
  const where = d.etab ? (d.ents[0]?.name ?? "") : d.scope.current ? d.scope.current.name : `Groupe · ${d.ents.length} établissements`;
  const labels = d.months.map((m) => m.label);

  return {
    title: "Rapports",
    subtitle: `${where} · ${d.period.label}`,
    fileName: `rapports_${d.period.from}_${d.period.to}`,
    filters,
    count: d.sales.length,
    countLabel: d.sales.length > 1 ? "ventes analysées" : "vente analysée",
    sections: [
      {
        title: "Synthèse",
        subtitle: `Du ${d.period.from.split("-").reverse().join("/")} au ${d.period.to.split("-").reverse().join("/")}`,
        blocks: [
          {
            type: "kpis",
            items: [
              { label: d.period.id === "mois" ? "CA du mois" : "Chiffre d'affaires", value: mad(d.total), sub: `Ce mois ${madShort(d.lastM)}${d.prevM ? ` · ${d.lastM >= d.prevM ? "+" : ""}${Math.round(((d.lastM - d.prevM) / d.prevM) * 100)} % vs mois précédent` : ""}` },
              { label: "Ventes", value: String(d.sales.length), sub: `Panier moyen ${mad(d.avgTicket)}` },
              { label: "Nouveaux contacts", value: String(d.newTotal), sub: d.n > 1 ? `${Math.round(d.newTotal / d.n)} par mois` : d.period.label },
              { label: "Prospects convertis", value: `${pct(d.won, d.closed.length)} %`, sub: `${d.won} gagnés sur ${d.closed.length}` },
            ],
          },
        ],
      },
      {
        title: "Chiffre d'affaires",
        blocks: [
          {
            type: "chart",
            title: "CA mensuel",
            subtitle: d.ents.length > 1 ? "Par établissement" : undefined,
            chart: { type: "bars", labels, stacked: true, unit: "mad", series: d.ents.map((e) => ({ name: e.short, color: d.ents.length > 1 ? e.color : "#1a6d8e", values: d.stacked.map((r) => Number(r[e.id] ?? 0)) })) },
          },
          ...(d.multi
            ? [{ type: "chart" as const, half: true, title: "Répartition du CA", subtitle: "Part de chaque établissement", chart: { type: "donut" as const, items: d.byEntity.map((x) => ({ label: x.name, value: x.value, color: x.color })), center: d.n > 1 ? `${d.n} mois` : "ce mois", unit: "mad" as const } }]
            : []),
          { type: "chart", half: true, title: "CA par type", subtitle: "Abonnements, prestations, produits, packs", chart: { type: "donut", items: d.byKind.map((x) => ({ label: x.name, value: x.value, color: x.color })), center: "vendus", unit: "mad" } },
          { type: "chart", half: true, title: "Modes de paiement", subtitle: "Montant encaissé par moyen", chart: { type: "hbars", unit: "mad", items: d.byPay.map((x) => ({ label: x.name, value: x.value })) } },
        ],
      },
      {
        title: "Clients et prospects",
        blocks: [
          { type: "chart", half: true, title: "Nouveaux contacts", subtitle: "Clients et prospects créés chaque mois", chart: { type: "line", labels, unit: "num", series: [{ name: "Nouveaux contacts", values: d.newContacts.map((m) => m.value), area: true }] } },
          {
            type: "chart",
            half: true,
            title: "Absences aux rendez-vous",
            subtitle: d.apptDone.length ? `${d.noShowAll} % des RDV passés` : "Aucun rendez-vous passé",
            chart: { type: "hbars", unit: "pct", items: d.noShow.map((x) => ({ label: x.name, value: x.value, color: "#94a3b8", hint: x.hint })) },
          },
          {
            type: "table",
            title: "Conversion des prospects par source",
            subtitle: `${pct(d.won, d.closed.length)} % au total`,
            empty: "Aucun prospect clôturé sur la période",
            table: {
              columns: [
                { key: "source", label: "Source" },
                { key: "gagnes", label: "Gagnés", kind: "int" },
                { key: "perdus", label: "Perdus", kind: "int" },
                { key: "taux", label: "Taux de réussite", kind: "pct" },
              ],
              rows: d.conversion.map((c) => ({ ...c })),
            },
          },
        ],
      },
      {
        title: "Classements",
        blocks: [
          {
            type: "table",
            title: "Top 10 des ventes",
            subtitle: "Prestations et articles qui rapportent le plus",
            empty: "Aucune vente détaillée",
            table: {
              columns: [
                { key: "rank", label: "#", kind: "int" },
                { key: "label", label: "Article / prestation" },
                { key: "entity", label: "Établissement" },
                { key: "qty", label: "Quantité", kind: "int" },
                { key: "value", label: "CA", kind: "money" },
              ],
              rows: d.topItems.map((t, i) => ({ rank: i + 1, label: t.label, entity: entity(t.entity)?.short ?? "", qty: t.qty, value: Math.round(t.value) })),
            },
          },
          {
            type: "table",
            title: "Top 10 des clients",
            subtitle: `Chiffre d'affaires · ${d.period.label}`,
            empty: "Aucun client sur la période",
            table: {
              columns: [
                { key: "rank", label: "#", kind: "int" },
                { key: "client", label: "Client" },
                { key: "phone", label: "Téléphone" },
                { key: "entity", label: "Établissement" },
                { key: "count", label: "Achats", kind: "int" },
                { key: "value", label: "CA", kind: "money" },
              ],
              rows: d.topClients.map((c, i) => ({
                rank: i + 1,
                client: c.contact?.full_name ?? "Client",
                phone: c.contact?.phone ?? "",
                entity: c.contact?.entity_ids[0] ? (entity(c.contact.entity_ids[0])?.short ?? "") : "",
                count: c.count,
                value: Math.round(c.value),
              })),
            },
          },
        ],
      },
    ],
  };
}
