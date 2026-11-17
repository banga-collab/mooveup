/**
 * Calculs purs des conventions entreprises (utilisables côté serveur, côté client et dans le seed).
 * Aucune dépendance serveur.
 */
import { entity } from "@/lib/entities";
import type { CatalogKind, Sale, SaleItem, Subscription } from "@/lib/types";
import type { Company, CompanyEmployee } from "@/lib/types-corporate";
import { dayKey } from "@/lib/utils";

/* ---------- Mois ---------- */

/** Mois courant AAAA-MM (Agadir) */
export function currentMonth() {
  return dayKey().slice(0, 7);
}

export function isMonth(v: string | null | undefined): v is string {
  return !!v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

/** Décale un mois AAAA-MM de n mois */
export function shiftMonth(m: string, n: number) {
  const [y, mo] = m.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, mo - 1 + n, 15));
  return d.toISOString().slice(0, 7);
}

/** Premier et dernier jour AAAA-MM-JJ d'un mois */
export function monthBounds(m: string) {
  const [y, mo] = m.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return { start: `${m}-01`, end: `${m}-${String(last).padStart(2, "0")}` };
}

const monthFmt = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
/** « novembre 2026 » */
export function monthLabel(m: string) {
  return monthFmt.format(new Date(`${m}-15T12:00:00Z`));
}

/* ---------- Convention ---------- */

const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Résumé lisible : « Remise 15 % · entreprise 50 % » */
export function conventionSummary(c: Pick<Company, "convention" | "discount_pct" | "flat_mad" | "share_mode" | "share_value">) {
  const base = c.convention === "forfait" ? `Forfait ${nf.format(Number(c.flat_mad))} MAD / salarié / mois` : `Remise ${nf.format(Number(c.discount_pct))} %`;
  return `${base} · ${shareSummary(c)}`;
}

export function shareSummary(c: Pick<Company, "share_mode" | "share_value">) {
  const v = Number(c.share_value);
  if (c.share_mode === "pct") return v >= 100 ? "100 % payé par l'entreprise" : `entreprise ${nf.format(v)} %, salarié ${nf.format(100 - v)} %`;
  return `entreprise jusqu'à ${nf.format(v)} MAD / salarié / mois`;
}

/** La convention couvre-t-elle (au moins en partie) ce mois ? */
export function conventionCovers(c: Pick<Company, "start_date" | "end_date">, month: string) {
  const { start, end } = monthBounds(month);
  return c.start_date <= end && (!c.end_date || c.end_date >= start);
}

/** Salarié rattaché pendant le mois ? */
export function employeeInMonth(e: Pick<CompanyEmployee, "joined_on" | "left_on" | "active">, month: string) {
  const { start, end } = monthBounds(month);
  if (e.joined_on > end) return false;
  if (e.left_on) return e.left_on >= start;
  return e.active;
}

/** Valeur mensuelle d'un abonnement (un abonnement annuel compte pour 1/12 par mois) */
export function monthlyValue(s: Pick<Subscription, "price_mad" | "start_date" | "end_date">) {
  const days = Math.max(1, Math.round((new Date(`${s.end_date}T00:00:00Z`).getTime() - new Date(`${s.start_date}T00:00:00Z`).getTime()) / 86_400_000));
  const price = Number(s.price_mad) || 0;
  return days <= 31 ? price : r2((price * 30) / days);
}

/* ---------- Facture du mois ---------- */

export type BillSub = { id: string; name: string; entity_id: string; amount: number };
export type BillSale = { id: string; number: string; entity_id: string; sold_at: string; amount: number };

export type EmployeeBill = {
  employee: CompanyEmployee;
  contact_id: string;
  name: string;
  phone: string | null;
  subs: BillSub[];
  sales: BillSale[];
  gross: number;
  discount: number;
  net: number;
  company: number;
  employee_part: number;
  detail: string;
};

export type CompanyBill = {
  month: string;
  covered: boolean;
  lines: EmployeeBill[];
  /** Lignes avec un montant (celles qui iront sur la facture) */
  billable: EmployeeBill[];
  gross: number;
  discount: number;
  net: number;
  company: number;
  employee: number;
};

export type CalcData = {
  contacts: Map<string, { id: string; full_name: string; phone: string | null }>;
  subscriptions: Pick<Subscription, "id" | "contact_id" | "entity_id" | "name" | "price_mad" | "start_date" | "end_date" | "status">[];
  sales: Pick<Sale, "id" | "number" | "contact_id" | "entity_id" | "total_mad" | "sold_at" | "status">[];
  saleItems: Pick<SaleItem, "sale_id" | "item_id" | "qty" | "unit_price_mad">[];
  /** Type de chaque article du catalogue (les lignes « abonnement » des ventes ne sont pas recomptées) */
  catalogKind: Map<string, CatalogKind>;
};

