/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SeedDB, SeedHelpers } from "./index";
import type { EntityId } from "../entities";
import type { Company, CompanyEmployee } from "../types-corporate";
import { CORPORATE_TAG } from "../types-corporate";
import { addDaysKey, daysUntil, dayKey } from "../utils";
import { computeBill, currentMonth, monthLabel, shiftMonth, type CalcData } from "@/components/corporate/calc";

type Row = Record<string, any>;

type Def = Pick<Company, "name" | "sector" | "ice" | "address" | "hr_name" | "hr_phone" | "hr_email" | "convention" | "discount_pct" | "flat_mad" | "share_mode" | "share_value" | "payment_days" | "notes"> & {
  entity_ids: EntityId[];
  size: number;
  prefix: string;
  startOffset: number;
};

/** Entreprises fictives d'Agadir */
const DEFS: Def[] = [
  {
    name: "Hôtel Atlas Bay Agadir",
    sector: "Hôtellerie",
    ice: "002318745000061",
    address: "Boulevard du 20 Août, Secteur touristique, Agadir",
    hr_name: "Salma Idrissi",
    hr_phone: "06 61 48 22 90",
    hr_email: "rh@atlasbay-agadir.ma",
    entity_ids: ["sports", "lady", "power"],
    convention: "remise",
    discount_pct: 20,
    flat_mad: 0,
    share_mode: "pct",
    share_value: 50,
    payment_days: 30,
    notes: "Convention signée avec la DRH ; personnel en horaires décalés (accès 6 h - 23 h).",
    size: 13,
    prefix: "ABA",
    startOffset: -320,
  },
  {
    name: "Banque Souss Atlantique, direction régionale",
    sector: "Banque",
    ice: "001795530000072",
    address: "Avenue Hassan II, Centre-ville, Agadir",
    hr_name: "Karim Bennani",
    hr_phone: "06 70 15 33 08",
    hr_email: "karim.bennani@souss-atlantique.ma",
    entity_ids: ["sports", "lady", "power", "institut", "evolve"],
    convention: "forfait",
    discount_pct: 0,
    flat_mad: 300,
    share_mode: "pct",
    share_value: 100,
    payment_days: 45,
    notes: "Forfait bien-être 100 % pris en charge par la banque. Bon de commande annuel.",
    size: 9,
    prefix: "BSA",
    startOffset: -240,
  },
  {
    name: "Polyclinique Souss Santé",
    sector: "Santé",
    ice: "002644018000035",
    address: "Rue Abou Bakr Essedik, Dakhla, Agadir",
    hr_name: "Dr Leïla Amrani",
    hr_phone: "06 62 90 41 17",
    hr_email: "drh@souss-sante.ma",
    entity_ids: ["clinic", "institut", "lady", "sports"],
    convention: "remise",
    discount_pct: 15,
    flat_mad: 0,
    share_mode: "fixe",
    share_value: 200,
    payment_days: 30,
    notes: "Plafond de 200 MAD par salarié et par mois, le reste est payé par le salarié à l'accueil.",
    size: 7,
    prefix: "PSS",
    startOffset: -200,
  },
  {
    name: "Agadir Logistique Express",
    sector: "Logistique",
    ice: "003102276000014",
    address: "Zone industrielle Tassila, Lot 112, Agadir",
    hr_name: "Hicham Ouazzani",
    hr_phone: "06 55 72 18 40",
    hr_email: "rh@alx-logistique.ma",
    entity_ids: ["power", "sports", "evolve"],
    convention: "remise",
    discount_pct: 10,
    flat_mad: 0,
    share_mode: "pct",
    share_value: 70,
    payment_days: 30,
    notes: "Chauffeurs et magasiniers : priorité Power Gym (horaires tôt le matin).",
    size: 12,
    prefix: "ALX",
    startOffset: -150,
  },
];

