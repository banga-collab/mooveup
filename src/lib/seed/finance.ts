/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SeedDB, SeedHelpers } from "./index";
import { ENTITIES } from "../entities";
import { dayKey, mad } from "../utils";
import { EXPENSE_CATEGORY_LABEL, EXPENSE_METHOD_LABEL, type ExpenseCategory, type ExpenseMethod } from "../types-finance";

type Row = Record<string, any>;

const METHODS = ["especes", "carte", "virement", "cheque", "en_ligne"] as const;

/** Réglages, dépenses (7 mois), clôtures de caisse (3 semaines) et journal des actions */
export function seedFinance(db: SeedDB, h: SeedHelpers): SeedDB {
  const { uid, rnd, pick, int, day, at } = h;
  const today = day(0);
  const nowIso = new Date().toISOString();
  const profiles = db.profiles ?? [];
  const sales = (db.sales ?? []).filter((s) => s.status !== "remboursee");
  const direction = profiles.find((p) => p.role === "direction")!;
  const nameOf = (id: string | null) => profiles.find((p) => p.id === id)?.full_name ?? "";
  const managersOf = (e: string) => profiles.filter((p) => p.role === "manager" && p.entity_ids.includes(e));
  const deskOf = (e: string) => {
    const desk = profiles.filter((p) => (p.role === "reception" || p.role === "manager") && p.entity_ids.includes(e));
    return desk.length ? desk : [direction];
  };
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const round = (n: number, step: number) => Math.max(step, Math.round(n / step) * step);

  /* ---------- Réglages ---------- */
  const settings: Row[] = [
    {
      id: 1,
      company_name: "Groupe Moov'Up SARL",
      address: "N°40 Hay El Mohammadi, Agadir",
      phone: "05 28 23 40 40",
      email: "contact@moovup.ma",
      ice: "002871436000057",
      rc: "Agadir 48213",
      if_number: "52104873",
      patente: "48631209",
      vat_rate: 20,
      invoice_footer: "Groupe Moov'Up SARL au capital de 100 000 MAD · Merci de votre confiance, à très bientôt !",
      google_review_url: "https://g.page/r/CbMoovUpAgadir2026/review",
      loyalty_points_per_10mad: 1,
      loyalty_point_value_mad: 0.5,
      referral_bonus_points: 200,
      whatsapp_phone_id: "",
      whatsapp_enabled: false,
      cmi_client_id: "",
      cmi_enabled: false,
      booking_deposit_mad: 100,
      updated_at: at(-20, "18:10"),
    },
  ];

  /* ---------- Chiffre d'affaires par établissement et par mois ---------- */
  const caByMonth = new Map<string, number>();
  for (const s of sales) {
    const k = `${s.entity_id}|${dayKey(s.sold_at).slice(0, 7)}`;
    caByMonth.set(k, (caByMonth.get(k) ?? 0) + Number(s.total_mad));
  }
  const [ty, tm] = today.split("-").map(Number) as [number, number];
  const months = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.UTC(ty, tm - 1 - (6 - i), 1));
    return d.toISOString().slice(0, 7);
  });
  const full = months.slice(3, 6); // 3 derniers mois complets
  const avgCa = (e: string) => full.reduce((a, m) => a + (caByMonth.get(`${e}|${m}`) ?? 0), 0) / full.length;

  /* ---------- Dépenses ---------- */
  const expenses: Row[] = [];
  const productSupplier: Record<string, string[]> = {
    sports: ["Nutri Sport Maroc", "Hygiène Souss Distribution"],
    lady: ["Nutri Sport Maroc", "Hygiène Souss Distribution"],
    kids: ["Hygiène Souss Distribution", "Jouets & Sport Agadir"],
    power: ["Nutri Sport Maroc", "Hygiène Souss Distribution"],
    clinic: ["Pharma Agadir", "Medika Maroc"],
    institut: ["Cosmétiques Atlas", "Hammam Pro Distribution"],
    evolve: ["Barber Pro Maroc", "Cosmétiques Atlas"],
  };
  const ENTRETIEN: [string, string][] = [
    ["Réparation climatisation", "Clim Service Agadir"],
    ["Plomberie vestiaires", "Plomberie Talborjt"],
    ["Changement d'ampoules", "Électricité Bensergao"],
    ["Entretien du matériel", "Technofit Maroc"],
    ["Produits ménagers", "Marjane Agadir"],
  ];
  const FOURNITURES: [string, string][] = [
    ["Papier caisse", "Bureau Plus Agadir"],
    ["Serviettes", "Marjane Agadir"],
    ["Eau pour les clients", "Marjane Agadir"],
    ["Fournitures de bureau", "Librairie Al Massira"],
    ["Gobelets", "Marjane Agadir"],
  ];
  const MARKETING: [string, string][] = [
    ["Publicité Instagram", "Meta Ads"],
    ["Campagne Facebook", "Meta Ads"],
    ["Flyers", "Imprimerie Founty"],
    ["Spot radio", "Radio Plus Agadir"],
  ];
  const add = (entity_id: string, date: string, category: ExpenseCategory, amount: number, method: ExpenseMethod, note: string | null, supplier: string | null) => {
    if (date > today) return;
    const mgr = managersOf(entity_id);
    const created = `${date}T${String(int(8, 10)).padStart(2, "0")}:${String(int(10, 59))}:00.000Z`;
    expenses.push({
      id: uid(),
      entity_id,
      date,
      category,
      amount_mad: r2(amount),
      method,
      supplier,
      note,
      receipt_url: null,
      created_by: mgr.length && rnd() < 0.6 ? pick(mgr).id : direction.id,
      created_at: created > nowIso ? nowIso : created,
    });
  };
  const dd = (m: string, d: number) => `${m}-${String(d).padStart(2, "0")}`;
  const monthName = (m: string) => new Intl.DateTimeFormat("fr-FR", { month: "long", timeZone: "UTC" }).format(new Date(`${m}-15T00:00:00Z`));

  for (const e of ENTITIES) {
    const base = Math.max(8_000, avgCa(e.id));
    const rent = round(base * 0.1, 500);
    const salaries = round(base * 0.25, 500);
    for (const m of months) {
      const ca = caByMonth.get(`${e.id}|${m}`) ?? base;
      add(e.id, dd(m, 2), "loyer", rent, "virement", `Loyer ${monthName(m)}`, "SCI Hay Mohammadi");
      add(e.id, dd(m, int(3, 5)), "salaires", salaries, "virement", "Salaires de l'équipe", null);
      add(e.id, dd(m, int(8, 12)), "energie", round(base * 0.028 * (0.85 + rnd() * 0.3), 10), "prelevement", "Électricité", "ONEE");
      add(e.id, dd(m, int(13, 16)), "energie", round(base * 0.01 * (0.8 + rnd() * 0.4), 10), "prelevement", "Eau", "RAMSA");
      add(e.id, dd(m, int(6, 20)), "produits", round(ca * 0.04 * (0.8 + rnd() * 0.4), 10), pick(["virement", "cheque"] as const), "Réassort", pick(productSupplier[e.id]!));
      if (e.kind !== "sport" || rnd() < 0.5) add(e.id, dd(m, int(18, 26)), "produits", round(ca * 0.02 * (0.8 + rnd() * 0.4), 10), "especes", "Petit réassort", pick(productSupplier[e.id]!));
      const [mk, mks] = pick(MARKETING);
      add(e.id, dd(m, int(1, 10)), "marketing", round(base * 0.02 * (0.6 + rnd() * 0.8), 50), "carte", mk, mks);
      for (let k = 0; k < int(1, 2); k++) {
        const [n, sup] = pick(ENTRETIEN);
        add(e.id, dd(m, int(1, 28)), "entretien", round(base * (0.004 + rnd() * 0.015), 10), pick(["especes", "especes", "cheque"] as const), n, sup);
      }
      for (let k = 0; k < int(2, 3); k++) {
        const [n, sup] = pick(FOURNITURES);
        add(e.id, dd(m, int(1, 28)), "fournitures", round(base * (0.001 + rnd() * 0.005), 5), "especes", n, sup);
      }
    }
  }
  // Petites sorties de caisse aujourd'hui
  add("sports", today, "fournitures", 180, "especes", "Bouteilles d'eau pour l'accueil", "Marjane Agadir");
  add("institut", today, "produits", 95, "especes", "Huiles de massage", "Cosmétiques Atlas");
  add("evolve", today, "produits", 60, "especes", "Lames de rasoir", "Barber Pro Maroc");
  expenses.sort((a, b) => (a.date < b.date ? -1 : 1));

  /* ---------- Clôtures de caisse (3 dernières semaines) ---------- */
  const cash_sessions: Row[] = [];
  const audit_log: Row[] = [];
  const log = (row: Omit<Row, "id">) => audit_log.push({ id: uid(), meta: null, ...row });

  const salesByDay = new Map<string, Row[]>();
  for (const s of sales) {
    const k = `${s.entity_id}|${dayKey(s.sold_at)}`;
    if (!salesByDay.has(k)) salesByDay.set(k, []);
    salesByDay.get(k)!.push(s);
  }
  const cashExpenses = (e: string, d: string) => expenses.filter((x) => x.entity_id === e && x.date === d && x.method === "especes").reduce((a, x) => a + x.amount_mad, 0);
  const totalExpenses = (e: string, d: string) => expenses.filter((x) => x.entity_id === e && x.date === d).reduce((a, x) => a + x.amount_mad, 0);

  for (const e of ENTITIES) {
    const float = e.kind === "sport" && e.id !== "kids" ? 1000 : 500;
    for (let k = 21; k >= 1; k--) {
      const d = day(-k);
      const list = salesByDay.get(`${e.id}|${d}`) ?? [];
      const by = Object.fromEntries(METHODS.map((m) => [m, 0])) as Record<string, number>;
      for (const s of list) by[s.method] = (by[s.method] ?? 0) + Number(s.paid_mad);
      const expCash = cashExpenses(e.id, d);
      const expected = r2(float + by.especes! - expCash);
      const roll = rnd();
      const diff = roll < 0.78 ? 0 : roll < 0.9 ? pick([-10, -5, 5, 10, -15]) : pick([-120, -60, -45, 30, 50]);
      const comment =
        Math.abs(diff) > 20 ? (diff < 0 ? pick(["Monnaie rendue en trop sur un ticket, vérifié avec la caméra", "Remboursement client non saisi, à régulariser", "Erreur de rendu de monnaie"]) : pick(["Pourboire laissé dans la caisse", "Vente de bouteille d'eau non saisie"])) : null;
      const cashier = pick(deskOf(e.id));
      const opened = at(-k, `0${int(7, 9)}:${pick(["00", "15", "30"])}`);
      const closed = at(-k, `${int(20, 22)}:${pick(["05", "20", "40"])}`);
      const id = uid();
      cash_sessions.push({
        id,
        entity_id: e.id,
        day: d,
        status: "cloturee",
        opening_float_mad: float,
        opened_at: opened,
        opened_by: cashier.id,
        closed_at: closed,
        closed_by: cashier.id,
        expected_cash_mad: expected,
        counted_cash_mad: r2(expected + diff),
        difference_mad: diff,
        comment,
        breakdown: null,
        totals: {
          sales: Object.fromEntries(METHODS.map((m) => [m, r2(by[m] ?? 0)])),
          balances: Object.fromEntries(METHODS.map((m) => [m, 0])),
          sales_count: list.length,
          refunds_total: 0,
          refunds_cash: 0,
          expenses_total: r2(totalExpenses(e.id, d)),
          expenses_cash: r2(expCash),
          cash_in: r2(by.especes ?? 0),
        },
        created_at: opened,
      });
      if (k <= 3 || Math.abs(diff) > 20) {
        log({
          action: "caisse.cloture",
          entity_id: e.id,
          target_type: "cash_session",
          target_id: id,
          summary: `Caisse ${e.short} du ${d.split("-").reverse().join("/")} clôturée : attendu ${mad(expected)}, compté ${mad(expected + diff)} (${diff === 0 ? "sans écart" : `écart ${diff > 0 ? "+" : ""}${mad(diff)}`})`,
          actor_id: cashier.id,
          actor_name: cashier.full_name,
          meta: { expected, counted: r2(expected + diff), diff },
          created_at: closed,
        });
      }
    }
    // Aujourd'hui : caisse ouverte partout sauf Moov'Up Kids
    if (e.id !== "kids") {
      const cashier = pick(deskOf(e.id));
      const openedAt = at(0, "08:30") < new Date().toISOString() ? at(0, "08:30") : new Date().toISOString();
      const id = uid();
      cash_sessions.push({
        id,
        entity_id: e.id,
        day: today,
        status: "ouverte",
        opening_float_mad: float,
        opened_at: openedAt,
        opened_by: cashier.id,
        closed_at: null,
        closed_by: null,
        expected_cash_mad: null,
        counted_cash_mad: null,
        difference_mad: null,
        comment: null,
        breakdown: null,
        totals: null,
        created_at: openedAt,
      });
      log({ action: "caisse.ouverture", entity_id: e.id, target_type: "cash_session", target_id: id, summary: `Caisse ${e.short} ouverte avec un fond de ${mad(float)}`, actor_id: cashier.id, actor_name: cashier.full_name, meta: { float }, created_at: openedAt });
    }
  }

  /* ---------- Journal des actions ---------- */
  // Remises accordées ce dernier mois
  for (const s of sales) {
    if (!Number(s.discount_mad) || s.sold_at < at(-14, "00:00") || s.sold_at > nowIso) continue;
    const gross = Number(s.total_mad) + Number(s.discount_mad);
    log({
      action: "vente.remise",
      entity_id: s.entity_id,
      target_type: "sale",
      target_id: s.id,
      summary: `Remise de ${mad(Number(s.discount_mad))} sur la vente ${s.number}`,
      actor_id: s.sold_by,
      actor_name: nameOf(s.sold_by),
      meta: { amount: Number(s.discount_mad), pct: gross ? Math.round((Number(s.discount_mad) / gross) * 100) : 0 },
      created_at: s.sold_at,
    });
  }
  // Dépenses saisies ce dernier mois
  for (const x of expenses) {
    if (x.date < day(-14)) continue;
    log({
      action: "depense.ajout",
      entity_id: x.entity_id,
      target_type: "expense",
      target_id: x.id,
      summary: `Dépense ${EXPENSE_CATEGORY_LABEL[x.category as ExpenseCategory]} de ${mad(x.amount_mad)}${x.supplier ? ` (${x.supplier})` : ""} · ${EXPENSE_METHOD_LABEL[x.method as ExpenseMethod]}`,
      actor_id: x.created_by,
      actor_name: nameOf(x.created_by),
      meta: { amount: x.amount_mad, method: x.method, month: x.date.slice(0, 7) },
      created_at: x.created_at,
    });
  }
  // Résiliations d'abonnement
  const contacts = db.contacts ?? [];
  const contactName = (id: string) => contacts.find((c) => c.id === id)?.full_name ?? "client";
  for (const s of (db.subscriptions ?? []).filter((x) => x.status === "resilie").slice(0, 8)) {
    const actor = pick(deskOf(s.entity_id));
    log({
      action: "abonnement.resiliation",
      entity_id: s.entity_id,
      target_type: "subscription",
      target_id: s.id,
      summary: `Abonnement ${s.name} de ${contactName(s.contact_id)} résilié`,
      actor_id: actor.id,
      actor_name: actor.full_name,
      meta: { contact_id: s.contact_id },
      created_at: at(-int(1, 40), `${int(10, 19)}:${pick(["05", "25", "50"])}`),
    });
  }
  // Modifications de prix au catalogue
  const items = (db.catalog_items ?? []).filter((i) => i.kind !== "produit");
  for (let k = 0; k < 4 && items.length; k++) {
    const it = pick(items);
    const old = Number(it.price_mad) - pick([10, 20, 50, 100]);
    log({
      action: "catalogue.prix",
      entity_id: it.entity_id,
      target_type: "catalog_item",
      target_id: it.id,
      summary: `Prix de « ${it.name} » : ${old} → ${it.price_mad} MAD`,
      actor_id: direction.id,
      actor_name: direction.full_name,
      meta: { old, new: Number(it.price_mad) },
      created_at: at(-int(3, 45), "11:20"),
    });
  }
  // Suppressions (sensibles)
  const someContacts = contacts.slice(0, 40);
  if (someContacts.length) {
    const c = pick(someContacts);
    const mgr = profiles.find((p) => p.role === "manager") ?? direction;
    log({
      action: "contact.suppression",
      entity_id: c.entity_ids?.[0] ?? null,
      target_type: "contact",
      target_id: null,
      summary: `Fiche client « ${c.full_name.split(" ")[0]} (doublon) » supprimée`,
      actor_id: mgr.id,
      actor_name: mgr.full_name,
      created_at: at(-4, "17:42"),
    });
    const a = (db.appointments ?? []).find((x) => x.entity_id === "institut") ?? (db.appointments ?? [])[0];
    if (a) {
      const rec = deskOf(a.entity_id)[0]!;
      log({
        action: "rdv.suppression",
        entity_id: a.entity_id,
        target_type: "appointment",
        target_id: null,
        summary: `Rendez-vous supprimé : ${a.service} de ${contactName(a.contact_id)} (saisi en double)`,
        actor_id: rec.id,
        actor_name: rec.full_name,
        created_at: at(-2, "10:12"),
      });
    }
  }
  // Équipe et réglages
  const rachid = profiles.find((p) => p.full_name === "Rachid Ennaji");
  if (rachid) {
    log({
      action: "equipe.role",
      entity_id: null,
      target_type: "profile",
      target_id: rachid.id,
      summary: `Rôle de ${rachid.full_name} : Équipe → Réception`,
      actor_id: direction.id,
      actor_name: direction.full_name,
      meta: { from: "staff", to: "reception" },
      created_at: at(-26, "09:40"),
    });
  }
  log({
    action: "parametres.modification",
    entity_id: null,
    target_type: "settings",
    target_id: "1",
    summary: "Paramètres modifiés : ICE, RC, IF, pied de facture, acompte de réservation",
    actor_id: direction.id,
    actor_name: direction.full_name,
    meta: { fields: ["ICE", "RC", "IF", "pied de facture", "acompte de réservation"] },
    created_at: at(-20, "18:10"),
  });

  const journal = audit_log.filter((a) => a.created_at <= nowIso).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return { settings, expenses, cash_sessions, audit_log: journal };
}