/** Part entreprise / part salarié de chaque salarié pour un mois */
export function computeBill(company: Company, employees: CompanyEmployee[], data: CalcData, month: string): CompanyBill {
  const { start, end } = monthBounds(month);
  const covered = conventionCovers(company, month);
  const ents = new Set<string>(company.entity_ids);
  const staff = employees.filter((e) => employeeInMonth(e, month));
  const ids = new Set(staff.map((e) => e.contact_id));

  const subsBy = new Map<string, BillSub[]>();
  const salesBy = new Map<string, BillSale[]>();
  if (covered && company.convention === "remise") {
    for (const s of data.subscriptions) {
      if (!ids.has(s.contact_id) || !ents.has(s.entity_id) || s.status === "resilie") continue;
      if (s.start_date > end || s.end_date < start) continue;
      const list = subsBy.get(s.contact_id) ?? [];
      list.push({ id: s.id, name: s.name, entity_id: s.entity_id, amount: monthlyValue(s) });
      subsBy.set(s.contact_id, list);
    }
    const linesBy = new Map<string, CalcData["saleItems"]>();
    for (const l of data.saleItems) {
      const arr = linesBy.get(l.sale_id) ?? [];
      arr.push(l);
      linesBy.set(l.sale_id, arr);
    }
    for (const s of data.sales) {
      if (!s.contact_id || !ids.has(s.contact_id) || !ents.has(s.entity_id) || s.status === "remboursee") continue;
      const d = dayKey(s.sold_at);
      if (d < start || d > end) continue;
      const lines = linesBy.get(s.id) ?? [];
      const gross = lines.reduce((a, l) => a + Number(l.qty) * Number(l.unit_price_mad), 0);
      const services = lines.filter((l) => !l.item_id || data.catalogKind.get(l.item_id) !== "abonnement").reduce((a, l) => a + Number(l.qty) * Number(l.unit_price_mad), 0);
      const total = Number(s.total_mad) || 0;
      const amount = lines.length && gross > 0 ? r2((services * total) / gross) : total;
      if (amount <= 0) continue;
      const list = salesBy.get(s.contact_id) ?? [];
      list.push({ id: s.id, number: s.number, entity_id: s.entity_id, sold_at: s.sold_at, amount });
      salesBy.set(s.contact_id, list);
    }
  }

  const lines: EmployeeBill[] = staff.map((e) => {
    const c = data.contacts.get(e.contact_id);
    const subs = subsBy.get(e.contact_id) ?? [];
    const sales = salesBy.get(e.contact_id) ?? [];
    let gross = 0;
    let discount = 0;
    const parts: string[] = [];
    if (!covered) {
      parts.push("Hors période de convention");
    } else if (company.convention === "forfait") {
      gross = Number(company.flat_mad) || 0;
      parts.push(`Forfait mensuel ${nf.format(gross)} MAD`);
    } else {
      const subTotal = subs.reduce((a, s) => a + s.amount, 0);
      const saleTotal = sales.reduce((a, s) => a + s.amount, 0);
      gross = r2(subTotal + saleTotal);
      discount = r2((gross * (Number(company.discount_pct) || 0)) / 100);
      for (const s of subs) parts.push(`${s.name} (${entity(s.entity_id)?.short ?? s.entity_id}) ${nf.format(s.amount)}`);
      if (sales.length) parts.push(`${sales.length} prestation${sales.length > 1 ? "s" : ""} ${nf.format(saleTotal)}`);
      if (discount > 0) parts.push(`remise ${nf.format(Number(company.discount_pct))} %`);
      if (!parts.length) parts.push("Aucune consommation");
    }
    const net = r2(gross - discount);
    const v = Number(company.share_value) || 0;
    const companyPart = r2(Math.max(0, Math.min(net, company.share_mode === "pct" ? (net * Math.min(100, v)) / 100 : v)));
    return {
      employee: e,
      contact_id: e.contact_id,
      name: c?.full_name ?? "Salarié",
      phone: c?.phone ?? null,
      subs,
      sales,
      gross,
      discount,
      net,
      company: companyPart,
      employee_part: r2(net - companyPart),
      detail: parts.join(" · "),
    };
  });
  lines.sort((a, b) => b.company - a.company || a.name.localeCompare(b.name, "fr"));
  const billable = lines.filter((l) => l.company > 0);
  const sum = (k: "gross" | "discount" | "net" | "company" | "employee_part") => r2(lines.reduce((a, l) => a + l[k], 0));
  return { month, covered, lines, billable, gross: sum("gross"), discount: sum("discount"), net: sum("net"), company: sum("company"), employee: sum("employee_part") };
}

/* ---------- Import rapide ---------- */

export type ImportRow = { name: string; phone: string | null; matricule: string | null };

/** « Nom ; téléphone ; matricule » (séparateurs ; , tabulation ou espaces avant le numéro) */
export function parseImport(text: string): ImportRow[] {
  const out: ImportRow[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    let parts = line.split(/[;\t]|,(?=\s*[+\d])/).map((p) => p.trim()).filter(Boolean);
    if (parts.length === 1) {
      const m = line.match(/^(.*?)[\s:]+((?:\+|00)?\d[\d\s.-]{7,})(?:\s+(\S+))?$/);
      if (m) parts = [m[1]!.trim(), m[2]!.trim(), ...(m[3] ? [m[3]] : [])];
    }
    const [name, phone, matricule] = parts;
    if (!name || /^nom$/i.test(name)) continue;
    out.push({ name: name.replace(/\s+/g, " "), phone: phone ? normalizePhone(phone) : null, matricule: matricule || null });
  }
  return out;
}

/** 0612345678 / +212612345678 → « 06 12 34 56 78 » */
export function normalizePhone(p: string) {
  let d = p.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("212") && d.length >= 12) d = "0" + d.slice(3);
  if (d.length === 9 && !d.startsWith("0")) d = "0" + d;
  return d.length === 10 ? d.replace(/(\d{2})(?=\d)/g, "$1 ").trim() : p.trim();
}

export function phoneKey(p: string | null | undefined) {
  const d = (p ?? "").replace(/\D/g, "");
  return d.length >= 9 ? d.slice(-9) : "";
}

/* ---------- CSV ---------- */

export function csvCell(v: string | number | null | undefined) {
  if (v === null || v === undefined) return "";
  let s = typeof v === "number" ? String(Math.round(v * 100) / 100).replace(".", ",") : String(v);
  if (typeof v === "string" && /^[=@]|^[+-](?![\d\s])/.test(s)) s = "'" + s; // pas de formule dans Excel
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
