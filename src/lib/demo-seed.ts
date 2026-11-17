/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Données fictives du groupe Moov'Up pour le mode démo.
 * Générateur déterministe : les mêmes identifiants à chaque démarrage.
 */
import { ENTITIES, type EntityId } from "./entities";
import { agadirToIso, dayKey, addDaysKey } from "./utils";

type Row = Record<string, any>;

const DIRECTION = "00000000-0000-4000-8000-000000000001";
const MANAGER = "00000000-0000-4000-8000-000000000002";
const RECEPTION = "00000000-0000-4000-8000-000000000003";

let seq = 100;
const uid = () => `00000000-0000-4000-9000-${String(++seq).padStart(12, "0")}`;

// Pseudo-aléatoire reproductible
let state = 42;
const rnd = () => {
  state |= 0;
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]!;
const int = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));

const today = () => dayKey();
const day = (offset: number) => addDaysKey(today(), offset);
const at = (offset: number, hhmm: string) => agadirToIso(day(offset), hhmm);

const FIRST_F = ["Salma", "Nadia", "Imane", "Leila", "Khadija", "Fatima Zahra", "Sara", "Hajar", "Meryem", "Asmae", "Ghita", "Nour", "Houda", "Zineb", "Yasmine", "Loubna", "Wiam", "Kawtar", "Rim", "Amal"];
const FIRST_H = ["Karim", "Youssef", "Omar", "Mehdi", "Hamza", "Anas", "Reda", "Amine", "Ayoub", "Othmane", "Yassir", "Ilyas", "Soufiane", "Badr", "Nabil", "Adil", "Rachid", "Hicham", "Zakaria", "Ismail"];
const KIDS = ["Adam", "Rayan", "Inès", "Lina", "Yanis", "Aya", "Sami", "Malak", "Ilyan", "Jana", "Ziyad", "Hiba"];
const LAST = ["El Amrani", "Bennani", "Ait Lahcen", "Ouhammou", "Tazi", "Chraibi", "Alaoui", "Benjelloun", "Berrada", "Idrissi", "Fassi", "Amzil", "Ouaziz", "Boutaleb", "Lahlou", "Naciri", "Benali", "Ait Baha", "Oukacha", "Bouzid", "Kabbaj", "Saadi", "Talbi", "Ennaji"];
const CITIES = ["Agadir", "Agadir", "Agadir", "Agadir", "Inezgane", "Aourir", "Dcheira", "Tikiouine", "Anza"];
const SOURCES = ["instagram", "instagram", "facebook", "whatsapp", "passage", "passage", "telephone", "parrainage", "site", "google"] as const;

const phone = () => `06 ${int(10, 99)} ${int(10, 99)} ${int(10, 99)} ${int(10, 99)}`;
const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "");

