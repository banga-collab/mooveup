import { getProfile, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { entity } from "@/lib/entities";
import { fmtDate, fmtTime, PAY_LABEL, SALE_STATUS_LABEL } from "@/lib/utils";
import type { SaleItem } from "@/lib/types";
import { loadSales, readFilters } from "@/components/sales/query";

export const dynamic = "force-dynamic";

const cell = (v: string | number | null | undefined) => {
  const s = typeof v === "number" ? String(Math.round(v * 100) / 100).replace(".", ",") : (v ?? "");
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Export CSV des ventes (mêmes filtres que la page /ventes) */
export async function GET(req: Request) {
  await getProfile();
  const scope = await getScope();
  const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
  const f = readFilters(sp);
  const { sales, contacts, sellers } = await loadSales(scope, f);

  const supabase = await createClient();
  const lines = new Map<string, SaleItem[]>();
  const ids = sales.map((s) => s.id);
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await supabase.from("sale_items").select("*").in("sale_id", ids.slice(i, i + 500));
    for (const l of (data ?? []) as SaleItem[]) lines.set(l.sale_id, [...(lines.get(l.sale_id) ?? []), l]);
  }

  const head = ["Numéro", "Date", "Heure", "Établissement", "Client", "Téléphone", "Articles", "Remise (MAD)", "Total (MAD)", "Payé (MAD)", "Reste (MAD)", "Statut", "Mode de paiement", "Vendeur", "Note"];
  const rows = sales.map((s) => {
    const c = s.contact_id ? contacts.get(s.contact_id) : undefined;
    const items = (lines.get(s.id) ?? []).map((l) => (Number(l.qty) > 1 ? `${l.qty} x ${l.label}` : l.label)).join(" | ");
    const total = Number(s.total_mad);
    const paid = Number(s.paid_mad);
    return [
      s.number,
      fmtDate(s.sold_at, { day: "2-digit", month: "2-digit", year: "numeric" }),
      fmtTime(s.sold_at),
      entity(s.entity_id)?.short ?? s.entity_id,
      c?.full_name ?? "Client de passage",
      c?.phone ?? "",
      items,
      Number(s.discount_mad),
      total,
      paid,
      s.status === "remboursee" ? 0 : Math.max(0, total - paid),
      SALE_STATUS_LABEL[s.status],
      PAY_LABEL[s.method],
      (s.sold_by && sellers.get(s.sold_by)?.full_name) || "",
      s.notes ?? "",
    ].map(cell);
  });

  const csv = "﻿" + [head.map(cell), ...rows].map((r) => r.join(";")).join("\r\n") + "\r\n";
  const name = `ventes_${f.du}_${f.au}${scope.current ? `_${scope.current.id}` : ""}.csv`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
