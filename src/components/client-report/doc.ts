import { entity } from "@/lib/entities";
import {
  APPT_STATUS_LABEL,
  CONTACT_STATUS_LABEL,
  SALE_STATUS_LABEL,
  SOURCE_LABEL,
  STAGE_LABEL,
  SUB_STATUS_LABEL,
  age,
  fmtDate,
  fmtTime,
  mad,
} from "@/lib/utils";
import type { ExportColumn, ExportFilter, ExportRow, ExportSheet, ReportBlock, ReportDoc, ReportSection } from "@/lib/export/types";
import type { ClientReport, ClientReportData } from "./load";
import type { Period } from "./period";

/** Nombre maximal de rapports individuels dans un PDF */
export const PDF_MAX_CLIENTS = 300;
const LIST_MAX = 40;

const d2 = (iso: string) => fmtDate(iso, { day: "2-digit", month: "2-digit", year: "numeric" });
const short = (id: string | null | undefined) => (id ? (entity(id)?.short ?? id) : "");
const plural = (n: number, s: string, p = `${s}s`) => `${n} ${n > 1 ? p : s}`;

export const sessionsLeft = (r: ClientReport) => r.subs.filter((s) => s.status === "actif" && s.sessions_left !== null).reduce((a, s) => a + Number(s.sessions_left), 0);
const hasPacks = (r: ClientReport) => r.subs.some((s) => s.status === "actif" && s.sessions_left !== null);
const openLeads = (r: ClientReport) => r.leads.filter((l) => l.stage !== "gagne" && l.stage !== "perdu");

/* ---------- Colonnes Excel ---------- */

const C_CLIENTS: ExportColumn[] = [
  { key: "name", label: "Client" },
  { key: "phone", label: "Téléphone" },
  { key: "email", label: "E-mail" },
  { key: "status", label: "Statut" },
  { key: "entities", label: "Établissements" },
  { key: "since", label: "Client depuis" },
  { key: "revenue", label: "Dépensé sur la période", kind: "money" },
  { key: "purchases", label: "Achats", kind: "int" },
  { key: "visits", label: "Entrées", kind: "int" },
  { key: "lastVisit", label: "Dernière entrée" },
  { key: "honored", label: "RDV honorés", kind: "int" },
  { key: "absent", label: "RDV absents", kind: "int" },
  { key: "upcoming", label: "RDV à venir", kind: "int" },
  { key: "subs", label: "Abonnements actifs" },
  { key: "sessions", label: "Séances restantes", kind: "int" },
  { key: "due", label: "Reste dû", kind: "money" },
  { key: "points", label: "Points fidélité", kind: "int" },
  { key: "earned", label: "Points gagnés (période)", kind: "int" },
  { key: "leads", label: "Prospects en cours" },
];
const C_SALES: ExportColumn[] = [
  { key: "client", label: "Client" },
  { key: "date", label: "Date" },
  { key: "number", label: "Numéro" },
  { key: "entity", label: "Établissement" },
  { key: "items", label: "Articles" },
  { key: "total", label: "Total", kind: "money" },
  { key: "paid", label: "Payé", kind: "money" },
  { key: "status", label: "Statut" },
];
const C_APPTS: ExportColumn[] = [
  { key: "client", label: "Client" },
  { key: "date", label: "Date" },
  { key: "time", label: "Heure" },
  { key: "entity", label: "Établissement" },
  { key: "service", label: "Prestation" },
  { key: "status", label: "Statut" },
  { key: "price", label: "Prix", kind: "money" },
];
const C_SUBS: ExportColumn[] = [
  { key: "client", label: "Client" },
  { key: "name", label: "Abonnement / pack" },
  { key: "entity", label: "Établissement" },
  { key: "start", label: "Début" },
  { key: "end", label: "Fin" },
  { key: "status", label: "Statut" },
  { key: "sessions", label: "Séances restantes", kind: "int" },
  { key: "renew", label: "Renouvellement auto" },
  { key: "price", label: "Prix", kind: "money" },
];
const C_VISITS: ExportColumn[] = [
  { key: "client", label: "Client" },
  { key: "entity", label: "Établissement" },
  { key: "count", label: "Entrées", kind: "int" },
];
const C_LEADS: ExportColumn[] = [
  { key: "client", label: "Client" },
  { key: "entity", label: "Établissement" },
  { key: "interest", label: "Intérêt" },
  { key: "stage", label: "Étape" },
  { key: "source", label: "Source" },
  { key: "value", label: "Valeur", kind: "money" },
  { key: "next", label: "Prochaine action" },
];
const C_NOTES: ExportColumn[] = [
  { key: "client", label: "Client" },
  { key: "date", label: "Date" },
  { key: "body", label: "Note" },
];

/* ---------- Lignes ---------- */

