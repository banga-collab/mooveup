import { NextResponse } from "next/server";
import { getProfile, getScope } from "@/lib/auth";
import { entity } from "@/lib/entities";
import { loadClientReport } from "@/components/client-report/load";
import { clientReportDoc } from "@/components/client-report/doc";
import { readClientParams } from "@/components/client-report/params";
import { exportResponse, readFormat } from "@/lib/export/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Export des rapports clients (mêmes paramètres que /rapports-clients) :
 * `?format=pdf` (défaut : un rapport par client, sauts de page) | `xlsx` (une feuille par rubrique) | `csv`.
 */
export async function GET(req: Request) {
  const me = await getProfile();
  if (me.role === "staff") return NextResponse.json({ error: "Réservé à la direction, aux managers et à la réception." }, { status: 403 });
  const scope = await getScope();
  const sp = new URL(req.url).searchParams;
  const p = readClientParams(sp, scope);
  if (!p.mode) return NextResponse.json({ error: "Choisissez au moins un client (ou « Tous les clients »)." }, { status: 400 });
  const data = await loadClientReport(scope, p);
  const doc = clientReportDoc(data, { period: p.period, mode: p.mode, etabName: p.etab ? (entity(p.etab)?.name ?? p.etab) : null });
  return exportResponse(doc, readFormat(req, "pdf"), req);
}
