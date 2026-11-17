/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SeedDB, SeedHelpers } from "./index";

type Row = Record<string, any>;

/** "09:00" + minutes → "HH:MM" */
const addMin = (hhmm: string, min: number) => {
  const [h, m] = hhmm.split(":").map(Number);
  const t = Math.max(0, Math.min(23 * 60 + 59, h! * 60 + m! + min));
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

/**
 * Horaires types par personne : pour chaque jour (0 = lundi … 6 = dimanche)
 * [établissement, début, fin] ou "repos".
 */
type Day = [entity: string, start: string, end: string] | "repos";
const PATTERNS: Record<string, (week: number) => Day[]> = {
  "Yassine Moov'Up": () => [["sports", "09:30", "18:00"], ["sports", "09:30", "18:00"], ["sports", "09:30", "18:00"], ["sports", "09:30", "18:00"], ["sports", "09:30", "17:00"], ["sports", "10:00", "13:00"], "repos"],
  "Houda Bennis": () => [["lady", "09:00", "17:00"], ["lady", "09:00", "17:00"], ["kids", "13:00", "20:00"], ["lady", "09:00", "17:00"], ["lady", "09:00", "17:00"], ["kids", "09:00", "14:00"], "repos"],
  "Meryem Ait Ali": (w) => [["clinic", "09:30", "18:30"], ["institut", "09:30", "18:30"], ["clinic", "09:30", "18:30"], ["institut", "09:30", "18:30"], ["clinic", "09:30", "18:30"], w % 2 ? ["institut", "10:00", "16:00"] : ["clinic", "10:00", "16:00"], "repos"],
  "Sara El Idrissi": (w) => {
    const am: Day = ["lady", "08:00", "14:00"];
    const pm: Day = ["sports", "15:00", "21:00"];
    return w % 2 ? [am, am, pm, pm, am, ["lady", "09:00", "13:00"], "repos"] : [pm, pm, am, am, pm, ["sports", "09:00", "13:00"], "repos"];
  },
  "Hamza Berrada": (w) => {
    const am: Day = ["power", "07:00", "14:00"];
    const pm: Day = ["sports", "14:00", "21:00"];
    return w % 2 ? [pm, pm, pm, "repos", am, am, ["power", "09:00", "13:00"]] : [am, am, am, "repos", pm, pm, ["sports", "09:00", "13:00"]];
  },
  "Anas Ouaziz": () => ["repos", ["sports", "09:00", "16:00"], ["kids", "14:00", "20:00"], ["sports", "09:00", "16:00"], ["kids", "14:00", "20:00"], ["kids", "09:00", "17:00"], ["kids", "09:00", "13:00"]],
  "Dr Nadia Kabbaj": () => [["clinic", "10:00", "18:00"], ["clinic", "10:00", "18:00"], ["clinic", "10:00", "14:00"], ["clinic", "10:00", "18:00"], ["clinic", "10:00", "18:00"], ["clinic", "10:00", "15:00"], "repos"],
  "Hajar Lahlou": () => [["institut", "10:00", "19:00"], "repos", ["institut", "10:00", "19:00"], ["institut", "10:00", "19:00"], ["institut", "10:00", "19:00"], ["institut", "10:00", "19:00"], "repos"],
  "Loubna Saadi": () => [["institut", "11:00", "20:00"], ["institut", "11:00", "20:00"], "repos", ["institut", "11:00", "20:00"], ["institut", "11:00", "20:00"], ["institut", "10:00", "19:00"], "repos"],
  "Reda Talbi": () => ["repos", ["evolve", "11:00", "21:00"], ["evolve", "11:00", "21:00"], ["evolve", "11:00", "21:00"], ["evolve", "14:00", "21:00"], ["evolve", "10:00", "21:00"], ["evolve", "10:00", "15:00"]],
  "Soufiane Amzil": (w) => [["sports", "09:00", "18:00"], ["power", "09:00", "18:00"], ["sports", "09:00", "18:00"], ["power", "09:00", "18:00"], "repos", w % 2 ? ["sports", "09:00", "14:00"] : ["power", "09:00", "14:00"], "repos"],
  "Rachid Ennaji": () => [["sports", "07:00", "15:00"], ["sports", "07:00", "15:00"], ["power", "13:00", "21:00"], "repos", ["sports", "07:00", "15:00"], ["kids", "08:00", "16:00"], ["kids", "08:00", "13:00"]],
};

const fallback = (entity: string): Day[] => [
  [entity, "09:00", "17:00"],
  [entity, "09:00", "17:00"],
  [entity, "09:00", "17:00"],
  [entity, "09:00", "17:00"],
  [entity, "09:00", "17:00"],
  [entity, "09:00", "13:00"],
  "repos",
];

/* Fournisseurs fictifs (Maroc) */
const SUPPLIERS: { name: string; contact: string; phone: string; email: string; city: string; entities: string[]; products: string[]; notes: string }[] = [
  {
    name: "Atlas Nutrition Distribution",
    contact: "Karim Ziani",
    phone: "06 61 48 22 90",
    email: "commandes@atlas-nutrition.ma",
    city: "Casablanca",
    entities: ["sports", "power"],
    products: ["Whey protéine 2 kg", "Créatine 300 g"],
    notes: "Livraison en 48 h par CTM. Minimum de commande : 2 000 MAD.",
  },
  {
    name: "Coopérative Tifaout Argan",
    contact: "Fatima Ait Brahim",
    phone: "06 70 15 63 28",
    email: "tifaout.argan@coop.ma",
    city: "Taroudant",
    entities: ["institut", "evolve"],
    products: ["Huile d'argan 100 ml", "Huile à barbe"],
    notes: "Paiement à la livraison. Passer commande avant le jeudi.",
  },
  {
    name: "Souss Sport Équipement",
    contact: "Youssef Amrani",
    phone: "06 62 37 81 05",
    email: "contact@soussport.ma",
    city: "Agadir (Hay Mohammadi)",
    entities: ["sports", "lady", "power"],
    products: ["Bouteille Moov'Up", "Tapis de yoga", "Ceinture de force"],
    notes: "Bouteilles personnalisées : délai 10 jours.",
  },
  {
    name: "Barber Pro Maroc",
    contact: "Adil Fennane",
    phone: "06 55 92 40 17",
    email: "pro@barberpro.ma",
    city: "Marrakech",
    entities: ["evolve"],
    products: [],
    notes: "Consommables barbier (lames, serviettes). Pas encore de produits revendus.",
  },
];

const COST_RATE: Record<string, number> = {
  "Whey protéine 2 kg": 0.62,
  "Créatine 300 g": 0.55,
  "Bouteille Moov'Up": 0.35,
  "Tapis de yoga": 0.5,
  "Ceinture de force": 0.52,
  "Huile d'argan 100 ml": 0.45,
  "Huile à barbe": 0.4,
};
const ALERT: Record<string, number> = { "Whey protéine 2 kg": 4, "Bouteille Moov'Up": 10, "Tapis de yoga": 3, "Ceinture de force": 3 };

/** Planning, pointage, commissions et stock de démo */
export function seedOps(db: SeedDB, h: SeedHelpers): SeedDB {
  const { uid, rnd, int, day, at } = h;
  const profiles = (db.profiles ?? []) as Row[];
  const catalog = (db.catalog_items ?? []) as Row[];
  const sales = (db.sales ?? []) as Row[];
  const saleItems = (db.sale_items ?? []) as Row[];
  const byName = new Map(profiles.map((p) => [p.full_name as string, p]));
  const boss = profiles.find((p) => p.role === "direction")?.id ?? null;
  const now = Date.now();
  const today = day(0);

  /* ---------- Planning : semaine passée, en cours, suivante ---------- */
  const monday = -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7);
  const shifts: Row[] = [];
  const time_entries: Row[] = [];
  const onLeave = byName.get("Loubna Saadi")?.id;
  for (const p of profiles) {
    if (!p.active) continue;
    const home: string = p.entity_ids[0] ?? "sports";
    const pattern = PATTERNS[p.full_name] ?? (() => fallback(home));
    for (let w = -1; w <= 1; w++) {
      const days = pattern(w + 10);
      for (let d = 0; d < 7; d++) {
        const off = monday + w * 7 + d;
        const date = day(off);
        const base = { profile_id: p.id, date, note: null, created_by: boss, created_at: at(monday - 10, "10:00") };
        // Congé annuel : jeudi à samedi de la semaine prochaine
        if (p.id === onLeave && w === 1 && d >= 3 && d <= 5) {
          shifts.push({ id: uid(), ...base, entity_id: home, start_time: null, end_time: null, kind: "conge", note: "Congé annuel" });
          continue;
        }
        const plan = days[d]!;
        if (plan === "repos") {
          shifts.push({ id: uid(), ...base, entity_id: home, start_time: null, end_time: null, kind: "repos" });
          continue;
        }
        const [entity, start, end] = plan;
        shifts.push({ id: uid(), ...base, entity_id: entity, start_time: start, end_time: end, kind: "travail" });

        // Pointage des créneaux passés (et de celui en cours aujourd'hui)
        if (new Date(at(off, start)).getTime() > now) continue;
        if (rnd() < 0.03) continue; // absence, rare
        const late = rnd() < 0.13;
        const inIso = at(off, addMin(start, late ? int(8, 32) : int(-12, 3)));
        if (new Date(inIso).getTime() > now) continue;
        const done = new Date(at(off, end)).getTime() + 20 * 60000 < now;
        const outIso = done ? at(off, addMin(end, int(-6, 18))) : null;
        time_entries.push({ id: uid(), entity_id: entity, profile_id: p.id, date, clock_in: inIso, clock_out: outIso, created_at: inIso });
      }
    }
  }

  /* ---------- Commissions ---------- */
  const rid = (n: string) => byName.get(n)?.id;
  const commission_rules: Row[] = [
    { entity_id: "clinic", profile_id: rid("Dr Nadia Kabbaj"), basis: "prestations", category: null, rate_pct: 12 },
    { entity_id: "clinic", profile_id: rid("Dr Nadia Kabbaj"), basis: "prestations", category: "Injections", rate_pct: 15 },
    { entity_id: "institut", profile_id: null, basis: "prestations", category: null, rate_pct: 10 },
    { entity_id: "institut", profile_id: rid("Loubna Saadi"), basis: "prestations", category: "Massage", rate_pct: 20 },
    { entity_id: "evolve", profile_id: rid("Reda Talbi"), basis: "prestations", category: null, rate_pct: 30 },
    { entity_id: "kids", profile_id: null, basis: "prestations", category: "Stages", rate_pct: 8 },
    { entity_id: "sports", profile_id: null, basis: "produits", category: null, rate_pct: 5 },
    { entity_id: "power", profile_id: null, basis: "produits", category: null, rate_pct: 5 },
    { entity_id: "institut", profile_id: null, basis: "produits", category: null, rate_pct: 8 },
    { entity_id: "evolve", profile_id: null, basis: "produits", category: null, rate_pct: 8 },
  ]
    .filter((r) => r.profile_id !== undefined)
    .map((r) => ({ id: uid(), active: true, created_at: at(-120, "10:00"), ...r }));

  /* ---------- Fournisseurs et réglages de stock ---------- */
  const products = catalog.filter((i) => i.kind === "produit");
  const suppliers: Row[] = SUPPLIERS.map((s) => ({
    id: uid(),
    name: s.name,
    contact_name: s.contact,
    phone: s.phone,
    email: s.email,
    city: s.city,
    entity_ids: s.entities,
    product_ids: products.filter((p) => s.products.includes(p.name)).map((p) => p.id),
    notes: s.notes,
    created_at: at(-300, "10:00"),
  }));
  const supplierOf = (itemId: string) => suppliers.find((s) => s.product_ids.includes(itemId)) ?? null;
  // Les deux produits les plus bas passent sous leur seuil (alerte « à commander » visible en démo)
  const tight = [...products].sort((a, b) => Number(a.stock ?? 0) / (ALERT[a.name] ?? 5) - Number(b.stock ?? 0) / (ALERT[b.name] ?? 5)).slice(0, 2).map((p) => p.id);
  const stock_settings: Row[] = products.map((p) => ({
    id: uid(),
    item_id: p.id,
    entity_id: p.entity_id,
    alert_qty: tight.includes(p.id) ? Math.max(ALERT[p.name] ?? 5, Number(p.stock ?? 0) + int(0, 2)) : (ALERT[p.name] ?? 5),
    unit_cost_mad: Math.round(Number(p.price_mad) * (COST_RATE[p.name] ?? 0.5)),
    supplier_id: supplierOf(p.id)?.id ?? null,
    created_at: at(-300, "10:00"),
  }));
  const settingOf = (itemId: string) => stock_settings.find((s) => s.item_id === itemId)!;

  /* ---------- Mouvements : cohérents avec les ventes et le stock actuel ---------- */
  const salesById = new Map(sales.map((s) => [s.id, s]));
  const stock_movements: Row[] = [];
  const recent: Row[] = []; // réceptions des 60 derniers jours (rattachées à un bon de commande)
  const since60 = at(-60, "00:00");
  for (const p of products) {
    const setting = settingOf(p.id);
    const supplier = suppliers.find((x) => x.id === setting.supplier_id);
    const outs = saleItems
      .filter((l) => l.item_id === p.id && salesById.has(l.sale_id))
      .map((l) => ({ sale: salesById.get(l.sale_id)!, qty: Number(l.qty) }))
      .sort((a, b) => (a.sale.sold_at < b.sale.sold_at ? 1 : -1)); // du plus récent au plus ancien
    // On remonte le temps depuis le stock actuel en intercalant des livraisons
    let level = Number(p.stock ?? 0);
    const cap = Math.max(setting.alert_qty * 4, 18);
    const rows: Row[] = [];
    for (let i = 0; i < outs.length; i++) {
      const { sale: s, qty } = outs[i]!;
      if (s.status !== "remboursee") {
        rows.push({ entity_id: p.entity_id, item_id: p.id, kind: "sortie", reason: "vente", qty: -qty, stock_after: level, ref_id: s.id, note: `Vente ${s.number}`, author_id: s.sold_by, created_at: s.sold_at });
        level += qty;
      }
      if (level > cap && i < outs.length - 1) {
        const older = new Date(outs[i + 1]!.sale.sold_at).getTime();
        const newer = new Date(s.sold_at).getTime();
        const when = new Date(older + (newer - older) * 0.6).toISOString();
        const r = Math.max(1, Math.round(level * 0.75));
        rows.push({ entity_id: p.entity_id, item_id: p.id, kind: "entree", reason: "reception", qty: r, stock_after: level, ref_id: null, note: supplier ? `Livraison ${supplier.name}` : "Livraison", author_id: boss, created_at: when });
        level -= r;
      }
    }
    const first = outs.at(-1)?.sale.sold_at ?? at(-200, "09:00");
    rows.push({ entity_id: p.entity_id, item_id: p.id, kind: "ajustement", reason: "inventaire", qty: level, stock_after: level, ref_id: null, note: "Stock initial", author_id: boss, created_at: new Date(new Date(first).getTime() - 86_400_000).toISOString() });
    // Horodatages strictement décroissants (les ventes d'une même minute restent dans l'ordre)
    for (let i = 1; i < rows.length; i++) {
      const newer = new Date(rows[i - 1]!.created_at).getTime();
      if (new Date(rows[i]!.created_at).getTime() >= newer) rows[i]!.created_at = new Date(newer - 60_000).toISOString();
    }
    for (const r of rows) {
      const row: Row = { id: uid(), ...r };
      stock_movements.push(row);
      if (row.reason === "reception" && row.created_at >= since60) recent.push(row);
    }
  }

  /* ---------- Bons de commande ---------- */
  const purchase_orders: Row[] = [];
  let n = 1;
  const year = today.slice(0, 4);
  const num = () => `BC-${year}-${String(n++).padStart(4, "0")}`;
  const costOf = (itemId: string) => Number(settingOf(itemId).unit_cost_mad ?? 0);
  const total = (lines: Row[]) => lines.reduce((a, l) => a + l.qty * l.unit_cost_mad, 0);
  recent.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  for (const r of recent) {
    const lines = [{ item_id: r.item_id, label: products.find((p) => p.id === r.item_id)?.name ?? "Produit", qty: r.qty, unit_cost_mad: costOf(r.item_id) }];
    const id = uid();
    const sent = new Date(new Date(r.created_at).getTime() - int(2, 4) * 86_400_000).toISOString();
    purchase_orders.push({ id, number: num(), entity_id: r.entity_id, supplier_id: settingOf(r.item_id).supplier_id, status: "recue", lines, total_mad: total(lines), notes: null, sent_at: sent, received_at: r.created_at, created_by: boss, created_at: sent });
    r.ref_id = id;
  }
  // Une commande envoyée (en attente de livraison) et un brouillon pour les produits sous le seuil
  const low = products.filter((p) => Number(p.stock ?? 0) <= settingOf(p.id).alert_qty);
  const pending = products.find((p) => !low.includes(p) && supplierOf(p.id));
  if (pending) {
    const lines = [{ item_id: pending.id, label: pending.name, qty: 12, unit_cost_mad: costOf(pending.id) }];
    purchase_orders.push({ id: uid(), number: num(), entity_id: pending.entity_id, supplier_id: supplierOf(pending.id)!.id, status: "envoyee", lines, total_mad: total(lines), notes: "Livraison prévue en fin de semaine", sent_at: at(-1, "11:20"), received_at: null, created_by: boss, created_at: at(-1, "11:00") });
  }
  const draft = low.find((p) => supplierOf(p.id));
  if (draft) {
    const sup = supplierOf(draft.id)!;
    const lines = low
      .filter((p) => p.entity_id === draft.entity_id && supplierOf(p.id)?.id === sup.id)
      .map((p) => ({ item_id: p.id, label: p.name, qty: Math.max(6, settingOf(p.id).alert_qty * 3 - Number(p.stock ?? 0)), unit_cost_mad: costOf(p.id) }));
    purchase_orders.push({ id: uid(), number: num(), entity_id: draft.entity_id, supplier_id: sup.id, status: "brouillon", lines, total_mad: total(lines), notes: null, sent_at: null, received_at: null, created_by: boss, created_at: at(0, "08:30") });
  }

  stock_movements.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  return { shifts, time_entries, commission_rules, suppliers, stock_settings, stock_movements, purchase_orders };
}
