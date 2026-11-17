import type { CatalogItem } from "@/lib/types";
import { DEFAULT_ALERT_QTY, type StockSetting, type Supplier } from "@/lib/types-ops";

export type ProductRow = {
  item: CatalogItem;
  stock: number;
  alert: number;
  /** Prix d'achat (à défaut : prix de vente) */
  cost: number;
  hasCost: boolean;
  value: number;
  low: boolean;
  supplier: Supplier | null;
};

export function buildRows(items: CatalogItem[], settings: StockSetting[], suppliers: Supplier[]): ProductRow[] {
  const byItem = new Map(settings.map((s) => [s.item_id, s]));
  return items.map((item) => {
    const s = byItem.get(item.id);
    const stock = Math.max(0, Number(item.stock ?? 0));
    const alert = s ? Number(s.alert_qty) : DEFAULT_ALERT_QTY;
    const hasCost = s?.unit_cost_mad != null;
    const cost = hasCost ? Number(s!.unit_cost_mad) : Number(item.price_mad);
    const supplier = suppliers.find((x) => x.id === s?.supplier_id) ?? suppliers.find((x) => (x.product_ids ?? []).includes(item.id)) ?? null;
    return { item, stock, alert, cost, hasCost, value: stock * cost, low: stock <= alert, supplier };
  });
}

/** Quantité suggérée pour revenir à un stock confortable (3 × le seuil) */
export function suggestedQty(r: Pick<ProductRow, "stock" | "alert">) {
  return Math.max(1, r.alert * 3 - r.stock);
}
