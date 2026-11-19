/**
 * Tableaux intelligents + outils de liste.
 * - `DataTable` (client) : tri URL, colonnes, export Excel/PDF/CSV (en-tête Moov'Up), « Afficher plus », sélection, cartes mobiles
 * - `ExportMenu` (client) : bouton « Exporter » (Excel / PDF / CSV) pour une route serveur ou un export navigateur
 * - `SaveViewButton` (client) : « Enregistrer la vue » → table saved_views
 * - `NoResults`, `ResultCount` : états vides / compteur
 * - `matchesQuery`, `one` : filtrage CÔTÉ SERVEUR (à préférer à celui de list-toolbar, qui est une référence client)
 */
export { DataTable } from "./data-table";
export { ExportMenu } from "./export-menu";
export { SaveViewButton } from "./save-view";
export { NoResults, ResultCount } from "./no-results";
export { matchesQuery, norm, one } from "./match";
export type { BulkAction, CellValue, DataColumn, DataRow } from "./types";
