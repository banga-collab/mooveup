import type { SupabaseClient } from "@supabase/supabase-js";
import { addDaysKey, agadirToIso } from "@/lib/utils";
import type { PayMethod, Sale } from "@/lib/types";
import type { AuditEntry, CashTotals, Expense } from "@/lib/types-finance";

export const METHODS: PayMethod[] = ["especes", "carte", "virement", "cheque", "en_ligne"];

const zero = () => Object.fromEntries(METHODS.map((m) => [m, 0])) as Record<PayMethod, number>;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Bornes ISO d'une journée à Agadir */
export function dayBounds(day: string) {
  return { start: agadirToIso(day, "00:00"), end: agadirToIso(addDaysKey(day, 1), "00:00") };
}

/**
 * Montants d'une journée de caisse pour un établissement :
 * ventes encaissées par mode, soldes encaissés, remboursements, dépenses.
 */
export async function computeCashDay(supabase: SupabaseClient, entityId: string, day: string): Promise<CashTotals> {
  const { start, end } = dayBounds(day);
  const [{ data: saleRows }, { data: payRows }, { data: refundRows }, { data: expRows }] = await Promise.all([
    supabase.from("sales").select("*").eq("entity_id", entityId).gte("sold_at", start).lt("sold_at", end),
    supabase.from("audit_log").select("*").eq("action", "vente.paiement").eq("entity_id", entityId).gte("created_at", start).lt("created_at", end),
    supabase.from("audit_log").select("*").eq("action", "vente.remboursement").eq("entity_id", entityId).gte("created_at", start).lt("created_at", end),
    supabase.from("expenses").select("*").eq("entity_id", entityId).eq("date", day),
  ]);
  const sales = (saleRows ?? []) as Sale[];
  const payments = (payRows ?? []) as AuditEntry[];
  const refunds = (refundRows ?? []) as AuditEntry[];
  const expenses = (expRows ?? []) as Expense[];

  // Paiements complémentaires (tous jours confondus) des ventes du jour : à retirer de leur encaissement initial
  const saleIds = sales.map((s) => s.id);
  const { data: laterRows } = saleIds.length
    ? await supabase.from("audit_log").select("*").eq("action", "vente.paiement").in("target_id", saleIds)
    : { data: [] };
  const later = new Map<string, number>();
  for (const p of (laterRows ?? []) as AuditEntry[]) later.set(p.target_id ?? "", (later.get(p.target_id ?? "") ?? 0) + Number(p.meta?.amount ?? 0));

  const salesBy = zero();
  for (const s of sales) {
    const initial = Math.max(0, Number(s.paid_mad) - (later.get(s.id) ?? 0));
    if (METHODS.includes(s.method)) salesBy[s.method] += initial;
  }

  const balances = zero();
  for (const p of payments) {
    const m = String(p.meta?.method ?? "") as PayMethod;
    if (METHODS.includes(m)) balances[m] += Number(p.meta?.amount ?? 0);
  }

  // Remboursements : montant et mode de la vente d'origine
  const refundIds = refunds.map((r) => r.target_id).filter((x): x is string => !!x);
  const { data: refundedRows } = refundIds.length ? await supabase.from("sales").select("*").in("id", refundIds) : { data: [] };
  const refunded = new Map(((refundedRows ?? []) as Sale[]).map((s) => [s.id, s]));
  let refundsTotal = 0;
  let refundsCash = 0;
  for (const r of refunds) {
    const s = refunded.get(r.target_id ?? "");
    const amount = Number(r.meta?.amount ?? s?.paid_mad ?? 0);
    refundsTotal += amount;
    if ((r.meta?.method ?? s?.method) === "especes") refundsCash += amount;
  }

  const expensesTotal = expenses.reduce((a, e) => a + Number(e.amount_mad), 0);
  const expensesCash = expenses.filter((e) => e.method === "especes").reduce((a, e) => a + Number(e.amount_mad), 0);

  for (const m of METHODS) {
    salesBy[m] = r2(salesBy[m]);
    balances[m] = r2(balances[m]);
  }
  return {
    sales: salesBy,
    balances,
    sales_count: sales.length,
    refunds_total: r2(refundsTotal),
    refunds_cash: r2(refundsCash),
    expenses_total: r2(expensesTotal),
    expenses_cash: r2(expensesCash),
    cash_in: r2(salesBy.especes + balances.especes),
  };
}

/** Espèces attendues en caisse = fond + espèces encaissées − sorties (remboursements et dépenses en espèces) */
export function expectedCash(float: number, t: CashTotals) {
  return r2(float + t.cash_in - t.refunds_cash - t.expenses_cash);
}
