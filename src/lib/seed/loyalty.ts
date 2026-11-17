/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SeedDB, SeedHelpers } from "./index";
import { AUTOMATIONS, renderTemplate } from "@/components/automations/defs";
import { entity } from "../entities";

type Row = Record<string, any>;

const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LOWER = "abcdefghjkmnpqrstuvwxyz23456789";

const COMMENTS_GOOD = [
  "Accueil chaleureux et personnel aux petits soins.",
  "Très propre, coachs motivants. Je recommande !",
  "Super expérience, je reviendrai avec mes amies.",
  "Résultat parfait, merci à toute l'équipe.",
  "Ponctuels et très professionnels.",
  "Le hammam était top, ambiance très relaxante.",
  "Ma fille adore ses cours de natation.",
  "Coupe nickel, comme d'habitude.",
  "",
  "",
  "",
];
const COMMENTS_MID = ["Bien dans l'ensemble mais un peu d'attente à l'accueil.", "Vestiaires à améliorer.", "Correct, un peu cher pour la prestation.", ""];
const COMMENTS_BAD = [
  "Rendez-vous commencé avec 30 minutes de retard, sans excuse.",
  "La climatisation de la salle ne fonctionnait pas.",
  "Douches froides deux fois cette semaine.",
  "Résultat décevant, j'attendais mieux pour ce prix.",
  "Personne pour m'expliquer les machines.",
];

