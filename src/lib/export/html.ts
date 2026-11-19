import { cellText, escHtml, kindOf } from "./format";
import { chartSvg, donutSvg, valueFmt } from "./svg";
import type { ExportMeta, ExportTable, ReportBlock, ReportDoc } from "./types";

/*
 * Page HTML imprimable (A4) : en-tête Moov'Up, métadonnées d'export, sections
 * (indicateurs, graphiques SVG, tableaux), pied de page « Page X / Y ».
 * Ouverte dans un nouvel onglet, elle lance l'impression (→ « Enregistrer au format PDF »).
 */

const cssStr = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]+/g, " ")}"`;

function tableHtml(tb: ExportTable, empty = "Aucune donnée") {
  if (!tb.rows.length) return `<p class="empty">${escHtml(empty)}</p>`;
  const kinds = tb.columns.map(kindOf);
  const head = tb.columns.map((c, i) => `<th${kinds[i] !== "text" ? ' class="n"' : ""}>${escHtml(c.label)}</th>`).join("");
  const row = (r: Record<string, unknown>) =>
    tb.columns
      .map((c, i) => {
        const txt = cellText(r[c.key] as never, kinds[i]);
        return `<td${kinds[i] !== "text" ? ' class="n"' : ""}>${escHtml(txt).replace(/\n/g, "<br>")}</td>`;
      })
      .join("");
  const body = tb.rows.map((r) => `<tr>${row(r)}</tr>`).join("");
  const foot = tb.totals ? `<tfoot><tr>${row(tb.totals)}</tr></tfoot>` : "";
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${foot}</table>`;
}

function blockHtml(b: ReportBlock): string {
  const head = b.title || b.subtitle ? `${b.title ? `<h3>${escHtml(b.title)}</h3>` : ""}${b.subtitle ? `<p class="bsub">${escHtml(b.subtitle)}</p>` : ""}` : "";
  let inner = "";
  let cls = "block";
  if (b.type === "kpis") {
    inner = `<div class="kpis">${b.items
      .map((k) => `<div class="kpi"><div class="l">${escHtml(k.label)}</div><div class="v">${escHtml(k.value)}</div>${k.sub ? `<div class="s">${escHtml(k.sub)}</div>` : ""}</div>`)
      .join("")}</div>`;
  } else if (b.type === "chart") {
    const c = b.chart;
    if (c.type === "donut") {
      const total = c.items.reduce((a, x) => a + Math.max(0, x.value), 0);
      inner = `<div class="donut">${donutSvg(c)}<table class="legend"><tbody>${c.items
        .map(
          (x) =>
            `<tr><td><span class="dot" style="background:${escHtml(x.color)}"></span>${escHtml(x.label)}</td><td class="n muted">${total ? Math.round((x.value / total) * 100) : 0} %</td><td class="n">${escHtml(valueFmt(x.value, c.unit ?? "mad"))}</td></tr>`,
        )
        .join("")}</tbody></table></div>`;
    } else if ((c.type === "hbars" && !c.items.length) || ((c.type === "bars" || c.type === "line") && !c.labels.length)) {
      inner = `<p class="empty">Aucune donnée sur la période</p>`;
    } else inner = `<div class="chart">${chartSvg(c, b.half ? 440 : 700)}</div>`;
  } else if (b.type === "table") {
    cls = "block tbl";
    inner = tableHtml(b.table, b.empty);
  } else if (b.type === "desc") {
    inner = `<dl class="desc">${b.items.map(([l, v]) => `<div><dt>${escHtml(l)}</dt><dd>${escHtml(v)}</dd></div>`).join("")}</dl>`;
  } else if (b.type === "list") {
    inner = b.items.length ? `<ul class="list">${b.items.map((i) => `<li class="${i.tone ?? "info"}">${escHtml(i.text)}</li>`).join("")}</ul>` : `<p class="empty">Rien à signaler</p>`;
  } else if (b.type === "text") {
    inner = `<p class="text">${escHtml(b.text).replace(/\n/g, "<br>")}</p>`;
  }
  return `<div class="${cls}${b.half ? " half" : ""}">${head}${inner}</div>`;
}

/** Regroupe les blocs demi-largeur consécutifs par deux */
function blocksHtml(blocks: ReportBlock[]) {
  const out: string[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    const n = blocks[i + 1];
    if (b.half && n?.half) {
      out.push(`<div class="grid">${blockHtml(b)}${blockHtml(n)}</div>`);
      i++;
    } else out.push(blockHtml({ ...b, half: false }));
  }
  return out.join("");
}

export function buildPrintHtml(doc: ReportDoc, meta: ExportMeta, count: number, opts: { autoPrint?: boolean; logoSrc?: string } = {}) {
  const maxCols = Math.max(0, ...doc.sections.flatMap((s) => s.blocks.map((b) => (b.type === "table" ? b.table.columns.length : 0))));
  const landscape = doc.landscape ?? maxCols > 8;
  const filters = (doc.filters ?? []).map((f) => (f.label ? `${f.label} : ${f.value}` : f.value)).join(" · ");
  const label = doc.countLabel ?? (count > 1 ? "lignes" : "ligne");
  const footer = `Groupe Moov'Up · ${doc.title} · exporté le ${meta.at} par ${meta.by}`;
  const logo = opts.logoSrc ?? "/logo.png";

  const sections = doc.sections
    .map(
      (s) =>
        `<section${s.pageBreak ? ' class="break"' : ""}>${s.title ? `<h2>${escHtml(s.title)}</h2>` : ""}${s.subtitle ? `<p class="ssub">${escHtml(s.subtitle)}</p>` : ""}${blocksHtml(s.blocks)}</section>`,
    )
    .join("");

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>${escHtml(doc.title)} — Moov'Up</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
@page { size: A4${landscape ? " landscape" : ""}; margin: 13mm 12mm 15mm 12mm;
  @bottom-left { content: ${cssStr(footer)}; font: 7.5pt Inter, system-ui, sans-serif; color: #6b7280; }
  @bottom-right { content: "Page " counter(page) " / " counter(pages); font: 7.5pt Inter, system-ui, sans-serif; color: #6b7280; } }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font: 9.5pt/1.45 Inter, system-ui, -apple-system, "Segoe UI", Arial, sans-serif; color: #111827; background: #eef0f3; }
.toolbar { position: sticky; top: 0; z-index: 5; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: center; padding: 10px 16px; background: #fff; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #6b7280; }
.toolbar button { font: 500 13px Inter, system-ui, sans-serif; height: 36px; padding: 0 14px; border-radius: 8px; border: 1px solid #e5e7eb; background: #fff; color: #111827; cursor: pointer; }
.toolbar button.primary { background: #1a6d8e; border-color: #1a6d8e; color: #fff; }
.sheet { background: #fff; width: 100%; max-width: ${landscape ? "297mm" : "210mm"}; margin: 16px auto; padding: 12mm; border: 1px solid #e5e7eb; border-radius: 6px; }
.head { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-bottom: 8px; border-bottom: 2px solid #1a6d8e; }
.head img { height: 40px; width: auto; }
.head .t { text-align: right; min-width: 0; }
.group { margin: 0; color: #1a6d8e; font-weight: 600; font-size: 8.5pt; letter-spacing: .06em; text-transform: uppercase; }
h1 { margin: 2px 0 0; font-size: 15pt; font-weight: 600; line-height: 1.25; }
.sub { margin: 1px 0 0; color: #6b7280; font-size: 9.5pt; }
.meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 6px 16px; margin: 10px 0 6px; padding: 8px 10px; background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 8.5pt; }
.meta dt { color: #6b7280; } .meta dd { margin: 0; font-weight: 500; }
section { margin-top: 14px; } section.break { break-before: page; margin-top: 0; }
h2 { margin: 0 0 2px; font-size: 12pt; font-weight: 600; color: #111827; padding-bottom: 3px; border-bottom: 1px solid #e5e7eb; }
.ssub { margin: 3px 0 8px; color: #6b7280; font-size: 9pt; }
h3 { margin: 0 0 1px; font-size: 10pt; font-weight: 600; }
.bsub { margin: 0 0 6px; color: #6b7280; font-size: 8.5pt; }
.block { break-inside: avoid; margin: 10px 0 12px; min-width: 0; }
.block.tbl { break-inside: auto; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; break-inside: avoid; }
.grid > .block { margin-top: 10px; }
.kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.kpi { border: 1px solid #e5e7eb; border-radius: 6px; padding: 7px 9px; min-width: 0; }
.kpi .l { color: #6b7280; font-size: 8pt; } .kpi .v { font-size: 12.5pt; font-weight: 600; font-variant-numeric: tabular-nums; } .kpi .s { color: #6b7280; font-size: 7.5pt; }
table { width: 100%; border-collapse: collapse; font-size: 8.3pt; }
thead { display: table-header-group; } tfoot { display: table-row-group; }
th { text-align: left; font-weight: 600; color: #374151; background: #f1f5f9; border-bottom: 1px solid #cbd5e1; padding: 4px 6px; }
td { padding: 3px 6px; border-bottom: 1px solid #eef0f3; vertical-align: top; overflow-wrap: anywhere; }
tbody tr:nth-child(even) td { background: #fafbfc; }
tr { break-inside: avoid; }
.n { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
tfoot td { font-weight: 600; border-top: 1px solid #94a3b8; border-bottom: 0; background: #fff !important; }
.donut { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; }
.donut svg { flex: none; width: 150px; height: auto; }
.donut .legend { flex: 1 1 230px; min-width: 230px; }
table.legend td:first-child { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px; }
table.legend td.n { white-space: nowrap; }
table.legend { font-size: 8.5pt; } table.legend td { border-bottom: 1px solid #f1f5f9; background: #fff !important; }
.dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
.muted { color: #6b7280; }
.desc { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 16px; margin: 0; font-size: 9pt; }
.desc div { display: flex; justify-content: space-between; gap: 8px; border-bottom: 1px solid #f1f5f9; padding: 2px 0; }
.desc dt { color: #6b7280; } .desc dd { margin: 0; font-weight: 500; text-align: right; }
.list { margin: 0; padding: 0; list-style: none; } .list li { position: relative; padding: 3px 0 3px 14px; border-bottom: 1px solid #f1f5f9; }
.list li::before { content: ""; position: absolute; left: 0; top: 9px; width: 6px; height: 6px; border-radius: 50%; background: #94a3b8; }
.list li.bad::before { background: #e8782a; } .list li.good::before { background: #059669; }
.text { margin: 0; color: #374151; }
.empty { margin: 0; padding: 10px; color: #6b7280; text-align: center; border: 1px dashed #e5e7eb; border-radius: 6px; }
.end { margin-top: 18px; padding-top: 6px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 7.5pt; text-align: center; }
@media (max-width: 640px) { .sheet { padding: 16px; margin: 0; border: 0; border-radius: 0; } .grid, .kpis { grid-template-columns: 1fr 1fr; } .grid { grid-template-columns: 1fr; } .head { flex-direction: column; align-items: flex-start; } .head .t { text-align: left; } table { display: block; overflow-x: auto; } }
@media print { body { background: #fff; } .toolbar { display: none; } .sheet { margin: 0; padding: 0; max-width: none; border: 0; border-radius: 0; } }
</style></head>
<body>
<div class="toolbar"><span>Aperçu avant impression · choisissez « Enregistrer au format PDF » comme imprimante</span><button type="button" class="primary" onclick="window.print()">Imprimer / PDF</button><button type="button" onclick="window.close()">Fermer</button></div>
<main class="sheet">
<header class="head"><img src="${escHtml(logo)}" alt="Moov'Up"><div class="t"><p class="group">Groupe Moov'Up</p><h1>${escHtml(doc.title)}</h1>${doc.subtitle ? `<p class="sub">${escHtml(doc.subtitle)}</p>` : ""}</div></header>
<dl class="meta">
<div><dt>Établissement(s)</dt><dd>${escHtml(meta.scope)}</dd></div>
${filters ? `<div><dt>Filtres appliqués</dt><dd>${escHtml(filters)}</dd></div>` : ""}
<div><dt>Exporté par</dt><dd>${escHtml(meta.by)} · ${escHtml(meta.role)}</dd></div>
<div><dt>Date et heure (Agadir)</dt><dd>${escHtml(meta.at)}</dd></div>
<div><dt>Contenu</dt><dd>${count} ${escHtml(label)}</dd></div>
</dl>
${sections}
<p class="end">Document interne du Groupe Moov'Up · ${escHtml(meta.at)} · ${escHtml(meta.by)}</p>
</main>
${
  opts.autoPrint === false
    ? ""
    : `<script>window.addEventListener("load",function(){var go=function(){setTimeout(function(){window.print()},300)};if(document.fonts&&document.fonts.ready){document.fonts.ready.then(go,go)}else{go()}});</script>`
}
</body></html>`;
}
