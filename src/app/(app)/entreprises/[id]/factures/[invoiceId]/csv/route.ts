import { getScope, requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { CompanyInvoice, CompanyInvoiceLine } from "@/lib/types-corporate";
import { INVOICE_STATUS_LABEL } from "@/lib/types-corporate";
import { monthLabel } from "@/components/corporate/calc";
import { loadCompany } from "@/components/corporate/data";
import { exportResponse, readFormat } from "@/lib/export/server";
import { tableDoc } from "@/lib/export/doc";
import type { ExportColumn } from "@/lib/export/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const COLUMNS: ExportColumn[] = [
  { key: "invoice", label: "Facture" },
  { key: "month", label: "Mois" },
  { key: "matricule", label: "Matricule" },
  { key: "label", label: "Salarié" },
  { key: "phone", label: "Téléphone" },
  { key: "detail", label: "Détail" },
  { key: "gross", label: "Brut", kind: "money" },
  { key: "discount", label: "Remise", kind: "money" },
  { key: "net", label: "Net", kind: "money" },
  { key: "company", label: "Part entreprise", kind: "money" },
  { key: "employee", label: "Part salarié", kind: "money" },
  { key: "status", label: "Statut facture" },
];

/**
 * Export d'une facture entreprise pour le service RH (une ligne par salarié), avec l'en-tête Moov'Up.
 * `?format=xlsx` (défaut) | `pdf` | `csv`.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; invoiceId: string }> }) {
  await requireManager();
  const { id, invoiceId } = await params;
  const [scope, supabase] = await Promise.all([getScope(), createClient()]);
  const company = await loadCompany(supabase, scope, id);
  const { data } = await supabase.from("company_invoices").select("*").eq("id", invoiceId).maybeSingle();
  const inv = data as CompanyInvoice | null;
  if (!company || !inv || inv.company_id !== company.id) return new Response("Facture introuvable", { status: 404 });

  const { data: lineRows } = await supabase.from("company_invoice_lines").select("*").eq("invoice_id", inv.id);
  const lines = ((lineRows ?? []) as CompanyInvoiceLine[]).sort((a, b) => a.label.localeCompare(b.label, "fr"));
  const { data: cRows } = await supabase.from("contacts").select("id,phone").in("id", lines.map((l) => l.contact_id).filter((x): x is string => !!x));
  const phones = new Map(((cRows ?? []) as { id: string; phone: string | null }[]).map((c) => [c.id, c.phone]));

  const rows = lines.map((l) => ({
    invoice: inv.number,
    month: monthLabel(inv.month),
    matricule: l.matricule,
    label: l.label,
    phone: l.contact_id ? (phones.get(l.contact_id) ?? "") : "",
    detail: l.detail,
    gross: Number(l.gross_mad),
    discount: Number(l.discount_mad),
    net: Number(l.net_mad),
    company: Number(l.company_mad),
    employee: Number(l.employee_mad),
    status: INVOICE_STATUS_LABEL[inv.status],
  }));
  const sum = (k: keyof CompanyInvoiceLine) => lines.reduce((a, l) => a + Number(l[k]), 0);

  const doc = tableDoc({
    title: `Facture ${inv.number} — ${company.name}`,
    subtitle: monthLabel(inv.month),
    fileName: `${inv.number}_${company.name}`,
    filters: [
      { label: "Entreprise", value: company.name },
      { label: "Mois", value: monthLabel(inv.month) },
      { label: "Statut", value: INVOICE_STATUS_LABEL[inv.status] },
    ],
    columns: COLUMNS,
    rows,
    totals: { invoice: inv.number, label: "TOTAL", detail: `${lines.length} salariés`, gross: sum("gross_mad"), discount: sum("discount_mad"), net: sum("net_mad"), company: sum("company_mad"), employee: sum("employee_mad") },
  });
  doc.countLabel = lines.length > 1 ? "salariés" : "salarié";
  doc.landscape = true;
  return exportResponse(doc, readFormat(req, "xlsx"), req);
}
