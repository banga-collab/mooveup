import type { ExportSheet, ExportValue } from "./types";

/* CSV UTF-8 (BOM) séparé par « ; » (Excel en français), avec l'en-tête Moov'Up en tête de fichier. */

export function csvCell(v: ExportValue): string {
  if (v === null || v === undefined) return "";
  let s = typeof v === "number" ? (Number.isFinite(v) ? String(Math.round(v * 100) / 100).replace(".", ",") : "") : typeof v === "boolean" ? (v ? "Oui" : "Non") : String(v);
  if (typeof v === "string" && /^[=@\t\r]|^[+-](?![\d\s])/.test(s)) s = "'" + s; // pas de formule involontaire
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildCsv({ header, sheets }: { header: string[]; sheets: ExportSheet[] }) {
  const lines: string[] = header.map((h) => csvCell(h));
  for (const s of sheets) {
    lines.push("");
    if (sheets.length > 1 || s.title) lines.push(csvCell(s.title ?? s.name));
    lines.push(s.columns.map((c) => csvCell(c.label)).join(";"));
    for (const r of s.rows) lines.push(s.columns.map((c) => csvCell(r[c.key])).join(";"));
    if (s.totals) lines.push(s.columns.map((c) => csvCell(s.totals![c.key])).join(";"));
  }
  return "﻿" + lines.join("\r\n") + "\r\n";
}
