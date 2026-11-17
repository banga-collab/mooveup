import { createClient } from "@/lib/supabase/server";
import type { Scope } from "@/lib/auth";
import type { CatalogItem, CatalogKind, Contact, Sale, SaleItem, Subscription } from "@/lib/types";
import type { Company, CompanyEmployee, CompanyInvoice } from "@/lib/types-corporate";
import type { CalcData } from "./calc";

type DB = Awaited<ReturnType<typeof createClient>>;

/** Entreprises visibles : au moins un établissement couvert dans le périmètre */
export async function loadCompanies(supabase: DB, scope: Scope): Promise<Company[]> {
  const { data } = await supabase.from("companies").select("*").order("name");
  return ((data ?? []) as Company[]).filter((c) => (c.entity_ids?.length ? c.entity_ids : [c.entity_id]).some((e) => scope.ids.includes(e)));
}

export async function loadCompany(supabase: DB, scope: Scope, id: string): Promise<Company | null> {
  const { data } = await supabase.from("companies").select("*").eq("id", id).maybeSingle();
  const c = data as Company | null;
  if (!c) return null;
  const allowed = scope.allowed.map((e) => e.id as string);
  return (c.entity_ids?.length ? c.entity_ids : [c.entity_id]).some((e) => allowed.includes(e)) ? c : null;
}

export async function loadEmployees(supabase: DB, companyIds?: string[]): Promise<CompanyEmployee[]> {
  let q = supabase.from("company_employees").select("*");
  if (companyIds) q = q.in("company_id", companyIds);
  const { data } = await q;
  return (data ?? []) as CompanyEmployee[];
}

export async function loadInvoices(supabase: DB, companyIds: string[]): Promise<CompanyInvoice[]> {
  if (!companyIds.length) return [];
  const { data } = await supabase.from("company_invoices").select("*").in("company_id", companyIds).order("issued_on", { ascending: false });
  return (data ?? []) as CompanyInvoice[];
}

/** Contacts, abonnements et ventes des salariés : de quoi calculer les factures */
export async function loadCalcData(supabase: DB, contactIds: string[]): Promise<CalcData & { contactRows: Contact[] }> {
  const ids = [...new Set(contactIds)];
  if (!ids.length) return { contacts: new Map(), contactRows: [], subscriptions: [], sales: [], saleItems: [], catalogKind: new Map() };
  const [{ data: cRows }, { data: subRows }, { data: saleRows }, { data: catRows }] = await Promise.all([
    supabase.from("contacts").select("*").in("id", ids),
    supabase.from("subscriptions").select("*").in("contact_id", ids),
    supabase.from("sales").select("*").in("contact_id", ids),
    supabase.from("catalog_items").select("id,kind"),
  ]);
  const sales = (saleRows ?? []) as Sale[];
  const { data: lineRows } = sales.length ? await supabase.from("sale_items").select("*").in("sale_id", sales.map((s) => s.id)) : { data: [] };
  const contactRows = (cRows ?? []) as Contact[];
  return {
    contactRows,
    contacts: new Map(contactRows.map((c) => [c.id, { id: c.id, full_name: c.full_name, phone: c.phone }])),
    subscriptions: (subRows ?? []) as Subscription[],
    sales,
    saleItems: (lineRows ?? []) as SaleItem[],
    catalogKind: new Map(((catRows ?? []) as Pick<CatalogItem, "id" | "kind">[]).map((c) => [c.id, c.kind as CatalogKind])),
  };
}
