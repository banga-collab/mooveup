import { getProfile, getScope } from "@/lib/auth";
import { entity } from "@/lib/entities";
import { fmtDate, fmtTime, PAY_LABEL, SALE_STATUS_LABEL } from "@/lib/utils";
import { linesLabel, loadSales, readFilters } from "@/components/sales/query";
import { exportResponse, readFormat } from "@/lib/export/server";
import { tableDoc } from "@/lib/export/doc";
import type { ExportColumn, ExportFilter } from "@/lib/export/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const COLUMNS: ExportColumn[] = [
  { key: "number", label: "Numéro" },
  { key: "date", label: "Date" },
  { key: "time", label: "Heure" },
  { key: "entity", label: "Établissement" },
  { key: "client", label: "Client" },
  { key: "phone", label: "Téléphone" },
  { key: "items", label: "Articles" },
  { key: "discount", label: "Remise", kind: "money" },
  { key: "total", label: "Total", kind: "money" },
  { key: "paid", label: "Payé", kind: "money" },
  { key: "due", label: "Reste", kind: "money" },
  { key: "status", label: "Statut" },
  { key: "method", label: "Mode de paiement" },
  { key: "seller", label: "Vendeur" },
  { key: "notes", label: "Note" },
];

/**
 * Export comptable des ventes (mêmes filtres et recherche que la page /ventes),
 * avec l'en-tête Moov'Up. `?format=xlsx` (défaut) | `pdf` | `csv`.
 */
export async function GET(req: Request) {
  await getProfile();
  const scope = await getScope();
  const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
  const f = readFilters(sp);
  const { sales, contacts, sellers, lines } = await loadSales(scope, f);

  const rows = sales.map((s) => {
    const c = s.contact_id ? contacts.get(s.contact_id) : undefined;
    const total = Number(s.total_mad);
    const paid = Number(s.paid_mad);
    return {
      number: s.number,
      date: fmtDate(s.sold_at, { day: "2-digit", month: "2-digit", year: "numeric" }),
      time: fmtTime(s.sold_at),
      entity: entity(s.entity_id)?.short ?? s.entity_id,
      client: c?.full_name ?? "Client de passage",
      phone: c?.phone ?? "",
      items: linesLabel(lines.get(s.id)),
      discount: Number(s.discount_mad),
      total,
      paid,
      due: s.status === "remboursee" ? 0 : Math.max(0, total - paid),
      status: SALE_STATUS_LABEL[s.status],
      method: PAY_LABEL[s.method],
      seller: (s.sold_by && sellers.get(s.sold_by)?.full_name) || "",
      notes: s.notes ?? "",
    };
  });
  const sum = (k: "discount" | "total" | "paid" | "due") => rows.reduce((a, r) => a + r[k], 0);

  const filters: ExportFilter[] = [{ label: "Période", value: `du ${fmtDate(f.du)} au ${fmtDate(f.au)}` }];
  if (f.etab) filters.push({ label: "Établissement", value: entity(f.etab)?.short ?? f.etab });
  if (f.statut) filters.push({ label: "Statut", value: SALE_STATUS_LABEL[f.statut] });
  if (f.mode) filters.push({ label: "Paiement", value: PAY_LABEL[f.mode] });
  if (f.q) filters.push({ label: "Recherche", value: `« ${f.q} »` });

  const doc = tableDoc({
    title: "Ventes",
    subtitle: `du ${fmtDate(f.du)} au ${fmtDate(f.au)}`,
    fileName: `ventes_${f.du}_${f.au}${f.etab ? `_${f.etab}` : scope.current ? `_${scope.current.id}` : ""}`,
    filters,
    columns: COLUMNS,
    rows,
    totals: rows.length ? { number: "TOTAL", items: `${rows.length} vente${rows.length > 1 ? "s" : ""}`, discount: sum("discount"), total: sum("total"), paid: sum("paid"), due: sum("due") } : undefined,
  });
  doc.countLabel = rows.length > 1 ? "ventes" : "vente";
  doc.landscape = true;
  return exportResponse(doc, readFormat(req, "xlsx"), req);
}
