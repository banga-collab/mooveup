/**
 * Rappels WhatsApp automatiques : calcul des destinataires du jour,
 * anti-doublon (même règle + même client + même jour, et délais propres à chaque règle),
 * envoi via src/lib/whatsapp.ts et journal `message_log`.
 */
import { createClient as createSupabase, type SupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { createClient } from "./supabase/server";
import { DEMO } from "./demo";
import { ENTITIES, entity, type EntityId } from "./entities";
import type { Appointment, Contact, Sale, Subscription } from "./types";
import type { AutomationKey, AutomationRule, MessageLog, Review } from "./types-loyalty";
import { getSettings } from "./settings";
import { addDaysKey, agadirHour, agadirToIso, dayKey, fmtDate, fmtTime, mad } from "./utils";
import { fetchAll, firstName } from "./loyalty";
import { sendAndLog } from "./whatsapp";
import { AUTOMATIONS, renderTemplate, type AutomationDef } from "@/components/automations/defs";
import "@/lib/supabase/paginate";

/** Client sans session utilisateur (route planifiée, page publique d'avis) */
export async function serviceClient(): Promise<SupabaseClient> {
  if (DEMO) return createClient();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY manquante");
  return createSupabase(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Adresse publique du site (liens d'avis) */
export async function siteOrigin() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

export type RuleView = AutomationDef & { enabled: boolean; message: string; updated_at: string | null };

/** Règles avec leurs réglages enregistrés */
export async function loadRules(supabase: SupabaseClient): Promise<RuleView[]> {
  const { data } = await supabase.from("automation_rules").select("*");
  const saved = new Map(((data ?? []) as AutomationRule[]).map((r) => [r.id, r]));
  return AUTOMATIONS.map((d) => {
    const s = saved.get(d.key);
    return { ...d, enabled: s ? s.enabled : d.defaultEnabled, message: s?.message || d.defaultMessage, updated_at: s?.updated_at ?? null };
  });
}

/** Lien court public d'une demande d'avis */
export function reviewToken() {
  const a = "abcdefghjkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}

type Target = {
  key: AutomationKey;
  contact: Contact;
  entity_id: EntityId;
  vars: Record<string, string>;
  ref_id: string | null;
  /** Demande d'avis à créer au moment de l'envoi */
  review?: { appointment_id: string | null; sale_id: string | null; service: string | null };
};

const longDate = (iso: string) => fmtDate(iso, { weekday: "long", day: "numeric", month: "long" });

/** Calcule les destinataires du jour de chaque règle */
async function computeTargets(supabase: SupabaseClient, ids: EntityId[], keys: Set<AutomationKey>) {
  const now = new Date();
  const nowIso = now.toISOString();
  const today = dayKey();
  const tomorrow = addDaysKey(today, 1);
  const since36h = new Date(now.getTime() - 36 * 3600_000).toISOString();
  const need = (k: AutomationKey) => keys.has(k);

  const [contacts, appts, subs, unpaid, recentSales, recentReviews] = await Promise.all([
    fetchAll<Contact>(() => supabase.from("contacts").select("*").overlaps("entity_ids", ids)),
    need("rdv_veille") || need("rdv_confirmation") || need("avis")
      ? fetchAll<Appointment>(() => supabase.from("appointments").select("*").in("entity_id", ids).gte("starts_at", since36h).lt("starts_at", agadirToIso(addDaysKey(today, 60), "00:00")))
      : Promise.resolve([] as Appointment[]),
    need("abo_j7") || need("abo_j1") || need("inactif_21")
      ? fetchAll<Subscription>(() => supabase.from("subscriptions").select("*").in("entity_id", ids).eq("status", "actif"))
      : Promise.resolve([] as Subscription[]),
    need("impaye")
      ? fetchAll<Sale>(() => supabase.from("sales").select("*").in("entity_id", ids).in("status", ["impayee", "partielle"]).gte("sold_at", agadirToIso(addDaysKey(today, -60), "00:00")))
      : Promise.resolve([] as Sale[]),
    need("avis") ? fetchAll<Sale>(() => supabase.from("sales").select("*").in("entity_id", ids).gte("sold_at", since36h)) : Promise.resolve([] as Sale[]),
    need("avis") ? fetchAll<Pick<Review, "appointment_id" | "sale_id">>(() => supabase.from("reviews").select("appointment_id, sale_id").gte("created_at", addDaysKey(today, -10))) : Promise.resolve([]),
  ]);
  const cById = new Map(contacts.map((c) => [c.id, c]));
  const out: Target[] = [];
  const push = (key: AutomationKey, contactId: string | null, eid: EntityId, vars: Record<string, string>, ref: string | null, review?: Target["review"]) => {
    const c = contactId ? cById.get(contactId) : undefined;
    if (!c || !keys.has(key)) return;
    out.push({ key, contact: c, entity_id: eid, ref_id: ref, review, vars: { prenom: firstName(c.full_name), etablissement: entity(eid)?.short ?? "Moov'Up", ...vars } });
  };

  // Rendez-vous
  const tomorrowStart = agadirToIso(tomorrow, "00:00");
  const afterTomorrow = agadirToIso(addDaysKey(tomorrow, 1), "00:00");
  for (const a of appts) {
    const vars = { date: longDate(a.starts_at), heure: fmtTime(a.starts_at), service: a.service };
    const upcoming = a.status === "prevu" || a.status === "confirme";
    if (upcoming && a.starts_at >= tomorrowStart && a.starts_at < afterTomorrow) push("rdv_veille", a.contact_id, a.entity_id, vars, a.id);
    if (upcoming && a.starts_at > nowIso && new Date(a.created_at).getTime() >= now.getTime() - 24 * 3600_000) push("rdv_confirmation", a.contact_id, a.entity_id, vars, a.id);
  }

  // Abonnements qui expirent
  for (const s of subs) {
    const vars = { date: longDate(agadirToIso(s.end_date, "12:00")), service: s.name };
    if (s.end_date === addDaysKey(today, 7)) push("abo_j7", s.contact_id, s.entity_id, vars, s.id);
    if (s.end_date === tomorrow) push("abo_j1", s.contact_id, s.entity_id, vars, s.id);
  }

  // Inactifs (sport) : aucun passage ni achat depuis 21 jours
  if (need("inactif_21")) {
    const sportIds = ids.filter((id) => ENTITIES.find((e) => e.id === id)?.kind === "sport");
    const sportSubs = subs.filter((s) => sportIds.includes(s.entity_id) && s.start_date <= addDaysKey(today, -21));
    if (sportSubs.length) {
      const since21 = agadirToIso(addDaysKey(today, -21), "00:00");
      const cids = [...new Set(sportSubs.map((s) => s.contact_id))];
      const [visits, sales] = await Promise.all([
        fetchAll<{ contact_id: string; entity_id: string | null }>(() => supabase.from("activities").select("contact_id, entity_id").eq("kind", "visite").gte("created_at", since21).in("contact_id", cids)),
        fetchAll<{ contact_id: string | null; entity_id: string }>(() => supabase.from("sales").select("contact_id, entity_id").gte("sold_at", since21).in("contact_id", cids)),
      ]);
      const seen = new Set([...visits, ...sales].map((v) => `${v.contact_id}:${v.entity_id}`));
      for (const s of sportSubs) if (!seen.has(`${s.contact_id}:${s.entity_id}`)) push("inactif_21", s.contact_id, s.entity_id, { service: s.name }, null);
    }
  }

  // Anniversaires
  if (need("anniversaire")) {
    for (const c of contacts) {
      if (c.status !== "client" || !c.birth_date || c.birth_date.slice(5, 10) !== today.slice(5)) continue;
      const eid = c.entity_ids.find((e) => ids.includes(e));
      if (eid) push("anniversaire", c.id, eid, {}, null);
    }
  }

  // Demandes d'avis : rendez-vous terminés et premières visites des dernières 36 h
  if (need("avis")) {
    const asked = new Set(recentReviews.flatMap((r) => [r.appointment_id, r.sale_id]).filter(Boolean) as string[]);
    const fromAppt = new Set<string>();
    for (const a of appts) {
      const end = new Date(a.starts_at).getTime() + a.duration_min * 60_000;
      if (a.status !== "termine" || end > now.getTime() || asked.has(a.id)) continue;
      fromAppt.add(a.contact_id);
      push("avis", a.contact_id, a.entity_id, { service: a.service, date: longDate(a.starts_at), heure: fmtTime(a.starts_at) }, a.id, { appointment_id: a.id, sale_id: null, service: a.service });
    }
    const buyers = [...new Set(recentSales.map((s) => s.contact_id).filter((x): x is string => !!x && !fromAppt.has(x)))];
    if (buyers.length) {
      const older = await fetchAll<{ contact_id: string }>(() => supabase.from("sales").select("contact_id").in("contact_id", buyers).lt("sold_at", since36h));
      const known = new Set(older.map((o) => o.contact_id));
      for (const s of recentSales) {
        if (!s.contact_id || known.has(s.contact_id) || fromAppt.has(s.contact_id) || asked.has(s.id) || s.status === "remboursee") continue;
        known.add(s.contact_id);
        push("avis", s.contact_id, s.entity_id, { service: "votre visite", date: longDate(s.sold_at) }, s.id, { appointment_id: null, sale_id: s.id, service: null });
      }
    }
  }

  // Impayés
  for (const s of unpaid) {
    if (s.sold_at > agadirToIso(addDaysKey(today, -3), "00:00")) continue;
    push("impaye", s.contact_id, s.entity_id, { montant: mad(Number(s.total_mad) - Number(s.paid_mad)), date: fmtDate(s.sold_at, { day: "numeric", month: "long" }), service: s.number }, s.id);
  }
  return out;
}

export type RunSummary = { sent: number; simulated: number; failed: number; skipped: number; already: number; byRule: Partial<Record<AutomationKey, number>> };

/** Destinataires restant à contacter aujourd'hui (après anti-doublon) */
async function plan(supabase: SupabaseClient, entityIds: EntityId[], rules: RuleView[]) {
  const ruleOf = new Map(rules.map((r) => [r.key, r]));
  const targets = await computeTargets(supabase, entityIds, new Set(rules.map((r) => r.key)));

  // Journal des envois récents (les échecs peuvent être réessayés)
  const today = dayKey();
  const maxCooldown = Math.max(1, ...rules.map((r) => r.cooldownDays));
  const logs = await fetchAll<Pick<MessageLog, "rule_key" | "contact_id" | "ref_id" | "day_key" | "status">>(() =>
    supabase.from("message_log").select("rule_key, contact_id, ref_id, day_key, status").gte("day_key", addDaysKey(today, -maxCooldown)).neq("status", "echec"),
  );
  const lastByContact = new Map<string, string>();
  const refsDone = new Set<string>();
  for (const l of logs) {
    if (!l.rule_key) continue;
    const k = `${l.rule_key}:${l.contact_id}`;
    const d = String(l.day_key).slice(0, 10);
    if (d > (lastByContact.get(k) ?? "")) lastByContact.set(k, d);
    if (l.ref_id) refsDone.add(`${l.rule_key}:${l.ref_id}`);
  }

  const todo: (Target & { rule: RuleView })[] = [];
  let already = 0;
  let skipped = 0;
  const planned = new Set<string>();
  for (const t of targets) {
    const rule = ruleOf.get(t.key)!;
    const ck = `${t.key}:${t.contact.id}`;
    const last = lastByContact.get(ck);
    // Même règle + même client + même jour, délai propre à la règle, objet déjà traité
    if (planned.has(ck) || (last && last > addDaysKey(today, -rule.cooldownDays)) || (rule.perRef && t.ref_id && refsDone.has(`${t.key}:${t.ref_id}`))) {
      already++;
      continue;
    }
    if (!t.contact.phone || t.contact.whatsapp_optin === false) {
      skipped++;
      continue;
    }
    planned.add(ck);
    todo.push({ ...t, rule });
  }
  return { todo, already, skipped };
}

/**
 * Exécute les règles actives.
 * `scheduled` : appel de la route planifiée (respecte l'heure de chaque règle et les heures calmes 21 h – 8 h).
 */
export async function runAutomations(opts: { supabase: SupabaseClient; entityIds: EntityId[]; authorId: string | null; origin: string; scheduled?: boolean; only?: AutomationKey }): Promise<RunSummary> {
  const { supabase, entityIds, authorId, origin } = opts;
  const summary: RunSummary = { sent: 0, simulated: 0, failed: 0, skipped: 0, already: 0, byRule: {} };
  const hour = agadirHour();
  if (opts.scheduled && (hour < 8 || hour >= 21)) return summary;

  const [rules, settings] = await Promise.all([loadRules(supabase), getSettings()]);
  const active = rules.filter((r) => r.enabled && (!opts.only || r.key === opts.only) && (!opts.scheduled || hour >= r.hour));
  if (!active.length || !entityIds.length) return summary;

  const { todo, already, skipped } = await plan(supabase, entityIds, active);
  summary.already = already;
  summary.skipped = skipped;

  for (const t of todo) {
    const vars = { ...t.vars };
    if (t.review) {
      const token = reviewToken();
      await supabase.from("reviews").insert({
        token,
        contact_id: t.contact.id,
        entity_id: t.entity_id,
        appointment_id: t.review.appointment_id,
        sale_id: t.review.sale_id,
        service: t.review.service,
        rating: null,
        comment: null,
        answered_at: null,
        handled: false,
        handled_at: null,
        handled_by: null,
        task_id: null,
      });
      vars.lien = `${origin}/r/${token}`;
    }
    const r = await sendAndLog(
      supabase,
      { contact_id: t.contact.id, entity_id: t.entity_id, phone: t.contact.phone, body: renderTemplate(t.rule.message, vars), rule_key: t.key, ref_id: t.ref_id, author_id: authorId, label: t.rule.label },
      settings,
    );
    if (r.status === "envoye") summary.sent++;
    else if (r.status === "simule") summary.simulated++;
    else summary.failed++;
    if (r.status !== "echec") summary.byRule[t.key] = (summary.byRule[t.key] ?? 0) + 1;
  }
  return summary;
}

/** Aperçu sans envoi : clients restant à contacter aujourd'hui, par règle */
export async function pendingCounts(supabase: SupabaseClient, entityIds: EntityId[], rules: RuleView[]) {
  const counts: Partial<Record<AutomationKey, number>> = {};
  if (!entityIds.length) return counts;
  const { todo } = await plan(supabase, entityIds, rules);
  for (const t of todo) counts[t.key] = (counts[t.key] ?? 0) + 1;
  return counts;
}
