/**
 * Données et calculs du tableau de bord du dirigeant.
 * Chaque table est chargée une seule fois (pagination si besoin) puis indexée :
 * tous les calculs sont linéaires. Une table absente (module non installé) donne une liste vide.
 */
import type { Scope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ENTITIES, type Entity } from "@/lib/entities";
import type { Appointment, Contact, Lead, Sale, Subscription } from "@/lib/types";
import { addDaysKey, agadirToIso, dayKey, madShort } from "@/lib/utils";
import {
  addMonthsKey,
  daysInMonth,
  diffDays,
  forecastMonthEnd,
  forecastMonths,
  monthLabel,
  monthlyRecurring,
  nextRamadan,
  renewalProbability,
  renewalRates,
  weekday,
  type DayRevenue,
  type MonthEnd,
  type SeasonFlag,
} from "@/lib/forecast";
import { computeChurn, type ChurnRow } from "@/lib/churn";

/* ---------- Lecture tolérante et paginée ---------- */

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
    for (let from = 0; from < 200_000; from += PAGE) {
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

/* ---------- Heure locale (Agadir) en un seul appel ---------- */

const partsFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Casablanca",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});
function local(iso: string) {
  let y = "", m = "", d = "", h = "0";
  for (const p of partsFmt.formatToParts(new Date(iso))) {
    if (p.type === "year") y = p.value;
    else if (p.type === "month") m = p.value;
    else if (p.type === "day") d = p.value;
    else if (p.type === "hour") h = p.value;
  }
  return { day: `${y}-${m}-${d}`, hour: Number(h) % 24 };
}

/* ---------- Types renvoyés ---------- */

type CheckinRow = { contact_id: string; entity_id: string; created_at: string };
type ReviewRow = { contact_id: string; entity_id: string; rating: number | null; handled: boolean | null; created_at: string };
type ExpenseRow = { entity_id: string; date: string; amount_mad: number };
type ShiftRow = { entity_id: string; profile_id: string; date: string; start_time: string | null; end_time: string | null; kind: string };
type TargetRow = { id: string; entity_id: string; amount_mad: number };

export type EntitySummary = MonthEnd & {
  entity: Entity;
  prevTotal: number;
  prevMtd: number;
  /** Même mois l'an dernier (null si l'historique ne remonte pas) */
  n1: number | null;
  target: number | null;
  expenses: number | null;
  margin: number | null;
  /** Meilleur mois sur `bestOf` mois complets */
  best: boolean;
  bestOf: number;
  expiringWeek: { count: number; value: number };
};

export type ChartRow = { label: string; real?: number; forecast?: number; band?: [number, number]; mtd?: number; flags?: SeasonFlag[] };

export type Alert = { tone: "bad" | "good" | "info"; text: string; weight: number };

export type ExecData = Awaited<ReturnType<typeof loadExec>>;

/* ---------- Chargement ---------- */

export async function loadExec(scope: Scope) {
  const supabase = await createClient();
  const ids = scope.ids;
  const ents = ENTITIES.filter((e) => ids.includes(e.id));
  const now = new Date();
  const nowIso = now.toISOString();
  const today = dayKey(now);
  const month = today.slice(0, 7);
  const dom = Number(today.slice(8, 10));
  const dim = daysInMonth(month);
  const monthEnd = `${month}-${String(dim).padStart(2, "0")}`;
  const lastFull = addMonthsKey(month, -1);
  const prevMonth = lastFull;
  const n1Month = addMonthsKey(month, -12);

  const salesFrom = agadirToIso(`${addMonthsKey(month, -15)}-01`, "00:00");
  const d180 = addDaysKey(today, -180);
  const apptFrom = agadirToIso(d180, "00:00");
  const apptTo = agadirToIso(addDaysKey(today, 45), "00:00");

  const [sales, subs, appts, contacts, checkins, reviews, expenses, leads, shifts, targets, openTasks] = await Promise.all([
    rows<Pick<Sale, "id" | "entity_id" | "contact_id" | "total_mad" | "paid_mad" | "status" | "sold_at">>(() =>
      supabase.from("sales").select("id, entity_id, contact_id, total_mad, paid_mad, status, sold_at").in("entity_id", ids).gte("sold_at", salesFrom).order("id"),
    ),
    rows<Subscription>(() => supabase.from("subscriptions").select("*").in("entity_id", ids).order("id")),
    rows<Pick<Appointment, "id" | "entity_id" | "contact_id" | "staff_id" | "starts_at" | "duration_min" | "status" | "price_mad">>(() =>
      supabase.from("appointments").select("id, entity_id, contact_id, staff_id, starts_at, duration_min, status, price_mad").in("entity_id", ids).gte("starts_at", apptFrom).lt("starts_at", apptTo).order("id"),
    ),
    rows<Pick<Contact, "id" | "full_name" | "phone" | "entity_ids" | "status" | "created_at">>(() =>
      supabase.from("contacts").select("id, full_name, phone, entity_ids, status, created_at").overlaps("entity_ids", ids).order("id"),
    ),
    rows<CheckinRow>(() => supabase.from("checkins").select("contact_id, entity_id, created_at").in("entity_id", ids).gte("created_at", apptFrom).order("id")),
    rows<ReviewRow>(() => supabase.from("reviews").select("contact_id, entity_id, rating, handled, created_at").in("entity_id", ids).gte("created_at", apptFrom).order("id")),
    rows<ExpenseRow>(() => supabase.from("expenses").select("entity_id, date, amount_mad").in("entity_id", ids).gte("date", `${addMonthsKey(month, -4)}-01`).order("id")),
    rows<Pick<Lead, "id" | "entity_id" | "stage" | "created_at">>(() => supabase.from("leads").select("id, entity_id, stage, created_at").in("entity_id", ids).gte("created_at", agadirToIso(addDaysKey(today, -90), "00:00")).order("id")),
    rows<ShiftRow>(() => supabase.from("shifts").select("entity_id, profile_id, date, start_time, end_time, kind").in("entity_id", ids).gte("date", addDaysKey(today, -14)).lt("date", today).order("id")),
    rows<TargetRow>(() => supabase.from("monthly_targets").select("id, entity_id, amount_mad").in("entity_id", ids)),
    rows<{ contact_id: string | null }>(() => supabase.from("tasks").select("contact_id").eq("done", false).ilike("title", "Relance fidélisation%")),
  ]);

  /* ---------- Index des abonnements et RDV ---------- */
  const subStart = new Set<string>();
  for (const s of subs) subStart.add(`${s.contact_id}|${s.entity_id}|${s.start_date}`);

  const rdvDone = new Set<string>();
  const apptLocal = appts.map((a) => ({ ...a, ...local(a.starts_at) }));
  const show = new Map<string, { ok: number; n: number }>();
  const d60 = addDaysKey(today, -60);
  for (const a of apptLocal) {
    if (a.status === "termine" || a.status === "arrive") rdvDone.add(`${a.contact_id}|${a.entity_id}|${a.day}`);
    if (a.starts_at < nowIso && a.day >= d60 && ["termine", "absent", "annule"].includes(a.status)) {
      const s = show.get(a.entity_id) ?? { ok: 0, n: 0 };
      s.n++;
      if (a.status === "termine") s.ok++;
      show.set(a.entity_id, s);
    }
  }
  const showRate = (e: string) => {
    const s = show.get(e);
    return s && s.n >= 10 ? s.ok / s.n : 0.85;
  };

  /* ---------- Ventes ---------- */
  const valid = sales.filter((s) => s.status !== "remboursee");
  const saleLocal = valid.map((s) => ({ ...s, total: Number(s.total_mad) || 0, ...local(s.sold_at) }));

  const firstSale = new Map<string, string>();
  for (const s of saleLocal) {
    if (!s.contact_id) continue;
    const k = `${s.contact_id}|${s.entity_id}`;
    const f = firstSale.get(k);
    if (!f || s.day < f) firstSale.set(k, s.day);
  }

  const dailyFrom = addDaysKey(today, -60) < `${month}-01` ? addDaysKey(today, -60) : `${month}-01`;
  const daily = new Map<string, Map<string, Required<DayRevenue>>>();
  const monthly = new Map<string, Map<string, number>>();
  const prevMtd = new Map<string, number>();
  const d90 = addDaysKey(today, -90);
  const d30 = addDaysKey(today, -30);
  const dowRevenue = Array<number>(7).fill(0);
  const hourRevenue = Array<number>(24).fill(0);
  const share90 = new Map<string, number>();
  let rev90 = 0;
  let rev30 = 0;
  let count30 = 0;
  const payers90 = new Set<string>();

  for (const s of saleLocal) {
    const m = s.day.slice(0, 7);
    const mm = monthly.get(s.entity_id) ?? new Map<string, number>();
    mm.set(m, (mm.get(m) ?? 0) + s.total);
    monthly.set(s.entity_id, mm);
    if (m === prevMonth && Number(s.day.slice(8, 10)) <= dom) prevMtd.set(s.entity_id, (prevMtd.get(s.entity_id) ?? 0) + s.total);

    if (s.day >= d90 && s.day <= today) {
      rev90 += s.total;
      share90.set(s.entity_id, (share90.get(s.entity_id) ?? 0) + s.total);
      if (s.day < today) {
        dowRevenue[weekday(s.day)]! += s.total;
        hourRevenue[s.hour]! += s.total;
      }
      if (s.contact_id) payers90.add(s.contact_id);
      if (s.day > d30) {
        rev30 += s.total;
        count30++;
      }
    }

    if (s.day < dailyFrom || s.day > today) continue;
    const dm = daily.get(s.entity_id) ?? new Map();
    daily.set(s.entity_id, dm);
    const r = dm.get(s.day) ?? { other: 0, rdv: 0, newSub: 0, renew: 0 };
    dm.set(s.day, r);
    const ck = `${s.contact_id}|${s.entity_id}|`;
    const isSub = !!s.contact_id && (subStart.has(ck + s.day) || subStart.has(ck + addDaysKey(s.day, 1)) || subStart.has(ck + addDaysKey(s.day, -1)));
    if (isSub) {
      const first = firstSale.get(`${s.contact_id}|${s.entity_id}`);
      if (first && diffDays(first, s.day) <= 20) r.newSub += s.total;
      else r.renew += s.total;
    } else if (s.contact_id && rdvDone.has(ck + s.day)) r.rdv += s.total;
    else r.other += s.total;
  }

  /* ---------- Abonnements : renouvellements attendus ---------- */
  const rates = renewalRates(subs, firstSale, today);
  const latestEnd = new Map<string, string>();
  for (const s of subs) {
    const k = `${s.contact_id}|${s.entity_id}`;
    if ((latestEnd.get(k) ?? "") < s.end_date) latestEnd.set(k, s.end_date);
  }
  const renewMonth = new Map<string, { value: number; p: number }[]>();
  const weekEnd = addDaysKey(today, 7);
  const expWeek = new Map<string, { count: number; value: number }>();
  const horizon = [1, 2, 3].map((h) => addMonthsKey(month, h));
  const renewAhead = new Map<string, { count: number; value: number }>(horizon.map((m) => [m, { count: 0, value: 0 }]));
  const lateFrom = addDaysKey(today, -7);
  for (const s of subs) {
    if (s.sessions_left !== null || s.status === "resilie") continue;
    if (latestEnd.get(`${s.contact_id}|${s.entity_id}`) !== s.end_date) continue;
    const p = renewalProbability(s, rates);
    const price = Number(s.price_mad) || 0;
    const due = addDaysKey(s.end_date, 1);
    if (due >= today && due <= monthEnd) {
      const list = renewMonth.get(s.entity_id) ?? [];
      list.push({ value: price, p });
      renewMonth.set(s.entity_id, list);
    } else if (s.end_date >= lateFrom && s.end_date < today) {
      const list = renewMonth.get(s.entity_id) ?? [];
      list.push({ value: price, p: p * 0.35 });
      renewMonth.set(s.entity_id, list);
    }
    if (s.end_date >= today && s.end_date <= weekEnd && !s.auto_renew) {
      const w = expWeek.get(s.entity_id) ?? { count: 0, value: 0 };
      w.count++;
      w.value += price;
      expWeek.set(s.entity_id, w);
    }
    const ra = renewAhead.get(due.slice(0, 7));
    if (ra && due > monthEnd) {
      ra.count++;
      ra.value += price * p;
    }
  }
  const { mrr, active: activeSubs } = monthlyRecurring(subs, today);
  let rateNum = 0;
  let rateDen = 0;
  for (const e of ents) {
    if (e.kind !== "sport") continue;
    rateNum += rates.get(e.id) ?? 0.7;
    rateDen++;
  }
  const renewalRate = rateDen ? rateNum / rateDen : null;

  /* ---------- RDV planifiés du mois ---------- */
  const planned = new Map<string, Map<string, number>>();
  for (const a of apptLocal) {
    if (a.day < today || a.day > monthEnd) continue;
    if (!["prevu", "confirme", "arrive"].includes(a.status)) continue;
    if (a.status !== "arrive" && a.starts_at < nowIso) continue;
    const pm = planned.get(a.entity_id) ?? new Map<string, number>();
    pm.set(a.day, (pm.get(a.day) ?? 0) + (Number(a.price_mad) || 0) * showRate(a.entity_id));
    planned.set(a.entity_id, pm);
  }

  /* ---------- Dépenses ---------- */
  const expByMonth = new Map<string, Map<string, number>>();
  for (const x of expenses) {
    const m = String(x.date).slice(0, 7);
    const em = expByMonth.get(x.entity_id) ?? new Map<string, number>();
    em.set(m, (em.get(m) ?? 0) + (Number(x.amount_mad) || 0));
    expByMonth.set(x.entity_id, em);
  }
  const hasExpenses = expenses.length > 0;
  const expectedExpenses = (e: string) => {
    const em = expByMonth.get(e);
    if (!em) return hasExpenses ? 0 : null;
    const last3 = [1, 2, 3].map((k) => em.get(addMonthsKey(month, -k)) ?? 0).filter((v) => v > 0);
    const avg = last3.length ? last3.reduce((a, b) => a + b, 0) / last3.length : 0;
    return Math.max(em.get(month) ?? 0, avg);
  };

  const targetBy = new Map(targets.map((t) => [t.entity_id, Number(t.amount_mad)]));

  /* ---------- Synthèse par établissement ---------- */
  const summaries: EntitySummary[] = ents.map((e) => {
    const d = daily.get(e.id) ?? new Map();
    const me = forecastMonthEnd({ today, daily: d, plannedRdv: planned.get(e.id) ?? new Map(), renewals: renewMonth.get(e.id) ?? [] });
    const mm = monthly.get(e.id) ?? new Map<string, number>();
    const hist = [...mm.keys()].sort();
    const earliest = hist[0] ?? month;
    const n1 = earliest < n1Month ? (mm.get(n1Month) ?? 0) : null;
    const past = [1, 2, 3, 4, 5, 6].map((k) => addMonthsKey(month, -k)).filter((m) => m > earliest);
    const best = past.length >= 4 && me.forecast > Math.max(...past.map((m) => mm.get(m) ?? 0));
    const expensesE = expectedExpenses(e.id);
    return {
      ...me,
      entity: e,
      prevTotal: mm.get(prevMonth) ?? 0,
      prevMtd: prevMtd.get(e.id) ?? 0,
      n1,
      target: targetBy.get(e.id) ?? null,
      expenses: expensesE,
      margin: expensesE === null ? null : me.forecast - expensesE,
      best,
      bestOf: past.length,
      expiringWeek: expWeek.get(e.id) ?? { count: 0, value: 0 },
    };
  });

  const sumOf = (f: (s: EntitySummary) => number) => summaries.reduce((a, s) => a + f(s), 0);
  const totalForecast = sumOf((s) => s.forecast);
  const halfQuad = Math.sqrt(summaries.reduce((a, s) => a + ((s.high - s.low) / 2) ** 2, 0));
  const mtdTotal = sumOf((s) => s.mtd);
  const n1Avail = summaries.filter((s) => s.n1 !== null);
  const targetSet = summaries.filter((s) => s.target !== null);
  const total = {
    mtd: mtdTotal,
    forecast: totalForecast,
    low: Math.max(mtdTotal, totalForecast - halfQuad),
    high: totalForecast + halfQuad,
    prevTotal: sumOf((s) => s.prevTotal),
    prevMtd: sumOf((s) => s.prevMtd),
    n1: n1Avail.length === summaries.length && n1Avail.length ? n1Avail.reduce((a, s) => a + (s.n1 ?? 0), 0) : null,
    expenses: hasExpenses ? sumOf((s) => s.expenses ?? 0) : null,
    target: targetSet.length ? targetSet.reduce((a, s) => a + (s.target ?? 0), 0) : null,
    targetMtd: targetSet.reduce((a, s) => a + s.mtd, 0),
    targetForecast: targetSet.reduce((a, s) => a + s.forecast, 0),
    targetCount: targetSet.length,
    pace: sumOf((s) => s.pace),
    rdv: sumOf((s) => s.rdv),
    renewals: sumOf((s) => s.renewals),
  };

  /* ---------- Prévisions 3 mois ---------- */
  const perEntity = summaries.map((s) => {
    const pts = forecastMonths(s.entity.id, s.entity.kind, monthly.get(s.entity.id) ?? new Map(), lastFull, 4);
    return { entity: s.entity, months: pts.slice(1), method: pts[1]?.method ?? "court" };
  });
  const chart: ChartRow[] = [];
  // Premier mois de l'historique commencé en cours de mois : partiel, on ne l'affiche pas
  let firstDay = "9999";
  for (const v of firstSale.values()) if (v < firstDay) firstDay = v;
  for (const sl of saleLocal) if (!sl.contact_id && sl.day < firstDay) firstDay = sl.day;
  const partial = firstDay !== "9999" && Number(firstDay.slice(8, 10)) > 3 ? firstDay.slice(0, 7) : null;
  for (let k = 8; k >= 1; k--) {
    const m = addMonthsKey(month, -k);
    if (m === partial) continue;
    let v = 0;
    let any = false;
    for (const e of ents) {
      const x = monthly.get(e.id)?.get(m);
      if (x !== undefined) {
        v += x;
        any = true;
      }
    }
    if (any || chart.length) chart.push({ label: monthLabel(m), real: Math.round(v) });
  }
  if (chart.length) {
    const last = chart[chart.length - 1]!;
    last.forecast = last.real;
    last.band = [last.real!, last.real!];
  }
  chart.push({ label: monthLabel(month), forecast: Math.round(total.forecast), band: [Math.round(total.low), Math.round(total.high)], mtd: Math.round(total.mtd) });
  const futureTotals = horizon.map((m, i) => {
    let v = 0;
    let lo = 0;
    let hi = 0;
    const flags = new Set<SeasonFlag>();
    for (const pe of perEntity) {
      const p = pe.months[i];
      if (!p) continue;
      v += p.value;
      lo += p.low;
      hi += p.high;
      p.flags.forEach((f) => flags.add(f));
    }
    return { month: m, value: v, low: lo, high: hi, flags: [...flags] };
  });
  for (const f of futureTotals) chart.push({ label: monthLabel(f.month), forecast: Math.round(f.value), band: [Math.round(f.low), Math.round(f.high)], flags: f.flags });
  const methodN1 = perEntity.some((p) => p.method === "n1");

  /* ---------- Clients à risque ---------- */
  const visits: { contact_id: string; entity_id: string; day: string }[] = [];
  for (const c of checkins) visits.push({ contact_id: c.contact_id, entity_id: c.entity_id, day: local(c.created_at).day });
  for (const a of apptLocal) if ((a.status === "termine" || a.status === "arrive") && a.day <= today) visits.push({ contact_id: a.contact_id, entity_id: a.entity_id, day: a.day });
  for (const s of saleLocal) if (s.contact_id && s.day >= d180) visits.push({ contact_id: s.contact_id, entity_id: s.entity_id, day: s.day });

  const d365 = addDaysKey(today, -365);
  const churn: ChurnRow[] = computeChurn({
    today,
    scopeIds: ids,
    contacts,
    visits,
    appointments: apptLocal.filter((a) => a.starts_at < nowIso).map((a) => ({ contact_id: a.contact_id, entity_id: a.entity_id, status: a.status, day: a.day })),
    subscriptions: subs.map((s) => ({ ...s, sessions_left: s.sessions_left ?? null })),
    sales: saleLocal
      .filter((s) => s.day >= d365)
      .map((s) => ({
        contact_id: s.contact_id,
        entity_id: s.entity_id,
        total: s.total,
        due: s.status === "impayee" || s.status === "partielle" ? Math.max(0, s.total - (Number(s.paid_mad) || 0)) : 0,
        day: s.day,
      })),
    reviews: reviews.map((r) => ({ contact_id: r.contact_id, entity_id: r.entity_id, rating: r.rating === null ? null : Number(r.rating), handled: !!r.handled, day: local(r.created_at).day })),
  });
  const tasked = new Set(openTasks.map((t) => t.contact_id).filter(Boolean) as string[]);

  /* ---------- Indicateurs clés ---------- */
  // Churn mensuel des abonnés : couverts il y a 30 j, plus couverts aujourd'hui
  const d30Key = d30;
  const covered = new Set<string>();
  for (const s of subs) {
    if (s.sessions_left !== null) continue;
    if (s.start_date <= d30Key && s.end_date >= d30Key) covered.add(`${s.contact_id}|${s.entity_id}`);
  }
  // Abonnés renouvelés dans la fenêtre (ancienne période absente des données) : ils faisaient partie de la cohorte
  for (const s of subs) {
    if (s.sessions_left !== null || s.start_date <= d30Key || s.start_date > today) continue;
    const first = firstSale.get(`${s.contact_id}|${s.entity_id}`);
    if (first && diffDays(first, s.start_date) > 20) covered.add(`${s.contact_id}|${s.entity_id}`);
  }
  let churned = 0;
  for (const k of covered) if ((latestEnd.get(k) ?? "") < today) churned++;
  const subChurn = covered.size >= 10 ? churned / covered.size : null;

  // Retour des clients : venus il y a 3 à 6 mois, revenus dans les 90 derniers jours
  const seenA = new Set<string>();
  const seenB = new Set<string>();
  for (const v of visits) {
    if (v.day >= d180 && v.day < d90) seenA.add(v.contact_id);
    else if (v.day >= d90 && v.day <= today) seenB.add(v.contact_id);
  }
  let back = 0;
  for (const c of seenA) if (seenB.has(c)) back++;
  const retention90 = seenA.size >= 10 ? back / seenA.size : null;

  const monthlyChurn = subChurn ?? (retention90 !== null ? 1 - Math.pow(retention90, 1 / 3) : null);
  const arpu = payers90.size ? rev90 / 3 / payers90.size : 0;
  const lifetime = monthlyChurn !== null ? Math.min(36, 1 / Math.max(monthlyChurn, 0.02)) : null;
  const ltv = lifetime !== null ? arpu * lifetime : null;

  // Occupation des RDV (14 derniers jours) : minutes réservées / minutes de présence des praticiens
  const practitioners = new Map<string, Set<string>>();
  for (const a of apptLocal) {
    if (!a.staff_id) continue;
    const p = practitioners.get(a.entity_id) ?? new Set<string>();
    p.add(a.staff_id);
    practitioners.set(a.entity_id, p);
  }
  let available = 0;
  const onShift = new Set<string>();
  for (const s of shifts) {
    if (s.kind !== "travail" || !s.start_time || !s.end_time || !practitioners.get(s.entity_id)?.has(s.profile_id)) continue;
    const mins = toMin(s.end_time) - toMin(s.start_time);
    if (mins <= 0) continue;
    available += mins;
    onShift.add(`${s.profile_id}|${s.entity_id}|${s.date}`);
  }
  // Seuls les RDV d'un praticien présent ce jour-là (planning saisi) comptent
  let booked = 0;
  const d14 = addDaysKey(today, -14);
  for (const a of apptLocal) {
    if (a.day < d14 || a.day >= today || a.status === "annule" || !a.staff_id) continue;
    if (!onShift.has(`${a.staff_id}|${a.entity_id}|${a.day}`)) continue;
    booked += Number(a.duration_min) || 0;
  }
  const occupancy = available > 0 ? Math.min(1, booked / available) : null;

  const won = leads.filter((l) => l.stage === "gagne").length;
  const conversion = leads.length >= 5 ? won / leads.length : null;

  const dowCount = Array<number>(7).fill(0);
  for (let i = 1; i <= 90; i++) dowCount[weekday(addDaysKey(today, -i))]!++;
  const dows = dowRevenue.map((v, i) => ({ dow: i, avg: dowCount[i] ? v / dowCount[i]! : 0 }));
  const hoursAll = hourRevenue.map((v, h) => ({ h, v })).filter((x) => x.v > 0);
  const blocks = hoursAll.map((x) => ({ h: x.h, v: x.v + (hourRevenue[(x.h + 1) % 24] ?? 0) })).filter((b) => hourRevenue[(b.h + 1) % 24]! > 0);
  const bestHour = blocks.length ? blocks.reduce((a, b) => (b.v > a.v ? b : a)) : null;
  const worstHour = blocks.length ? blocks.reduce((a, b) => (b.v < a.v ? b : a)) : null;

  const shares = ents.map((e) => ({ entity: e, value: share90.get(e.id) ?? 0 })).sort((a, b) => b.value - a.value);

  const unpaid = churn.filter((c) => c.main === "impaye" || c.reasons.some((r) => r.startsWith("Impayé"))).length;
  const unpaidTotal = saleLocal.reduce((a, s) => a + (s.status === "impayee" || s.status === "partielle" ? Math.max(0, s.total - (Number(s.paid_mad) || 0)) : 0), 0);
  const negReviews = reviews.filter((r) => r.rating !== null && Number(r.rating) <= 2 && !r.handled).length;

  const kpis = {
    subChurn,
    retention90,
    monthlyChurn,
    ltv,
    arpu,
    lifetime,
    basket: count30 ? rev30 / count30 : null,
    occupancy,
    occupancyHasData: available > 0,
    conversion,
    leads: leads.length,
    won,
    shares,
    rev90,
    dows,
    bestHour,
    worstHour,
  };

  /* ---------- Alertes ---------- */
  const alerts = buildAlerts({ summaries, churn, unpaidTotal, unpaid, negReviews, today, ents, total });

  return {
    today,
    month,
    dom,
    dim,
    ents,
    summaries,
    total,
    chart,
    perEntity,
    horizon,
    methodN1,
    subsInfo: { mrr, activeSubs, renewalRate, renewAhead: horizon.map((m) => ({ month: m, ...renewAhead.get(m)! })) },
    churn,
    tasked,
    kpis,
    alerts,
    hasExpenses,
    hasCheckins: checkins.length > 0,
  };
}

function toMin(t: string) {
  const [h = "0", m = "0"] = t.split(":");
  return Number(h) * 60 + Number(m);
}

function pctTxt(v: number) {
  const n = Math.round(v * 100);
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)} %`;
}

function buildAlerts({
  summaries,
  churn,
  unpaidTotal,
  unpaid,
  negReviews,
  today,
  ents,
  total,
}: {
  summaries: EntitySummary[];
  churn: ChurnRow[];
  unpaidTotal: number;
  unpaid: number;
  negReviews: number;
  today: string;
  ents: Entity[];
  total: { forecast: number; prevTotal: number };
}): Alert[] {
  const out: Alert[] = [];
  for (const s of summaries) {
    const name = s.entity.short;
    const delta = s.prevTotal > 0 ? s.forecast / s.prevTotal - 1 : null;
    const exp = s.expiringWeek.count >= 3 ? `${s.expiringWeek.count} abonnements expirent cette semaine` : null;
    if (delta !== null && delta <= -0.1) {
      out.push({ tone: "bad", weight: 30 + Math.abs(delta) * 100, text: `${name} : CA prévu ${pctTxt(delta)} vs mois dernier${exp ? `, ${exp}` : ""}.` });
    } else if (s.best && s.forecast > 0) {
      out.push({ tone: "good", weight: 18 + (exp ? s.expiringWeek.count : 0), text: `${name} : meilleur mois depuis ${s.bestOf} mois (prévision ${madShort(s.forecast)} MAD)${exp ? `, ${exp}` : ""}.` });
    } else {
      if (delta !== null && delta >= 0.15) out.push({ tone: "good", weight: 12 + delta * 50, text: `${name} : CA prévu ${pctTxt(delta)} vs mois dernier.` });
      if (exp) out.push({ tone: "info", weight: 14 + s.expiringWeek.count, text: `${name} : ${exp} (${madShort(s.expiringWeek.value)} MAD à renouveler).` });
    }
    if (s.target && s.target > 0) {
      const r = s.forecast / s.target;
      if (r < 0.95) out.push({ tone: "bad", weight: 20 + (1 - r) * 60, text: `${name} : objectif prévu à ${Math.round(r * 100)} %, il manque ${madShort(s.target - s.forecast)} MAD.` });
      else if (r >= 1.05) out.push({ tone: "good", weight: 9, text: `${name} : objectif dépassé en prévision (${Math.round(r * 100)} %).` });
    }
    if (s.margin !== null && s.margin < 0 && s.forecast > 0) out.push({ tone: "bad", weight: 26, text: `${name} : marge prévue négative (${madShort(s.margin)} MAD).` });
  }
  const high = churn.filter((c) => c.level === "eleve");
  if (high.length >= 3) {
    const v = high.reduce((a, c) => a + c.value12, 0);
    out.push({ tone: "bad", weight: 24 + Math.min(high.length, 20), text: `${high.length} clients à risque élevé de départ (${madShort(v)} MAD de CA sur 12 mois) : relancez-les cette semaine.` });
  }
  if (unpaidTotal >= 1000) out.push({ tone: "bad", weight: 13 + Math.min(unpaidTotal / 1000, 10), text: `Impayés : ${madShort(unpaidTotal)} MAD à recouvrer${unpaid ? ` (${unpaid} client${unpaid > 1 ? "s" : ""} concernés)` : ""}.` });
  if (negReviews) out.push({ tone: "bad", weight: 11 + negReviews, text: `${negReviews} avis négatif${negReviews > 1 ? "s" : ""} non traité${negReviews > 1 ? "s" : ""} : un appel du responsable évite souvent un départ.` });
  const ram = nextRamadan(today, 100);
  if (ram) {
    const sport = ents.some((e) => e.kind === "sport" || e.kind === "clinique");
    out.push({
      tone: "info",
      weight: 10,
      text: `Ramadan vers le ${new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${ram}T12:00:00Z`))} (dans ${diffDays(today, ram)} j) : ${sport ? "baisse attendue au sport et à la clinique, prévoyez horaires et offres" : "pensez aux horaires et aux offres de l'Aïd"}.`,
    });
  }
  out.sort((a, b) => b.weight - a.weight);
  const top = out.slice(0, 5);
  if (top.length < 3 && total.prevTotal > 0) {
    const d = total.forecast / total.prevTotal - 1;
    top.push({ tone: d < 0 ? "bad" : "good", weight: 0, text: `Groupe : CA prévu ${madShort(total.forecast)} MAD (${pctTxt(d)} vs mois dernier).` });
  }
  return top;
}
