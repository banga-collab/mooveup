"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getScope, requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { flash } from "@/lib/flash";
import { recordUndo } from "@/lib/undo";
import type { EntityId } from "@/lib/entities";
import type { Contact, PayMethod } from "@/lib/types";
import {
  CORPORATE_TAG,
  INVOICE_STATUS_LABEL,
  type Company,
  type CompanyEmployee,
  type CompanyEventKind,
  type CompanyInvoice,
  type CompanyStatus,
  type ConventionKind,
  type ShareMode,
} from "@/lib/types-corporate";
import { PAY_LABEL, addDaysKey, dayKey, mad, parseNum, str } from "@/lib/utils";
import { computeBill, isMonth, monthLabel, parseImport, phoneKey } from "@/components/corporate/calc";
import { loadCalcData, loadCompany, loadEmployees } from "@/components/corporate/data";
import type { FormState } from "@/components/action-form";

type DB = Awaited<ReturnType<typeof createClient>>;
type Result = { ok: true; message: string } | { ok: false; error: string };

const METHODS = Object.keys(PAY_LABEL) as PayMethod[];
const STATUSES: CompanyStatus[] = ["active", "suspendue", "terminee"];

async function ctx() {
  const [me, scope, supabase] = await Promise.all([requireManager(), getScope(), createClient()]);
  return { me, scope, supabase, allowed: scope.allowed.map((e) => e.id) as EntityId[] };
}

async function log(supabase: DB, companyId: string, kind: CompanyEventKind, body: string, authorId: string | null) {
  await supabase.from("company_events").insert({ company_id: companyId, kind, body, author_id: authorId });
}

function refresh(companyId: string) {
  revalidatePath("/entreprises");
  revalidatePath(`/entreprises/${companyId}`);
}

/* ---------- Entreprise ---------- */

function readCompany(fd: FormData, allowed: EntityId[]): { error: string } | { values: Omit<Company, "id" | "created_at" | "created_by"> } {
  const name = str(fd.get("name"));
  if (!name) return { error: "Indiquez le nom de l'entreprise." };
  const ice = str(fd.get("ice"))?.replace(/\s/g, "") ?? null;
  if (ice && !/^\d{15}$/.test(ice)) return { error: "L'ICE doit comporter 15 chiffres (laissez vide si vous ne l'avez pas encore)." };
  const entity_ids = fd.getAll("entity_ids").map(String).filter((e): e is EntityId => allowed.includes(e as EntityId));
  if (!entity_ids.length) return { error: "Cochez au moins un établissement couvert par la convention." };
  const convention: ConventionKind = fd.get("convention") === "forfait" ? "forfait" : "remise";
  const discount_pct = parseNum(fd.get("discount_pct")) ?? 0;
  const flat_mad = parseNum(fd.get("flat_mad")) ?? 0;
  if (convention === "remise" && (discount_pct < 0 || discount_pct > 100)) return { error: "La remise doit être comprise entre 0 et 100 %." };
  if (convention === "forfait" && flat_mad <= 0) return { error: "Indiquez le montant du forfait par salarié et par mois." };
  const share_mode: ShareMode = fd.get("share_mode") === "fixe" ? "fixe" : "pct";
  const share_value = parseNum(fd.get("share_value")) ?? 0;
  if (share_value < 0 || (share_mode === "pct" && share_value > 100)) return { error: "La part de l'entreprise doit être comprise entre 0 et 100 %." };
  const start_date = str(fd.get("start_date")) ?? dayKey();
  const end_date = str(fd.get("end_date"));
  if (end_date && end_date < start_date) return { error: "La date de fin doit être après la date de début." };
  const statusRaw = str(fd.get("status")) as CompanyStatus | null;
  const hrEmail = str(fd.get("hr_email"));
  if (hrEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(hrEmail)) return { error: "L'e-mail du contact RH semble incorrect." };
  return {
    values: {
      name,
      sector: str(fd.get("sector")),
      ice,
      address: str(fd.get("address")),
      hr_name: str(fd.get("hr_name")),
      hr_phone: str(fd.get("hr_phone")),
      hr_email: hrEmail,
      entity_ids,
      entity_id: entity_ids[0]!,
      convention,
      discount_pct,
      flat_mad,
      share_mode,
      share_value,
      payment_days: Math.max(0, Math.round(parseNum(fd.get("payment_days")) ?? 30)),
      start_date,
      end_date,
      status: statusRaw && STATUSES.includes(statusRaw) ? statusRaw : "active",
      notes: str(fd.get("notes")),
    },
  };
}

