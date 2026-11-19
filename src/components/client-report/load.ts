/**
 * Rapports clients : un client, une sélection ou tous les clients actifs, sur une période.
 * Chaque table est chargée une fois (par client si la sélection est courte, sinon par
 * établissement + période) puis indexée par client : calculs linéaires.
 */
import type { Scope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ENTITIES, type EntityId } from "@/lib/entities";
import type { Activity, Appointment, Contact, Lead, Sale, SaleItem, SaleStatus, Subscription } from "@/lib/types";
import type { Checkin } from "@/lib/types-access";
import type { LedgerRow } from "@/lib/types-loyalty";
import { addDaysKey, agadirToIso, dayKey } from "@/lib/utils";
import type { Period } from "./period";

/* ---------- Lecture tolérante, paginée et par paquets ---------- */

const PAGE = 1000;
type Res = { data: unknown[] | null; error: unknown };
type Pageable = PromiseLike<Res> & { range?: (a: number, b: number) => PromiseLike<Res> };

async function rows<T>(make: () => unknown): Promise<T[]> {
  try {
    const q0 = make() as Pageable;
    if (typeof q0.range !== "function") {
      const { data } = await q0;
      return (data ?? []) as T[];
    }
    const out: T[] = [];
    for (let from = 0; from < 300_000; from += PAGE) {
      const q = (from ? make() : q0) as Pageable;
      const { data, error } = await q.range!(from, from + PAGE - 1);
      if (error || !data) break;
      out.push(...(data as T[]));
      if (data.length < PAGE) break;
    }
    return out;
  } catch {
    return [];
  }
}

/** Requête `.in(col, ids)` découpée en paquets (URL courtes) */
async function inChunks<T>(ids: string[], make: (chunk: string[]) => unknown, size = 150): Promise<T[]> {
  if (!ids.length) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) chunks.push(ids.slice(i, i + size));
  const parts = await Promise.all(chunks.map((c) => rows<T>(() => make(c))));
  return parts.flat();
}

/* ---------- Types ---------- */

export type ClientPurchase = { id: string; number: string; date: string; entity: string; items: string; total: number; paid: number; status: SaleStatus };
export type ClientSub = Pick<Subscription, "id" | "name" | "entity_id" | "start_date" | "end_date" | "status" | "sessions_left" | "auto_renew" | "price_mad">;
export type ClientAppt = Pick<Appointment, "id" | "entity_id" | "service" | "starts_at" | "status" | "price_mad">;

export type ClientReport = {
  contact: Contact;
  /** Total dépensé sur la période (hors ventes remboursées) */
  revenue: number;
  purchases: ClientPurchase[];
  /** Reste dû (toutes périodes confondues) */
  due: number;
  subs: ClientSub[];
  visits: number;
  lastVisit: string | null;
  visitsByEntity: { entity: string; count: number }[];
  appts: { total: number; honored: number; absent: number; cancelled: number; upcoming: number; list: ClientAppt[] };
  loyalty: { balance: number; earned: number };
  leads: Lead[];
  notes: { date: string; body: string }[];
};

export type ClientReportParams = { ids: string[] | "all"; period: Period; etab: EntityId | null };

const SMALL = 150;

