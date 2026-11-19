import type { ExportColumn, ExportKind, ExportValue } from "./types";

/* Helpers purs (utilisables côté serveur et navigateur). */

export function escXml(s: string) {
  // Caractères de contrôle interdits en XML
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
export const escHtml = escXml;

/** Nom de fichier sûr : « Ventes du mois » → « ventes-du-mois » */
export function slug(s: string) {
  return (
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 60) || "export"
  );
}

const nf0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const nf1 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

/** 12 500 MAD */
export const fmtMad = (v: number) => `${nf0.format(v)} MAD`;
export const fmtNum = (v: number) => nf2.format(v);
/** 12,5 k / 1,2 M */
export function fmtShort(v: number) {
  if (Math.abs(v) >= 1_000_000) return `${nf1.format(v / 1_000_000)} M`;
  if (Math.abs(v) >= 10_000) return `${nf0.format(v / 1000)} k`;
  return nf0.format(v);
}

/** Lit un nombre affiché à la française (« 12 500 MAD », « -3,5 % », « 1 250,00 ») ; null sinon */
export function parseLooseNumber(s: string): { n: number; money: boolean; pct: boolean } | null {
  const t = s.replace(/[  ]/g, " ").trim();
  const m = t.match(/^([+\-−]?)\s*((?:\d{1,3}(?:[ .]\d{3})+|\d+)(?:,\d+)?)\s*(MAD|DH|Dhs?|%)?$/i);
  if (!m) return null;
  const n = Number(m[2]!.replace(/[ .]/g, "").replace(",", ".")) * (m[1] && m[1] !== "+" ? -1 : 1);
  if (!Number.isFinite(n)) return null;
  const unit = (m[3] ?? "").toLowerCase();
  return { n, money: unit === "mad" || unit.startsWith("dh"), pct: unit === "%" };
}

/** Format effectif d'une colonne */
export function kindOf(c: ExportColumn): ExportKind {
  return c.kind ?? (c.numeric ? "num" : "text");
}

/** Texte affiché d'une valeur (PDF, CSV) */
export function cellText(v: ExportValue, kind: ExportKind = "text"): string {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "boolean") return v ? "Oui" : "Non";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "";
    if (kind === "money") return fmtMad(v);
    if (kind === "pct") return `${nf1.format(v)} %`;
    if (kind === "int") return nf0.format(v);
    return nf2.format(v);
  }
  return String(v);
}
