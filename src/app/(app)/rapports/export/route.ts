import { getScope, requireManager } from "@/lib/auth";
import { loadReports } from "@/components/reports/load";
import { reportsDoc } from "@/components/reports/report-doc";
import { exportResponse, readFormat } from "@/lib/export/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Export de /rapports (mêmes paramètres que la page) :
 * `?format=pdf` (défaut : page A4 avec graphiques SVG et tableaux) | `xlsx` (chiffres) | `csv`.
 */
export async function GET(req: Request) {
  await requireManager();
  const scope = await getScope();
  const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
  const data = await loadReports(sp, scope);
  return exportResponse(reportsDoc(data), readFormat(req, "pdf"), req);
}
