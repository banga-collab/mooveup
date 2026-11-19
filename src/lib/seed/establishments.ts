/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SeedDB, SeedHelpers } from "./index";
import { DEFAULT_ENTITIES } from "../entities";

type Row = Record<string, any>;

const CONTACT: Record<string, [address: string, phone: string]> = {
  sports: ["Bd Mohammed V, Agadir", "05 28 84 10 10"],
  lady: ["Av. Hassan II, Agadir", "05 28 84 10 20"],
  kids: ["Bd Mohammed V, Agadir", "05 28 84 10 30"],
  power: ["Hay Dakhla, Agadir", "05 28 84 10 40"],
  clinic: ["Av. du 29 Février, Agadir", "05 28 84 20 10"],
  institut: ["Av. du 29 Février, Agadir", "05 28 84 20 20"],
  evolve: ["Founty, Agadir", "05 28 84 30 10"],
};

/** Produits vendus en boutique : prix, taux d'achat, seuil, fournisseur, établissements et stock */
type P = { name: string; category: string; price: number; cost: number; alert: number; supplier?: string; stock: Record<string, number> };
const PRODUCTS: P[] = [
  { name: "Whey protéine 2 kg", category: "Boutique", price: 650, cost: 0.62, alert: 4, supplier: "Atlas", stock: { power: 7 } },
  { name: "Créatine 300 g", category: "Boutique", price: 280, cost: 0.55, alert: 4, supplier: "Atlas", stock: { sports: 9 } },
  { name: "Barre protéinée", category: "Snacking", price: 25, cost: 0.5, alert: 20, supplier: "Atlas", stock: { sports: 64, lady: 0, power: 38 } },
  { name: "Boisson isotonique 50 cl", category: "Snacking", price: 15, cost: 0.45, alert: 24, stock: { sports: 96, lady: 30, kids: 18, power: 52 } },
  { name: "Bouteille Moov'Up", category: "Boutique", price: 60, cost: 0.35, alert: 10, supplier: "Souss", stock: { lady: 14, kids: 22, power: 12 } },
  { name: "Serviette microfibre Moov'Up", category: "Boutique", price: 90, cost: 0.4, alert: 6, supplier: "Souss", stock: { sports: 18, lady: 9, power: 4 } },
  { name: "Tapis de yoga", category: "Boutique", price: 220, cost: 0.5, alert: 3, supplier: "Souss", stock: { sports: 5 } },
  { name: "Lunettes de natation", category: "Natation", price: 90, cost: 0.45, alert: 5, supplier: "Souss", stock: { sports: 12, kids: 7, lady: 6 } },
  { name: "Bonnet de bain enfant", category: "Natation", price: 50, cost: 0.4, alert: 6, supplier: "Souss", stock: { kids: 2, sports: 10 } },
  { name: "Huile d'argan 100 ml", category: "Boutique", price: 150, cost: 0.45, alert: 5, supplier: "Tifaout", stock: { clinic: 8, evolve: 6 } },
  { name: "Savon noir beldi", category: "Hammam", price: 60, cost: 0.35, alert: 8, supplier: "Tifaout", stock: { institut: 26, evolve: 9 } },
  { name: "Ghassoul 200 g", category: "Hammam", price: 45, cost: 0.4, alert: 8, supplier: "Tifaout", stock: { institut: 17, evolve: 5 } },
  { name: "Crème solaire SPF 50", category: "Dermo-cosmétique", price: 220, cost: 0.55, alert: 4, stock: { clinic: 11, institut: 6 } },
  { name: "Sérum acide hyaluronique", category: "Dermo-cosmétique", price: 380, cost: 0.5, alert: 3, stock: { clinic: 3 } },
  { name: "Cire coiffante", category: "Barbier", price: 95, cost: 0.42, alert: 5, stock: { evolve: 14 } },
];

