/**
 * Points d'extension appelés par les actions de vente.
 * Chaque module branche sa logique dans son propre fichier :
 *  - fidélité : src/lib/loyalty.ts
 *  - journal  : src/lib/audit.ts
 *  - stock    : src/lib/stock.ts
 */
import type { Contact, Profile, Sale } from "./types";
import { awardLoyaltyForSale, revokeLoyaltyForSale } from "./loyalty";
import { logAudit } from "./audit";
import { recordSaleStockOut, recordSaleStockBack } from "./stock";

export type SaleLine = { item_id: string | null; label: string; qty: number; unit_price_mad: number };

export async function onSaleCreated(ctx: { sale: Sale; lines: SaleLine[]; contact: Contact | null; profile: Profile; discount: number }) {
  await Promise.all([
    awardLoyaltyForSale(ctx),
    recordSaleStockOut(ctx),
    ctx.discount > 0
      ? logAudit({ action: "vente.remise", entity_id: ctx.sale.entity_id, target_type: "sale", target_id: ctx.sale.id, summary: `Remise de ${ctx.discount} MAD sur la vente ${ctx.sale.number}`, actor: ctx.profile })
      : Promise.resolve(),
  ]);
}

export async function onSaleRefunded(ctx: { sale: Sale; profile: Profile }) {
  await Promise.all([
    revokeLoyaltyForSale(ctx),
    recordSaleStockBack(ctx),
    logAudit({ action: "vente.remboursement", entity_id: ctx.sale.entity_id, target_type: "sale", target_id: ctx.sale.id, summary: `Vente ${ctx.sale.number} remboursée (${ctx.sale.paid_mad} MAD)`, actor: ctx.profile }),
  ]);
}