export async function createCompany(_s: FormState, fd: FormData): Promise<FormState> {
  const { me, supabase, allowed } = await ctx();
  const r = readCompany(fd, allowed);
  if ("error" in r) return { error: r.error };
  const { data: dup } = await supabase.from("companies").select("id").ilike("name", r.values.name).maybeSingle();
  if (dup) return { error: `« ${r.values.name} » existe déjà dans les entreprises partenaires.` };
  const { data, error } = await supabase
    .from("companies")
    .insert({ ...r.values, created_by: me.id })
    .select("*")
    .single();
  if (error || !data) return { error: "Impossible d'enregistrer l'entreprise. Réessayez." };
  const c = data as Company;
  await log(supabase, c.id, "creation", `Convention créée par ${me.full_name}`, me.id);
  await flash(`${c.name} ajoutée — rattachez maintenant les salariés`);
  revalidatePath("/entreprises");
  redirect(`/entreprises/${c.id}?tab=salaries`);
}

export async function updateCompany(id: string, _s: FormState, fd: FormData): Promise<FormState> {
  const { me, scope, supabase, allowed } = await ctx();
  const prev = await loadCompany(supabase, scope, id);
  if (!prev) return { error: "Entreprise introuvable ou hors de votre périmètre." };
  const r = readCompany(fd, allowed);
  if ("error" in r) return { error: r.error };
  // Les établissements hors de votre périmètre restent couverts
  const keep = prev.entity_ids.filter((e) => !allowed.includes(e));
  const entity_ids = [...new Set([...r.values.entity_ids, ...keep])];
  await supabase.from("companies").update({ ...r.values, entity_ids, entity_id: entity_ids[0] }).eq("id", id);
  const changes: string[] = [];
  if (prev.convention !== r.values.convention || prev.discount_pct !== r.values.discount_pct || prev.flat_mad !== r.values.flat_mad) changes.push("conditions tarifaires");
  if (prev.share_mode !== r.values.share_mode || prev.share_value !== r.values.share_value) changes.push("prise en charge");
  if (prev.status !== r.values.status) changes.push(`statut → ${r.values.status}`);
  if (prev.start_date !== r.values.start_date || prev.end_date !== r.values.end_date) changes.push("dates");
  await log(supabase, id, "convention", changes.length ? `Convention modifiée : ${changes.join(", ")}` : "Fiche entreprise mise à jour", me.id);
  await flash("Convention enregistrée");
  refresh(id);
  return undefined;
}

export async function addCompanyNote(id: string, _s: FormState, fd: FormData): Promise<FormState> {
  const { me, scope, supabase } = await ctx();
  if (!(await loadCompany(supabase, scope, id))) return { error: "Entreprise introuvable." };
  const body = str(fd.get("body"));
  if (!body) return { error: "Écrivez la note avant d'enregistrer." };
  await log(supabase, id, "note", body, me.id);
  await flash("Note ajoutée");
  refresh(id);
  return undefined;
}

/* ---------- Salariés ---------- */

async function tagContact(supabase: DB, contact: Contact, company: Company, authorId: string) {
  if (!(contact.tags ?? []).includes(CORPORATE_TAG)) await supabase.from("contacts").update({ tags: [...(contact.tags ?? []), CORPORATE_TAG] }).eq("id", contact.id);
  await supabase.from("activities").insert({ contact_id: contact.id, entity_id: company.entity_id, kind: "note", body: `Rattaché(e) à l'entreprise partenaire ${company.name}`, author_id: authorId });
  revalidatePath(`/contacts/${contact.id}`);
}

