import type { Scope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { byId, monthKey } from "@/lib/data";
import type { Appointment, CatalogItem, CatalogKind, Contact, Lead, PayMethod, Sale, SaleItem } from "@/lib/types";
import { CATALOG_KIND_LABEL, PAY_LABEL, SOURCE_LABEL, addDaysKey, agadirToIso, dayKey, fmtDate, pct } from "@/lib/utils";
import { matchesQuery } from "@/lib/search-match";
import { one } from "@/components/data-table/match";
import { readSort, sortRows } from "./list-kit";
import type { Slice } from "./charts";

/*
 * Calculs de la page /rapports (partagés avec l'export PDF / Excel `/rapports/export`).
 * Toutes les données sont chargées une fois puis agrégées.
 */

/* Palette sobre (bleu → gris) pour les répartitions qui ne sont pas par établissement */
const KIND_COLOR: Record<CatalogKind | "autre", string> = { abonnement: "#1a6d8e", prestation: "#74b2ca", produit: "#94a3b8", pack: "#12495f", autre: "#cbd5e1" };

export type SP = Record<string, string | string[] | undefined>;
type Month = { key: string; label: string };

export const PERIODS = [
  { value: "mois", label: "Ce mois" },
  { value: "trimestre", label: "Trimestre" },
  { value: "annee", label: "Année" },
  { value: "12", label: "12 mois" },
  { value: "perso", label: "Personnalisée" },
];

const isDay = (v: string | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/** Mois (clé AAAA-MM) couverts par [from, to] inclus, 36 au plus */
function monthsBetween(from: string, to: string): Month[] {
  const out: Month[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const end = to.slice(0, 7);
  while (out.length < 36) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    const d = new Date(Date.UTC(y, m - 1, 15));
    out.push({ key, label: new Intl.DateTimeFormat("fr-FR", { month: "short", ...(from.slice(0, 4) !== to.slice(0, 4) && m === 1 ? { year: "2-digit" } : {}) }).format(d).replace(".", "") });
    if (key >= end) break;
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

/** Période demandée → bornes (jours inclus) + mois des graphiques */
function readPeriod(sp: SP, today: string) {
  const legacy = one(sp.mois) === "12" ? "12" : undefined;
  const id = PERIODS.some((p) => p.value === one(sp.periode)) ? one(sp.periode)! : (legacy ?? "6");
  const y = today.slice(0, 4);
  const mo = Number(today.slice(5, 7));
  let from: string;
  let to = today;
  let label: string;
  if (id === "mois") {
    from = `${today.slice(0, 7)}-01`;
    label = fmtDate(today, { month: "long", year: "numeric" });
  } else if (id === "trimestre") {
    const q = Math.floor((mo - 1) / 3);
    from = `${y}-${String(q * 3 + 1).padStart(2, "0")}-01`;
    label = `${q + 1}${q ? "e" : "er"} trimestre ${y}`;
  } else if (id === "annee") {
    from = `${y}-01-01`;
    label = `Année ${y}`;
  } else if (id === "perso") {
    const du = one(sp.du);
    const au = one(sp.au);
    from = isDay(du) ? du : `${today.slice(0, 7)}-01`;
    to = isDay(au) && au >= from ? au : today;
    label = `du ${fmtDate(from)} au ${fmtDate(to)}`;
  } else {
    const n = id === "12" ? 12 : 6;
    const d = new Date(Date.UTC(Number(y), mo - 1 - (n - 1), 1));
    from = d.toISOString().slice(0, 10);
    label = `${n} derniers mois`;
  }
  const months = monthsBetween(from, to);
  return { id, from, to, label, months, toExclusive: addDaysKey(to, 1) };
}

export async function loadReports(sp: SP, scope: Scope) {
  const today = dayKey();
  const period = readPeriod(sp, today);
  const months = period.months;
  const n = months.length;
  const from = period.from;
  const fromIso = agadirToIso(from, "00:00");
  const toIso = agadirToIso(period.toExclusive, "00:00");
  const scopeEnts = scope.allowed.filter((e) => scope.ids.includes(e.id));
  const etab = scopeEnts.find((e) => e.id === one(sp.etab))?.id;
  const ids = etab ? [etab] : scope.ids;
  const ents = scopeEnts.filter((e) => ids.includes(e.id));
  const q = one(sp.q);
  const supabase = await createClient();

  const [{ data: salesRaw }, { data: catalogRaw }, { data: contactsRaw }, { data: leadsRaw }, { data: apptRaw }] = await Promise.all([
    supabase.from("sales").select("*").in("entity_id", ids).gte("sold_at", fromIso).lt("sold_at", toIso),
    supabase.from("catalog_items").select("*").in("entity_id", ids),
    supabase.from("contacts").select("*").overlaps("entity_ids", ids),
    supabase.from("leads").select("*").in("entity_id", ids),
    supabase.from("appointments").select("*").in("entity_id", ids).gte("starts_at", fromIso).lt("starts_at", toIso).lte("starts_at", new Date().toISOString()),
  ]);
  const sales = ((salesRaw ?? []) as Sale[]).filter((s) => s.status !== "remboursee");
  const saleIds = sales.map((s) => s.id);
  const { data: itemsRaw } = saleIds.length ? await supabase.from("sale_items").select("*").in("sale_id", saleIds) : { data: [] };
  const items = (itemsRaw ?? []) as SaleItem[];
  const catalog = byId(catalogRaw as CatalogItem[]);
  const contacts = (contactsRaw ?? []) as Contact[];
  const contactById = byId(contacts);
  const leads = (leadsRaw ?? []) as Lead[];
  const appts = (apptRaw ?? []) as Appointment[];
  const saleById = byId(sales);

  /* CA */
  const total = sales.reduce((a, s) => a + Number(s.total_mad), 0);
  const byMonth = months.map((m) => sales.filter((s) => monthKey(s.sold_at) === m.key).reduce((a, s) => a + Number(s.total_mad), 0));
  const stacked = months.map((m) => {
    const row: Record<string, string | number> = { label: m.label };
    for (const e of ents) row[e.id] = sales.filter((s) => s.entity_id === e.id && monthKey(s.sold_at) === m.key).reduce((a, s) => a + Number(s.total_mad), 0);
    return row;
  });
  const byEntity: Slice[] = ents
    .map((e) => ({ name: e.short, color: e.color, value: sales.filter((s) => s.entity_id === e.id).reduce((a, s) => a + Number(s.total_mad), 0) }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);
  const avgTicket = sales.length ? total / sales.length : 0;
  const lastM = byMonth.at(-1) ?? 0;
  const prevM = byMonth.at(-2) ?? 0;

  /* CA par type */
  const kindSum = new Map<CatalogKind | "autre", number>();
  for (const it of items) {
    const k = (it.item_id && catalog.get(it.item_id)?.kind) || "autre";
    kindSum.set(k, (kindSum.get(k) ?? 0) + Number(it.qty) * Number(it.unit_price_mad));
  }
  const byKind: Slice[] = [...kindSum.entries()]
    .map(([k, v]) => ({ name: k === "autre" ? "Autre" : CATALOG_KIND_LABEL[k], value: Math.round(v), color: KIND_COLOR[k] }))
    .sort((a, b) => b.value - a.value);

  /* Modes de paiement */
  const payMap = new Map<PayMethod, number>();
  for (const s of sales) payMap.set(s.method, (payMap.get(s.method) ?? 0) + Number(s.total_mad));
  const byPay = [...payMap.entries()].map(([k, v]) => ({ name: PAY_LABEL[k], value: v })).sort((a, b) => b.value - a.value);

  /* Nouveaux contacts */
  const inRange = (iso: string) => iso >= fromIso && iso < toIso;
  const newContacts = months.map((m) => ({ label: m.label, value: contacts.filter((c) => inRange(c.created_at) && monthKey(c.created_at) === m.key).length }));
  const newTotal = newContacts.reduce((a, m) => a + m.value, 0);

  /* Conversion des prospects par source (clôturés sur la période) */
  const closed = leads.filter((l) => (l.stage === "gagne" || l.stage === "perdu") && l.updated_at >= from && l.updated_at < toIso);
  const won = closed.filter((l) => l.stage === "gagne").length;
  const sources = [...new Set(closed.map((l) => l.source))];
  const conversion = sources
    .map((s) => {
      const g = closed.filter((l) => l.source === s && l.stage === "gagne").length;
      const p = closed.filter((l) => l.source === s && l.stage === "perdu").length;
      return { source: SOURCE_LABEL[s] ?? s, gagnes: g, perdus: p, taux: pct(g, g + p) };
    })
    .sort((a, b) => b.gagnes + b.perdus - (a.gagnes + a.perdus));

  /* Absences aux RDV */
  const noShow = ents
    .map((e) => {
      const done = appts.filter((a) => a.entity_id === e.id && (a.status === "arrive" || a.status === "termine" || a.status === "absent"));
      const abs = done.filter((a) => a.status === "absent").length;
      return { name: e.short, value: pct(abs, done.length), hint: `${abs} absence${abs > 1 ? "s" : ""} sur ${done.length} RDV`, n: done.length };
    })
    .filter((d) => d.n > 0)
    .sort((a, b) => b.value - a.value);
  const apptDone = appts.filter((a) => ["arrive", "termine", "absent"].includes(a.status));
  const noShowAll = pct(apptDone.filter((a) => a.status === "absent").length, apptDone.length);

  /* Top prestations / articles */
  const topMap = new Map<string, { label: string; qty: number; value: number; entity: string }>();
  for (const it of items) {
    const key = it.item_id ?? it.label;
    const cur = topMap.get(key) ?? { label: it.item_id ? (catalog.get(it.item_id)?.name ?? it.label) : it.label, qty: 0, value: 0, entity: saleById.get(it.sale_id)?.entity_id ?? "" };
    cur.qty += Number(it.qty);
    cur.value += Number(it.qty) * Number(it.unit_price_mad);
    topMap.set(key, cur);
  }
  const topItems = [...topMap.values()].filter((t) => matchesQuery(q, t.label)).sort((a, b) => b.value - a.value).slice(0, 10);
  const topItemMax = Math.max(1, ...topItems.map((t) => t.value));

  /* Top clients */
  const clientMap = new Map<string, { value: number; count: number }>();
  for (const s of sales) {
    if (!s.contact_id) continue;
    const cur = clientMap.get(s.contact_id) ?? { value: 0, count: 0 };
    cur.value += Number(s.total_mad);
    cur.count += 1;
    clientMap.set(s.contact_id, cur);
  }
  const clientSort = readSort(sp, ["client", "achats", "ca"] as const, "ca", "desc");
  const ranked = [...clientMap.entries()]
    .map(([id, v]) => ({ id, ...v, contact: contactById.get(id) }))
    .filter((c) => matchesQuery(q, c.contact?.full_name, c.contact?.phone, c.contact?.email))
    .sort((a, b) => (clientSort.key === "achats" ? b.count - a.count || b.value - a.value : b.value - a.value))
    .slice(0, 10);
  const topClients = clientSort.key === "client" ? sortRows(ranked, (c) => c.contact?.full_name ?? "", clientSort.dir) : clientSort.dir === "asc" ? [...ranked].reverse() : ranked;
  const filtersActive = !!(q || etab || one(sp.periode));
  const multi = byEntity.length > 1;

  return {
    sp,
    scope,
    today,
    period,
    months,
    n,
    etab,
    ents,
    scopeEnts,
    q,
    sales,
    total,
    byMonth,
    stacked,
    byEntity,
    avgTicket,
    lastM,
    prevM,
    byKind,
    byPay,
    newContacts,
    newTotal,
    closed,
    won,
    conversion,
    noShow,
    apptDone,
    noShowAll,
    topItems,
    topItemMax,
    topClients,
    filtersActive,
    multi,
  };
}

export type ReportsData = Awaited<ReturnType<typeof loadReports>>;
