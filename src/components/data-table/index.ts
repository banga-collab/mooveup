/**
 * Tableaux intelligents + outils de liste.
 * - `DataTable` (client) : tri URL, colonnes, export CSV, « Afficher plus », sélection, cartes mobiles
 * - `SaveViewButton` (client) : « Enregistrer la vue » → table saved_views
 * - `NoResults`, `ResultCount` : états vides / compteur
 * - `matchesQuery`, `one` : filtrage CÔTÉ SERVEUR (à préférer à celui de list-toolbar, qui est une référence client)
 */
export { DataTable } from "./data-table";
export { SaveViewButton } from "./save-view";
export { NoResults, ResultCount } from "./no-results";
export { matchesQuery, norm, one } from "./match";
export type { BulkAction, CellValue, DataColumn, DataRow } from "./types";
