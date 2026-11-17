import type { EntityId } from "./entities";
import type { PayMethod } from "./types";

/* ---------- Caisse ---------- */

/** Montants d'une journée de caisse (instantané enregistré à la clôture) */
export type CashTotals = {
  /** Ventes du jour encaissées à la vente, par mode */
  sales: Record<PayMethod, number>;
  /** Soldes de ventes antérieures encaissés ce jour, par mode */
  balances: Record<PayMethod, number>;
  sales_count: number;
  refunds_total: number;
  refunds_cash: number;
  expenses_total: number;
  expenses_cash: number;
  /** Espèces entrées (ventes + soldes) */
  cash_in: number;
};

export type CashSessionStatus = "ouverte" | "cloturee";

export type CashSession = {
  id: string;
  entity_id: EntityId;
  /** Journée AAAA-MM-JJ (Agadir) */
  day: string;
  status: CashSessionStatus;
  opening_float_mad: number;
  opened_at: string;
  opened_by: string | null;
  closed_at: string | null;
  closed_by: string | null;
  expected_cash_mad: number | null;
  counted_cash_mad: number | null;
  difference_mad: number | null;
  comment: string | null;
  /** Billetage : { "200": 3, "100": 5, … } */
  breakdown: Record<string, number> | null;
  totals: CashTotals | null;
  created_at: string;
};

/** Billets et pièces en dirhams */
export const DENOMINATIONS = [200, 100, 50, 20, 10, 5, 2, 1] as const;

/** Écart toléré sans commentaire (MAD) */
export const CASH_TOLERANCE = 20;

/* ---------- Dépenses ---------- */

export type ExpenseCategory = "loyer" | "salaires" | "produits" | "energie" | "marketing" | "entretien" | "fournitures" | "autre";
export type ExpenseMethod = Exclude<PayMethod, "en_ligne"> | "prelevement";

export type Expense = {
  id: string;
  entity_id: EntityId;
  /** AAAA-MM-JJ */
  date: string;
  category: ExpenseCategory;
  amount_mad: number;
  method: ExpenseMethod;
  supplier: string | null;
  note: string | null;
  receipt_url: string | null;
  created_by: string | null;
  created_at: string;
};

export const EXPENSE_CATEGORIES: { id: ExpenseCategory; label: string }[] = [
  { id: "loyer", label: "Loyer" },
  { id: "salaires", label: "Salaires" },
  { id: "produits", label: "Produits & consommables" },
  { id: "energie", label: "Électricité / eau" },
  { id: "marketing", label: "Marketing" },
  { id: "entretien", label: "Entretien" },
  { id: "fournitures", label: "Fournitures" },
  { id: "autre", label: "Autre" },
];
export const EXPENSE_CATEGORY_LABEL = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.id, c.label])) as Record<ExpenseCategory, string>;

export const EXPENSE_METHOD_LABEL: Record<ExpenseMethod, string> = {
  especes: "Espèces (caisse)",
  carte: "Carte bancaire",
  virement: "Virement",
  cheque: "Chèque",
  prelevement: "Prélèvement",
};

/* ---------- Journal ---------- */

export type AuditEntry = {
  id: string;
  action: string;
  entity_id: EntityId | null;
  target_type: string;
  target_id: string | null;
  summary: string;
  actor_id: string | null;
  actor_name: string;
  meta: Record<string, unknown> | null;
  created_at: string;
};