/** Données de démo : fidélité, cartes cadeaux, parrainage, rappels et avis */
export function seedLoyalty(db: SeedDB, h: SeedHelpers): SeedDB {
  const { uid, rnd, pick, int, day, at } = h;
  const code = (prefix: string, n = 4) => `${prefix}-${Array.from({ length: n }, () => ALPHA[Math.floor(rnd() * ALPHA.length)]).join("")}`;
  const token = () => Array.from({ length: 8 }, () => LOWER[Math.floor(rnd() * LOWER.length)]).join("");
  const contacts = (db.contacts ?? []) as Row[];
  const cById = new Map(contacts.map((c) => [c.id, c]));
  const sales = (db.sales ?? []) as Row[];
  const desk = (db.profiles ?? []).filter((p: Row) => p.role !== "staff");
  const nowIso = new Date().toISOString();

  /* ---------- Points gagnés : une ligne par vente existante ---------- */
  const loyalty_ledger: Row[] = [];
  const balance = new Map<string, number>();
  const firstSale = new Map<string, Row>();
  for (const s of sales) {
    if (!s.contact_id) continue;
    if (!firstSale.has(s.contact_id)) firstSale.set(s.contact_id, s);
    if (s.status === "remboursee") continue;
    const pts = Math.floor(Number(s.total_mad) / 10);
    if (pts <= 0) continue;
    loyalty_ledger.push({ id: uid(), contact_id: s.contact_id, entity_id: s.entity_id, points: pts, kind: "gain", sale_id: s.id, voucher_code: null, value_mad: null, voucher_used: false, note: `Vente ${s.number}`, author_id: s.sold_by, created_at: s.sold_at });
    balance.set(s.contact_id, (balance.get(s.contact_id) ?? 0) + pts);
  }

  /* ---------- Parrainage ---------- */
  const referrals: Row[] = [];
  const clients = contacts.filter((c) => c.status === "client");
  const referees = [...contacts.filter((c) => c.source === "parrainage"), ...contacts.filter((c) => c.status === "prospect")];
  const usedReferee = new Set<string>();
  for (let k = 0; k < 16 && referees.length; k++) {
    const referee = referees[k % referees.length]!;
    if (usedReferee.has(referee.id)) continue;
    const referrer = pick(clients);
    if (!referrer || referrer.id === referee.id) continue;
    usedReferee.add(referee.id);
    const first = firstSale.get(referee.id);
    const valid = !!first && referee.status !== "prospect";
    const created = first ? new Date(new Date(first.sold_at).getTime() - int(2, 15) * 86_400_000).toISOString() : at(-int(1, 25), "11:00");
    const eid = (first?.entity_id ?? referee.entity_ids?.[0] ?? "sports") as string;
    referrals.push({ id: uid(), referrer_id: referrer.id, referee_id: referee.id, entity_id: eid, status: valid ? "valide" : "en_attente", bonus_points: valid ? 200 : 0, rewarded_at: valid ? first.sold_at : null, created_by: pick(desk)?.id ?? null, created_at: created });
    if (valid) {
      loyalty_ledger.push({ id: uid(), contact_id: referrer.id, entity_id: eid, points: 200, kind: "parrainage", sale_id: null, voucher_code: null, value_mad: null, voucher_used: false, note: `Parrainage de ${referee.full_name}`, author_id: null, created_at: first.sold_at });
      balance.set(referrer.id, (balance.get(referrer.id) ?? 0) + 200);
    }
  }

  /* ---------- Points utilisés (bons de réduction) ---------- */
  const rich = [...balance.entries()].filter(([, b]) => b >= 400).sort((a, b) => b[1] - a[1]);
  for (const [cid, b] of rich.filter((_, i) => i % 3 === 0).slice(0, 30)) {
    const pts = Math.min(b - 50, pick([200, 300, 400, 500, 1000]));
    if (pts < 100) continue;
    const c = cById.get(cid);
    const eid = pick((c?.entity_ids ?? ["institut"]) as string[]);
    const used = rnd() < 0.7;
    loyalty_ledger.push({ id: uid(), contact_id: cid, entity_id: eid, points: -pts, kind: "utilisation", sale_id: null, voucher_code: code("MU-BON"), value_mad: pts * 0.5, voucher_used: used, note: `Bon de réduction ${pts * 0.5} MAD`, author_id: pick(desk)?.id ?? null, created_at: at(-int(1, 60), `${int(10, 19)}:15`) });
    balance.set(cid, b - pts);
  }
  // Quelques ajustements manuels (geste commercial)
  for (let k = 0; k < 6; k++) {
    const c = pick(clients);
    if (!c) break;
    loyalty_ledger.push({ id: uid(), contact_id: c.id, entity_id: c.entity_ids[0], points: pick([50, 100]), kind: "ajustement", sale_id: null, voucher_code: null, value_mad: null, voucher_used: false, note: pick(["Geste commercial", "Attente prolongée", "Ambassadeur de la marque"]), author_id: pick(desk)?.id ?? null, created_at: at(-int(1, 90), "12:00") });
  }

  /* ---------- Cartes cadeaux ---------- */
  const gift_cards: Row[] = [];
  const gift_card_uses: Row[] = [];
  const GIFTS: [amount: number, valid: string[], soldAt: string, ageDays: number, usedPct: number, msg: string | null][] = [
    [500, ["institut"], "institut", 12, 0, "Joyeux anniversaire maman !"],
    [1000, ["institut", "clinic"], "clinic", 40, 0.35, "Pour prendre soin de toi"],
    [300, ["evolve"], "evolve", 20, 0.4, null],
    [1500, [], "sports", 70, 0.6, "Bonne année sportive !"],
    [750, ["lady"], "lady", 8, 0, "Bienvenue chez Lady Moov'Up"],
    [2000, ["clinic"], "clinic", 95, 1, null],
    [400, ["institut"], "institut", 400, 0, "Pour ton mariage"],
    [600, [], "kids", 30, 0.5, "Pour les vacances des enfants"],
    [250, ["evolve", "institut"], "evolve", 3, 0, null],
  ];
  for (const [amount, valid, sold, ageDays, usedPct, message] of GIFTS) {
    const buyer = pick(clients);
    const beneficiary = rnd() < 0.6 ? pick(clients) : null;
    const created = at(-ageDays, `${int(10, 19)}:20`);
    const expires = day(-ageDays + 365);
    const id = uid();
    const used = Math.round(amount * usedPct);
    const status = used >= amount ? "epuisee" : expires < day(0) ? "expiree" : "active";
    gift_cards.push({
      id,
      code: code("MU-GC"),
      amount_mad: amount,
      balance_mad: amount - used,
      buyer_contact_id: buyer?.id ?? null,
      buyer_name: buyer?.full_name ?? null,
      beneficiary_contact_id: beneficiary?.id ?? null,
      beneficiary_name: beneficiary?.full_name ?? pick(["Nadia Alaoui", "Imane Berrada", "Omar Tazi", "Lina Chraibi"]),
      entity_ids: valid,
      entity_id: sold,
      expires_on: expires,
      status,
      message,
      created_by: pick(desk)?.id ?? null,
      created_at: created,
    });
    if (used > 0) {
      const parts = used >= 600 ? 2 : 1;
      for (let p = 0; p < parts; p++) {
        gift_card_uses.push({
          id: uid(),
          card_id: id,
          entity_id: valid.length ? pick(valid) : pick(["sports", "institut", "kids"]),
          amount_mad: p === parts - 1 ? used - Math.round(used / parts) * (parts - 1) : Math.round(used / parts),
          note: null,
          author_id: pick(desk)?.id ?? null,
          created_at: at(-Math.max(0, ageDays - int(2, Math.max(3, ageDays - 1))), "16:00"),
        });
      }
    }
  }

  /* ---------- Avis clients ---------- */
  const reviews: Row[] = [];
  const message_log: Row[] = [];
  const appts = ((db.appointments ?? []) as Row[]).filter((a) => a.status === "termine" && a.starts_at < nowIso && a.starts_at >= at(-45, "00:00"));
  const askedContact = new Map<string, string>();
  const avisDef = AUTOMATIONS.find((a) => a.key === "avis")!;
  for (const a of appts) {
    if (rnd() > 0.16) continue;
    const c = cById.get(a.contact_id);
    if (!c || (askedContact.get(c.id) ?? "") > a.starts_at.slice(0, 10)) continue;
    askedContact.set(c.id, new Date(new Date(a.starts_at).getTime() + 30 * 86_400_000).toISOString().slice(0, 10));
    const askedAt = new Date(new Date(a.starts_at).getTime() + (a.duration_min + int(60, 300)) * 60_000).toISOString();
    if (askedAt > nowIso) continue;
    const answered = rnd() < 0.72;
    const r = rnd();
    const rating = !answered ? null : r < 0.55 ? 5 : r < 0.8 ? 4 : r < 0.9 ? 3 : r < 0.95 ? 2 : 1;
    const comment = rating === null ? null : rating >= 4 ? pick(COMMENTS_GOOD) : rating === 3 ? pick(COMMENTS_MID) : pick(COMMENTS_BAD);
    const answeredAt = answered ? new Date(new Date(askedAt).getTime() + int(10, 600) * 60_000).toISOString() : null;
    const old = askedAt < at(-7, "00:00");
    const handled = rating !== null && rating <= 3 && old && rnd() < 0.7;
    const tok = token();
    reviews.push({
      id: uid(),
      token: tok,
      contact_id: c.id,
      entity_id: a.entity_id,
      appointment_id: a.id,
      sale_id: null,
      service: a.service,
      rating,
      comment: comment || null,
      answered_at: answeredAt && answeredAt < nowIso ? answeredAt : answered ? nowIso : null,
      handled,
      handled_at: handled ? new Date(new Date(answeredAt!).getTime() + 86_400_000).toISOString() : null,
      handled_by: handled ? pick(desk)?.id ?? null : null,
      task_id: null,
      created_at: askedAt,
    });
    const first = c.full_name.split(" ")[0];
    message_log.push({
      id: uid(),
      rule_key: "avis",
      contact_id: c.id,
      entity_id: a.entity_id,
      phone: c.phone,
      body: renderTemplate(avisDef.defaultMessage, { prenom: first, etablissement: entity(a.entity_id)?.short ?? "Moov'Up", lien: `https://crm.moovup.ma/r/${tok}` }),
      status: "simule",
      mode: "demo",
      error: null,
      ref_id: a.id,
      day_key: askedAt.slice(0, 10),
      wa_message_id: null,
      author_id: null,
      created_at: askedAt,
    });
  }

  /* ---------- Journal des rappels (14 derniers jours) ---------- */
  const veille = AUTOMATIONS.find((a) => a.key === "rdv_veille")!;
  const upcomingAppts = ((db.appointments ?? []) as Row[]).filter((a) => a.starts_at >= at(-13, "00:00") && a.starts_at < at(1, "00:00") && a.status !== "annule");
  for (const a of upcomingAppts) {
    if (rnd() > 0.35) continue;
    const c = cById.get(a.contact_id);
    if (!c?.phone) continue;
    const startDay = a.starts_at.slice(0, 10);
    const sentAt = new Date(new Date(`${startDay}T18:05:00Z`).getTime() - 86_400_000 + int(0, 40) * 60_000).toISOString();
    if (sentAt > nowIso) continue;
    const fail = rnd() < 0.04;
    const fmt = new Intl.DateTimeFormat("fr-FR", { timeZone: "Africa/Casablanca", weekday: "long", day: "numeric", month: "long" });
    const tfmt = new Intl.DateTimeFormat("fr-FR", { timeZone: "Africa/Casablanca", hour: "2-digit", minute: "2-digit" });
    message_log.push({
      id: uid(),
      rule_key: "rdv_veille",
      contact_id: c.id,
      entity_id: a.entity_id,
      phone: c.phone,
      body: renderTemplate(veille.defaultMessage, { prenom: c.full_name.split(" ")[0], etablissement: entity(a.entity_id)?.short ?? "", date: fmt.format(new Date(a.starts_at)), heure: tfmt.format(new Date(a.starts_at)), service: a.service }),
      status: fail ? "echec" : "simule",
      mode: "demo",
      error: fail ? "Numéro WhatsApp introuvable" : null,
      ref_id: a.id,
      day_key: sentAt.slice(0, 10),
      wa_message_id: null,
      author_id: null,
      created_at: sentAt,
    });
  }
  const subs = ((db.subscriptions ?? []) as Row[]).filter((s) => s.end_date >= day(-6) && s.end_date <= day(13));
  const j7 = AUTOMATIONS.find((a) => a.key === "abo_j7")!;
  for (const s of subs) {
    const sendDay = new Date(`${s.end_date}T12:00:00Z`);
    sendDay.setUTCDate(sendDay.getUTCDate() - 7);
    const dk = sendDay.toISOString().slice(0, 10);
    if (dk >= day(0) || rnd() > 0.7) continue;
    const c = cById.get(s.contact_id);
    if (!c?.phone) continue;
    message_log.push({
      id: uid(),
      rule_key: "abo_j7",
      contact_id: c.id,
      entity_id: s.entity_id,
      phone: c.phone,
      body: renderTemplate(j7.defaultMessage, { prenom: c.full_name.split(" ")[0], etablissement: entity(s.entity_id)?.short ?? "", date: new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" }).format(new Date(`${s.end_date}T12:00:00Z`)), service: s.name }),
      status: "simule",
      mode: "demo",
      error: null,
      ref_id: s.id,
      day_key: dk,
      wa_message_id: null,
      author_id: null,
      created_at: `${dk}T10:02:00.000Z`,
    });
  }
  message_log.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));

  /* ---------- Règles ---------- */
  const automation_rules = AUTOMATIONS.map((a) => ({ id: a.key, enabled: a.defaultEnabled, message: a.defaultMessage, updated_by: null, updated_at: day(-30) }));

  return { loyalty_ledger, referrals, gift_cards, gift_card_uses, reviews, message_log, automation_rules };
}
