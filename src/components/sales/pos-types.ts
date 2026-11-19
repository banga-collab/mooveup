import type { CatalogKind, PayMethod } from "@/lib/types";

/** Ligne du panier (remise de ligne en %) */
export type CartLine = { key: string; item_id: string | null; label: string; kind: CatalogKind | null; qty: number; unit_price: number; disc_pct?: number };

export type PosItem = {
  id: string;
  entity_id: string;
  kind: CatalogKind;
  name: string;
  category: string;
  price: number;
  /** null = stock non suivi */
  stock: number | null;
  /** Seuil d'alerte (stock bas) */
  alert: number;
  barcode: string | null;
  duration_min: number | null;
  duration_days: number | null;
  sessions_count: number | null;
};

export type PosEntity = { id: string; short: string; name: string; color: string; soft: string; address: string; phone: string };

export type PosSession = { id: string; entity_id: string; status: "ouverte" | "cloturee"; float: number; opened_at: string; opened_by: string; closed_at: string | null };

export type PosCashMove = { id: string; entity_id: string; kind: "depot" | "retrait"; amount: number; reason: string; at: string; by: string };

/** Paiement d'un encaissement (montant net appliqué ; espèces : montant remis) */
export type PosPayment = { method: PayMethod; amount: number; tendered?: number | null };

/** Données d'un ticket de caisse (80 mm) */
export type TicketData = {
  sale_id: string;
  number: string;
  sold_at: string;
  company: { name: string; address: string; phone: string; ice: string; footer: string };
  entity: { name: string; address: string; phone: string };
  cashier: string;
  client: string | null;
  lines: { label: string; qty: number; unit_price: number; total: number }[];
  gross: number;
  discount: number;
  total: number;
  payments: { method: PayMethod; amount: number }[];
  tendered_cash: number;
  change: number;
  paid: number;
  rest: number;
  refunded?: boolean;
};
