"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { flash } from "@/lib/flash";
import { directionOrNull, isTableName, listTables, logBackup, mergeRows, serviceDb, storeBackup, tableLabel } from "@/lib/backup";
import type { FormState } from "@/components/action-form";

const MAX_ROWS_PER_CHUNK = 2000;

/** « Sauvegarder maintenant » : même traitement que la sauvegarde de nuit */
export async function backupNow(_state: FormState, _fd: FormData): Promise<FormState> {
  void _state;
  void _fd;
  const me = await directionOrNull();
  if (!me) return { error: "Réservé à la direction." };
  const r = await storeBackup({ id: me.id, name: me.full_name || me.email });
  if (!r.ok) return { error: `La sauvegarde a échoué : ${r.error}` };
  await flash(r.mode === "demo" ? `Sauvegarde simulée : ${r.stats.rows.toLocaleString("fr-FR")} lignes` : `Sauvegarde enregistrée : ${r.file}`);
  revalidatePath("/parametres/sauvegarde");
  revalidatePath("/parametres/systeme");
  return undefined;
}

export type ChunkResult = { ok: true; written: number } | { ok: false; error: string };

/**
 * Restauration, appelée par le navigateur table par table et par paquets
 * (évite la limite de taille des envois). Mode « fusion » : les lignes ayant
 * le même identifiant sont remplacées, les autres ajoutées ; rien n'est supprimé.
 */
export async function restoreChunk(table: string, rows: unknown[]): Promise<ChunkResult> {
  const me = await directionOrNull();
  if (!me) return { ok: false, error: "Réservé à la direction." };
  if (!isTableName(table) || !listTables().includes(table)) return { ok: false, error: `Table « ${String(table)} » inconnue : ignorée.` };
  if (!Array.isArray(rows)) return { ok: false, error: "Paquet de lignes invalide." };
  if (rows.length > MAX_ROWS_PER_CHUNK) return { ok: false, error: "Paquet trop gros." };
  const clean = rows.filter((r): r is Record<string, unknown> => !!r && typeof r === "object" && !Array.isArray(r));
  // Clé service si disponible (la RLS bloquerait les lignes des autres membres), sinon droits de la direction
  const db = (await serviceDb()) ?? (await createClient());
  const r = await mergeRows(db, table, clean);
  if (r.error) return { ok: false, error: `${tableLabel(table)} : ${r.error}` };
  return { ok: true, written: r.written };
}

/** Fin de restauration : journal + message */
export async function finishRestore(info: { file: string; tables: number; rows: number; failed: string[] }): Promise<void> {
  const me = await directionOrNull();
  if (!me) return;
  const file = String(info.file ?? "").slice(0, 120);
  const rows = Number(info.rows) || 0;
  const tables = Number(info.tables) || 0;
  const failed = Array.isArray(info.failed) ? info.failed.map(String).slice(0, 50) : [];
  await logBackup(
    await createClient(),
    "sauvegarde.restauration",
    `Restauration (fusion) de ${file} : ${rows} lignes dans ${tables} tables${failed.length ? `, ${failed.length} erreur(s)` : ""}`,
    { file, rows, tables, failed },
    { id: me.id, name: me.full_name || me.email },
  );
  await flash(failed.length ? `Restauration terminée avec ${failed.length} erreur(s)` : `Restauration terminée : ${rows.toLocaleString("fr-FR")} lignes`, failed.length ? "error" : "success");
  revalidatePath("/", "layout");
}
