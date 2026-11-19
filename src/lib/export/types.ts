/* Module d'export commun (Excel, PDF imprimable, CSV) avec en-tête Moov'Up. */

export type ExportFormat = "xlsx" | "pdf" | "csv";
export const EXPORT_FORMATS: ExportFormat[] = ["xlsx", "pdf", "csv"];
export const FORMAT_LABEL: Record<ExportFormat, string> = { xlsx: "Excel", pdf: "PDF", csv: "CSV" };

/** Valeur brute d'une cellule */
export type ExportValue = string | number | boolean | null | undefined;

/**
 * Format d'une colonne :
 * money = montant MAD, int = entier, num = décimal, pct = pourcentage (0-100), text = texte.
 * Sans valeur : texte, ou nombre si `numeric`.
 */
export type ExportKind = "money" | "int" | "num" | "pct" | "text";

export type ExportColumn = {
  key: string;
  label: string;
  /** Colonne de nombres (aligné à droite, convertie en nombre dans Excel) */
  numeric?: boolean;
  kind?: ExportKind;
  /** Largeur Excel (caractères) ; calculée sinon */
  width?: number;
};

export type ExportRow = Record<string, ExportValue>;

export type ExportFilter = { label: string; value: string };

export type ExportTable = {
  columns: ExportColumn[];
  rows: ExportRow[];
  /** Ligne de total (en gras) */
  totals?: ExportRow;
};

/** Entrée simple : un tableau (API `exportTable`) */
export type ExportTableInput = ExportTable & {
  title: string;
  subtitle?: string;
  /** Filtres appliqués (« Recherche : dupont », « Statut : actif »…) */
  filters?: (ExportFilter | string)[];
  format: ExportFormat;
  /** Préfixe du fichier (sans extension ni date) */
  fileName?: string;
};

/* ---------- Rapports mis en page (graphiques + tableaux) ---------- */

export type ChartSpec =
  | {
      type: "bars";
      labels: string[];
      series: { name: string; color?: string; values: number[] }[];
      stacked?: boolean;
      unit?: "mad" | "num" | "pct";
    }
  | { type: "hbars"; items: { label: string; value: number; color?: string; hint?: string }[]; unit?: "mad" | "num" | "pct" }
  | { type: "donut"; items: { label: string; value: number; color: string }[]; unit?: "mad" | "num"; center?: string }
  | {
      type: "line";
      labels: string[];
      series: { name: string; color?: string; values: (number | null)[]; dashed?: boolean; area?: boolean }[];
      band?: { low: (number | null)[]; high: (number | null)[] };
      unit?: "mad" | "num";
    };

export type ReportKpi = { label: string; value: string; sub?: string };

export type ReportBlock = (
  | { type: "kpis"; items: ReportKpi[] }
  | { type: "chart"; chart: ChartSpec }
  | { type: "table"; table: ExportTable; empty?: string }
  | { type: "desc"; items: [string, string][] }
  | { type: "list"; items: { text: string; tone?: "bad" | "good" | "info" }[] }
  | { type: "text"; text: string }
) & {
  title?: string;
  subtitle?: string;
  /** Demi-largeur (deux blocs côte à côte dans le PDF) */
  half?: boolean;
};

export type ReportSection = {
  title?: string;
  subtitle?: string;
  /** Nouvelle page avant la section (PDF) */
  pageBreak?: boolean;
  blocks: ReportBlock[];
};

/** Feuille Excel */
export type ExportSheet = ExportTable & { name: string; title?: string };

export type ReportDoc = {
  title: string;
  subtitle?: string;
  filters?: ExportFilter[];
  sections: ReportSection[];
  /** Feuilles Excel / CSV (défaut : un tableau par bloc « table » et « kpis ») */
  sheets?: ExportSheet[];
  /** Nombre de lignes affiché dans l'en-tête (défaut : lignes des feuilles) */
  count?: number;
  countLabel?: string;
  fileName?: string;
  /** PDF en paysage (défaut : automatique selon le nombre de colonnes) */
  landscape?: boolean;
};

/** Qui exporte, quand, quel périmètre (calculé côté serveur) */
export type ExportMeta = {
  by: string;
  role: string;
  /** « 18/11/2026 à 14:32 » (heure d'Agadir) */
  at: string;
  /** Date du jour AAAA-MM-JJ (Agadir) pour le nom du fichier */
  day: string;
  /** Établissement(s) du périmètre */
  scope: string;
};
