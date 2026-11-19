import type { EntityId } from "./entities";

/* ---------- Planning ---------- */
export type ShiftKind = "travail" | "repos" | "conge";

export type Shift = {
  id: string;
  entity_id: EntityId;
  profile_id: string;
  /** AAAA-MM-JJ */
  date: string;
  /** "HH:MM" (null pour repos / congé) */
  start_time: string | null;
  end_time: string | null;
  kind: ShiftKind;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

/** Pointage : une arrivée et (plus tard) un départ */
export type TimeEntry = {
  id: string;
  entity_id: EntityId;
  profile_id: string;
  /** AAAA-MM-JJ (Agadir) */
  date: string;
  clock_in: string;
  clock_out: string | null;
  created_at: string;
};

export type CommissionBasis = "prestations" | "produits";

/**
 * Règle de commission. La plus précise l'emporte :
 * membre + catégorie > membre > catégorie > toute l'équipe de l'établissement.
 */
export type CommissionRule = {
  id: string;
  entity_id: EntityId;
  /** null = toute l'équipe de l'établissement */
  profile_id: string | null;
  basis: CommissionBasis;
  /** Catégorie du catalogue (null = toutes) */
  category: string | null;
  rate_pct: number;
  active: boolean;
  created_at: string;
};

/* ---------- Stock ---------- */
export type Supplier = {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  entity_ids: EntityId[];
  /** Articles du catalogue fournis */
  product_ids: string[];
  notes: string | null;
  created_at: string;
};

/** Réglages de stock d'un produit du catalogue */
export type StockSetting = {
  id: string;
  item_id: string;
  entity_id: EntityId;
  alert_qty: number;
  unit_cost_mad: number | null;
  supplier_id: string | null;
  created_at: string;
};

export type MovementKind = "entree" | "sortie" | "ajustement";
export type MovementReason = "vente" | "remboursement" | "reception" | "inventaire" | "manuel" | "perte" | "transfert";

export type StockMovement = {
  id: string;
  entity_id: EntityId;
  item_id: string;
  kind: MovementKind;
  reason: MovementReason;
  /** Quantité signée : + entrée, − sortie */
  qty: number;
  stock_after: number | null;
  ref_id: string | null;
  note: string | null;
  author_id: string | null;
  created_at: string;
};

export type OrderStatus = "brouillon" | "envoyee" | "recue";
export type OrderLine = { item_id: string; label: string; qty: number; unit_cost_mad: number };

export type PurchaseOrder = {
  id: string;
  number: string;
  entity_id: EntityId;
  supplier_id: string | null;
  status: OrderStatus;
  lines: OrderLine[];
  total_mad: number;
  notes: string | null;
  sent_at: string | null;
  received_at: string | null;
  created_by: string | null;
  created_at: string;
};

/* ---------- Libellés et constantes (utilisables côté client) ---------- */
export const DEFAULT_ALERT_QTY = 5;

export const SHIFT_KIND_LABEL: Record<ShiftKind, string> = { travail: "Travail", repos: "Repos", conge: "Congé" };
export const MOVEMENT_KIND_LABEL: Record<MovementKind, string> = { entree: "Entrée", sortie: "Sortie", ajustement: "Ajustement" };
export const MOVEMENT_REASON_LABEL: Record<MovementReason, string> = {
  vente: "Vente",
  remboursement: "Vente remboursée",
  reception: "Réception commande",
  inventaire: "Inventaire",
  manuel: "Saisie manuelle",
  perte: "Perte / casse",
  transfert: "Transfert",
};
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = { brouillon: "Brouillon", envoyee: "Envoyée", recue: "Reçue" };
export const BASIS_LABEL: Record<CommissionBasis, string> = { prestations: "Prestations réalisées", produits: "Ventes de produits" };