/* ---------- Catalogue par établissement ---------- */
type Cat = [kind: "abonnement" | "prestation" | "produit" | "pack", name: string, category: string, price: number, extra?: number];
const CATALOG: Record<EntityId, Cat[]> = {
  sports: [
    ["abonnement", "Mensuel Musculation & Fitness", "Abonnements", 350, 30],
    ["abonnement", "Trimestriel Musculation & Fitness", "Abonnements", 900, 90],
    ["abonnement", "Annuel Accès total + piscine", "Abonnements", 3600, 365],
    ["abonnement", "Mensuel Piscine", "Piscine", 300, 30],
    ["pack", "Pack 10 séances coaching personnel", "Coaching", 2000, 10],
    ["prestation", "Location terrain foot 1h", "Football", 400, 60],
    ["produit", "Whey protéine 2 kg", "Boutique", 650],
    ["produit", "Bouteille Moov'Up", "Boutique", 60],
  ],
  lady: [
    ["abonnement", "Mensuel Lady Fitness", "Abonnements", 300, 30],
    ["abonnement", "Trimestriel Lady Fitness", "Abonnements", 800, 90],
    ["abonnement", "Mensuel Aquagym", "Aquagym", 350, 30],
    ["pack", "Pack 8 cours Yoga & Pilates", "Cours", 480, 8],
    ["pack", "Pack 10 séances coaching", "Coaching", 1800, 10],
    ["produit", "Tapis de yoga", "Boutique", 220],
  ],
  kids: [
    ["abonnement", "Natation enfants (mensuel)", "Natation", 300, 30],
    ["abonnement", "École de football (trimestre)", "Football", 750, 90],
    ["abonnement", "Gym enfants (mensuel)", "Gym", 250, 30],
    ["abonnement", "Arts martiaux (mensuel)", "Arts martiaux", 250, 30],
    ["prestation", "Stage vacances (semaine)", "Stages", 600, 300],
    ["prestation", "Anniversaire (10 enfants)", "Événements", 1500, 180],
  ],
  power: [
    ["abonnement", "Mensuel Power", "Abonnements", 250, 30],
    ["abonnement", "Trimestriel Power", "Abonnements", 650, 90],
    ["abonnement", "Annuel Power", "Abonnements", 2200, 365],
    ["pack", "Pack 12 séances CrossTraining", "Cours", 600, 12],
    ["produit", "Créatine 300 g", "Boutique", 280],
    ["produit", "Ceinture de force", "Boutique", 450],
  ],
  clinic: [
    ["prestation", "Consultation esthétique", "Consultations", 300, 30],
    ["prestation", "Injection acide hyaluronique", "Injections", 2500, 45],
    ["prestation", "Toxine botulique (zone)", "Injections", 1800, 30],
    ["prestation", "Épilation laser (zone)", "Laser", 600, 30],
    ["prestation", "Peeling médical", "Soins", 900, 45],
    ["pack", "Cure 6 séances laser", "Laser", 3000, 6],
    ["prestation", "Mésothérapie visage", "Soins", 1200, 45],
  ],
  institut: [
    ["prestation", "Hammam traditionnel + gommage", "Hammam", 200, 60],
    ["prestation", "Massage relaxant 60 min", "Massage", 350, 60],
    ["prestation", "Soin du visage hydratant", "Visage", 300, 60],
    ["prestation", "Épilation jambes complètes", "Épilation", 150, 45],
    ["prestation", "Manucure + vernis semi-permanent", "Ongles", 180, 45],
    ["prestation", "Brushing", "Coiffure", 100, 30],
    ["pack", "Rituel mariée", "Packs", 2500, 1],
    ["produit", "Huile d'argan 100 ml", "Boutique", 150],
  ],
  evolve: [
    ["prestation", "Coupe homme", "Coiffure", 80, 30],
    ["prestation", "Coupe + barbe", "Coiffure", 120, 45],
    ["prestation", "Soin du visage homme", "Visage", 250, 45],
    ["prestation", "Hammam + gommage homme", "Hammam", 180, 60],
    ["prestation", "Massage sportif 45 min", "Massage", 300, 45],
    ["pack", "Abonnement barbe (4 passages)", "Packs", 200, 4],
    ["produit", "Huile à barbe", "Boutique", 120],
  ],
};

/* ---------- Équipe ---------- */
const STAFF: [name: string, role: "staff" | "manager" | "reception", ents: EntityId[], job: string][] = [
  ["Sara El Idrissi", "staff", ["sports", "lady"], "Coach fitness"],
  ["Hamza Berrada", "staff", ["sports", "power"], "Coach musculation"],
  ["Anas Ouaziz", "staff", ["kids", "sports"], "Maître-nageur"],
  ["Dr Nadia Kabbaj", "staff", ["clinic"], "Médecin esthétique"],
  ["Hajar Lahlou", "staff", ["institut"], "Esthéticienne"],
  ["Loubna Saadi", "staff", ["institut"], "Masseuse"],
  ["Reda Talbi", "staff", ["evolve"], "Barbier"],
  ["Soufiane Amzil", "manager", ["sports", "power"], "Manager sport"],
  ["Rachid Ennaji", "reception", ["sports", "power", "kids"], "Accueil complexe"],
];

