/**
 * Prévisions du tableau de bord du dirigeant (fonctions pures, sans accès aux données).
 *
 * - Fin de mois : rythme journalier par jour de la semaine (8 dernières semaines)
 *   + renouvellements d'abonnements attendus + rendez-vous déjà planifiés.
 * - 3 mois : niveau des derniers mois complets, tendance amortie, saisonnalité
 *   (même mois N-1 × croissance annuelle si l'historique existe, sinon effets Ramadan / été supposés).
 * Tout est linéaire en nombre de lignes (pas de double boucle sur les données).
 */
import type { EntityKind } from "./entities";

/* ---------- Dates (clés AAAA-MM-JJ / AAAA-MM, calcul en UTC) ---------- */

const DAY = 86_400_000;
const utc = (key: string) => new Date(`${key.slice(0, 10)}T00:00:00Z`);

export function addMonthsKey(month: string, n: number) {
  const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export function daysInMonth(month: string) {
  return new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
}

/** 0 = dimanche … 6 = samedi */
export function weekday(day: string) {
  return utc(day).getUTCDay();
}

export function diffDays(a: string, b: string) {
  return Math.round((utc(b).getTime() - utc(a).getTime()) / DAY);
}

export function monthLabel(month: string, withYear = false) {
  const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 15));
  return new Intl.DateTimeFormat("fr-FR", { month: "short", ...(withYear ? { year: "2-digit" } : {}) }).format(d).replace(".", "");
}

/* ---------- Saisonnalité ---------- */

/** Dates approximatives du Ramadan (début, fin incluse) — à ±1 jour selon l'observation du croissant */
const RAMADAN: [string, string][] = [
  ["2025-03-01", "2025-03-30"],
  ["2026-02-18", "2026-03-19"],
  ["2027-02-08", "2027-03-09"],
  ["2028-01-28", "2028-02-26"],
  ["2029-01-16", "2029-02-14"],
  ["2030-01-06", "2030-02-04"],
];

/** Nombre de jours de Ramadan dans le mois */
export function ramadanDays(month: string) {
  const first = `${month}-01`;
  const last = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
  let n = 0;
  for (const [a, b] of RAMADAN) {
    const s = a > first ? a : first;
    const e = b < last ? b : last;
    if (s <= e) n += diffDays(s, e) + 1;
  }
  return n;
}

/** Début du prochain Ramadan après `day` (dans les `withinDays` jours), sinon null */
export function nextRamadan(day: string, withinDays = 100) {
  const r = RAMADAN.find(([a]) => a >= day);
  return r && diffDays(day, r[0]) <= withinDays ? r[0] : null;
}

export type SeasonFlag = "ramadan" | "ete";

/**
 * Effet saisonnier supposé (multiplicateur) quand l'historique N-1 manque.
 * Hypothèses prudentes : le sport baisse pendant le Ramadan, les enfants font des stages l'été,
 * l'institut et le barbier profitent des mariages et de la préparation de l'Aïd.
 */
const PRIOR: Record<string, { ramadan: number; ete: number }> = {
  sports: { ramadan: -0.2, ete: -0.1 },
  lady: { ramadan: -0.22, ete: -0.12 },
  power: { ramadan: -0.18, ete: -0.08 },
  kids: { ramadan: -0.15, ete: 0.15 },
  clinic: { ramadan: -0.2, ete: -0.1 },
  institut: { ramadan: -0.08, ete: 0.1 },
  evolve: { ramadan: 0.05, ete: 0.05 },
};
const PRIOR_BY_KIND: Record<EntityKind, { ramadan: number; ete: number }> = {
  sport: { ramadan: -0.2, ete: -0.1 },
  clinique: { ramadan: -0.2, ete: -0.1 },
  beaute: { ramadan: -0.05, ete: 0.08 },
};