export async function loadClientReport(scope: Scope, p: ClientReportParams) {
  const supabase = await createClient();
  const ents = p.etab && scope.ids.includes(p.etab) ? [p.etab] : scope.ids;
  const fromIso = agadirToIso(p.period.from, "00:00");
  const toIso = agadirToIso(addDaysKey(p.period.to, 1), "00:00");
  const nowIso = new Date().toISOString();
  const explicit = p.ids === "all" ? null : [...new Set(p.ids)].slice(0, 500);
  const small = !!explicit && explicit.length <= SMALL;

  // Requête limitée aux clients choisis (sélection courte) ou à tout le périmètre
  type InQ = { in: (c: string, v: string[]) => unknown };
  const forContacts = <Q,>(q: Q): Q => (small ? ((q as unknown as InQ).in("contact_id", explicit!) as Q) : q);

  const [sales, unpaid, subsRaw, checkins, appts, leadsRaw] = await Promise.all([
    rows<Sale>(() => forContacts(supabase.from("sales").select("*").in("entity_id", ents).gte("sold_at", fromIso).lt("sold_at", toIso)).order("sold_at", { ascending: false })),
    rows<Pick<Sale, "id" | "contact_id" | "total_mad" | "paid_mad" | "status">>(() =>
      forContacts(supabase.from("sales").select("id, contact_id, total_mad, paid_mad, status").in("entity_id", ents).in("status", ["impayee", "partielle"])).order("id"),
    ),
    rows<Subscription>(() => forContacts(supabase.from("subscriptions").select("*").in("entity_id", ents).gte("end_date", p.period.from)).order("id")),
    rows<Pick<Checkin, "id" | "contact_id" | "entity_id" | "created_at">>(() =>
      forContacts(supabase.from("checkins").select("id, contact_id, entity_id, created_at").in("entity_id", ents).gte("created_at", fromIso).lt("created_at", toIso)).order("id"),
    ),
    rows<Appointment>(() => forContacts(supabase.from("appointments").select("*").in("entity_id", ents).gte("starts_at", fromIso).lt("starts_at", toIso)).order("starts_at")),
    rows<Lead>(() => forContacts(supabase.from("leads").select("*").in("entity_id", ents)).order("id")),
  ]);
  const subs = subsRaw.filter((s) => s.start_date <= p.period.to);

  /* Clients concernés */
  let contactIds: string[];
  if (explicit) contactIds = explicit;
  else {
    const set = new Set<string>();
    for (const s of sales) if (s.contact_id) set.add(s.contact_id);
    for (const c of checkins) set.add(c.contact_id);
    for (const a of appts) if (a.status !== "annule") set.add(a.contact_id);
    for (const s of subs) if (s.status === "actif" || s.status === "suspendu") set.add(s.contact_id);
    contactIds = [...set];
  }
  const wanted = new Set(contactIds);
  const contactsRaw =
    contactIds.length > 600
      ? (await rows<Contact>(() => supabase.from("contacts").select("*").overlaps("entity_ids", scope.ids).order("id"))).filter((c) => wanted.has(c.id))
      : await inChunks<Contact>(contactIds, (c) => supabase.from("contacts").select("*").in("id", c));
  // Droit de lecture : au moins un établissement du périmètre de l'utilisateur
  const contacts = contactsRaw.filter((c) => !c.entity_ids?.length || c.entity_ids.some((e) => scope.ids.includes(e)));
  const allowed = new Set(contacts.map((c) => c.id));
  const ids = [...allowed];

  /* Détails dépendants : articles des ventes, fidélité, notes */
  const saleIds = sales.filter((s) => s.contact_id && allowed.has(s.contact_id)).map((s) => s.id);
  const smallSet = ids.length <= SMALL;
  const [items, ledger, notesRaw] = await Promise.all([
    saleIds.length <= 6000 ? inChunks<Pick<SaleItem, "sale_id" | "label" | "qty">>(saleIds, (c) => supabase.from("sale_items").select("sale_id, label, qty").in("sale_id", c), 200) : Promise.resolve([]),
    smallSet
      ? inChunks<Pick<LedgerRow, "contact_id" | "points" | "created_at">>(ids, (c) => supabase.from("loyalty_ledger").select("contact_id, points, created_at").in("contact_id", c))
      : rows<Pick<LedgerRow, "contact_id" | "points" | "created_at">>(() => supabase.from("loyalty_ledger").select("contact_id, points, created_at").order("id")),
    smallSet
      ? inChunks<Activity>(ids, (c) => supabase.from("activities").select("*").in("contact_id", c).eq("kind", "note").order("created_at", { ascending: false }))
      : rows<Activity>(() => supabase.from("activities").select("*").eq("kind", "note").gte("created_at", fromIso).lt("created_at", toIso).order("id")),
  ]);

  /* Index par client */
  const itemsBySale = new Map<string, string[]>();
  for (const it of items) {
    const l = itemsBySale.get(it.sale_id) ?? [];
    l.push(`${Number(it.qty) > 1 ? `${it.qty} × ` : ""}${it.label}`);
    itemsBySale.set(it.sale_id, l);
  }
  const group = <T,>(list: T[], key: (x: T) => string | null | undefined) => {
    const m = new Map<string, T[]>();
    for (const x of list) {
      const k = key(x);
      if (!k || !allowed.has(k)) continue;
      const l = m.get(k);
      if (l) l.push(x);
      else m.set(k, [x]);
    }
    return m;
  };
  const salesBy = group(sales, (s) => s.contact_id);
  const unpaidBy = group(unpaid, (s) => s.contact_id);
  const subsBy = group(subs, (s) => s.contact_id);
  const checkBy = group(checkins, (c) => c.contact_id);
  const apptBy = group(appts, (a) => a.contact_id);
  const leadBy = group(
    leadsRaw.filter((l) => (l.stage !== "gagne" && l.stage !== "perdu") || (l.updated_at >= fromIso && l.updated_at < toIso) || (l.created_at >= fromIso && l.created_at < toIso)),
    (l) => l.contact_id,
  );
  const noteBy = group(notesRaw, (n) => n.contact_id);
  const loyaltyBy = new Map<string, { balance: number; earned: number }>();
  for (const r of ledger) {
    if (!allowed.has(r.contact_id)) continue;
    const m = loyaltyBy.get(r.contact_id) ?? { balance: 0, earned: 0 };
    m.balance += Number(r.points);
    if (Number(r.points) > 0 && r.created_at >= fromIso && r.created_at < toIso) m.earned += Number(r.points);
    loyaltyBy.set(r.contact_id, m);
  }

  const short = (id: string) => ENTITIES.find((e) => e.id === id)?.short ?? id;

  const reports: ClientReport[] = contacts.map((c) => {
    const ss = salesBy.get(c.id) ?? [];
    const purchases: ClientPurchase[] = ss.map((s) => ({
      id: s.id,
      number: s.number,
      date: s.sold_at,
      entity: s.entity_id,
      items: (itemsBySale.get(s.id) ?? []).join(", "),
      total: Number(s.total_mad),
      paid: Number(s.paid_mad),
      status: s.status,
    }));
    const revenue = purchases.filter((x) => x.status !== "remboursee").reduce((a, x) => a + x.total, 0);
    const due = (unpaidBy.get(c.id) ?? []).reduce((a, s) => a + Math.max(0, Number(s.total_mad) - Number(s.paid_mad)), 0);
    const ch = checkBy.get(c.id) ?? [];
    const byEnt = new Map<string, number>();
    let last: string | null = null;
    for (const x of ch) {
      byEnt.set(x.entity_id, (byEnt.get(x.entity_id) ?? 0) + 1);
      if (!last || x.created_at > last) last = x.created_at;
    }
    const ap = apptBy.get(c.id) ?? [];
    const honored = ap.filter((a) => a.status === "arrive" || a.status === "termine").length;
    const absent = ap.filter((a) => a.status === "absent").length;
    const cancelled = ap.filter((a) => a.status === "annule").length;
    const upcoming = ap.filter((a) => (a.status === "prevu" || a.status === "confirme") && a.starts_at >= nowIso).length;
    const subsC = (subsBy.get(c.id) ?? []).sort((a, b) => (a.status === "actif" ? 0 : 1) - (b.status === "actif" ? 0 : 1) || b.end_date.localeCompare(a.end_date));
    const notes = (noteBy.get(c.id) ?? [])
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 5)
      .map((n) => ({ date: n.created_at, body: n.body }));
    return {
      contact: c,
      revenue,
      purchases,
      due,
      subs: subsC,
      visits: ch.length,
      lastVisit: last,
      visitsByEntity: [...byEnt.entries()].map(([e, n]) => ({ entity: short(e), count: n })).sort((a, b) => b.count - a.count),
      appts: { total: ap.length, honored, absent, cancelled, upcoming, list: ap },
      loyalty: loyaltyBy.get(c.id) ?? { balance: 0, earned: 0 },
      leads: leadBy.get(c.id) ?? [],
      notes,
    };
  });
  reports.sort((a, b) => b.revenue - a.revenue || b.visits - a.visits || a.contact.full_name.localeCompare(b.contact.full_name, "fr"));

  /* Synthèse */
  const sum = (f: (r: ClientReport) => number) => reports.reduce((a, r) => a + f(r), 0);
  const salesCount = sum((r) => r.purchases.filter((x) => x.status !== "remboursee").length);
  const revenue = sum((r) => r.revenue);
  const honored = sum((r) => r.appts.honored);
  const absent = sum((r) => r.appts.absent);
  const byEntity = ENTITIES.filter((e) => ents.includes(e.id))
    .map((e) => ({
      id: e.id,
      name: e.short,
      color: e.color,
      revenue: sales.filter((s) => s.entity_id === e.id && s.contact_id && allowed.has(s.contact_id) && s.status !== "remboursee").reduce((a, s) => a + Number(s.total_mad), 0),
      visits: checkins.filter((x) => x.entity_id === e.id && allowed.has(x.contact_id)).length,
    }))
    .filter((x) => x.revenue > 0 || x.visits > 0);

  const summary = {
    clients: reports.length,
    activeClients: reports.filter((r) => r.revenue > 0 || r.visits > 0 || r.appts.honored > 0).length,
    revenue,
    salesCount,
    basket: salesCount ? revenue / salesCount : 0,
    visits: sum((r) => r.visits),
    honored,
    absent,
    absentRate: honored + absent ? Math.round((absent / (honored + absent)) * 100) : 0,
    upcoming: sum((r) => r.appts.upcoming),
    due: sum((r) => r.due),
    activeSubs: sum((r) => r.subs.filter((s) => s.status === "actif").length),
    points: sum((r) => r.loyalty.balance),
    pointsEarned: sum((r) => r.loyalty.earned),
    top: reports.filter((r) => r.revenue > 0).slice(0, 10),
    byEntity,
  };

  return { reports, summary, ents, today: dayKey(), missing: explicit ? explicit.length - reports.length : 0 };
}

export type ClientReportData = Awaited<ReturnType<typeof loadClientReport>>;
