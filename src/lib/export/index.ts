/**
 * Module d'export commun Moov'Up (Excel .xlsx, PDF imprimable, CSV) avec en-tête :
 * logo, « Groupe Moov'Up », titre, établissement(s), filtres, exporté par (nom + rôle),
 * date/heure d'Agadir, nombre de lignes ; pied de page paginé.
 *
 * - Navigateur : `exportTable({ title, columns, rows, filters, format })` (via POST /api/export)
 * - Bouton prêt à l'emploi : `ExportMenu` (`@/components/data-table/export-menu`)
 * - Serveur (gros exports, rapports) : `exportResponse(doc, format, req)` depuis `@/lib/export/server`
 *   avec `doc` = `tableDoc({...})` ou un `ReportDoc` (sections : indicateurs, graphiques SVG, tableaux).
 */
export * from "./types";
export { exportTable, exportHref, postToNewTab, saveBlob, EXPORT_ENDPOINT } from "./client";
export { tableDoc, sheetsOf, normFilters } from "./doc";
export { cellText, parseLooseNumber, slug } from "./format";
