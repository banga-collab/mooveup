import { getScope, requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { CompanyInvoice, CompanyInvoiceLine } from "@/lib/types-corporate";
import { INVOICE_STATUS_LABEL } from "@/lib/types-corporate";
import { csvCell, monthLabel } from "@/components/corporate/calc";
import { loadCompany } from "@/components/corporate/data";

export const dynamic = "force-dynamic";

/** Export CSV d'une facture entreprise pour le service RH (une ligne par salarié) */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; invoiceId: string }> }) {
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

  const head = ["Facture", "Mois", "Matricule", "Salarié", "Téléphone", "Détail", "Brut (MAD)", "Remise (MAD)", "Net (MAD)", "Part entreprise (MAD)", "Part salarié (MAD)", "Statut facture"];
  const rows = lines.map((l) => [
    inv.number,
    monthLabel(inv.month),
    l.matricule,
    l.label,
    l.contact_id ? phones.get(l.contact_id) ?? "" : "",
    l.detail,
    Number(l.gross_mad),
    Number(l.discount_mad),
    Number(l.net_mad),
    Number(l.company_mad),
    Number(l.employee_mad),
    INVOICE_STATUS_LABEL[inv.status],
  ]);
  const sum = (k: keyof CompanyInvoiceLine) => lines.reduce((a, l) => a + Number(l[k]), 0);
  rows.push([inv.number, monthLabel(inv.month), "", "TOTAL", "", `${lines.length} salariés`, sum("gross_mad"), sum("discount_mad"), sum("net_mad"), sum("company_mad"), sum("employee_mad"), ""]);

  const csv = "﻿" + [head, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n") + "\r\n";
  const slug = company.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${inv.number}_${slug}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
