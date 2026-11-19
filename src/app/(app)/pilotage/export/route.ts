import { getScope, requireManager } from "@/lib/auth";
import { entity } from "@/lib/entities";
import { RISK_LABEL, type RiskLevel } from "@/lib/churn";
import { monthLabel } from "@/lib/forecast";
import { matchesQuery } from "@/lib/search-match";
import { fmtDate, mad, madShort } from "@/lib/utils";
import { exportResponse, readFormat } from "@/lib/export/server";
import type { ExportFilter, ReportBlock, ReportDoc } from "@/lib/export/types";
import { loadExec, type ExecData } from "../load";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DOW_LONG = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const DOW_SHORT = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];

function deltaTxt(cur: number, base: number | null | undefined) {
  if (!base) return "–";
  const n = Math.round((cur / base - 1) * 100);
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)} %`;
}
const pctTxt = (v: number | null, digits = 0) => (v === null ? "–" : `${(v * 100).toFixed(digits).replace(".", ",")} %`);

function pilotageDoc(d: ExecData, sp: URLSearchParams, where: string): ReportDoc {
  const { total, kpis } = d;
  const multi = d.ents.length > 1;
  const margin = total.expenses !== null ? total.forecast - total.expenses : null;
  const n1Label = monthLabel(`${Number(d.month.slice(0, 4)) - 1}${d.month.slice(4)}`, true);

  /* Clients à risque : mêmes filtres que la page */
  const q = sp.get("q")?.trim() ?? "";
  const etab = d.ents.find((e) => e.id === sp.get("etab"))?.id ?? null;
  const level = (["eleve", "moyen", "faible"] as RiskLevel[]).find((l) => l === sp.get("risque")) ?? null;
  const risk = d.churn.filter((c) => (!etab || c.entityId === etab) && (!level || c.level === level) && matchesQuery(q, c.name, c.phone, ...c.reasons)).slice(0, 500);
  const filters: ExportFilter[] = [{ label: "Mois", value: `${fmtDate(d.today, { month: "long", year: "numeric" })} (jour ${d.dom} sur ${d.dim})` }];
  if (etab) filters.push({ label: "Clients à risque · établissement", value: entity(etab)?.short ?? etab });
  if (level) filters.push({ label: "Niveau de risque", value: RISK_LABEL[level] });
  if (q) filters.push({ label: "Recherche", value: `« ${q} »` });

  const orderedDows = [1, 2, 3, 4, 5, 6, 0].map((i) => kpis.dows[i]!);
  const best = orderedDows.reduce((a, b) => (b.avg > a.avg ? b : a));
  const worst = orderedDows.reduce((a, b) => (b.avg < a.avg ? b : a));

  const kpiBlocks: ReportBlock[] = [
    {
      type: "kpis",
      items: [
        { label: "CA du mois à date", value: mad(total.mtd), sub: total.prevMtd ? `${deltaTxt(total.mtd, total.prevMtd)} vs même jour du mois dernier` : "Pas de comparaison" },
        { label: "Prévision fin de mois", value: mad(total.forecast), sub: `entre ${madShort(total.low)} et ${madShort(total.high)} MAD · ${deltaTxt(total.forecast, total.prevTotal)} vs mois dernier` },
        { label: "Marge prévue", value: margin === null ? "–" : mad(margin), sub: total.expenses === null ? "Dépenses non saisies" : `Dépenses prévues ${madShort(total.expenses)} MAD` },
        {
          label: "Objectif du mois",
          value: total.target ? `${Math.round((total.targetForecast / total.target) * 100)} %` : "–",
          sub: total.target ? `${Math.round((total.targetMtd / total.target) * 100)} % atteint · objectif ${madShort(total.target)} MAD` : "Aucun objectif défini",
        },
      ],
    },
  ];
  if (d.alerts.length) kpiBlocks.push({ type: "list", title: "À retenir", items: d.alerts.map((a) => ({ text: a.text, tone: a.tone })) });

  const hasN1 = d.summaries.some((s) => s.n1 !== null);
  return {
    title: "Pilotage",
    subtitle: `${where} · ${fmtDate(d.today, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`,
    fileName: `pilotage_${d.today}`,
    filters,
    count: d.summaries.length,
    countLabel: d.summaries.length > 1 ? "établissements" : "établissement",
    sections: [
      { title: "Synthèse du mois", blocks: kpiBlocks },
      {
        title: "Mois en cours",
        subtitle: multi ? "Par établissement, trié par prévision" : "Détail de la prévision",
        blocks: [
          {
            type: "table",
            table: {
              columns: [
                { key: "entity", label: "Établissement" },
                { key: "mtd", label: "À date", kind: "money" },
                { key: "forecast", label: "Prévision", kind: "money" },
                { key: "range", label: "Fourchette" },
                { key: "dm", label: "vs mois dernier", kind: "pct" },
                ...(hasN1 ? [{ key: "dn", label: `vs ${n1Label}`, kind: "pct" as const }] : []),
                { key: "target", label: "Objectif", kind: "money" },
                { key: "targetPct", label: "Objectif prévu", kind: "pct" },
              ],
              rows: [...d.summaries]
                .sort((a, b) => b.forecast - a.forecast)
                .map((s) => ({
                  entity: s.entity.short,
                  mtd: Math.round(s.mtd),
                  forecast: Math.round(s.forecast),
                  range: `${madShort(s.low)} – ${madShort(s.high)}`,
                  dm: s.prevTotal ? Math.round((s.forecast / s.prevTotal - 1) * 100) : null,
                  dn: s.n1 ? Math.round((s.forecast / s.n1 - 1) * 100) : null,
                  target: s.target,
                  targetPct: s.target ? Math.round((s.forecast / s.target) * 100) : null,
                })),
              totals: multi ? { entity: "Total", mtd: Math.round(total.mtd), forecast: Math.round(total.forecast), range: `${madShort(total.low)} – ${madShort(total.high)}`, target: total.target } : undefined,
            },
          },
          {
            type: "text",
            text: `Prévision = réel à date + rythme habituel de chaque jour de la semaine (8 dernières semaines) + RDV planifiés pondérés par le taux de présence (${madShort(total.rdv)} MAD) + renouvellements attendus (${madShort(total.renewals)} MAD). Fourchette probable à environ 80 %.`,
          },
        ],
      },
      {
        title: "Prévisions sur 3 mois",
        subtitle: "Chiffre d'affaires mensuel : réel, puis prévision avec fourchette",
        blocks: [
          {
            type: "chart",
            chart: {
              type: "line",
              unit: "mad",
              labels: d.chart.map((c) => c.label),
              series: [
                { name: "Réel", values: d.chart.map((c) => c.real ?? null), color: "#1a6d8e" },
                { name: "Prévision", values: d.chart.map((c) => c.forecast ?? null), color: "#e8782a", dashed: true },
              ],
              band: { low: d.chart.map((c) => c.band?.[0] ?? null), high: d.chart.map((c) => c.band?.[1] ?? null) },
            },
          },
          {
            type: "table",
            title: "Prévision par établissement",
            table: {
              columns: [{ key: "entity", label: "Établissement" }, ...d.horizon.map((m, i) => ({ key: `m${i}`, label: monthLabel(m, true), kind: "money" as const }))],
              rows: d.perEntity.map((p) => ({ entity: p.entity.short + (p.method === "court" ? " (historique court)" : ""), ...Object.fromEntries(p.months.map((m, i) => [`m${i}`, Math.round(m.value)])) })),
            },
          },
          {
            type: "desc",
            title: "Abonnements",
            items: [
              ["Revenu récurrent mensuel", mad(d.subsInfo.mrr)],
              ["Abonnements actifs", String(d.subsInfo.activeSubs)],
              ["Taux de renouvellement (90 j)", pctTxt(d.subsInfo.renewalRate)],
              ["Renouvellements attendus ce mois", mad(total.renewals)],
              ...d.subsInfo.renewAhead.map((r) => [`Renouvellements ${monthLabel(r.month, true)}`, `${r.count} · ${madShort(r.value)} MAD`] as [string, string]),
            ],
          },
        ],
      },
      {
        title: "Indicateurs clés",
        subtitle: "Calculés sur les 30 à 90 derniers jours",
        blocks: [
          {
            type: "kpis",
            items: [
              { label: "Churn mensuel", value: pctTxt(kpis.monthlyChurn, 1), sub: kpis.subChurn !== null ? `rétention abonnés ${pctTxt(1 - kpis.subChurn)}` : "estimé sur les visites" },
              { label: "Clients revenus (90 j)", value: pctTxt(kpis.retention90), sub: "venus il y a 3 à 6 mois" },
              { label: "Valeur vie client", value: kpis.ltv === null ? "–" : `${madShort(kpis.ltv)} MAD` },
              { label: "Panier moyen (30 j)", value: kpis.basket === null ? "–" : mad(kpis.basket) },
              { label: "Occupation des RDV", value: pctTxt(kpis.occupancy), sub: kpis.occupancyHasData ? "créneaux pris / dispo, 14 j" : "planning non renseigné" },
              { label: "Conversion prospects", value: pctTxt(kpis.conversion), sub: `${kpis.won} gagnés sur ${kpis.leads} (90 j)` },
            ],
          },
          ...(multi
            ? [{ type: "chart" as const, half: true, title: "Part du CA (90 jours)", chart: { type: "hbars" as const, unit: "mad" as const, items: kpis.shares.map((s) => ({ label: s.entity.short, value: Math.round(s.value), hint: kpis.rev90 ? `${Math.round((s.value / kpis.rev90) * 100)} %` : undefined })) } }]
            : []),
          {
            type: "chart",
            half: multi,
            title: "CA moyen par jour (90 jours)",
            subtitle: `Meilleur jour : ${DOW_LONG[best.dow]} · plus calme : ${DOW_LONG[worst.dow]}${kpis.bestHour && kpis.worstHour ? ` · heures fortes ${kpis.bestHour.h} h – ${kpis.bestHour.h + 2} h` : ""}`,
            chart: { type: "bars", unit: "mad", labels: orderedDows.map((x) => DOW_SHORT[x.dow]!), series: [{ name: "CA moyen", values: orderedDows.map((x) => Math.round(x.avg)) }] },
          },
        ],
      },
      {
        title: "Clients à risque de départ",
        subtitle: `${risk.length} client${risk.length > 1 ? "s" : ""}${d.churn.length > risk.length ? ` sur ${d.churn.length}` : ""} · score de 0 à 100`,
        pageBreak: risk.length > 15,
        blocks: [
          {
            type: "table",
            empty: "Aucun client à risque détecté",
            table: {
              columns: [
                { key: "name", label: "Client" },
                { key: "phone", label: "Téléphone" },
                { key: "entity", label: "Établissement" },
                { key: "score", label: "Score", kind: "int" },
                { key: "level", label: "Risque" },
                { key: "reason", label: "Raison principale" },
                { key: "value", label: "CA 12 mois", kind: "money" },
                { key: "last", label: "Dernière visite" },
                { key: "action", label: "Action proposée" },
              ],
              rows: risk.map((c) => ({
                name: c.name,
                phone: c.phone ?? "",
                entity: entity(c.entityId)?.short ?? c.entityId,
                score: c.score,
                level: RISK_LABEL[c.level],
                reason: c.reasons.join(" · "),
                value: Math.round(c.value12),
                last: c.lastVisit ? fmtDate(`${c.lastVisit}T12:00:00Z`, { day: "2-digit", month: "2-digit", year: "numeric" }) : "",
                action: c.action.label,
              })),
            },
          },
        ],
      },
    ],
  };
}

/** Export du tableau de bord dirigeant : `?format=pdf` (défaut) | `xlsx` | `csv` (+ filtres q, etab, risque) */
export async function GET(req: Request) {
  await requireManager();
  const scope = await getScope();
  const sp = new URL(req.url).searchParams;
  const d = await loadExec(scope);
  const where = scope.current?.short ?? (d.ents.length > 1 ? "Tous les établissements" : (d.ents[0]?.short ?? ""));
  return exportResponse(pilotageDoc(d, sp, where), readFormat(req, "pdf"), req);
}
