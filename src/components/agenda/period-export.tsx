"use client";

import { ExportMenu } from "@/components/data-table/export-menu";
import { exportTable } from "@/lib/export/client";
import type { ExportColumn, ExportFilter, ExportRow } from "@/lib/export/types";

const COLUMNS: ExportColumn[] = [
  { key: "date", label: "Date" },
  { key: "heure", label: "Heure" },
  { key: "duree", label: "Durée (min)", kind: "int" },
  { key: "client", label: "Client" },
  { key: "telephone", label: "Téléphone" },
  { key: "prestation", label: "Prestation" },
  { key: "praticien", label: "Praticien" },
  { key: "etablissement", label: "Établissement" },
  { key: "salle", label: "Salle" },
  { key: "statut", label: "Statut" },
  { key: "prix", label: "Prix", kind: "money" },
];

/** Export (Excel / PDF / CSV, en-tête Moov'Up) des rendez-vous d'une période */
export function PeriodExport({ title, rows, filters, totals }: { title: string; rows: ExportRow[]; filters: ExportFilter[]; totals: ExportRow }) {
  return (
    <ExportMenu
      compact
      disabled={!rows.length}
      onExport={(format) => exportTable({ title, columns: COLUMNS, rows, totals, filters, format, fileName: "agenda" })}
    />
  );
}
