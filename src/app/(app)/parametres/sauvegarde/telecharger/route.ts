import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DEMO } from "@/lib/demo";
import {
  BACKUP_BUCKET,
  BACKUP_FILE_RE,
  backupFileName,
  backupStream,
  directionOrNull,
  isTableName,
  listTables,
  logBackup,
  serviceDb,
  tableCsvStream,
} from "@/lib/backup";
import { dayKey } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const noStore = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

/**
 * Téléchargements de la page Sauvegarde (direction uniquement) :
 *  - sans paramètre : sauvegarde complète JSON (en flux) ;
 *  - ?table=<nom>   : une table en CSV (séparateur « ; », compatible Excel) ;
 *  - ?fichier=<nom> : une sauvegarde automatique conservée dans le stockage.
 */
export async function GET(req: NextRequest) {
  const me = await directionOrNull();
  if (!me) return NextResponse.json({ error: "Réservé à la direction : reconnectez-vous avec un compte Direction." }, { status: 403 });

  const user = await createClient();
  // Clé service si disponible : sauvegarde complète, sans filtre de RLS (vues et brouillons de chaque membre)
  const db = (await serviceDb()) ?? user;
  const actor = { id: me.id, name: me.full_name || me.email };
  const sp = req.nextUrl.searchParams;

  // Une sauvegarde conservée dans le stockage
  const fichier = sp.get("fichier");
  if (fichier) {
    if (DEMO) return NextResponse.json({ error: "Aucun fichier stocké en mode démo." }, { status: 404 });
    if (!BACKUP_FILE_RE.test(fichier)) return NextResponse.json({ error: "Nom de fichier invalide." }, { status: 400 });
    const svc = await serviceDb();
    if (!svc) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquante." }, { status: 503 });
    const { data, error } = await svc.storage.from(BACKUP_BUCKET).download(fichier);
    if (error || !data) return NextResponse.json({ error: `Fichier introuvable : ${error?.message ?? ""}` }, { status: 404 });
    await logBackup(user, "sauvegarde.export", `Sauvegarde du stockage téléchargée : ${fichier}`, { file: fichier, from: "storage" }, actor);
    return new Response(data.stream(), {
      headers: { ...noStore, "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${fichier}"` },
    });
  }

  // Une table en CSV
  const table = sp.get("table");
  if (table) {
    if (!isTableName(table) || !listTables().includes(table)) return NextResponse.json({ error: "Table inconnue." }, { status: 400 });
    await logBackup(user, "sauvegarde.csv", `Table « ${table} » exportée en CSV`, { table }, actor);
    return new Response(tableCsvStream(db, table), {
      headers: { ...noStore, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="moovup-${table}-${dayKey()}.csv"` },
    });
  }

  // Tout, en JSON
  const file = backupFileName();
  await logBackup(user, "sauvegarde.export", `Sauvegarde complète téléchargée (${file})`, { file, tables: listTables().length }, actor);
  return new Response(backupStream(db), {
    headers: { ...noStore, "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${file}"` },
  });
}