/** Code EAN-13 marocain (préfixe 611) avec clé de contrôle */
function ean13(n: number) {
  const body = `611${String(4_000_000 + n * 7919).padStart(9, "0").slice(-9)}`;
  const sum = [...body].reduce((a, d, i) => a + Number(d) * (i % 2 ? 3 : 1), 0);
  return body + ((10 - (sum % 10)) % 10);
}
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Établissements, codes-barres, stock réparti sur plusieurs établissements, transferts et mouvements de caisse */
export function seedEstablishments(db: SeedDB, h: SeedHelpers): SeedDB {
  const { uid, at, day } = h;
  const base = (db.catalog_items ?? []) as Row[];
  const suppliers = (db.suppliers ?? []) as Row[];
  const settings = (db.stock_settings ?? []) as Row[];
  const profiles = (db.profiles ?? []) as Row[];
  const boss = profiles.find((p) => p.role === "direction")?.id ?? null;
  const now = new Date().toISOString();
  const past = (iso: string) => (iso < now ? iso : now);

  /* ---------- Établissements ---------- */
  const establishments: Row[] = DEFAULT_ENTITIES.map((e, i) => ({
    id: e.id,
    name: e.name,
    short: e.short,
    kind: e.kind,
    color: e.color,
    icon: e.icon,
    tagline: e.tagline,
    activities: e.activities,
    audience: e.audience,
    address: CONTACT[e.id]?.[0] ?? "",
    phone: CONTACT[e.id]?.[1] ?? "",
    active: true,
    position: i + 1,
    created_at: at(-420, "10:00"),
  }));

  /* ---------- Catalogue : codes-barres + produits dans plusieurs établissements ---------- */
  const codeOf = new Map<string, string>();
  const code = (name: string) => {
    const k = norm(name);
    if (!codeOf.has(k)) codeOf.set(k, ean13(codeOf.size + 1));
    return codeOf.get(k)!;
  };
  const catalog_items: Row[] = base.map((i) => (i.kind === "produit" ? { ...i, barcode: code(i.name) } : i));
  const supplierId = (key?: string) => (key ? (suppliers.find((s) => String(s.name).includes(key))?.id ?? null) : null);
  const stock_settings: Row[] = [...settings];
  const added: Row[] = [];
  for (const p of PRODUCTS) {
    for (const [eid, stock] of Object.entries(p.stock)) {
      if (catalog_items.some((i) => i.entity_id === eid && i.kind === "produit" && norm(i.name) === norm(p.name))) continue;
      const item = {
        id: uid(),
        entity_id: eid,
        kind: "produit",
        name: p.name,
        category: p.category,
        price_mad: p.price,
        duration_min: null,
        duration_days: null,
        sessions_count: null,
        stock,
        active: true,
        barcode: code(p.name),
        created_at: at(-60, "10:00"),
      };
      catalog_items.push(item);
      added.push(item);
      stock_settings.push({
        id: uid(),
        item_id: item.id,
        entity_id: eid,
        alert_qty: p.alert,
        unit_cost_mad: Math.round(p.price * p.cost),
        supplier_id: supplierId(p.supplier),
        created_at: at(-60, "10:00"),
      });
    }
  }
  const productAt = (name: string, eid: string) => catalog_items.find((i) => i.kind === "produit" && i.entity_id === eid && norm(i.name) === norm(name));
  const costOf = (itemId: string) => Number(stock_settings.find((s) => s.item_id === itemId)?.unit_cost_mad ?? 0);

  /* ---------- Transferts entre établissements ---------- */
  const PLAN: [from: string, to: string, offset: number, lines: [name: string, qty: number][], note: string | null][] = [
    ["sports", "power", -21, [["Bouteille Moov'Up", 10], ["Boisson isotonique 50 cl", 24]], "Ouverture du rayon boutique Power Gym"],
    ["sports", "lady", -13, [["Serviette microfibre Moov'Up", 6]], null],
    ["institut", "evolve", -9, [["Savon noir beldi", 8], ["Ghassoul 200 g", 6]], "Rupture chez Evolve avant la livraison Tifaout"],
    ["power", "sports", -5, [["Créatine 300 g", 4]], null],
    ["sports", "kids", -2, [["Lunettes de natation", 5], ["Bonnet de bain enfant", 4]], "Stage natation des vacances"],
  ];
  const stock_transfers: Row[] = [];
  const moves: Row[] = [];
  const transferIn = new Map<string, number>();
  const transferOut = new Map<string, number>();
  const year = day(0).slice(0, 4);
  PLAN.forEach(([from, to, offset, lines, note], n) => {
    const id = uid();
    const when = at(offset, "11:15");
    const rows = lines
      .map(([name, qty]) => ({ src: productAt(name, from), dst: productAt(name, to), name, qty }))
      .filter((l) => l.src && l.dst);
    if (!rows.length) return;
    stock_transfers.push({
      id,
      number: `TR-${year}-${String(n + 1).padStart(4, "0")}`,
      from_entity_id: from,
      to_entity_id: to,
      lines: rows.map((l) => ({ label: l.name, qty: l.qty, from_item_id: l.src!.id, to_item_id: l.dst!.id, unit_cost_mad: costOf(l.src!.id) })),
      note,
      created_by: boss,
      created_at: when,
    });
    for (const l of rows) {
      transferOut.set(l.src!.id, (transferOut.get(l.src!.id) ?? 0) + l.qty);
      transferIn.set(l.dst!.id, (transferIn.get(l.dst!.id) ?? 0) + l.qty);
      const label = `Transfert ${stock_transfers.at(-1)!.number}`;
      moves.push({ id: uid(), entity_id: from, item_id: l.src!.id, kind: "sortie", reason: "transfert", qty: -l.qty, stock_after: null, ref_id: id, note: `${label} vers ${to}`, author_id: boss, created_at: when });
      moves.push({ id: uid(), entity_id: to, item_id: l.dst!.id, kind: "entree", reason: "transfert", qty: l.qty, stock_after: null, ref_id: id, note: `${label} depuis ${from}`, author_id: boss, created_at: when });
    }
  });
  // Stock initial des produits ajoutés (cohérent avec le stock actuel et les transferts)
  for (const it of added) {
    const initial = Math.max(0, Number(it.stock) - (transferIn.get(it.id) ?? 0) + (transferOut.get(it.id) ?? 0));
    moves.push({ id: uid(), entity_id: it.entity_id, item_id: it.id, kind: "ajustement", reason: "inventaire", qty: initial, stock_after: initial, ref_id: null, note: "Stock initial", author_id: boss, created_at: at(-45, "09:00") });
  }
  const stock_movements = [...((db.stock_movements ?? []) as Row[]), ...moves].sort((a, b) => (a.created_at < b.created_at ? -1 : 1));

  /* ---------- Caisse : entrées / sorties du jour ---------- */
  const today = day(0);
  const open = ((db.cash_sessions ?? []) as Row[]).filter((s) => s.day === today && s.status === "ouverte");
  const sessionOf = (eid: string) => open.find((s) => s.entity_id === eid);
  const cash_moves: Row[] = [];
  const MOVES: [eid: string, kind: "depot" | "retrait", amount: number, reason: string, hhmm: string][] = [
    ["sports", "depot", 300, "Appoint de monnaie (pièces)", "09:05"],
    ["sports", "retrait", 150, "Achat d'eau pour les cours collectifs", "11:40"],
    ["institut", "retrait", 60, "Course taxi livraison serviettes", "10:20"],
  ];
  for (const [eid, kind, amount, reason, hhmm] of MOVES) {
    const s = sessionOf(eid);
    if (!s) continue;
    const when = past(at(0, hhmm));
    if (when < s.opened_at) continue;
    cash_moves.push({ id: uid(), entity_id: eid, session_id: s.id, day: today, kind, amount_mad: amount, reason, created_by: s.opened_by, created_at: when });
  }

  return { establishments, catalog_items, stock_settings, stock_movements, stock_transfers, cash_moves, sale_payments: [] };
}