export function clientRow(r: ClientReport): ExportRow {
  const c = r.contact;
  const active = r.subs.filter((s) => s.status === "actif");
  return {
    name: c.full_name,
    phone: c.phone ?? "",
    email: c.email ?? "",
    status: CONTACT_STATUS_LABEL[c.status] ?? c.status,
    entities: (c.entity_ids ?? []).map(short).join(", "),
    since: d2(c.created_at),
    revenue: Math.round(r.revenue),
    purchases: r.purchases.filter((x) => x.status !== "remboursee").length,
    visits: r.visits,
    lastVisit: r.lastVisit ? d2(r.lastVisit) : "",
    honored: r.appts.honored,
    absent: r.appts.absent,
    upcoming: r.appts.upcoming,
    subs: active.map((s) => `${s.name} (→ ${d2(`${s.end_date}T12:00:00Z`)})`).join(", "),
    sessions: hasPacks(r) ? sessionsLeft(r) : null,
    due: Math.round(r.due),
    points: r.loyalty.balance,
    earned: r.loyalty.earned,
    leads: openLeads(r)
      .map((l) => `${l.interest} (${STAGE_LABEL[l.stage]})`)
      .join(", "),
  };
}
const saleRow = (r: ClientReport, x: ClientReport["purchases"][number], withClient: boolean): ExportRow => ({
  ...(withClient ? { client: r.contact.full_name } : {}),
  date: d2(x.date),
  number: x.number,
  entity: short(x.entity),
  items: x.items,
  total: x.total,
  paid: x.paid,
  status: SALE_STATUS_LABEL[x.status],
});
const apptRow = (r: ClientReport, a: ClientReport["appts"]["list"][number], withClient: boolean): ExportRow => ({
  ...(withClient ? { client: r.contact.full_name } : {}),
  date: d2(a.starts_at),
  time: fmtTime(a.starts_at),
  entity: short(a.entity_id),
  service: a.service,
  status: APPT_STATUS_LABEL[a.status],
  price: Number(a.price_mad) || null,
});
const subRow = (r: ClientReport, s: ClientReport["subs"][number], withClient: boolean): ExportRow => ({
  ...(withClient ? { client: r.contact.full_name } : {}),
  name: s.name,
  entity: short(s.entity_id),
  start: d2(`${s.start_date}T12:00:00Z`),
  end: d2(`${s.end_date}T12:00:00Z`),
  status: SUB_STATUS_LABEL[s.status],
  sessions: s.sessions_left,
  renew: s.auto_renew ? "Oui" : "Non",
  price: Number(s.price_mad),
});
const leadRow = (r: ClientReport, l: ClientReport["leads"][number], withClient: boolean): ExportRow => ({
  ...(withClient ? { client: r.contact.full_name } : {}),
  entity: short(l.entity_id),
  interest: l.interest,
  stage: STAGE_LABEL[l.stage],
  source: SOURCE_LABEL[l.source] ?? l.source,
  value: Number(l.value_mad) || null,
  next: l.next_action_on ? d2(`${l.next_action_on}T12:00:00Z`) : "",
});
const noClient = (cols: ExportColumn[]) => cols.filter((c) => c.key !== "client");

/* ---------- Document ---------- */