export function seasonPrior(entityId: string, kind: EntityKind, month: string) {
  const p = PRIOR[entityId] ?? PRIOR_BY_KIND[kind];
  const flags: SeasonFlag[] = [];
  let f = 1;
  const r = ramadanDays(month);
  if (r >= 5) {
    flags.push("ramadan");
    f *= 1 + p.ramadan * (r / daysInMonth(month));
  }
  const m = Number(month.slice(5, 7));
  if (m === 7 || m === 8) {
    flags.push("ete");
    f *= 1 + p.ete;
  }
  return { factor: f, flags };
}

/* ---------- Statistiques simples ---------- */

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const mean = (a: number[]) => (a.length ? sum(a) / a.length : 0);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function stdev(a: number[]) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(sum(a.map((x) => (x - m) ** 2)) / (a.length - 1));
}

/** Pente relative (par mois) d'une régression linéaire, en fraction de la moyenne */
function relativeSlope(values: number[]) {
  const n = values.length;
  if (n < 3) return 0;
  const xm = (n - 1) / 2;
  const ym = mean(values);
  if (!ym) return 0;
  let num = 0;
  let den = 0;
  values.forEach((y, x) => {
    num += (x - xm) * (y - ym);
    den += (x - xm) ** 2;
  });
  return den ? num / den / ym : 0;
}

/** Z pour une fourchette à ≈ 80 % */
const Z80 = 1.28;

/* ---------- Fin de mois ---------- */

/** Chiffre d'affaires d'un jour, décomposé selon son origine */
export type DayRevenue = { other: number; rdv: number; newSub: number; /** Renouvellements encaissés : comptent dans le réel, pas dans le rythme */ renew?: number };

export type MonthEndInput = {
  today: string;
  /** CA réel par jour (clé AAAA-MM-JJ) — au moins les 8 dernières semaines et le mois en cours */
  daily: Map<string, DayRevenue>;
  /** Valeur attendue des RDV planifiés restants, par jour (déjà pondérée par le taux de présence) */
  plannedRdv: Map<string, number>;
  /** Renouvellements attendus d'ici la fin du mois : valeur et probabilité */
  renewals: { value: number; p: number }[];
};

export type MonthEnd = {
  month: string;
  mtd: number;
  forecast: number;
  low: number;
  high: number;
  /** Détail de ce qu'il reste à venir */
  pace: number;
  rdv: number;
  renewals: number;
};

/**
 * Prévision de fin de mois : réel jusqu'à hier + pour chaque jour restant
 * (rythme du jour de la semaine + max(RDV planifiés, rythme RDV habituel) + nouveaux abonnements)
 * + renouvellements attendus. Aujourd'hui compte pour le plus grand du réel et de l'attendu.
 */
export function forecastMonthEnd({ today, daily, plannedRdv, renewals }: MonthEndInput): MonthEnd {
  const month = today.slice(0, 7);
  const dim = daysInMonth(month);
  const dom = Number(today.slice(8, 10));

  // Rythme par jour de la semaine sur les 56 jours précédant aujourd'hui
  const byDow = Array.from({ length: 7 }, () => ({ other: [] as number[], rdv: [] as number[], newSub: [] as number[] }));
  const totals: number[] = [];
  for (let i = 1; i <= 56; i++) {
    const d = addDaysUtc(today, -i);
    const r = daily.get(d) ?? { other: 0, rdv: 0, newSub: 0 };
    const w = byDow[weekday(d)]!;
    w.other.push(r.other);
    w.rdv.push(r.rdv);
    w.newSub.push(r.newSub);
    totals.push(r.other + r.rdv + r.newSub);
  }
  const avg = byDow.map((w) => ({ other: mean(w.other), rdv: mean(w.rdv), newSub: mean(w.newSub) }));

  let mtdBefore = 0;
  for (let d = 1; d < dom; d++) {
    const r = daily.get(`${month}-${String(d).padStart(2, "0")}`);
    if (r) mtdBefore += r.other + r.rdv + r.newSub + (r.renew ?? 0);
  }
  const t = daily.get(today);
  const actualToday = t ? t.other + t.rdv + t.newSub + (t.renew ?? 0) : 0;

  let pace = 0;
  let rdv = 0;
  let todayExpected = 0;
  for (let d = dom; d <= dim; d++) {
    const key = `${month}-${String(d).padStart(2, "0")}`;
    const a = avg[weekday(key)]!;
    const r = Math.max(plannedRdv.get(key) ?? 0, a.rdv);
    if (d === dom) todayExpected = a.other + a.newSub + r;
    else {
      pace += a.other + a.newSub;
      rdv += r;
    }
  }
  const renewVal = sum(renewals.map((r) => r.value * r.p));
  const todayPart = Math.max(actualToday, todayExpected);
  const forecast = mtdBefore + todayPart + pace + rdv + renewVal;

  // Incertitude : variabilité journalière sur les jours restants + aléa des renouvellements
  const remaining = dim - dom;
  const sdDays = stdev(totals) * Math.sqrt(Math.max(remaining, 0));
  const sdRenew = Math.sqrt(sum(renewals.map((r) => r.value ** 2 * r.p * (1 - r.p))));
  const sd = Math.sqrt(sdDays ** 2 + sdRenew ** 2);
  const floor = mtdBefore + actualToday;

  return {
    month,
    mtd: floor,
    forecast,
    low: Math.max(floor, forecast - Z80 * sd),
    high: forecast + Z80 * sd,
    pace,
    rdv,
    renewals: renewVal,
  };
}