export async function addEmployee(companyId: string, _s: FormState, fd: FormData): Promise<FormState> {
  const { me, scope, supabase } = await ctx();
  const company = await loadCompany(supabase, scope, companyId);
  if (!company) return { error: "Entreprise introuvable." };
  const contactId = str(fd.get("contact_id"));
  if (!contactId) return { error: "Choisissez le client à rattacher (recherche par nom ou téléphone)." };
  const { data: c } = await supabase.from("contacts").select("*").eq("id", contactId).maybeSingle();
  const contact = c as Contact | null;
  if (!contact) return { error: "Client introuvable." };
  const { data: ex } = await supabase.from("company_employees").select("*").eq("company_id", companyId).eq("contact_id", contactId).maybeSingle();
  const matricule = str(fd.get("matricule"));
  if (ex) {
    const e = ex as CompanyEmployee;
    if (e.active) return { error: `${contact.full_name} est déjà rattaché(e) à ${company.name}.` };
    await supabase.from("company_employees").update({ active: true, left_on: null, matricule: matricule ?? e.matricule }).eq("id", e.id);
  } else {
    await supabase.from("company_employees").insert({ company_id: companyId, contact_id: contactId, matricule, active: true, joined_on: dayKey(), left_on: null });
  }
  await tagContact(supabase, contact, company, me.id);
  await log(supabase, companyId, "salarie", `${contact.full_name} rattaché(e)${matricule ? ` (matricule ${matricule})` : ""}`, me.id);
  await flash(`${contact.full_name} rattaché(e) à ${company.name}`);
  refresh(companyId);
  return undefined;
}

export async function importEmployees(companyId: string, _s: FormState, fd: FormData): Promise<FormState> {
  const { me, scope, supabase } = await ctx();
  const company = await loadCompany(supabase, scope, companyId);
  if (!company) return { error: "Entreprise introuvable." };
  const rows = parseImport(String(fd.get("list") ?? ""));
  if (!rows.length) return { error: "Collez une ligne par salarié : « Nom ; téléphone ; matricule » (le matricule est facultatif)." };
  if (rows.length > 300) return { error: "300 salariés maximum par import : découpez la liste." };
  const [{ data: all }, employees] = await Promise.all([supabase.from("contacts").select("*"), loadEmployees(supabase, [companyId])]);
  const contacts = (all ?? []) as Contact[];
  const byPhone = new Map(contacts.filter((c) => phoneKey(c.phone)).map((c) => [phoneKey(c.phone), c]));
  const linked = new Map(employees.map((e) => [e.contact_id, e]));
  let created = 0;
  let added = 0;
  let skipped = 0;
  for (const r of rows) {
    let contact = (r.phone && byPhone.get(phoneKey(r.phone))) || null;
    if (!contact) {
      const { data } = await supabase
        .from("contacts")
        .insert({
          full_name: r.name,
          phone: r.phone,
          email: null,
          sex: null,
          birth_date: null,
          city: "Agadir",
          source: null,
          tags: [CORPORATE_TAG],
          entity_ids: [company.entity_id],
          status: "prospect",
          guardian_name: null,
          notes: `Salarié(e) de ${company.name}`,
          owner_id: me.id,
          whatsapp_optin: true,
        })
        .select("*")
        .single();
      if (!data) continue;
      contact = data as Contact;
      if (r.phone) byPhone.set(phoneKey(r.phone), contact);
      created++;
    }
    const ex = linked.get(contact.id);
    if (ex?.active) {
      skipped++;
      continue;
    }
    if (ex) await supabase.from("company_employees").update({ active: true, left_on: null, matricule: r.matricule ?? ex.matricule }).eq("id", ex.id);
    else {
      const { data } = await supabase.from("company_employees").insert({ company_id: companyId, contact_id: contact.id, matricule: r.matricule, active: true, joined_on: dayKey(), left_on: null }).select("*").single();
      if (data) linked.set(contact.id, data as CompanyEmployee);
    }
    await tagContact(supabase, contact, company, me.id);
    added++;
  }
  await log(supabase, companyId, "salarie", `Import rapide : ${added} salarié${added > 1 ? "s" : ""} rattaché${added > 1 ? "s" : ""}${created ? `, dont ${created} nouveau${created > 1 ? "x" : ""} client${created > 1 ? "s" : ""}` : ""}`, me.id);
  const parts = [`${added} salarié${added > 1 ? "s" : ""} rattaché${added > 1 ? "s" : ""}`];
  if (created) parts.push(`${created} fiche${created > 1 ? "s" : ""} client créée${created > 1 ? "s" : ""}`);
  if (skipped) parts.push(`${skipped} déjà présent${skipped > 1 ? "s" : ""}`);
  await flash(parts.join(" · "));
  refresh(companyId);
  return undefined;
}

