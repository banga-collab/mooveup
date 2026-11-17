import type { Scope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { byId } from "@/lib/data";
import { entity, type EntityId } from "@/lib/entities";
import { PAY_LABEL, SALE_STATUS_LABEL, addDaysKey, agadirToIso, dayKey, mad } from "@/lib/utils";
import type { Contact, PayMethod, Profile, Sale, SaleItem, SaleStatus } from "@/lib/types";
import { matchesQuery } from "@/components/data-table/match";

export type SalesPeriod = "today" | "7j" | "30j" | "mois" | "prev" | "annee" | "perso";
export type SalesFilters = { du: string; au: string; periode: SalesPeriod; statut: SaleStatus | ""; mode: PayMethod | ""; etab: EntityId | ""; q: string };

const STATUSES: SaleStatus[] = ["payee", "partielle", "impayee", "remboursee"];
const MODES: PayMethod[] = ["especes", "carte", "virement", "cheque", "en_ligne"];
const PERIODS: SalesPeriod[] = ["today", "7j", "30j", "mois", "prev", "annee", "perso"];
const isDay = (s: string | undefined) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Bornes d'une période prédéfinie (fuseau d'Agadir) */
export function periodRange(p: Exclude<SalesPeriod, "perso">, today = dayKey()) {
  const monthStart = `${today.slice(0, 8)}01`;
  switch (p) {
    case "today":
      return { du: today, au: today };
    case "7j":
      return { du: addDaysKey(today, -6), au: today };
    case "30j":
      return { du: addDaysKey(today, -29), au: today };
    case "prev": {
      const end = addDaysKey(monthStart, -1);
      return { du: `${end.slice(0, 8)}01`, au: end };
    }
    case "annee":
      return { du: `${today.slice(0, 4)}-01-01`, au: today };
    default:
      return { du: monthStart, au: today };
  }
}

/**
 * Lit les filtres de l'URL. Période : `?periode=` (today, 7j, 30j, prev, annee ; défaut : mois en cours)
 * ou `?du=&au=` (période personnalisée).
 */
export function readFilters(sp: Record<string, string | string[] | undefined>): SalesFilters {
  const get = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  const today = dayKey();
  const p = get("periode") as SalesPeriod;
  let periode: SalesPeriod = "mois";
  let du: string;
  let au: string;
  if (PERIODS.includes(p) && p !== "perso") {
    periode = p;
    ({ du, au } = periodRange(p, today));
  } else if (isDay(get("du")) || isDay(get("au"))) {
    du = isDay(get("du")) ? get("du") : `${today.slice(0, 8)}01`;
    au = isDay(get("au")) ? get("au") : today;
    periode = "perso";
  } else ({ du, au } = periodRange("mois", today));
  if (du > au) [du, au] = [au, du];
  const statut = STATUSES.includes(get("statut") as SaleStatus) ? (get("statut") as SaleStatus) : "";
  const mode = MODES.includes(get("mode") as PayMethod) ? (get("mode") as PayMethod) : "";
  const etab = entity(get("etab")) ? (get("etab") as EntityId) : "";
  return { du, au, periode, statut, mode, etab, q: get("q").trim().slice(0, 80) };
}

/** Paramètres d'URL des filtres (`extra` : valeur vide = paramètre retiré) */
export function filtersQuery(f: SalesFilters, extra: Record<string, string> = {}) {
  const p = new URLSearchParams();
  if (f.periode === "perso") {
    p.set("du", f.du);
    p.set("au", f.au);
  } else if (f.periode !== "mois") p.set("periode", f.periode);
  if (f.statut) p.set("statut", f.statut);
  if (f.mode) p.set("mode", f.mode);
  if (f.etab) p.set("etab", f.etab);
  if (f.q) p.set("q", f.q);
  for (const [k, v] of Object.entries(extra)) {
    if (v) p.set(k, v);
    else p.delete(k);
  }
  return p.toString();
}

/** Ventes du périmètre selon les filtres, avec clients, vendeurs et lignes d'articles */
export async function loadSales(scope: Scope, f: SalesFilters) {
  const supabase = await createClient();
  const ids = f.etab && scope.ids.includes(f.etab) ? [f.etab] : scope.ids;
  let query = supabase
    .from("sales")
    .select("*")
    .in("entity_id", ids)
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
  const [{ data: cRows }, { data: pRows }, lines] = await Promise.all([
    contactIds.length ? supabase.from("contacts").select("*").in("id", contactIds) : Promise.resolve({ data: [] }),
    sellerIds.length ? supabase.from("profiles").select("*").in("id", sellerIds) : Promise.resolve({ data: [] }),
    loadLines(supabase, sales.map((s) => s.id)),
  ]);
  const contacts = byId((cRows ?? []) as Contact[]);
  const sellers = byId((pRows ?? []) as Profile[]);

  if (f.q) {
    sales = sales.filter((s) => {
      const c = s.contact_id ? contacts.get(s.contact_id) : undefined;
      const total = Number(s.total_mad);
      return matchesQuery(
        f.q,
        s.number,
        c?.full_name ?? "Client de passage",
        c?.phone,
        c?.email,
        (lines.get(s.id) ?? []).map((l) => l.label),
        total,
        mad(total),
        SALE_STATUS_LABEL[s.status],
        PAY_LABEL[s.method],
        s.sold_by ? sellers.get(s.sold_by)?.full_name : null,
        s.notes,
      );
    });
  }
  return { sales, contacts, sellers, lines };
}

/** Lignes d'articles des ventes (par paquets de 500) */
async function loadLines(supabase: Awaited<ReturnType<typeof createClient>>, ids: string[]) {
  const lines = new Map<string, SaleItem[]>();
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await supabase.from("sale_items").select("*").in("sale_id", ids.slice(i, i + 500));
    for (const l of (data ?? []) as SaleItem[]) lines.set(l.sale_id, [...(lines.get(l.sale_id) ?? []), l]);
  }
  return lines;
}

/** « 2 x Séance hammam | Gommage » */
export function linesLabel(lines: SaleItem[] | undefined) {
  return (lines ?? []).map((l) => (Number(l.qty) > 1 ? `${l.qty} x ${l.label}` : l.label)).join(" | ");
}
