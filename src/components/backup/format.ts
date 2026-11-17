/**
 * Format du fichier de sauvegarde (partagé entre le serveur et le navigateur).
 * {
 *   "format": "moovup-crm-sauvegarde", "version": 1, "created_at": "…", "source": "demo" | "supabase",
 *   "tables": { "contacts": [ … ], … }, "counts": { "contacts": 123, … }, "errors": { … }
 * }
 */
export const BACKUP_FORMAT = "moovup-crm-sauvegarde";
export const BACKUP_VERSION = 1;

export type ParsedBackup =
  | { ok: true; created_at: string | null; source: string | null; tables: Record<string, Record<string, unknown>[]> }
  | { ok: false; error: string };

/** Vérifie la forme d'un fichier de sauvegarde déjà lu (JSON.parse) */
export function parseBackup(obj: unknown): ParsedBackup {
  if (!obj || typeof obj !== "object") return { ok: false, error: "Ce fichier n'est pas une sauvegarde Moov'Up (contenu illisible)." };
  const o = obj as Record<string, unknown>;
  if (o.format !== BACKUP_FORMAT) return { ok: false, error: "Ce fichier n'est pas une sauvegarde Moov'Up CRM. Choisissez un fichier « moovup-sauvegarde-AAAA-MM-JJ.json »." };
  if (typeof o.version !== "number" || o.version > BACKUP_VERSION) return { ok: false, error: "Sauvegarde créée par une version plus récente du CRM : mettez l'application à jour avant de la restaurer." };
  if (!o.tables || typeof o.tables !== "object" || Array.isArray(o.tables)) return { ok: false, error: "Sauvegarde incomplète : la liste des tables est absente." };
  const tables: Record<string, Record<string, unknown>[]> = {};
  for (const [k, v] of Object.entries(o.tables as Record<string, unknown>)) {
    if (Array.isArray(v)) tables[k] = v.filter((r): r is Record<string, unknown> => !!r && typeof r === "object" && !Array.isArray(r));
  }
  return { ok: true, created_at: typeof o.created_at === "string" ? o.created_at : null, source: typeof o.source === "string" ? o.source : null, tables };
}

/** Taille lisible : 1,2 Mo */
export function fmtSize(bytes: number | null | undefined) {
  if (bytes === null || bytes === undefined) return "—";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} Ko`;
  return `${(bytes / 1024 / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;
}
