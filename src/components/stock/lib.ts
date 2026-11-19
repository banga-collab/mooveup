import type { CatalogItem } from "@/lib/types";
import { DEFAULT_ALERT_QTY, MOVEMENT_REASON_LABEL, type StockSetting, type Supplier } from "@/lib/types-ops";

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
  barcode: string | null;
  /** Clé commune d'un même produit dans plusieurs établissements (code-barres ou nom) */
  key: string;
};

/** Code-barres d'un article (colonne `barcode`, facultative) */
export const barcodeOf = (item: CatalogItem) => ((item as CatalogItem & { barcode?: string | null }).barcode ?? null) || null;

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Même produit dans plusieurs établissements : même code-barres, sinon même nom */
export const productKey = (item: CatalogItem) => {
  const b = barcodeOf(item);
  return b ? `b:${b}` : `n:${norm(item.name)}`;
};

export function buildRows(items: CatalogItem[], settings: StockSetting[], suppliers: Supplier[]): ProductRow[] {
  const byItem = new Map(settings.map((s) => [s.item_id, s]));
  // Un nom commun relie les articles avec et sans code-barres
  const keyByName = new Map<string, string>();
  for (const it of items) if (barcodeOf(it)) keyByName.set(norm(it.name), productKey(it));
  return items.map((item) => {
    const s = byItem.get(item.id);
    const stock = Math.max(0, Number(item.stock ?? 0));
    const alert = s ? Number(s.alert_qty) : DEFAULT_ALERT_QTY;
    const hasCost = s?.unit_cost_mad != null;
    const cost = hasCost ? Number(s!.unit_cost_mad) : Number(item.price_mad);
    const supplier = suppliers.find((x) => x.id === s?.supplier_id) ?? suppliers.find((x) => (x.product_ids ?? []).includes(item.id)) ?? null;
    const barcode = barcodeOf(item);
    const key = barcode ? productKey(item) : (keyByName.get(norm(item.name)) ?? productKey(item));
    return { item, stock, alert, cost, hasCost, value: stock * cost, low: stock <= alert, supplier, barcode, key };
  });
}

/** Quantité suggérée pour revenir à un stock confortable (3 × le seuil) */
export function suggestedQty(r: Pick<ProductRow, "stock" | "alert">) {
  return Math.max(1, r.alert * 3 - r.stock);
}

/** Libellé d'un motif de mouvement (dont « transfert » entre établissements) */
export function reasonLabel(reason: string) {
  if (reason === "transfert") return "Transfert";
  return (MOVEMENT_REASON_LABEL as Record<string, string>)[reason] ?? reason;
}

export type TransferLine = { label: string; qty: number; from_item_id: string; to_item_id: string; unit_cost_mad: number };
export type StockTransfer = {
  id: string;
  number: string;
  from_entity_id: string;
  to_entity_id: string;
  lines: TransferLine[];
  note: string | null;
  created_by: string | null;
  created_at: string;
};