/** Données de démo : entreprises partenaires, salariés rattachés, factures des 3 derniers mois */
export function seedCorporate(db: SeedDB, h: SeedHelpers): SeedDB {
  const { uid, rnd, int, day, at, pick } = h;
  const contacts = (db.contacts ?? []) as Row[];
  const subs = (db.subscriptions ?? []) as Row[];
  const sales = (db.sales ?? []) as Row[];
  const managers = ((db.profiles ?? []) as Row[]).filter((p) => p.role === "direction" || p.role === "manager");
  const author = () => (managers.length ? pick(managers).id : null);
  if (!contacts.length) return {};

  const calc: CalcData = {
    contacts: new Map(contacts.map((c) => [c.id, { id: c.id, full_name: c.full_name, phone: c.phone }])),
    subscriptions: subs as any,
    sales: sales as any,
    saleItems: (db.sale_items ?? []) as any,
    catalogKind: new Map(((db.catalog_items ?? []) as Row[]).map((c) => [c.id, c.kind])),
  };

  const companies: Row[] = [];
  const company_employees: Row[] = [];
  const company_invoices: Row[] = [];
  const company_invoice_lines: Row[] = [];
  const company_events: Row[] = [];
  const taken = new Set<string>();
  const now = currentMonth();
  const today = dayKey();

  // Activité récente par client (abonnements / ventes) pour choisir des salariés « vivants »
  const recent = new Map<string, Set<string>>();
  const touch = (cid: string, e: string) => {
    const s = recent.get(cid) ?? new Set<string>();
    s.add(e);
    recent.set(cid, s);
  };
  const since = addDaysKey(today, -120);
  for (const s of subs) if (s.end_date >= since && s.status !== "resilie") touch(s.contact_id, s.entity_id);
  for (const s of sales) if (s.contact_id && dayKey(s.sold_at) >= since) touch(s.contact_id, s.entity_id);

  const event = (company_id: string, kind: string, body: string, created_at: string) => company_events.push({ id: uid(), company_id, kind, body, author_id: author(), created_at });
  const pending: { inv: Row; events: [string, string, string][] }[] = [];
  const fmt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

  DEFS.forEach((d, ci) => {
    const id = uid();
    const company: Row = {
      id,
      name: d.name,
      sector: d.sector,
      ice: d.ice,
      address: d.address,
      hr_name: d.hr_name,
      hr_phone: d.hr_phone,
      hr_email: d.hr_email,
      entity_ids: d.entity_ids,
      entity_id: d.entity_ids[0],
      convention: d.convention,
      discount_pct: d.discount_pct,
      flat_mad: d.flat_mad,
      share_mode: d.share_mode,
      share_value: d.share_value,
      payment_days: d.payment_days,
      start_date: day(d.startOffset),
      end_date: null,
      status: "active",
      notes: d.notes,
      created_by: author(),
      created_at: at(d.startOffset - 3, "10:30"),
    };
    companies.push(company);
    event(id, "creation", "Convention signée et créée dans le CRM", company.created_at);

    // Salariés : clients des établissements couverts, actifs récemment en priorité
    const pool = contacts
      .filter((c) => !taken.has(c.id) && c.status !== "prospect" && (c.entity_ids ?? []).some((e: string) => d.entity_ids.includes(e as EntityId)))
      .map((c) => ({ c, score: [...(recent.get(c.id) ?? [])].filter((e) => d.entity_ids.includes(e as EntityId)).length * 10 + rnd() * 5 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, d.size)
      .map((x) => x.c);
    pool.forEach((c, i) => {
      taken.add(c.id);
      const late = i >= pool.length - 2 && i > 3; // deux arrivées récentes
      const joinOffset = late ? -int(10, 40) : Math.max(d.startOffset, -int(100, 200));
      const leaves = i === 2 && ci % 2 === 0; // un départ récent dans certaines entreprises
      company_employees.push({
        id: uid(),
        company_id: id,
        contact_id: c.id,
        matricule: `${d.prefix}-${String(int(100, 999)).padStart(4, "0")}`,
        active: !leaves,
        joined_on: day(joinOffset),
        left_on: leaves ? day(-int(8, 25)) : null,
        created_at: at(joinOffset, "11:00"),
      });
    });
    event(id, "salarie", `Import rapide : ${pool.length} salariés rattachés depuis la liste du service RH`, at(Math.max(d.startOffset, -200) + 1, "15:10"));

    // Factures des 3 derniers mois
    const emps = company_employees.filter((e) => e.company_id === id) as CompanyEmployee[];
    for (let k = 3; k >= 1; k--) {
      const month = shiftMonth(now, -k);
      const bill = computeBill(company as Company, emps, calc, month);
      if (!bill.covered || !bill.billable.length) continue;
      const issued = `${shiftMonth(month, 1)}-0${int(2, 5)}`;
      const off = daysUntil(issued);
      const due = addDaysKey(issued, d.payment_days);
      // m-3 : payée ; m-2 : payée sauf la logistique (en retard, relancée) ; m-1 : envoyée (la banque : encore à envoyer)
      const status = k === 3 ? "payee" : k === 2 ? (ci === 3 ? "envoyee" : "payee") : ci === 1 ? "a_envoyer" : ci === 0 && rnd() < 0.5 ? "payee" : "envoyee";
      const paidOn = status === "payee" ? [addDaysKey(issued, int(8, 25)), today].sort()[0]! : null;
      const reminders = status === "envoyee" && due < today ? 2 : 0;
      const method = ci === 2 ? "cheque" : "virement";
      const inv: Row = {
        id: uid(),
        number: "",
        company_id: id,
        entity_id: company.entity_id,
        month,
        issued_on: issued,
        due_on: due,
        total_mad: bill.company,
        net_mad: bill.net,
        employees_count: bill.billable.length,
        status,
        sent_at: status === "a_envoyer" ? null : at(off + 1, "09:40"),
        paid_on: paidOn,
        paid_method: paidOn ? method : null,
        paid_ref: paidOn ? `${method === "cheque" ? "CHQ" : "VIR"}-${int(100000, 999999)}` : null,
        reminders_count: reminders,
        last_reminder_at: reminders ? at(-int(1, 4), "10:15") : null,
        created_by: author(),
        created_at: at(off, "09:15"),
      };
      company_invoices.push(inv);
      for (const l of bill.billable) {
        company_invoice_lines.push({
          id: uid(),
          invoice_id: inv.id,
          employee_id: l.employee.id,
          contact_id: l.contact_id,
          label: l.name,
          matricule: l.employee.matricule,
          detail: l.detail,
          gross_mad: l.gross,
          discount_mad: l.discount,
          net_mad: l.net,
          company_mad: l.company,
          employee_mad: l.employee_part,
        });
      }
      const amount = `${fmt.format(bill.company)} MAD`;
      const events: [string, string, string][] = [["facture", `Facture {n} générée : ${monthLabel(month)}, ${bill.billable.length} salariés, ${amount}`, inv.created_at]];
      if (inv.sent_at) events.push(["envoi", "Facture {n} envoyée au service RH", inv.sent_at]);
      if (paidOn) events.push(["paiement", `Facture {n} payée le ${paidOn} par ${method === "cheque" ? "chèque" : "virement"} : ${amount}`, at(daysUntil(paidOn), "16:00")]);
      if (reminders) {
        events.push(["relance", `Relance n°1 de la facture {n} par WhatsApp (${d.hr_name})`, at(-int(9, 14), "10:05")]);
        events.push(["relance", `Relance n°2 de la facture {n} par e-mail (${d.hr_name})`, inv.last_reminder_at]);
      }
      pending.push({ inv, events });
    }
  });

  // Numérotation chronologique MU-ENT-AAAA-0001
  pending.sort((a, b) => (a.inv.issued_on === b.inv.issued_on ? (a.inv.created_at < b.inv.created_at ? -1 : 1) : a.inv.issued_on < b.inv.issued_on ? -1 : 1));
  const seq = new Map<string, number>();
  for (const { inv, events } of pending) {
    const y = String(inv.issued_on).slice(0, 4);
    const n = (seq.get(y) ?? 0) + 1;
    seq.set(y, n);
    inv.number = `MU-ENT-${y}-${String(n).padStart(4, "0")}`;
    for (const [kind, body, when] of events) event(inv.company_id, kind, body.replace("{n}", inv.number), when);
  }
  if (companies[0]) event(companies[0].id, "note", "Rendez-vous avec la DRH : renouvellement de la convention envisagé avec 5 salariés de plus.", at(-6, "12:20"));

  // Tag « Entreprise partenaire » sur les fiches des salariés (copie de la table, l'original n'est pas modifié)
  const tagged = contacts.map((c) => (taken.has(c.id) && !(c.tags ?? []).includes(CORPORATE_TAG) ? { ...c, tags: [...(c.tags ?? []), CORPORATE_TAG] } : c));

  return { contacts: tagged, companies, company_employees, company_invoices, company_invoice_lines, company_events };
}