/** Actif / inactif (appel direct depuis le tableau, mise à jour optimiste) */
export async function toggleEmployee(id: string): Promise<Result & { active?: boolean }> {
  const { me, scope, supabase } = await ctx();
  const { data } = await supabase.from("company_employees").select("*").eq("id", id).maybeSingle();
  const e = data as CompanyEmployee | null;
  if (!e) return { ok: false, error: "Salarié introuvable." };
  const company = await loadCompany(supabase, scope, e.company_id);
  if (!company) return { ok: false, error: "Entreprise hors de votre périmètre." };
  const active = !e.active;
  await supabase.from("company_employees").update({ active, left_on: active ? null : dayKey() }).eq("id", id);
  const { data: c } = await supabase.from("contacts").select("full_name").eq("id", e.contact_id).maybeSingle();
  const name = (c as { full_name: string } | null)?.full_name ?? "Salarié";
  await log(supabase, company.id, "salarie", `${name} ${active ? "réactivé(e)" : "désactivé(e)"}`, me.id);
  refresh(company.id);
  return { ok: true, active, message: active ? `${name} réactivé(e)` : `${name} désactivé(e) : plus facturé(e) à partir de demain` };
}

/** Retire un salarié (annulable 5 s) */
export async function removeEmployee(id: string): Promise<void> {
  const { me, scope, supabase } = await ctx();
  const { data } = await supabase.from("company_employees").select("*").eq("id", id).maybeSingle();
  const e = data as CompanyEmployee | null;
  if (!e) return;
  const company = await loadCompany(supabase, scope, e.company_id);
  if (!company) return;
  const { data: c } = await supabase.from("contacts").select("*").eq("id", e.contact_id).maybeSingle();
  const contact = c as Contact | null;
  await supabase.from("company_employees").delete().eq("id", id);
  const ops: Parameters<typeof recordUndo>[1]["ops"] = [{ op: "restore", table: "company_employees", rows: [e] }];
  // Plus aucun lien entreprise : on retire le tag
  const { data: others } = await supabase.from("company_employees").select("id").eq("contact_id", e.contact_id).eq("active", true);
  if (contact && !(others ?? []).length && contact.tags?.includes(CORPORATE_TAG)) {
    await supabase.from("contacts").update({ tags: contact.tags.filter((t) => t !== CORPORATE_TAG) }).eq("id", contact.id);
    ops.push({ op: "update", table: "contacts", id: contact.id, values: { tags: contact.tags } });
  }
  await log(supabase, company.id, "salarie", `${contact?.full_name ?? "Salarié"} retiré(e) de la convention`, me.id);
  const undo = await recordUndo("entreprise.salarie.retrait", { ops, message: "Salarié remis dans la convention", href: `/entreprises/${company.id}?tab=salaries` });
  await flash(`${contact?.full_name ?? "Salarié"} retiré(e)`, "success", { undo });
  refresh(company.id);
}

