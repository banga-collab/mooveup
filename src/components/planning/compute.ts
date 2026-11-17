import type { Scope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { byId } from "@/lib/data";
import { agadirToIso, dayKey } from "@/lib/utils";
import type { Appointment, CatalogItem, Sale, SaleItem } from "@/lib/types";
import type { CommissionRule } from "@/lib/types-ops";
import { findRule, groupByPerson, type CommissionLine } from "./lib";

/** Commissions d'un mois (AAAA-MM) sur le périmètre */
export async function computeCommissions(scope: Scope, month: string) {
  const supabase = await createClient();
  const from = agadirToIso(`${month}-01`, "00:00");
  const [y, m] = month.split("-").map(Number) as [number, number];
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const to = agadirToIso(`${next}-01`, "00:00");

  const [{ data: ap }, { data: sa }, { data: cat }, { data: ru }] = await Promise.all([
    supabase.from("appointments").select("*").in("entity_id", scope.ids).eq("status", "termine").gte("starts_at", from).lt("starts_at", to),
    supabase.from("sales").select("*").in("entity_id", scope.ids).gte("sold_at", from).lt("sold_at", to),
    supabase.from("catalog_items").select("*").in("entity_id", scope.ids),
    supabase.from("commission_rules").select("*").in("entity_id", scope.ids).order("entity_id"),
  ]);
  const catalog = (cat ?? []) as CatalogItem[];
  const items = byId(catalog);
  const rules = (ru ?? []) as CommissionRule[];
  const sales = ((sa ?? []) as Sale[]).filter((s) => s.status !== "remboursee" && s.sold_by);
  const saleMap = byId(sales);
  const { data: li } = sales.length ? await supabase.from("sale_items").select("*").in("sale_id", sales.map((s) => s.id)) : { data: [] };

  const lines: (CommissionLine & { profile_id: string })[] = [];
  for (const a of (ap ?? []) as Appointment[]) {
    if (!a.staff_id) continue;
    const category = (a.item_id && items.get(a.item_id)?.category) || "";
    const rule = findRule(rules, { entity_id: a.entity_id, profile_id: a.staff_id, basis: "prestations", category });
    const amount = Number(a.price_mad) || 0;
    const rate = rule ? Number(rule.rate_pct) : 0;
    lines.push({ profile_id: a.staff_id, basis: "prestations", entity_id: a.entity_id, date: dayKey(a.starts_at), label: a.service, category, amount, rate, commission: Math.round(amount * rate) / 100 });
  }
  for (const l of (li ?? []) as SaleItem[]) {
    const it = l.item_id ? items.get(l.item_id) : undefined;
    const s = saleMap.get(l.sale_id);
    if (!it || it.kind !== "produit" || !s?.sold_by) continue;
    const amount = Number(l.qty) * Number(l.unit_price_mad);
    const rule = findRule(rules, { entity_id: s.entity_id, profile_id: s.sold_by, basis: "produits", category: it.category });
    const rate = rule ? Number(rule.rate_pct) : 0;
    lines.push({ profile_id: s.sold_by, basis: "produits", entity_id: s.entity_id, date: dayKey(s.sold_at), label: l.label, category: it.category, amount, rate, commission: Math.round(amount * rate) / 100 });
  }
  const categories = [...new Set(catalog.filter((i) => i.kind === "prestation" || i.kind === "produit").map((i) => i.category).filter(Boolean))].sort();
  return { persons: groupByPerson(lines), rules, categories };
}
