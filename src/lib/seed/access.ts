/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SeedDB, SeedHelpers } from "./index";
import { CODE_ALPHABET, formatCode } from "@/components/access/code";

type Row = Record<string, any>;

/** Poids des heures d'arrivée (6 h → 22 h) par type de clientèle */
const WEIGHTS: Record<string, number[]> = {
  //      6  7  8   9 10 11 12 13 14 15 16 17 18  19  20 21 22
  sports: [2, 13, 15, 8, 4, 3, 3, 2, 2, 2, 3, 6, 15, 17, 14, 7, 1],
  power: [3, 14, 13, 6, 3, 2, 3, 2, 2, 2, 3, 6, 16, 18, 15, 8, 1],
  lady: [0, 7, 11, 13, 9, 4, 2, 2, 2, 3, 4, 8, 14, 13, 8, 2, 0],
  kids: [0, 0, 1, 3, 4, 3, 1, 1, 5, 7, 8, 9, 6, 2, 0, 0, 0],
};
/** Samedi : plus de monde et un pic en fin de matinée */
const SATURDAY = [1, 4, 6, 9, 12, 12, 9, 6, 5, 6, 7, 7, 6, 5, 4, 2, 0];

function weightedHour(w: number[], rnd: () => number) {
  const total = w.reduce((a, b) => a + b, 0);
  let r = rnd() * total;
  for (let i = 0; i < w.length; i++) {
    r -= w[i]!;
    if (r <= 0) return i + 6;
  }
  return 18;
}

export function seedAccess(db: SeedDB, h: SeedHelpers): SeedDB {
  const { uid, rnd, pick, int, day, at } = h;
  const contacts = db.contacts ?? [];
  const subs = db.subscriptions ?? [];
  const appts = db.appointments ?? [];
  const desk = (db.profiles ?? []).filter((p) => p.role !== "staff");
  const deskFor = (e: string) => desk.filter((p) => !p.entity_ids.length || p.entity_ids.includes(e));
  const now = Date.now();

  /* Cartes membres : une par client */
  const used = new Set<string>();
  const member_cards: Row[] = contacts.map((c) => {
    let code = "";
    do {
      let core = "";
      for (let i = 0; i < 8; i++) core += CODE_ALPHABET[Math.floor(rnd() * CODE_ALPHABET.length)];
      code = formatCode(core);
    } while (used.has(code));
    used.add(code);
    return { id: uid(), contact_id: c.id, code, regenerated_at: null, created_at: c.created_at };
  });

  /* Entrées des 30 derniers jours (abonnés) */
  const checkins: Row[] = [];
  const timeSubs = subs.filter((s) => s.sessions_left === null && s.status !== "resilie");
  for (let d = -30; d <= 0; d++) {
    const date = day(d);
    const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
    const factor = dow === 6 ? 1.35 : dow === 0 ? 0.45 : dow === 5 ? 0.85 : 1;
    for (const s of timeSubs) {
      if (s.start_date > date || s.end_date < date) continue;
      if (s.status === "suspendu" && d > -10) continue;
      const base = s.entity_id === "kids" ? (dow === 3 || dow === 6 ? 0.6 : 0.3) : 0.55;
      if (rnd() > base * factor) continue;
      const weights = dow === 6 && s.entity_id !== "kids" ? SATURDAY : WEIGHTS[s.entity_id] ?? WEIGHTS.sports!;
      const hour = weightedHour(weights, rnd);
      const when = at(d, `${String(hour).padStart(2, "0")}:${String(int(0, 59)).padStart(2, "0")}`);
      if (new Date(when).getTime() > now) continue;
      const by = deskFor(s.entity_id);
      checkins.push({
        id: uid(),
        contact_id: s.contact_id,
        entity_id: s.entity_id,
        subscription_id: s.id,
        appointment_id: null,
        method: rnd() < 0.78 ? "qr" : "recherche",
        session_used: false,
        forced: false,
        force_reason: null,
        by_id: by.length ? pick(by).id : null,
        created_at: when,
      });
    }
  }

  /* Arrivées sur rendez-vous (institut, clinique, barbier…) */
  const since = new Date(at(-30, "00:00")).getTime();
  for (const a of appts) {
    const t = new Date(a.starts_at).getTime();
    if (t < since || t > now || (a.status !== "termine" && a.status !== "arrive")) continue;
    const by = deskFor(a.entity_id);
    checkins.push({
      id: uid(),
      contact_id: a.contact_id,
      entity_id: a.entity_id,
      subscription_id: null,
      appointment_id: a.id,
      method: "rdv",
      session_used: false,
      forced: false,
      force_reason: null,
      by_id: by.length ? pick(by).id : null,
      created_at: new Date(t - int(2, 12) * 60_000).toISOString(),
    });
  }

  /* Quelques entrées forcées (journalisées) */
  const forcedPool = checkins.filter((c) => c.method !== "rdv");
  for (let i = 0; i < 4 && forcedPool.length; i++) {
    const c = pick(forcedPool);
    c.forced = true;
    c.force_reason = pick(["Renouvellement promis demain", "Paiement par virement en cours", "Carte oubliée, client connu", "Geste commercial"]);
  }
  checkins.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));

  /* Réservations en ligne : rendez-vous récents ou à venir */
  const candidates = appts.filter(
    (a) => ["institut", "clinic", "evolve", "sports", "kids"].includes(a.entity_id) && a.status !== "annule" && new Date(a.starts_at).getTime() > now - 6 * 86_400_000,
  );
  const online_bookings: Row[] = [];
  const taken = new Set<string>();
  for (let i = 0; i < 10 && candidates.length; i++) {
    const a = pick(candidates);
    if (taken.has(a.id)) continue;
    taken.add(a.id);
    const c = contacts.find((x) => x.id === a.contact_id);
    if (!c) continue;
    const future = new Date(a.starts_at).getTime() > now;
    let ref = "R-";
    for (let k = 0; k < 5; k++) ref += CODE_ALPHABET[Math.floor(rnd() * CODE_ALPHABET.length)];
    online_bookings.push({
      id: uid(),
      ref,
      entity_id: a.entity_id,
      contact_id: c.id,
      appointment_id: a.id,
      item_id: a.item_id,
      service: a.service,
      starts_at: a.starts_at,
      duration_min: a.duration_min,
      price_mad: a.price_mad,
      full_name: c.full_name,
      phone: c.phone ?? "",
      email: c.email,
      status: future && a.status === "prevu" ? "nouvelle" : "confirmee",
      source: "en_ligne",
      deposit_mad: 0,
      deposit_status: "aucun",
      created_at: new Date(Math.min(now, new Date(a.starts_at).getTime()) - int(1, 5) * 86_400_000).toISOString(),
    });
  }

  return { member_cards, checkins, online_bookings };
}