function addDaysUtc(day: string, n: number) {
  const d = utc(day);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/* ---------- 3 mois ---------- */

export type MonthPoint = { month: string; value: number; low: number; high: number; flags: SeasonFlag[]; method: "n1" | "tendance" | "court" };

/**
 * Prévision mensuelle d'un établissement.
 * @param history CA réel par mois complet (clé AAAA-MM), du plus ancien au plus récent
 * @param lastFull dernier mois complet (le mois précédent)
 * @param horizon mois à prévoir après `lastFull` (le 1er = mois en cours)
 */
export function forecastMonths(entityId: string, kind: EntityKind, history: Map<string, number>, lastFull: string, horizon: number): MonthPoint[] {
  // Mois complets disponibles (on ignore les mois sans aucune vente au début de l'historique)
  const months: string[] = [];
  for (let i = 23; i >= 0; i--) {
    const m = addMonthsKey(lastFull, -i);
    if (months.length || (history.get(m) ?? 0) > 0) months.push(m);
  }
  // Le premier mois de l'historique est souvent partiel (démarrage en cours de mois) : on l'écarte
  if (months.length >= 4) months.shift();
  const vals = months.map((m) => history.get(m) ?? 0);
  const prior = (m: string) => seasonPrior(entityId, kind, m);

  // Historique désaisonnalisé (effets supposés)
  const des = months.map((m, i) => vals[i]! / prior(m).factor);
  const recent = des.slice(-3);
  const w = [1, 2, 3].slice(-recent.length);
  const level = recent.length ? sum(recent.map((v, i) => v * w[i]!)) / sum(w) : 0;
  const slope = clamp(relativeSlope(des.slice(-6)), -0.08, 0.08) * 0.5;

  // Variabilité relative autour de la tendance linéaire (résidus), entre 6 % et 25 %
  const tail = des.slice(-6);
  const tm = mean(tail);
  const sl = relativeSlope(tail) * tm;
  const resid = tail.map((v, i) => v - (tm + sl * (i - (tail.length - 1) / 2)));
  const cv = tm && tail.length >= 3 ? Math.sqrt(sum(resid.map((r) => r * r)) / Math.max(1, tail.length - 2)) / tm : 0.15;
  const rel = clamp(cv, 0.06, 0.25);

  // Croissance annuelle (3 derniers mois vs les mêmes un an plus tôt) si l'historique couvre 15 mois
  const yoyNow = sum([0, 1, 2].map((k) => history.get(addMonthsKey(lastFull, -k)) ?? 0));
  const yoyThen = sum([0, 1, 2].map((k) => history.get(addMonthsKey(lastFull, -12 - k)) ?? 0));
  const hasYoY = months.length >= 15 && yoyThen > 0;
  const growth = hasYoY ? clamp(yoyNow / yoyThen, 0.5, 2) : 1;

  const out: MonthPoint[] = [];
  for (let h = 1; h <= horizon; h++) {
    const m = addMonthsKey(lastFull, h);
    const p = prior(m);
    const n1 = history.get(addMonthsKey(m, -12)) ?? 0;
    let value: number;
    let method: MonthPoint["method"];
    if (hasYoY && n1 > 0) {
      value = n1 * growth;
      method = "n1";
    } else {
      const damp = sum(Array.from({ length: h }, (_, i) => 0.7 ** i));
      value = level * (1 + slope * damp) * p.factor;
      method = months.length >= 3 ? "tendance" : "court";
    }
    value = Math.max(0, value);
    const spread = Z80 * rel * Math.sqrt(h) * (method === "court" ? 1.5 : 1);
    out.push({ month: m, value, low: Math.max(0, value * (1 - spread)), high: value * (1 + spread), flags: p.flags, method });
  }
  return out;
}

/* ---------- Abonnements ---------- */

type SubLike = { contact_id: string; entity_id: string; price_mad: number; start_date: string; end_date: string; status: string; auto_renew: boolean; sessions_left: number | null };

/** Revenu récurrent mensuel : prix ramené à 30 jours des abonnements actifs (hors packs de séances) */
export function monthlyRecurring(subs: SubLike[], today: string) {
  let mrr = 0;
  let active = 0;
  for (const s of subs) {
    if (s.status !== "actif" || s.sessions_left !== null || s.end_date < today) continue;
    const days = Math.max(7, diffDays(s.start_date, s.end_date));
    mrr += (Number(s.price_mad) * 30) / days;
    active++;
  }
  return { mrr, active };
}

/**
 * Taux de renouvellement observé sur 90 jours, par établissement :
 * renouvelés = abonnements démarrés il y a moins de 90 j par un client déjà venu auparavant ;
 * perdus = abonnements terminés il y a moins de 90 j sans abonnement plus récent.
 * `firstSale` : première vente connue par « client|établissement ».
 */
export function renewalRates(subs: SubLike[], firstSale: Map<string, string>, today: string) {
  const since = addDaysUtc(today, -90);
  const latestEnd = new Map<string, string>();
  for (const s of subs) {
    const k = `${s.contact_id}|${s.entity_id}`;
    if ((latestEnd.get(k) ?? "") < s.end_date) latestEnd.set(k, s.end_date);
  }
  const acc = new Map<string, { renewed: number; lost: number }>();
  const bump = (e: string, key: "renewed" | "lost") => {
    const a = acc.get(e) ?? { renewed: 0, lost: 0 };
    a[key]++;
    acc.set(e, a);
  };
  for (const s of subs) {
    if (s.sessions_left !== null) continue;
    const k = `${s.contact_id}|${s.entity_id}`;
    if (s.start_date >= since && s.start_date <= today) {
      const first = firstSale.get(k);
      if (first && diffDays(first, s.start_date) > 20) bump(s.entity_id, "renewed");
    }
    if (s.end_date >= since && s.end_date < today && latestEnd.get(k) === s.end_date) bump(s.entity_id, "lost");
  }
  const rates = new Map<string, number>();
  for (const [e, a] of acc) {
    const n = a.renewed + a.lost;
    rates.set(e, n >= 5 ? clamp(a.renewed / n, 0.3, 0.95) : 0.7);
  }
  return rates;
}

/** Probabilité de renouvellement d'un abonnement donné */
export function renewalProbability(s: Pick<SubLike, "auto_renew" | "entity_id" | "status">, rates: Map<string, number>) {
  if (s.status === "suspendu") return 0.3;
  return s.auto_renew ? 0.95 : (rates.get(s.entity_id) ?? 0.7);
}
