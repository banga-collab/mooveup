/**
 * Stock : journal des mouvements liés aux ventes.
 * Le stock de `catalog_items` est déjà mis à jour par la caisse ;
 * ici on garde la trace (sortie à la vente, retour au remboursement).
 */
import type { CatalogItem, Contact, Profile, Sale, SaleItem } from "./types";
import type { SaleLine } from "./hooks";
import { createClient } from "./supabase/server";

async function productsOf(ids: string[]) {
  if (!ids.length) return new Map<string, CatalogItem>();
  const supabase = await createClient();
  const { data } = await supabase.from("catalog_items").select("*").in("id", ids);
  return new Map(((data ?? []) as CatalogItem[]).filter((i) => i.kind === "produit").map((i) => [i.id, i]));
}

function sumByItem(lines: { item_id: string | null; qty: number }[]) {
  const m = new Map<string, number>();
  for (const l of lines) if (l.item_id) m.set(l.item_id, (m.get(l.item_id) ?? 0) + Number(l.qty));
  return m;
}

/** Enregistre les sorties de stock d'une vente (le stock du catalogue est déjà décrémenté par la caisse) */
export async function recordSaleStockOut(ctx: { sale: Sale; lines: SaleLine[]; contact: Contact | null; profile: Profile }): Promise<void> {
  try {
    const qty = sumByItem(ctx.lines);
    const items = await productsOf([...qty.keys()]);
    if (!items.size) return;
    const supabase = await createClient();
    await supabase.from("stock_movements").insert(
      [...items.values()].map((it) => ({
        entity_id: ctx.sale.entity_id,
        item_id: it.id,
        kind: "sortie",
        reason: "vente",
        qty: -(qty.get(it.id) ?? 0),
        stock_after: it.stock === null ? null : Number(it.stock),
        ref_id: ctx.sale.id,
        note: `Vente ${ctx.sale.number}`,
        author_id: ctx.profile.id,
      })),
    );
  } catch {
    // Le journal de stock ne doit jamais bloquer une vente
  }
}

/** Enregistre le retour en stock d'une vente remboursée (le stock du catalogue est déjà réincrémenté) */
export async function recordSaleStockBack(ctx: { sale: Sale; profile: Profile }): Promise<void> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("sale_items").select("*").eq("sale_id", ctx.sale.id);
    const qty = sumByItem((data ?? []) as SaleItem[]);
    const items = await productsOf([...qty.keys()]);
    if (!items.size) return;
    await supabase.from("stock_movements").insert(
      [...items.values()].map((it) => ({
        entity_id: ctx.sale.entity_id,
        item_id: it.id,
        kind: "entree",
        reason: "remboursement",
        qty: qty.get(it.id) ?? 0,
        stock_after: it.stock === null ? null : Number(it.stock),
        ref_id: ctx.sale.id,
        note: `Remboursement ${ctx.sale.number}`,
        author_id: ctx.profile.id,
      })),
    );
  } catch {
    // Idem : le remboursement reste prioritaire
  }
}