export function clientSection(r: ClientReport, opts: { pageBreak: boolean }): ReportSection {
  const c = r.contact;
  const a = age(c.birth_date);
  const identity: [string, string][] = [
    ["Téléphone", c.phone ?? "–"],
    ["E-mail", c.email ?? "–"],
    ["Statut", CONTACT_STATUS_LABEL[c.status] ?? c.status],
    ["Établissements", (c.entity_ids ?? []).map(short).join(", ") || "–"],
    ["Client depuis", fmtDate(c.created_at)],
    ["Âge", a !== null ? `${a} ans` : "–"],
  ];
  if (c.city) identity.push(["Ville", c.city]);
  if (c.guardian_name) identity.push(["Parent / tuteur", c.guardian_name]);
  if (c.source) identity.push(["Origine", SOURCE_LABEL[c.source] ?? c.source]);
  if (c.tags?.length) identity.push(["Étiquettes", c.tags.join(", ")]);

  const blocks: ReportBlock[] = [
    { type: "desc", title: "Identité", items: identity },
    {
      type: "kpis",
      items: [
        { label: "Dépensé sur la période", value: mad(r.revenue), sub: plural(r.purchases.filter((x) => x.status !== "remboursee").length, "achat") },
        { label: "Entrées", value: String(r.visits), sub: r.lastVisit ? `dernière le ${d2(r.lastVisit)}` : "aucune sur la période" },
        { label: "Rendez-vous", value: `${r.appts.honored} honoré${r.appts.honored > 1 ? "s" : ""}`, sub: `${plural(r.appts.absent, "absence")}${r.appts.upcoming ? ` · ${r.appts.upcoming} à venir` : ""}` },
        { label: "Reste dû", value: mad(r.due), sub: `${r.loyalty.balance} points fidélité${r.loyalty.earned ? ` (+${r.loyalty.earned})` : ""}` },
      ],
    },
    {
      type: "table",
      title: "Abonnements et séances",
      subtitle: hasPacks(r) ? `${sessionsLeft(r)} séance${sessionsLeft(r) > 1 ? "s" : ""} restante${sessionsLeft(r) > 1 ? "s" : ""} sur les packs actifs` : undefined,
      empty: "Aucun abonnement sur la période",
      table: { columns: noClient(C_SUBS), rows: r.subs.map((s) => subRow(r, s, false)) },
    },
    {
      type: "table",
      title: "Achats",
      subtitle: r.purchases.length > LIST_MAX ? `${LIST_MAX} plus récents sur ${r.purchases.length}` : undefined,
      empty: "Aucun achat sur la période",
      table: {
        columns: noClient(C_SALES),
        rows: r.purchases.slice(0, LIST_MAX).map((x) => saleRow(r, x, false)),
        totals: r.purchases.length ? { date: "Total", total: Math.round(r.revenue) } : undefined,
      },
    },
    {
      type: "table",
      title: "Rendez-vous",
      subtitle: r.appts.total ? `${r.appts.honored} honorés · ${r.appts.absent} absents · ${r.appts.cancelled} annulés${r.appts.upcoming ? ` · ${r.appts.upcoming} à venir` : ""}` : undefined,
      empty: "Aucun rendez-vous sur la période",
      table: { columns: noClient(C_APPTS), rows: r.appts.list.slice(-LIST_MAX).map((x) => apptRow(r, x, false)) },
    },
  ];
  if (r.visitsByEntity.length > 1) blocks.push({ type: "desc", title: "Entrées par établissement", items: r.visitsByEntity.map((v) => [v.entity, String(v.count)]) });
  if (r.leads.length) blocks.push({ type: "table", title: "Prospects", table: { columns: noClient(C_LEADS), rows: r.leads.map((l) => leadRow(r, l, false)) } });
  const notes = [...(c.notes ? [{ text: `Fiche : ${c.notes}` }] : []), ...r.notes.map((n) => ({ text: `${d2(n.date)} — ${n.body}` }))];
  if (notes.length) blocks.push({ type: "list", title: "Notes clés", items: notes });

  return { title: c.full_name, subtitle: [c.phone, CONTACT_STATUS_LABEL[c.status], (c.entity_ids ?? []).map(short).join(", ")].filter(Boolean).join(" · "), pageBreak: opts.pageBreak, blocks };
}

