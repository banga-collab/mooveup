import type { Scope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { byId } from "@/lib/data";
import { addDaysKey, agadirToIso, dayKey } from "@/lib/utils";
import type { Contact, PayMethod, Profile, Sale, SaleStatus } from "@/lib/types";

export type SalesFilters = { du: string; au: string; statut: SaleStatus | ""; mode: PayMethod | ""; q: string };

const STATUSES: SaleStatus[] = ["payee", "partielle", "impayee", "remboursee"];
const MODES: PayMethod[] = ["especes", "carte", "virement", "cheque", "en_ligne"];
const isDay = (s: string | undefined) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Lit les filtres de l'URL (par défaut : le mois en cours) */
export function readFilters(sp: Record<string, string | string[] | undefined>): SalesFilters {
  const get = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  const today = dayKey();
  let du = isDay(get("du")) ? get("du") : `${today.slice(0, 8)}01`;
  let au = isDay(get("au")) ? get("au") : today;
  if (du > au) [du, au] = [au, du];
  const statut = STATUSES.includes(get("statut") as SaleStatus) ? (get("statut") as SaleStatus) : "";
  const mode = MODES.includes(get("mode") as PayMethod) ? (get("mode") as PayMethod) : "";
  return { du, au, statut, mode, q: get("q").trim().slice(0, 80) };
}

export function filtersQuery(f: SalesFilters, extra: Record<string, string> = {}) {
  const p = new URLSearchParams();
  p.set("du", f.du);
  p.set("au", f.au);
  if (f.statut) p.set("statut", f.statut);
  if (f.mode) p.set("mode", f.mode);
  if (f.q) p.set("q", f.q);
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  return p.toString();
}

/** Ventes du périmètre selon les filtres, avec clients et vendeurs */
export async function loadSales(scope: Scope, f: SalesFilters) {
  const supabase = await createClient();
  let query = supabase
    .from("sales")
    .select("*")
    .in("entity_id", scope.ids)
    .gte("sold_at", agadirToIso(f.du, "00:00"))
    .lt("sold_at", agadirToIso(addDaysKey(f.au, 1), "00:00"));
  // « impayée » regroupe aussi les ventes partielles (reste à encaisser)
  if (f.statut === "impayee") query = query.in("status", ["impayee", "partielle"]);
  else if (f.statut) query = query.eq("status", f.statut);
  if (f.mode) query = query.eq("method", f.mode);
  const { data } = await query.order("sold_at", { ascending: false });
  let sales = (data ?? []) as Sale[];

  const contactIds = [...new Set(sales.map((s) => s.contact_id).filter((x): x is string => !!x))];
  const sellerIds = [...new Set(sales.map((s) => s.sold_by).filter((x): x is string => !!x))];
  const [{ data: cRows }, { data: pRows }] = await Promise.all([
    contactIds.length ? supabase.from("contacts").select("*").in("id", contactIds) : Promise.resolve({ data: [] }),
    sellerIds.length ? supabase.from("profiles").select("*").in("id", sellerIds) : Promise.resolve({ data: [] }),
  ]);
  const contacts = byId((cRows ?? []) as Contact[]);
  const sellers = byId((pRows ?? []) as Profile[]);

  if (f.q) {
    const n = f.q.toLowerCase();
    const digits = n.replace(/\D/g, "");
    sales = sales.filter((s) => {
      const c = s.contact_id ? contacts.get(s.contact_id) : undefined;
      return (
        s.number.toLowerCase().includes(n) ||
        (c?.full_name.toLowerCase().includes(n) ?? false) ||
        (digits.length >= 4 && (c?.phone ?? "").replace(/\D/g, "").includes(digits))
      );
    });
  }
  return { sales, contacts, sellers };
}
