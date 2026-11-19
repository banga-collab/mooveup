import type { ExportFilter, ExportMeta, ExportSheet, ExportTableInput, ReportDoc } from "./types";
import type { HeaderLine } from "./xlsx";

/* Passage d'un tableau simple ou d'un rapport à ses feuilles + lignes d'en-tête communes. */

export function normFilters(list: (ExportFilter | string)[] | undefined): ExportFilter[] {
  return (list ?? [])
    .map((f) => (typeof f === "string" ? { label: "", value: f } : f))
    .filter((f) => f && typeof f.value === "string" && f.value.trim())
    .slice(0, 20);
}

/** Un tableau → un rapport d'une section */
export function tableDoc(input: Omit<ExportTableInput, "format">): ReportDoc {
  return {
    title: input.title,
    subtitle: input.subtitle,
    filters: normFilters(input.filters),
    fileName: input.fileName,
    count: input.rows.length,
    sections: [{ blocks: [{ type: "table", table: { columns: input.columns, rows: input.rows, totals: input.totals } }] }],
    sheets: [{ name: input.title, columns: input.columns, rows: input.rows, totals: input.totals }],
  };
}

/** Feuilles Excel d'un rapport (déclarées, sinon déduites des tableaux et indicateurs) */
export function sheetsOf(doc: ReportDoc): ExportSheet[] {
  if (doc.sheets?.length) return doc.sheets;
  const out: ExportSheet[] = [];
  const kpis: { section: string; label: string; value: string; sub: string }[] = [];
  for (const s of doc.sections) {
    for (const b of s.blocks) {
      if (b.type === "kpis") for (const k of b.items) kpis.push({ section: s.title ?? "", label: k.label, value: k.value, sub: k.sub ?? "" });
      else if (b.type === "desc") for (const [l, v] of b.items) kpis.push({ section: b.title ?? s.title ?? "", label: l, value: v, sub: "" });
      else if (b.type === "table") out.push({ name: b.title ?? s.title ?? "Tableau", title: b.subtitle, ...b.table });
      else if (b.type === "chart") {
        const c = b.chart;
        const name = b.title ?? s.title ?? "Graphique";
        if (c.type === "bars" || c.type === "line") {
          out.push({
            name,
            columns: [{ key: "label", label: "Période" }, ...c.series.map((x, i) => ({ key: `s${i}`, label: x.name, kind: c.unit === "mad" ? ("money" as const) : c.unit === "pct" ? ("pct" as const) : ("num" as const) }))],
            rows: c.labels.map((l, i) => Object.fromEntries([["label", l], ...c.series.map((x, k) => [`s${k}`, x.values[i] ?? null])])),
          });
        } else {
          const items = c.items;
          const unit = c.unit === "mad" ? ("money" as const) : c.unit === "pct" ? ("pct" as const) : ("num" as const);
          const total = items.reduce((a, x) => a + x.value, 0);
          out.push({
            name,
            columns: [
              { key: "label", label: "Libellé" },
              { key: "value", label: "Valeur", kind: unit },
              ...(c.type === "donut" ? [{ key: "share", label: "Part", kind: "pct" as const }] : []),
            ],
            rows: items.map((x) => ({ label: x.label, value: x.value, share: total ? Math.round((x.value / total) * 1000) / 10 : 0 })),
          });
        }
      }
    }
  }
  if (kpis.length) {
    out.unshift({
      name: "Synthèse",
      columns: [
        { key: "section", label: "Rubrique" },
        { key: "label", label: "Indicateur" },
        { key: "value", label: "Valeur", kind: "num" },
        { key: "sub", label: "Détail" },
      ],
      rows: kpis,
    });
  }
  return out;
}

export function rowCount(doc: ReportDoc, sheets: ExportSheet[]) {
  return doc.count ?? sheets.reduce((a, s) => a + s.rows.length, 0);
}

export function filtersText(doc: ReportDoc) {
  return (doc.filters ?? []).map((f) => (f.label ? `${f.label} : ${f.value}` : f.value)).join(" · ");
}

/** Lignes d'en-tête (Excel, CSV) */
export function headerLines(doc: ReportDoc, meta: ExportMeta, count: number): HeaderLine[] {
  const filters = filtersText(doc);
  const label = doc.countLabel ?? (count > 1 ? "lignes" : "ligne");
  return [
    { text: "Groupe Moov'Up", style: "group" },
    { text: doc.subtitle ? `${doc.title} — ${doc.subtitle}` : doc.title, style: "title" },
    { text: `Établissement(s) : ${meta.scope}`, style: "meta" },
    ...(filters ? [{ text: `Filtres : ${filters}`, style: "meta" as const }] : []),
    { text: `Exporté par ${meta.by} (${meta.role}) le ${meta.at} (heure d'Agadir) · ${count} ${label}`, style: "meta" },
  ];
}

export function fileBase(doc: ReportDoc) {
  return doc.fileName || doc.title;
}