/* ---------- Factures ---------- */

async function nextNumber(supabase: DB, year: string) {
  const prefix = `MU-ENT-${year}-`;
  const { data } = await supabase.from("company_invoices").select("number").ilike("number", `${prefix}%`);
  const max = ((data ?? []) as { number: string }[]).reduce((m, r) => Math.max(m, Number(r.number.slice(prefix.length)) || 0), 0);
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

export async function generateInvoice(companyId: string, _s: FormState, fd: FormData): Promise<FormState> {
  const { me, scope, supabase } = await ctx();
  const company = await loadCompany(supabase, scope, companyId);
  if (!company) return { error: "Entreprise introuvable." };
  const month = str(fd.get("month"));
  if (!isMonth(month)) return { error: "Choisissez le mois à facturer." };
  if (month > dayKey().slice(0, 7)) return { error: "On ne peut pas facturer un mois à venir." };
  const { data: ex } = await supabase.from("company_invoices").select("*").eq("company_id", companyId).eq("month", month);
  const live = ((ex ?? []) as CompanyInvoice[]).find((i) => i.status !== "annulee");
  if (live) return { error: `La facture de ${monthLabel(month)} existe déjà (${live.number}). Annulez-la pour la régénérer.` };

  const employees = await loadEmployees(supabase, [companyId]);
  const data = await loadCalcData(supabase, employees.map((e) => e.contact_id));
  const bill = computeBill(company, employees, data, month);
  if (!bill.covered) return { error: `La convention ne couvre pas ${monthLabel(month)} (vérifiez les dates de début et de fin).` };
  if (!bill.billable.length) return { error: `Rien à facturer pour ${monthLabel(month)} : aucune consommation prise en charge.` };

  const issued = dayKey();
  const number = await nextNumber(supabase, issued.slice(0, 4));
  const { data: inv } = await supabase
    .from("company_invoices")
    .insert({
      number,
      company_id: companyId,
      entity_id: company.entity_id,
      month,
      issued_on: issued,
      due_on: addDaysKey(issued, company.payment_days),
      total_mad: bill.company,
      net_mad: bill.net,
      employees_count: bill.billable.length,
      status: "a_envoyer",
      sent_at: null,
      paid_on: null,
      paid_method: null,
      paid_ref: null,
      reminders_count: 0,
      last_reminder_at: null,
      created_by: me.id,
    })
    .select("*")
    .single();
  if (!inv) return { error: "Impossible de créer la facture. Réessayez." };
  const invoice = inv as CompanyInvoice;
  await supabase.from("company_invoice_lines").insert(
    bill.billable.map((l) => ({
      invoice_id: invoice.id,
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
    })),
  );
  await log(supabase, companyId, "facture", `Facture ${number} générée : ${monthLabel(month)}, ${bill.billable.length} salariés, ${mad(bill.company)}`, me.id);
  await flash(`Facture ${number} générée`);
  refresh(companyId);
  redirect(`/entreprises/${companyId}/factures/${invoice.id}`);
}

async function loadInvoice(supabase: DB, id: string) {
  const scope = await getScope();
  const { data } = await supabase.from("company_invoices").select("*").eq("id", id).maybeSingle();
  const inv = data as CompanyInvoice | null;
  if (!inv) return null;
  const company = await loadCompany(supabase, scope, inv.company_id);
  return company ? { inv, company } : null;
}

function refreshInvoice(inv: CompanyInvoice) {
  refresh(inv.company_id);
  revalidatePath(`/entreprises/${inv.company_id}/factures/${inv.id}`);
}

export async function markInvoiceSent(id: string): Promise<Result> {
  const { me, supabase } = await ctx();
  const r = await loadInvoice(supabase, id);
  if (!r) return { ok: false, error: "Facture introuvable." };
  if (r.inv.status !== "a_envoyer") return { ok: false, error: `Facture déjà ${INVOICE_STATUS_LABEL[r.inv.status].toLowerCase()}.` };
  await supabase.from("company_invoices").update({ status: "envoyee", sent_at: new Date().toISOString() }).eq("id", id);
  await log(supabase, r.company.id, "envoi", `Facture ${r.inv.number} envoyée au service RH`, me.id);
  refreshInvoice(r.inv);
  return { ok: true, message: `Facture ${r.inv.number} marquée envoyée` };
}

export async function markInvoicePaid(id: string, _s: FormState, fd: FormData): Promise<FormState> {
  const { me, supabase } = await ctx();
  const r = await loadInvoice(supabase, id);
  if (!r) return { error: "Facture introuvable." };
  if (r.inv.status === "payee" || r.inv.status === "annulee") return { error: `Facture déjà ${INVOICE_STATUS_LABEL[r.inv.status].toLowerCase()}.` };
  const paid_on = str(fd.get("paid_on")) ?? dayKey();
  if (paid_on > dayKey()) return { error: "La date de paiement ne peut pas être dans le futur." };
  const method = (str(fd.get("method")) ?? "virement") as PayMethod;
  if (!METHODS.includes(method)) return { error: "Mode de paiement inconnu." };
  const ref = str(fd.get("ref"));
  await supabase
    .from("company_invoices")
    .update({ status: "payee", paid_on, paid_method: method, paid_ref: ref, sent_at: r.inv.sent_at ?? new Date().toISOString() })
    .eq("id", id);
  await log(supabase, r.company.id, "paiement", `Facture ${r.inv.number} payée le ${paid_on} par ${PAY_LABEL[method].toLowerCase()}${ref ? ` (réf. ${ref})` : ""} : ${mad(r.inv.total_mad)}`, me.id);
  await flash(`Paiement de ${mad(r.inv.total_mad)} enregistré`);
  refreshInvoice(r.inv);
  return undefined;
}

/** Note la relance (le message WhatsApp / e-mail est ouvert côté navigateur) */
export async function remindInvoice(id: string, channel: "whatsapp" | "email" | "telephone"): Promise<Result> {
  const { me, supabase } = await ctx();
  const r = await loadInvoice(supabase, id);
  if (!r) return { ok: false, error: "Facture introuvable." };
  if (r.inv.status === "payee" || r.inv.status === "annulee") return { ok: false, error: "Cette facture n'a pas besoin de relance." };
  const n = (r.inv.reminders_count ?? 0) + 1;
  await supabase
    .from("company_invoices")
    .update({ reminders_count: n, last_reminder_at: new Date().toISOString(), status: r.inv.status === "a_envoyer" ? "envoyee" : r.inv.status, sent_at: r.inv.sent_at ?? new Date().toISOString() })
    .eq("id", id);
  const via = channel === "whatsapp" ? "WhatsApp" : channel === "email" ? "e-mail" : "téléphone";
  await log(supabase, r.company.id, "relance", `Relance n°${n} de la facture ${r.inv.number} par ${via}${r.company.hr_name ? ` (${r.company.hr_name})` : ""}`, me.id);
  refreshInvoice(r.inv);
  return { ok: true, message: `Relance n°${n} notée` };
}

export async function cancelInvoice(id: string): Promise<void> {
  const { me, supabase } = await ctx();
  const r = await loadInvoice(supabase, id);
  if (!r || r.inv.status === "payee" || r.inv.status === "annulee") return;
  await supabase.from("company_invoices").update({ status: "annulee" }).eq("id", id);
  await log(supabase, r.company.id, "facture", `Facture ${r.inv.number} annulée`, me.id);
  const undo = await recordUndo("entreprise.facture.annulation", { ops: [{ op: "update", table: "company_invoices", id, values: { status: r.inv.status } }], message: "Facture rétablie" });
  await flash(`Facture ${r.inv.number} annulée — vous pouvez la régénérer`, "success", { undo });
  refreshInvoice(r.inv);
}
