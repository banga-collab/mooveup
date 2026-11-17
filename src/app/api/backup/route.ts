import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { storeBackup } from "@/lib/backup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Laisse le temps d'exporter toutes les tables (plafonné selon l'offre Vercel) */
export const maxDuration = 300;

function sameSecret(given: string | null | undefined, secret: string) {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Sauvegarde automatique (planifiée chaque nuit dans vercel.json).
 * GET /api/backup?secret=<CRON_SECRET>  ou en-tête « Authorization: Bearer <CRON_SECRET> »
 * (Vercel Cron envoie automatiquement cet en-tête quand CRON_SECRET est défini).
 * Écrit moovup-sauvegarde-AAAA-MM-JJ.json dans le bucket privé « sauvegardes »
 * et ne garde que les 30 plus récentes. En démo : sauvegarde simulée.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "CRON_SECRET non configuré" }, { status: 503 });
  const given = req.nextUrl.searchParams.get("secret") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!sameSecret(given, secret)) return NextResponse.json({ ok: false, error: "Accès refusé" }, { status: 401 });

  const r = await storeBackup();
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 500 });
  return NextResponse.json({
    ok: true,
    at: new Date().toISOString(),
    mode: r.mode,
    file: r.file,
    tables: r.stats.tables,
    rows: r.stats.rows,
    errors: r.stats.errors,
    deleted: r.deleted,
  });
}
