import { addDaysKey } from "@/lib/utils";
import type { CommissionBasis, CommissionRule, Shift, TimeEntry } from "@/lib/types-ops";

/** Lundi (AAAA-MM-JJ) de la semaine d'une date */
export function mondayOf(key: string) {
  const dow = (new Date(`${key.slice(0, 10)}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDaysKey(key, -dow);
}

export const isDayKey = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
export const isTime = (v: unknown): v is string => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

const toMin = (t: string) => {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return h! * 60 + m!;
};

/** Durée prévue d'un créneau (minutes) */
export function shiftMinutes(s: Pick<Shift, "kind" | "start_time" | "end_time">) {
  if (s.kind !== "travail" || !s.start_time || !s.end_time) return 0;
  let d = toMin(s.end_time) - toMin(s.start_time);
  if (d < 0) d += 24 * 60;
  return d;
}

/** Durée pointée (minutes) ; un pointage encore ouvert compte jusqu'à maintenant */
export function entryMinutes(e: Pick<TimeEntry, "clock_in" | "clock_out">, now = Date.now()) {
  const end = e.clock_out ? new Date(e.clock_out).getTime() : now;
  return Math.max(0, Math.round((end - new Date(e.clock_in).getTime()) / 60000));
}

/** 450 → "7 h 30" */
export function fmtHours(min: number) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}

export const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");

/* ---------- Commissions ---------- */

/** Règle applicable : membre + catégorie > membre > catégorie > toute l'équipe */
export function findRule(rules: CommissionRule[], p: { entity_id: string; profile_id: string; basis: CommissionBasis; category: string }) {
  let best: CommissionRule | null = null;
  let bestScore = -1;
  for (const r of rules) {
    if (!r.active || r.basis !== p.basis || r.entity_id !== p.entity_id) continue;
    if (r.profile_id && r.profile_id !== p.profile_id) continue;
    if (r.category && r.category.toLowerCase() !== p.category.toLowerCase()) continue;
    const score = (r.profile_id ? 2 : 0) + (r.category ? 1 : 0);
    if (score > bestScore) {
      best = r;
      bestScore = score;
    }
  }
  return best;
}

export type CommissionLine = { basis: CommissionBasis; entity_id: string; date: string; label: string; category: string; amount: number; rate: number; commission: number };
export type CommissionPerson = { profile_id: string; lines: CommissionLine[]; caPrest: number; comPrest: number; caProd: number; comProd: number; total: number };

export function groupByPerson(lines: (CommissionLine & { profile_id: string })[]) {
  const map = new Map<string, CommissionPerson>();
  for (const l of lines) {
    const p = map.get(l.profile_id) ?? { profile_id: l.profile_id, lines: [], caPrest: 0, comPrest: 0, caProd: 0, comProd: 0, total: 0 };
    p.lines.push(l);
    if (l.basis === "prestations") {
      p.caPrest += l.amount;
      p.comPrest += l.commission;
    } else {
      p.caProd += l.amount;
      p.comProd += l.commission;
    }
    p.total += l.commission;
    map.set(l.profile_id, p);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}
