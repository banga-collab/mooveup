/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SeedDB, SeedHelpers } from "./index";

type Row = Record<string, any>;

/** Séries de démonstration : [établissement, fréquence, 1re séance (jours), heure, nombre de séances, mot-clé de prestation] */
const PLANS: [entity: string, freq: "weekly" | "biweekly" | "monthly", startOffset: number, time: string, count: number, hint: RegExp][] = [
  ["clinic", "biweekly", -28, "16:30", 8, /laser|peeling|mésothérapie|soin/i],
  ["institut", "weekly", -21, "18:30", 10, /hammam|massage|soin/i],
  ["evolve", "monthly", -62, "12:30", 6, /coupe|barbe/i],
  ["institut", "biweekly", -7, "11:00", 6, /manucure|ongles|beauté|soin/i],
];

const addMonths = (date: string, n: number) => {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d, last));
  return first.toISOString().slice(0, 10);
};
const diffDays = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000);

/**
 * Agenda : quelques séries de rendez-vous récurrents (soins en cure, hammam hebdomadaire, barbier mensuel).
 * Ajoute leurs séances aux rendez-vous existants en évitant les conflits de praticien.
 */
export function seedAgenda(db: SeedDB, h: SeedHelpers): SeedDB {
  const { uid, rnd, pick, day, at } = h;
  const appointments: Row[] = [...(db.appointments ?? [])];
  const series: Row[] = [];
  const activities: Row[] = [];
  const now = Date.now();
  const today = day(0);
  const usedContacts = new Set<string>();

  for (const [eid, freq, startOffset, time, count, hint] of PLANS) {
    const items = (db.catalog_items ?? []).filter((i) => i.entity_id === eid && i.kind === "prestation" && i.active !== false);
    const staff = (db.profiles ?? []).filter((p) => p.role === "staff" && p.active !== false && (p.entity_ids ?? []).includes(eid));
    const pool = (db.contacts ?? []).filter((c) => (c.entity_ids ?? []).includes(eid) && !usedContacts.has(c.id));
    if (!items.length || !pool.length) continue;
    const item = items.find((i) => hint.test(i.name)) ?? pick(items);
    const contact = pick(pool);
    usedContacts.add(contact.id);
    const staffer = staff.length ? pick(staff) : null;
    const duration = Number(item.duration_min ?? 60);
    const start = day(startOffset);
    const id = uid();

    series.push({
      id,
      entity_id: eid,
      contact_id: contact.id,
      item_id: item.id,
      service: item.name,
      staff_id: staffer?.id ?? null,
      freq,
      start_date: start,
      time,
      duration_min: duration,
      price_mad: item.price_mad,
      room: null,
      notes: freq === "monthly" ? "Entretien mensuel" : "Cure",
      until_date: null,
      occurrences: count,
      cancelled_at: null,
      created_by: null,
      created_at: at(startOffset - 3, "10:00"),
    });

    let created = 0;
    for (let i = 0; i < count; i++) {
      const date = freq === "monthly" ? addMonths(start, i) : addDaysKey(start, i * (freq === "weekly" ? 7 : 14));
      const startsAt = at(diffDays(today, date), time);
      const s = new Date(startsAt).getTime();
      const e = s + duration * 60000;
      if (
        staffer &&
        appointments.some((a) => a.staff_id === staffer.id && a.status !== "annule" && a.status !== "absent" && new Date(a.starts_at).getTime() < e && s < new Date(a.starts_at).getTime() + Number(a.duration_min) * 60000)
      )
        continue;
      const past = s < now;
      const r = rnd();
      appointments.push({
        id: uid(),
        entity_id: eid,
        contact_id: contact.id,
        item_id: item.id,
        service: item.name,
        staff_id: staffer?.id ?? null,
        starts_at: startsAt,
        duration_min: duration,
        status: past ? (r < 0.9 ? "termine" : "absent") : r < 0.5 ? "confirme" : "prevu",
        room: null,
        price_mad: item.price_mad,
        notes: null,
        series_id: id,
        created_at: at(startOffset - 3, "10:00"),
      });
      created++;
    }
    activities.push({
      id: uid(),
      contact_id: contact.id,
      entity_id: eid,
      kind: "rdv",
      body: `Série de ${created} rendez-vous : ${item.name}, ${freq === "weekly" ? "chaque semaine" : freq === "biweekly" ? "toutes les 2 semaines" : "chaque mois"} à ${time}`,
      author_id: null,
      created_at: at(startOffset - 3, "10:00"),
    });
  }

  return {
    appointment_series: series,
    appointments,
    activities: [...(db.activities ?? []), ...activities],
  };
}

function addDaysKey(date: string, n: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
