import { NextResponse, type NextRequest } from "next/server";
import { ENTITY_IDS } from "@/lib/entities";
import { runAutomations, serviceClient, siteOrigin } from "@/lib/automations";

export const dynamic = "force-dynamic";

/**
 * Rappels WhatsApp automatiques.
 * À appeler toutes les heures par un planificateur : GET /api/cron?secret=<CRON_SECRET>
 * Chaque règle n'envoie qu'à partir de son heure (ex. rappels de la veille à 18 h),
 * jamais entre 21 h et 8 h, et une seule fois par client et par jour.
 * `&force=1` ignore les heures (test manuel).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const given = req.nextUrl.searchParams.get("secret") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret) return NextResponse.json({ error: "CRON_SECRET non configuré" }, { status: 503 });
  if (given !== secret) return NextResponse.json({ error: "Accès refusé" }, { status: 401 });

  try {
    const supabase = await serviceClient();
    const summary = await runAutomations({
      supabase,
      entityIds: ENTITY_IDS,
      authorId: null,
      origin: await siteOrigin(),
      scheduled: req.nextUrl.searchParams.get("force") !== "1",
    });
    return NextResponse.json({ ok: true, at: new Date().toISOString(), ...summary });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Erreur" }, { status: 500 });
  }
}