export function clientReportDoc(data: ClientReportData, p: { period: Period; mode: "un" | "selection" | "tous"; etabName: string | null }): ReportDoc {
  const { reports, summary } = data;
  const multi = reports.length > 1;
  const filters: ExportFilter[] = [
    { label: "Période", value: `${p.period.label} (du ${d2(`${p.period.from}T12:00:00Z`)} au ${d2(`${p.period.to}T12:00:00Z`)})` },
    { label: "Clients", value: p.mode === "tous" ? `Tous les clients actifs (${reports.length})` : p.mode === "un" ? (reports[0]?.contact.full_name ?? "–") : `Sélection de ${reports.length} clients` },
  ];
  if (p.etabName) filters.push({ label: "Établissement", value: p.etabName });

  const sections: ReportSection[] = [];
  if (multi) {
    sections.push({
      title: "Synthèse",
      subtitle: `${plural(summary.clients, "client")} · ${p.period.label}`,
      blocks: [
        {
          type: "kpis",
          items: [
            { label: "Chiffre d'affaires", value: mad(summary.revenue), sub: `${plural(summary.salesCount, "achat")} · panier ${mad(summary.basket)}` },
            { label: "Fréquentation", value: plural(summary.visits, "entrée"), sub: `${summary.clients ? Math.round((summary.visits / summary.clients) * 10) / 10 : 0} par client` },
            { label: "Rendez-vous honorés", value: String(summary.honored), sub: `${summary.absent} absences (${summary.absentRate} %)` },
            { label: "Reste dû", value: mad(summary.due), sub: `${summary.activeSubs} abonnements actifs` },
          ],
        },
        ...(summary.byEntity.length > 1
          ? [
              { type: "chart" as const, half: true, title: "CA par établissement", chart: { type: "hbars" as const, unit: "mad" as const, items: summary.byEntity.map((e) => ({ label: e.name, value: Math.round(e.revenue), color: e.color })) } },
              { type: "chart" as const, half: true, title: "Entrées par établissement", chart: { type: "hbars" as const, unit: "num" as const, items: summary.byEntity.map((e) => ({ label: e.name, value: e.visits, color: e.color })) } },
            ]
          : []),
        {
          type: "table",
          title: "Top clients",
          subtitle: "Par montant dépensé sur la période",
          empty: "Aucun achat sur la période",
          table: {
            columns: [
              { key: "rank", label: "#", kind: "int" },
              { key: "name", label: "Client" },
              { key: "phone", label: "Téléphone" },
              { key: "purchases", label: "Achats", kind: "int" },
              { key: "visits", label: "Entrées", kind: "int" },
              { key: "revenue", label: "Dépensé", kind: "money" },
            ],
            rows: summary.top.map((r, i) => ({ rank: i + 1, ...clientRow(r) })),
          },
        },
        {
          type: "table",
          title: "Tous les clients du rapport",
          table: {
            columns: C_CLIENTS.filter((c) => ["name", "phone", "revenue", "visits", "honored", "absent", "due", "points"].includes(c.key)),
            rows: reports.map(clientRow),
            totals: { name: "Total", revenue: Math.round(summary.revenue), visits: summary.visits, honored: summary.honored, absent: summary.absent, due: Math.round(summary.due), points: summary.points },
          },
        },
      ],
    });
  }
  reports.slice(0, PDF_MAX_CLIENTS).forEach((r, i) => sections.push(clientSection(r, { pageBreak: multi || i > 0 })));
  if (reports.length > PDF_MAX_CLIENTS)
    sections.push({ blocks: [{ type: "text", text: `Les ${PDF_MAX_CLIENTS} premiers clients (par montant dépensé) sont détaillés ici. Le fichier Excel contient les ${reports.length} clients.` }] });
  if (!reports.length) sections.push({ blocks: [{ type: "text", text: "Aucun client ne correspond à ces critères sur la période." }] });

  const withClient = true;
  const sheets: ExportSheet[] = [
    { name: "Clients", columns: C_CLIENTS, rows: reports.map(clientRow) },
    { name: "Achats", columns: C_SALES, rows: reports.flatMap((r) => r.purchases.map((x) => saleRow(r, x, withClient))) },
    { name: "Rendez-vous", columns: C_APPTS, rows: reports.flatMap((r) => r.appts.list.map((x) => apptRow(r, x, withClient))) },
    { name: "Abonnements", columns: C_SUBS, rows: reports.flatMap((r) => r.subs.map((s) => subRow(r, s, withClient))) },
    { name: "Entrées", columns: C_VISITS, rows: reports.flatMap((r) => r.visitsByEntity.map((v) => ({ client: r.contact.full_name, entity: v.entity, count: v.count }))) },
    { name: "Prospects", columns: C_LEADS, rows: reports.flatMap((r) => r.leads.map((l) => leadRow(r, l, withClient))) },
    { name: "Notes", columns: C_NOTES, rows: reports.flatMap((r) => r.notes.map((n) => ({ client: r.contact.full_name, date: d2(n.date), body: n.body }))) },
  ];
  if (multi) {
    sheets.unshift({
      name: "Synthèse",
      columns: [
        { key: "label", label: "Indicateur" },
        { key: "value", label: "Valeur", kind: "num" },
      ],
      rows: [
        { label: "Clients", value: summary.clients },
        { label: "Chiffre d'affaires", value: `${Math.round(summary.revenue)} MAD` },
        { label: "Achats", value: summary.salesCount },
        { label: "Panier moyen", value: `${Math.round(summary.basket)} MAD` },
        { label: "Entrées", value: summary.visits },
        { label: "RDV honorés", value: summary.honored },
        { label: "RDV absents", value: summary.absent },
        { label: "Taux d'absence", value: `${summary.absentRate} %` },
        { label: "RDV à venir", value: summary.upcoming },
        { label: "Abonnements actifs", value: summary.activeSubs },
        { label: "Reste dû", value: `${Math.round(summary.due)} MAD` },
        { label: "Points de fidélité (solde)", value: summary.points },
        { label: "Points gagnés sur la période", value: summary.pointsEarned },
        ...summary.byEntity.map((e) => ({ label: `CA ${e.name}`, value: `${Math.round(e.revenue)} MAD` })),
      ],
    });
  }

  const single = p.mode === "un" && reports.length === 1;
  return {
    title: single ? `Rapport client — ${reports[0]!.contact.full_name}` : "Rapport clients",
    subtitle: p.period.label,
    fileName: single ? `rapport-${reports[0]!.contact.full_name}` : `rapport-clients_${p.period.from}_${p.period.to}`,
    filters,
    count: reports.length,
    countLabel: reports.length > 1 ? "clients" : "client",
    sections,
    sheets,
  };
}