export function seed(): Record<string, Row[]> {
  seq = 100;
  state = 42;

  const profiles: Row[] = [
    { id: DIRECTION, full_name: "Yassine Moov'Up", email: "direction@moovup.ma", role: "direction", entity_ids: [], job_title: "Directeur général", phone: "06 61 00 00 01", active: true, created_at: day(-400) },
    { id: MANAGER, full_name: "Houda Bennis", email: "lady@moovup.ma", role: "manager", entity_ids: ["lady", "kids"], job_title: "Manager Lady & Kids", phone: "06 61 00 00 02", active: true, created_at: day(-300) },
    { id: RECEPTION, full_name: "Meryem Ait Ali", email: "accueil.anais@moovup.ma", role: "reception", entity_ids: ["clinic", "institut"], job_title: "Réceptionniste Anais", phone: "06 61 00 00 03", active: true, created_at: day(-250) },
    ...STAFF.map(([full_name, role, entity_ids, job_title]) => ({
      id: uid(),
      full_name,
      email: `${slug(full_name.replace("Dr ", ""))}@moovup.ma`,
      role,
      entity_ids,
      job_title,
      phone: phone(),
      active: true,
      created_at: day(-int(60, 380)),
    })),
  ];
  const staffOf = (e: EntityId) => profiles.filter((p) => p.role === "staff" && p.entity_ids.includes(e));
  const deskOf = (e: EntityId) => profiles.filter((p) => p.role !== "staff" && (p.entity_ids.length === 0 || p.entity_ids.includes(e)));

  /* Catalogue */
  const catalog_items: Row[] = [];
  for (const e of ENTITIES) {
    for (const [kind, name, category, price, extra] of CATALOG[e.id]) {
      catalog_items.push({
        id: uid(),
        entity_id: e.id,
        kind,
        name,
        category,
        price_mad: price,
        duration_min: kind === "prestation" ? extra ?? 60 : null,
        duration_days: kind === "abonnement" ? extra ?? 30 : null,
        sessions_count: kind === "pack" ? extra ?? 10 : null,
        stock: kind === "produit" ? int(4, 40) : null,
        active: true,
        created_at: day(-int(100, 400)),
      });
    }
  }
  const itemsOf = (e: EntityId, kind?: string) => catalog_items.filter((i) => i.entity_id === e && (!kind || i.kind === kind));

  /* Contacts : chaque établissement a sa clientèle, certains clients en fréquentent plusieurs */
  const contacts: Row[] = [];
  const plan: [EntityId, number][] = [["sports", 64], ["lady", 46], ["kids", 34], ["power", 40], ["clinic", 28], ["institut", 42], ["evolve", 30]];
  for (const [eid, n] of plan) {
    for (let i = 0; i < n; i++) {
      const sex: "H" | "F" = eid === "lady" || eid === "institut" ? "F" : eid === "evolve" || eid === "power" ? (rnd() < 0.85 ? "H" : "F") : rnd() < 0.5 ? "H" : "F";
      const last = pick(LAST);
      const kid = eid === "kids";
      const first = kid ? pick(KIDS) : sex === "F" ? pick(FIRST_F) : pick(FIRST_H);
      const ents: EntityId[] = [eid];
      // Ventes croisées : une adhérente Lady va aussi à l'institut, etc.
      if (eid === "lady" && rnd() < 0.35) ents.push("institut");
      if (eid === "lady" && rnd() < 0.15) ents.push("clinic");
      if (eid === "sports" && sex === "H" && rnd() < 0.25) ents.push("evolve");
      if (eid === "institut" && rnd() < 0.2) ents.push("clinic");
      const status = rnd() < 0.82 ? "client" : rnd() < 0.5 ? "ancien" : "prospect";
      const created = day(-int(20, 540));
      const age = kid ? int(5, 13) : int(19, 58);
      contacts.push({
        id: uid(),
        full_name: `${first} ${last}`,
        phone: phone(),
        email: kid ? null : rnd() < 0.7 ? `${slug(first)}.${slug(last)}@gmail.com` : null,
        sex,
        birth_date: `${new Date().getFullYear() - age}-${String(int(1, 12)).padStart(2, "0")}-${String(int(1, 28)).padStart(2, "0")}`,
        city: pick(CITIES),
        source: pick(SOURCES),
        tags: [
          ...(rnd() < 0.18 ? ["VIP"] : []),
          ...(rnd() < 0.12 ? ["Parrain"] : []),
          ...(eid === "clinic" && rnd() < 0.4 ? ["Suivi médical"] : []),
          ...(eid === "institut" && rnd() < 0.15 ? ["Mariée 2026"] : []),
          ...(rnd() < 0.1 ? ["Entreprise partenaire"] : []),
        ],
        entity_ids: ents,
        status,
        guardian_name: kid ? `${sex === "F" ? pick(FIRST_F) : pick(FIRST_H)} ${last}` : null,
        notes: rnd() < 0.15 ? pick(["Préfère être contacté(e) sur WhatsApp.", "Disponible le soir après 18h.", "Allergie aux huiles essentielles.", "Vient avec sa sœur.", "Client fidèle depuis l'ouverture."]) : null,
        owner_id: pick(deskOf(eid)).id,
        whatsapp_optin: rnd() < 0.9,
        created_at: created,
      });
    }
  }
  const byEntity = (e: EntityId) => contacts.filter((c) => c.entity_ids.includes(e) && c.status !== "prospect");

  /* Abonnements (établissements sportifs + packs) */
  const subscriptions: Row[] = [];
  for (const e of ENTITIES.filter((x) => x.kind === "sport")) {
    for (const c of byEntity(e.id)) {
      const subs = itemsOf(e.id, "abonnement");
      const item = rnd() < 0.55 ? subs[0]! : pick(subs);
      const days = item.duration_days as number;
      // Fin d'abonnement répartie : certains expirent bientôt, d'autres sont expirés
      const endOffset = c.status === "ancien" ? -int(20, 200) : int(-6, days);
      const end = day(endOffset);
      const start = addDaysKey(end, -days);
      subscriptions.push({
        id: uid(),
        contact_id: c.id,
        entity_id: e.id,
        item_id: item.id,
        name: item.name,
        price_mad: item.price_mad,
        start_date: start,
        end_date: end,
        status: c.status === "ancien" ? (rnd() < 0.5 ? "resilie" : "expire") : endOffset < 0 ? "expire" : rnd() < 0.05 ? "suspendu" : "actif",
        auto_renew: rnd() < 0.4,
        sessions_left: null,
        created_at: start,
      });
      if (rnd() < 0.15 && itemsOf(e.id, "pack").length) {
        const pack = pick(itemsOf(e.id, "pack"));
        subscriptions.push({
          id: uid(),
          contact_id: c.id,
          entity_id: e.id,
          item_id: pack.id,
          name: pack.name,
          price_mad: pack.price_mad,
          start_date: day(-int(5, 40)),
          end_date: day(int(30, 90)),
          status: "actif",
          auto_renew: false,
          sessions_left: int(1, pack.sessions_count),
          created_at: day(-int(5, 40)),
        });
      }
    }
  }

  /* Rendez-vous (clinique, institut, barbier + coaching / terrain) : 45 jours passés, 10 à venir */
  const appointments: Row[] = [];
  const rdvEntities: [EntityId, number][] = [["clinic", 5], ["institut", 9], ["evolve", 11], ["sports", 2], ["kids", 1]];
  const now = Date.now();
  for (const [eid, perDay] of rdvEntities) {
    const pool = byEntity(eid);
    const services = itemsOf(eid, "prestation");
    const staff = staffOf(eid);
    if (!pool.length || !services.length) continue;
    for (let d = -45; d <= 10; d++) {
      const dow = new Date(`${day(d)}T12:00:00Z`).getUTCDay();
      if (eid === "clinic" && dow === 0) continue;
      const n = Math.max(0, perDay + int(-2, 2) + (dow === 6 ? 2 : 0));
      const used = new Set<string>();
      for (let k = 0; k < n; k++) {
        const hh = 9 + ((k * 2 + int(0, 1)) % 11);
        const time = `${String(hh).padStart(2, "0")}:${pick(["00", "30"])}`;
        if (used.has(time)) continue;
        used.add(time);
        const svc = pick(services);
        const startsAt = at(d, time);
        const past = new Date(startsAt).getTime() < now;
        const r = rnd();
        appointments.push({
          id: uid(),
          entity_id: eid,
          contact_id: pick(pool).id,
          item_id: svc.id,
          service: svc.name,
          staff_id: staff.length ? pick(staff).id : null,
          starts_at: startsAt,
          duration_min: svc.duration_min ?? 60,
          status: past ? (r < 0.84 ? "termine" : r < 0.93 ? "absent" : "annule") : d === 0 && r < 0.3 ? "arrive" : r < 0.6 ? "confirme" : "prevu",
          room: eid === "clinic" ? pick(["Cabine 1", "Cabine 2"]) : eid === "institut" ? pick(["Hammam", "Cabine soins", "Salle massage", "Ongles"]) : eid === "evolve" ? pick(["Fauteuil 1", "Fauteuil 2"]) : eid === "sports" ? pick(["Terrain A", "Plateau muscu"]) : "Bassin",
          price_mad: svc.price_mad,
          notes: rnd() < 0.08 ? pick(["Première visite", "Peau sensible", "Vient avec une amie", "Rappeler la veille"]) : null,
          created_at: at(d - int(1, 10), "10:00"),
        });
      }
    }
  }

  /* Ventes : 7 mois d'historique, en croissance */
  const sales: Row[] = [];
  const sale_items: Row[] = [];
  let num = 1;
  const addSale = (eid: EntityId, contactId: string | null, when: string, lines: [Row | null, string, number, number][], method?: string) => {
    const total = lines.reduce((a, [, , q, p]) => a + q * p, 0);
    const discount = rnd() < 0.1 ? Math.round(total * 0.1) : 0;
    const status = rnd() < 0.92 ? "payee" : rnd() < 0.5 ? "partielle" : "impayee";
    const id = uid();
    const paid = status === "payee" ? total - discount : status === "partielle" ? Math.round((total - discount) / 2) : 0;
    sales.push({
      id,
      number: `MU-${new Date(when).getFullYear()}-${String(num++).padStart(5, "0")}`,
      entity_id: eid,
      contact_id: contactId,
      total_mad: total - discount,
      discount_mad: discount,
      paid_mad: paid,
      method: method ?? pick(["especes", "especes", "especes", "carte", "carte", "virement", "en_ligne"]),
      status,
      sold_by: pick(deskOf(eid)).id,
      sold_at: when,
      notes: null,
      created_at: when,
    });
    for (const [item, label, qty, price] of lines) sale_items.push({ id: uid(), sale_id: id, item_id: item?.id ?? null, label, qty, unit_price_mad: price });
  };
  // Chaque abonnement : la vente de la période en cours + les renouvellements précédents (≈ 7 mois)
  for (const s of subscriptions) {
    const days = Math.max(1, Math.round((new Date(s.end_date).getTime() - new Date(s.start_date).getTime()) / 86_400_000));
    let start = s.start_date as string;
    let first = true;
    while (start >= day(-215)) {
      addSale(s.entity_id, s.contact_id, agadirToIso(start, `${int(9, 20)}:${pick(["05", "20", "40"])}`), [[{ id: s.item_id }, s.name, 1, s.price_mad]]);
      // Certains clients sont plus récents : on arrête l'historique
      if (!first && rnd() < 0.12) break;
      first = false;
      if (s.sessions_left !== null) break;
      start = addDaysKey(start, -days);
    }
  }
  for (const a of appointments) {
    if (a.status !== "termine") continue;
    addSale(a.entity_id, a.contact_id, new Date(new Date(a.starts_at).getTime() + a.duration_min * 60000).toISOString(), [[{ id: a.item_id }, a.service, 1, a.price_mad]]);
  }
  // Historique prestations des mois précédents (clinique / institut / barbier)
  for (const [eid, perMonth] of [["clinic", 110], ["institut", 230], ["evolve", 280], ["sports", 50], ["kids", 25]] as [EntityId, number][]) {
    for (let m = 5; m >= 1; m--) {
      const n = Math.round(perMonth * (1 - m * 0.04) * (0.9 + rnd() * 0.2));
      for (let k = 0; k < n; k++) {
        const svc = pick(itemsOf(eid, "prestation"));
        addSale(eid, pick(byEntity(eid)).id, at(-46 - (m - 1) * 30 - int(0, 29), `${int(10, 19)}:30`), [[svc, svc.name, 1, svc.price_mad]]);
      }
    }
  }
  // Boutique
  for (let k = 0; k < 260; k++) {
    const eid = pick(["sports", "sports", "power", "power", "institut", "evolve", "lady"] as EntityId[]);
    const prods = itemsOf(eid, "produit");
    if (!prods.length) continue;
    const p = pick(prods);
    const qty = rnd() < 0.8 ? 1 : 2;
    addSale(eid, rnd() < 0.6 ? pick(byEntity(eid)).id : null, at(-int(0, 200), `${int(10, 20)}:45`), [[p, p.name, qty, p.price_mad]], "especes");
  }
  sales.sort((a, b) => (a.sold_at < b.sold_at ? -1 : 1));
  sales.forEach((s, i) => (s.number = `MU-${new Date(s.sold_at).getFullYear()}-${String(i + 1).padStart(5, "0")}`));

  /* Prospects */
  const leads: Row[] = [];
  const interests: Record<EntityId, string[]> = {
    sports: ["Abonnement musculation", "Piscine", "Coaching personnel", "Location terrain"],
    lady: ["Abonnement Lady Fitness", "Aquagym", "Yoga & Pilates"],
    kids: ["Natation enfants", "École de football", "Stage vacances", "Anniversaire"],
    power: ["Abonnement Power", "CrossTraining"],
    clinic: ["Épilation laser", "Injections", "Peeling", "Consultation"],
    institut: ["Rituel mariée", "Hammam", "Massage", "Soin du visage"],
    evolve: ["Abonnement barbe", "Soin du visage homme"],
  };
  const stages = ["nouveau", "nouveau", "contacte", "contacte", "essai", "offre", "gagne", "perdu"] as const;
  for (let k = 0; k < 64; k++) {
    const e = pick(ENTITIES);
    const sex = e.id === "lady" || e.id === "institut" ? "F" : e.id === "evolve" || e.id === "power" ? "H" : rnd() < 0.5 ? "H" : "F";
    const last = pick(LAST);
    const first = e.id === "kids" ? pick(KIDS) : sex === "F" ? pick(FIRST_F) : pick(FIRST_H);
    const created = int(1, 60);
    const source = pick(SOURCES);
    const c = {
      id: uid(),
      full_name: `${first} ${last}`,
      phone: phone(),
      email: rnd() < 0.4 ? `${slug(first)}.${slug(last)}@gmail.com` : null,
      sex,
      birth_date: null,
      city: pick(CITIES),
      source,
      tags: [],
      entity_ids: [e.id],
      status: "prospect",
      guardian_name: e.id === "kids" ? `${pick(FIRST_F)} ${last}` : null,
      notes: null,
      owner_id: pick(deskOf(e.id)).id,
      whatsapp_optin: true,
      created_at: day(-created),
    };
    const stage = pick(stages);
    if (stage === "gagne") c.status = "client";
    contacts.push(c);
    const items = itemsOf(e.id);
    leads.push({
      id: uid(),
      contact_id: c.id,
      entity_id: e.id,
      interest: pick(interests[e.id]),
      stage,
      source,
      value_mad: pick(items).price_mad,
      owner_id: c.owner_id,
      next_action_on: stage === "gagne" || stage === "perdu" ? null : day(int(-3, 6)),
      lost_reason: stage === "perdu" ? pick(["Trop cher", "Trop loin", "A choisi un concurrent", "Pas de réponse", "Pas le bon moment"]) : null,
      created_at: day(-created),
      updated_at: day(-int(0, Math.min(created, 10))),
    });
  }

  /* Historique des échanges */
  const activities: Row[] = [];
  const notes = [
    ["appel", "Appel de suivi : très satisfait(e) de l'accueil."],
    ["whatsapp", "Envoi du planning des cours de la semaine."],
    ["visite", "Visite des installations avec la réception."],
    ["note", "Souhaite passer à la formule trimestrielle le mois prochain."],
    ["whatsapp", "Rappel de rendez-vous envoyé."],
    ["appel", "Relance après la séance d'essai, rappeler samedi."],
    ["email", "Envoi du devis et des conditions."],
  ] as const;
  for (const c of contacts) {
    const n = int(1, 4);
    for (let k = 0; k < n; k++) {
      const [kind, body] = pick(notes);
      activities.push({ id: uid(), contact_id: c.id, entity_id: c.entity_ids[0], kind, body, author_id: c.owner_id, created_at: at(-int(0, 90), `${int(9, 19)}:${pick(["10", "35", "50"])}`) });
    }
  }

  /* Tâches */
  const tasks: Row[] = [];
  const taskTitles = [
    "Relancer pour renouvellement d'abonnement",
    "Confirmer le rendez-vous de demain",
    "Envoyer le devis rituel mariée",
    "Appeler après la séance d'essai",
    "Préparer le planning des stages vacances",
    "Commander la whey (stock bas)",
    "Rappeler pour le paiement du solde",
    "Organiser la visite d'une entreprise partenaire",
  ];
  for (let k = 0; k < 24; k++) {
    const lead = rnd() < 0.5 ? pick(leads.filter((l) => l.stage !== "gagne" && l.stage !== "perdu")) : null;
    const contact = lead ? contacts.find((c) => c.id === lead.contact_id) : rnd() < 0.7 ? pick(contacts) : null;
    const eid = (lead?.entity_id ?? contact?.entity_ids[0] ?? pick(ENTITIES).id) as EntityId;
    tasks.push({
      id: uid(),
      title: lead ? `Relancer ${contact!.full_name.split(" ")[0]} (${lead.interest})` : pick(taskTitles),
      contact_id: contact?.id ?? null,
      lead_id: lead?.id ?? null,
      entity_id: eid,
      assigned_to: pick([...deskOf(eid), ...staffOf(eid)]).id,
      due_date: day(int(-4, 7)),
      priority: pick(["basse", "normale", "normale", "haute"]),
      done: rnd() < 0.2,
      created_by: DIRECTION,
      created_at: day(-int(1, 15)),
    });
  }

  /* Campagnes */
  const campaigns: Row[] = [
    {
      id: uid(),
      name: "Ramadan : horaires spéciaux",
      channel: "whatsapp",
      segment: { entity_ids: ["sports", "lady", "power"], statuses: ["client"], tags: [], expiring_days: null, inactive_days: null, sex: null },
      message: "Bonjour {prenom} 👋 Pendant le Ramadan, Moov'Up est ouvert de 10h à 16h et de 21h à 01h. Bon entraînement !",
      status: "envoyee",
      scheduled_at: null,
      sent_at: at(-40, "11:00"),
      recipients_count: 58,
      created_by: DIRECTION,
      created_at: day(-42),
    },
    {
      id: uid(),
      name: "Renouvellement : -10 % cette semaine",
      channel: "whatsapp",
      segment: { entity_ids: ["sports", "lady", "power", "kids"], statuses: ["client"], tags: [], expiring_days: 10, inactive_days: null, sex: null },
      message: "Bonjour {prenom}, ton abonnement {etablissement} se termine bientôt. Renouvelle cette semaine et profite de -10 % 💪",
      status: "programmee",
      scheduled_at: at(1, "10:00"),
      sent_at: null,
      recipients_count: 0,
      created_by: MANAGER,
      created_at: day(-1),
    },
    {
      id: uid(),
      name: "Offre laser printemps",
      channel: "sms",
      segment: { entity_ids: ["clinic", "institut"], statuses: ["client", "ancien"], tags: [], expiring_days: null, inactive_days: 60, sex: "F" },
      message: "Anais Clinic : -20 % sur votre cure laser jusqu'au 30. Réservez au 05 28 00 00 00.",
      status: "brouillon",
      scheduled_at: null,
      sent_at: null,
      recipients_count: 0,
      created_by: RECEPTION,
      created_at: day(-3),
    },
  ];

  return { profiles, catalog_items, contacts, subscriptions, appointments, sales, sale_items, leads, activities, tasks, campaigns };
}
