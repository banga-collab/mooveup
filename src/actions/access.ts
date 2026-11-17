"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getProfile, getScope, type Scope } from "@/lib/auth";
import { entity, type EntityId } from "@/lib/entities";
import { logAudit } from "@/lib/audit";
import { flash } from "@/lib/flash";
import { bestVerdict, evaluateAccess, loadAccessData, newCardCode, type AccessCode } from "@/lib/access";
import { addDaysKey, agadirToIso, dayKey, fmtTime } from "@/lib/utils";
import type { Activity, Appointment, Contact, Profile, Sale, Subscription } from "@/lib/types";
import type { CheckinMethod, MemberCard } from "@/lib/types-access";
import { canSeeMedical, careAlerts, MEDICAL_ENTITIES, type CareProfile } from "@/lib/types-care";
import { getSettings } from "@/lib/settings";
import { loadBalances, pointsValue } from "@/lib/loyalty";
import type { AccessSnapshot, ImportResult, QueuedCheckin, SnapMember } from "@/lib/offline/types";
import { parseCode } from "@/components/access/code";
import { phoneDigits } from "@/components/contacts/helpers";

export type DeskHit = { id: string; full_name: string; phone: string | null; entity_ids: EntityId[] };

export type DeskVerdict = {
  contact: { id: string; full_name: string; phone: string | null };
  ok: boolean;
  forced: boolean;
  code: AccessCode;
  entity_id: EntityId;
  reason: string;
  plan: string | null;
  daysLeft: number | null;
  sessionsLeft: number | null;
  sessionUsed: boolean;
  /** Déjà entré récemment (heure) : pas de nouveau passage enregistré */
  already: string | null;
  at: string;
  canForce: boolean;
  /** Suggestions contextuelles (renouvellement, solde, anniversaire, alertes, points) */
  hints: DeskHints | null;
  /** Verdict établi sans réseau, à partir de l'instantané local */
  offline?: boolean;
};

export type DeskAlert = { kind: "care" | "care_hidden" | "absences" | "vip"; text?: string; n?: number };

export type DeskHints = {
  /** Renouveler avec la même formule */
  renewHref: string | null;
  /** Reste à payer et lien pour l'encaisser */
  unpaid: { amount: number; href: string } | null;
  birthday: boolean;
  age: number | null;
  alerts: DeskAlert[];
  /** Dernière note importante de la fiche */
  note: { body: string; at: string } | null;
  points: { balance: number; value: number } | null;
};

export type DeskResult =
  | { kind: "none"; query: string }
  | { kind: "choices"; hits: DeskHit[] }
  | { kind: "result"; v: DeskVerdict }
  | { kind: "error"; message: string };

const CARD_ROLES = ["direction", "manager", "reception"];
const SPORT: EntityId[] = ["sports", "lady", "kids", "power"];

/** Établissements contrôlés par ce poste d'accueil */
function deskEntities(scope: Scope, desk: string): EntityId[] {
  if (desk !== "auto" && scope.allowed.some((e) => e.id === desk)) return [desk as EntityId];
  return scope.ids;
}

/** Mots qui signalent une note à montrer à l'accueil */
const IMPORTANT = /(important|attention|alerte|urgent|retard|contre-indic|allerg|ne pas |interdit|litige|r[ée]clamation|plainte|⚠|!)/i;

/** Suggestions affichées avec le verdict (ne bloque jamais l'entrée) */
async function deskHints(
  supabase: SupabaseClient,
  profile: Profile,
  contactId: string,
  v: { entity_id: EntityId; ok: boolean; code: AccessCode; sub: Subscription | null; daysLeft: number | null; sessionsLeft: number | null },
  entityIds: EntityId[],
): Promise<DeskHints | null> {
  try {
    const since = new Date(Date.now() - 120 * 86400_000).toISOString();
    const [{ data: c }, { data: sales }, { data: acts }, { data: absences }, balances, settings] = await Promise.all([
      supabase.from("contacts").select("*").eq("id", contactId).maybeSingle(),
      supabase.from("sales").select("*").eq("contact_id", contactId).in("entity_id", entityIds).in("status", ["impayee", "partielle"]).order("sold_at"),
      supabase.from("activities").select("*").eq("contact_id", contactId).order("created_at", { ascending: false }).limit(40),
      supabase.from("appointments").select("id").eq("contact_id", contactId).eq("status", "absent").gte("starts_at", since),
      loadBalances(supabase, [contactId]),
      getSettings(),
    ]);
    const contact = c as Contact | null;
    if (!contact) return null;

    // Renouvellement : abonnement terminé / bientôt fini, ou pack vide / presque vide
    const sport = SPORT.includes(v.entity_id);
    const ending =
      v.code === "expire" ||
      v.code === "pack_vide" ||
      (v.ok && v.code === "ok_sub" && v.daysLeft !== null && v.daysLeft <= 7) ||
      (v.ok && v.code === "ok_pack" && v.sessionsLeft !== null && v.sessionsLeft <= 2);
    const renewHref = sport && v.sub && ending ? `/abonnements/nouveau?contact=${contactId}${v.sub.item_id ? `&formule=${v.sub.item_id}` : ""}` : null;

    const open = ((sales ?? []) as Sale[]).filter((s) => s.total_mad - s.paid_mad > 0.009);
    const amount = Math.round(open.reduce((a, s) => a + (s.total_mad - s.paid_mad), 0) * 100) / 100;
    const unpaid = amount > 0 ? { amount, href: open.length === 1 ? `/ventes/${open[0]!.id}` : `/ventes/${open.find((s) => s.entity_id === v.entity_id)?.id ?? open[0]!.id}` } : null;

    const today = dayKey();
    const birthday = !!contact.birth_date && contact.birth_date.slice(5, 10) === today.slice(5, 10);
    const age = birthday && contact.birth_date ? Number(today.slice(0, 4)) - Number(contact.birth_date.slice(0, 4)) : null;

    const alerts: DeskAlert[] = [];
    if (contact.tags.some((t) => t.toLowerCase() === "vip")) alerts.push({ kind: "vip" });
    const nAbs = (absences ?? []).length;
    if (nAbs >= 2) alerts.push({ kind: "absences", n: nAbs });
    if (contact.entity_ids.some((e) => MEDICAL_ENTITIES.includes(e))) {
      const { data: care } = await supabase.from("care_profiles").select("*").eq("contact_id", contactId).maybeSingle();
      const list = careAlerts(care as CareProfile | null);
      if (list.length) {
        if (canSeeMedical(profile)) for (const text of list.slice(0, 3)) alerts.push({ kind: "care", text });
        else alerts.push({ kind: "care_hidden" });
      }
    }

    const yearAgo = new Date(Date.now() - 365 * 86400_000).toISOString();
    const important = ((acts ?? []) as Activity[]).find(
      (a) => a.created_at >= yearAgo && ["note", "appel", "whatsapp", "statut"].includes(a.kind) && !a.body.startsWith("Entrée forcée") && IMPORTANT.test(a.body),
    );
    const note = important ? { body: important.body.slice(0, 220), at: important.created_at } : contact.notes && IMPORTANT.test(contact.notes) ? { body: contact.notes.slice(0, 220), at: contact.created_at } : null;

    const bal = balances.get(contactId)?.balance ?? 0;
    const points = bal > 0 ? { balance: bal, value: pointsValue(bal, settings) } : null;

    return { renewHref, unpaid, birthday, age, alerts, note, points };
  } catch {
    return null;
  }
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Passage à l'accueil : verdict, enregistrement de l'entrée, décompte de séance */
async function runCheckin(
  supabase: SupabaseClient,
  profile: Profile,
  scope: Scope,
  contact: DeskHit,
  desk: string,
  method: CheckinMethod,
  force?: { entity: EntityId; reason: string },
): Promise<DeskResult> {
  const deskIds = deskEntities(scope, desk);
  const mine = contact.entity_ids.filter((e) => deskIds.includes(e));
  const ids = force ? [force.entity] : mine.length ? mine : deskIds;
  const data = await loadAccessData(supabase, contact.id, ids);
  const v = bestVerdict(ids.map((e) => evaluateAccess(e, data)));
  if (!v) return { kind: "error", message: "Aucun établissement à contrôler." };

  const canForce = profile.role === "direction" || profile.role === "manager";
  const hints = await deskHints(supabase, profile, contact.id, v, deskIds.length ? deskIds : ids);
  const base: DeskVerdict = {
    contact: { id: contact.id, full_name: contact.full_name, phone: contact.phone },
    ok: v.ok,
    forced: false,
    code: v.code,
    entity_id: v.entity_id,
    reason: v.reason,
    plan: v.plan,
    daysLeft: v.daysLeft,
    sessionsLeft: v.sessionsLeft,
    sessionUsed: false,
    already: null,
    at: new Date().toISOString(),
    canForce,
    hints,
  };
  if (!v.ok && !force) return { kind: "result", v: base };
  if (force && !canForce) return { kind: "error", message: "Seul un manager peut forcer une entrée." };

  // Double passage (badge scanné deux fois) : on ne compte pas une 2e entrée dans les 3 heures
  const { data: recent } = await supabase
    .from("checkins")
    .select("created_at")
    .eq("contact_id", contact.id)
    .eq("entity_id", v.entity_id)
    .gte("created_at", new Date(Date.now() - 3 * 3600_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(1);
  const last = (recent ?? [])[0] as { created_at: string } | undefined;
  if (last && !force) return { kind: "result", v: { ...base, already: fmtTime(last.created_at) } };

  const sessionUsed = v.ok && v.code === "ok_pack" && !!v.sub && (v.sub.sessions_left ?? 0) > 0;
  const { error } = await supabase.from("checkins").insert({
    contact_id: contact.id,
    entity_id: v.entity_id,
    subscription_id: v.sub?.id ?? null,
    appointment_id: v.appt?.id ?? null,
    method: v.code === "ok_rdv" ? "rdv" : method,
    session_used: sessionUsed,
    forced: !!force,
    force_reason: force?.reason ?? null,
    by_id: profile.id,
  });
  if (error) return { kind: "error", message: "L'entrée n'a pas pu être enregistrée. Réessayez." };

  let sessionsLeft = v.sessionsLeft;
  if (sessionUsed && v.sub) {
    sessionsLeft = (v.sub.sessions_left ?? 1) - 1;
    await supabase.from("subscriptions").update({ sessions_left: sessionsLeft }).eq("id", v.sub.id);
  }
  if (v.appt && v.appt.status !== "arrive") await supabase.from("appointments").update({ status: "arrive" }).eq("id", v.appt.id);

  if (force) {
    const e = entity(force.entity);
    await Promise.all([
      supabase.from("activities").insert({
        contact_id: contact.id,
        entity_id: force.entity,
        kind: "visite",
        body: `Entrée forcée à ${e?.short ?? force.entity} (${v.reason}) · motif : ${force.reason}`,
        author_id: profile.id,
      }),
      logAudit({ action: "acces.forcage", entity_id: force.entity, target_type: "contact", target_id: contact.id, summary: `Entrée forcée pour ${contact.full_name} : ${force.reason} (refus : ${v.reason})`, actor: profile }),
    ]);
  }
  revalidatePath("/acces");
  return { kind: "result", v: { ...base, ok: true, forced: !!force, sessionUsed, sessionsLeft } };
}

/** Recherche à l'accueil : code de carte (QR), téléphone ou nom */
export async function deskLookup(query: string, desk: string, viaScan = false): Promise<DeskResult> {
  const q = String(query ?? "").trim().slice(0, 120);
  if (!q) return { kind: "none", query: "" };
  const [profile, scope] = await Promise.all([getProfile(), getScope()]);
  const supabase = await createClient();
  const allowedIds = scope.allowed.map((e) => e.id);

  const code = parseCode(q);
  if (code) {
    const { data: card } = await supabase.from("member_cards").select("*").eq("code", code).maybeSingle();
    if (!card) return { kind: "none", query: q };
    const { data: c } = await supabase.from("contacts").select("id, full_name, phone, entity_ids").eq("id", (card as MemberCard).contact_id).maybeSingle();
    const contact = c as DeskHit | null;
    if (!contact || (contact.entity_ids.length && !contact.entity_ids.some((e) => allowedIds.includes(e)))) return { kind: "none", query: q };
    return runCheckin(supabase, profile, scope, contact, desk, "qr");
  }

  const { data } = await supabase.from("contacts").select("id, full_name, phone, entity_ids").overlaps("entity_ids", allowedIds).order("full_name");
  const all = (data ?? []) as DeskHit[];
  const digits = q.replace(/\D/g, "");
  let hits: DeskHit[];
  if (digits.length >= 4 && digits.length >= q.replace(/\s/g, "").length - 1) {
    const d = phoneDigits(q);
    const exact = all.filter((c) => phoneDigits(c.phone) === d);
    hits = exact.length ? exact : all.filter((c) => phoneDigits(c.phone).includes(digits));
  } else {
    const tokens = norm(q).split(/\s+/).filter(Boolean);
    hits = all.filter((c) => {
      const n = norm(c.full_name);
      return tokens.every((t) => n.includes(t));
    });
    const exact = hits.filter((c) => norm(c.full_name) === norm(q));
    if (exact.length === 1) hits = exact;
  }
  // Les clients de l'établissement du poste d'abord
  const deskIds = deskEntities(scope, desk);
  hits.sort((a, b) => Number(b.entity_ids.some((e) => deskIds.includes(e))) - Number(a.entity_ids.some((e) => deskIds.includes(e))));

  if (!hits.length) return { kind: "none", query: q };
  if (hits.length === 1) return runCheckin(supabase, profile, scope, hits[0]!, desk, viaScan ? "qr" : "recherche");
  return { kind: "choices", hits: hits.slice(0, 8) };
}

/** Valide l'entrée d'un client choisi dans la liste */
export async function deskCheckin(contactId: string, desk: string): Promise<DeskResult> {
  const [profile, scope] = await Promise.all([getProfile(), getScope()]);
  const supabase = await createClient();
  const { data } = await supabase.from("contacts").select("id, full_name, phone, entity_ids").eq("id", contactId).maybeSingle();
  const contact = data as DeskHit | null;
  if (!contact || (contact.entity_ids.length && !contact.entity_ids.some((e) => scope.allowed.some((a) => a.id === e)))) return { kind: "error", message: "Client introuvable." };
  return runCheckin(supabase, profile, scope, contact, desk, "recherche");
}

/** Entrée forcée par un manager, avec motif (journalisée) */
export async function deskForce(contactId: string, entityId: string, reason: string): Promise<DeskResult> {
  const [profile, scope] = await Promise.all([getProfile(), getScope()]);
  if (profile.role !== "direction" && profile.role !== "manager") return { kind: "error", message: "Seul un manager peut forcer une entrée." };
  const motif = String(reason ?? "").trim().slice(0, 200);
  if (motif.length < 3) return { kind: "error", message: "Indiquez le motif du forçage." };
  if (!scope.allowed.some((e) => e.id === entityId)) return { kind: "error", message: "Établissement non autorisé." };
  const supabase = await createClient();
  const { data } = await supabase.from("contacts").select("id, full_name, phone, entity_ids").eq("id", contactId).maybeSingle();
  const contact = data as DeskHit | null;
  if (!contact) return { kind: "error", message: "Client introuvable." };
  return runCheckin(supabase, profile, scope, contact, entityId, "manuel", { entity: entityId as EntityId, reason: motif });
}

/** Nouveau code de carte (carte perdue ou partagée) : l'ancien QR ne fonctionne plus */
export async function regenerateCard(contactId: string): Promise<void> {
  const [profile, scope] = await Promise.all([getProfile(), getScope()]);
  if (!CARD_ROLES.includes(profile.role)) return;
  const supabase = await createClient();
  const { data } = await supabase.from("contacts").select("*").eq("id", contactId).maybeSingle();
  const contact = data as Contact | null;
  if (!contact || (contact.entity_ids.length && !contact.entity_ids.some((e) => scope.allowed.some((a) => a.id === e)))) return;

  let code = newCardCode();
  for (let i = 0; i < 4; i++) {
    const { data: taken } = await supabase.from("member_cards").select("id").eq("code", code).maybeSingle();
    if (!taken) break;
    code = newCardCode();
  }
  const now = new Date().toISOString();
  const { data: existing } = await supabase.from("member_cards").select("id").eq("contact_id", contactId).maybeSingle();
  if (existing) await supabase.from("member_cards").update({ code, regenerated_at: now }).eq("contact_id", contactId);
  else await supabase.from("member_cards").insert({ contact_id: contactId, code, regenerated_at: now });

  const ent = contact.entity_ids.find((e) => scope.allowed.some((a) => a.id === e)) ?? null;
  await Promise.all([
    supabase.from("activities").insert({ contact_id: contactId, entity_id: ent, kind: "statut", body: "Nouvelle carte d'accès : l'ancien QR code est désactivé", author_id: profile.id }),
    logAudit({ action: "acces.carte", entity_id: ent, target_type: "contact", target_id: contactId, summary: `Code de carte régénéré pour ${contact.full_name}`, actor: profile }),
  ]);
  await flash("Nouveau code généré");
  revalidatePath(`/contacts/${contactId}`);
}

/* ---------- Mode hors ligne ---------- */

/**
 * Instantané des droits d'accès du poste (cartes, abonnements actifs, impayés, rendez-vous du jour),
 * téléchargé périodiquement pour contrôler les entrées sans réseau. Aucune donnée médicale.
 */
export async function accessSnapshot(desk: string): Promise<AccessSnapshot | null> {
  const scope = await getScope();
  const deskIds = deskEntities(scope, desk);
  if (!deskIds.length) return null;
  const supabase = await createClient();
  const today = dayKey();
  const [{ data: cs }, { data: cards }, { data: subs }, { data: sales }, { data: appts }] = await Promise.all([
    supabase.from("contacts").select("id, full_name, phone, entity_ids").overlaps("entity_ids", deskIds).limit(8000),
    supabase.from("member_cards").select("contact_id, code"),
    supabase.from("subscriptions").select("*").in("entity_id", deskIds).gte("end_date", addDaysKey(today, -400)),
    supabase.from("sales").select("*").in("entity_id", deskIds).eq("status", "impayee").gte("sold_at", agadirToIso(addDaysKey(today, -400), "00:00")),
    supabase.from("appointments").select("*").in("entity_id", deskIds).gte("starts_at", agadirToIso(today, "00:00")).lt("starts_at", agadirToIso(today, "23:59")),
  ]);
  const group = <T extends { contact_id: string | null }>(rows: T[] | null) => {
    const m = new Map<string, T[]>();
    for (const r of rows ?? []) if (r.contact_id) m.set(r.contact_id, [...(m.get(r.contact_id) ?? []), r]);
    return m;
  };
  const subsBy = group(subs as Subscription[] | null);
  const salesBy = group(sales as Sale[] | null);
  const apptsBy = group(appts as Appointment[] | null);
  const codeBy = new Map(((cards ?? []) as Pick<MemberCard, "contact_id" | "code">[]).map((c) => [c.contact_id, c.code]));

  const members: SnapMember[] = ((cs ?? []) as DeskHit[]).map((c) => {
    const mine = c.entity_ids.filter((e) => deskIds.includes(e));
    const data = { subs: subsBy.get(c.id) ?? [], sales: salesBy.get(c.id) ?? [], appts: apptsBy.get(c.id) ?? [] };
    return {
      id: c.id,
      name: c.full_name,
      phone: phoneDigits(c.phone),
      code: codeBy.get(c.id) ?? null,
      ents: mine,
      v: (mine.length ? mine : deskIds).map((e) => {
        const v = evaluateAccess(e, data, today);
        return { e, ok: v.ok, code: v.code, reason: v.reason, plan: v.plan, until: v.sub?.end_date ?? null, sessions: v.sessionsLeft };
      }),
    };
  });
  return { at: new Date().toISOString(), day: today, desk, ids: deskIds, members };
}

/**
 * Envoi en lot des entrées scannées hors ligne, sans doublon :
 * une entrée du même client au même établissement à moins de 3 h est ignorée.
 */
export async function importOfflineCheckins(items: QueuedCheckin[]): Promise<ImportResult> {
  const [profile, scope] = await Promise.all([getProfile(), getScope()]);
  const supabase = await createClient();
  const allowedIds = scope.allowed.map((e) => e.id);
  const res: ImportResult = { done: [], imported: 0, skipped: 0, failed: 0 };
  const now = Date.now();

  for (const it of (Array.isArray(items) ? items : []).slice(0, 100)) {
    if (!it || typeof it.id !== "string") continue;
    const at = new Date(it.at).getTime();
    if (!Number.isFinite(at) || at > now + 10 * 60_000 || at < now - 7 * 86400_000 || !allowedIds.includes(it.entity_id)) {
      res.done.push(it.id);
      res.failed++;
      continue;
    }
    const { data: c } = await supabase.from("contacts").select("id, full_name, phone, entity_ids").eq("id", String(it.contact_id)).maybeSingle();
    const contact = c as DeskHit | null;
    if (!contact || (contact.entity_ids.length && !contact.entity_ids.some((e) => allowedIds.includes(e)))) {
      res.done.push(it.id);
      res.failed++;
      continue;
    }
    const iso = new Date(at).toISOString();
    const { data: near } = await supabase
      .from("checkins")
      .select("id")
      .eq("contact_id", contact.id)
      .eq("entity_id", it.entity_id)
      .gte("created_at", new Date(at - 3 * 3600_000).toISOString())
      .lte("created_at", new Date(at + 3 * 3600_000).toISOString())
      .limit(1);
    if ((near ?? []).length) {
      res.done.push(it.id);
      res.skipped++;
      continue;
    }

    // Contrôle refait avec les données à jour : un refus devient une entrée « forcée » visible des managers
    const data = await loadAccessData(supabase, contact.id, [it.entity_id]);
    const v = evaluateAccess(it.entity_id, data, dayKey(iso));
    const sessionUsed = v.ok && v.code === "ok_pack" && !!v.sub && (v.sub.sessions_left ?? 0) > 0;
    const { error } = await supabase.from("checkins").insert({
      contact_id: contact.id,
      entity_id: it.entity_id,
      subscription_id: v.sub?.id ?? null,
      appointment_id: v.appt?.id ?? null,
      method: v.code === "ok_rdv" ? "rdv" : it.method === "qr" ? "qr" : "recherche",
      session_used: sessionUsed,
      forced: !v.ok,
      force_reason: v.ok ? null : `Entrée hors ligne (${v.reason})`,
      by_id: profile.id,
      created_at: iso,
    });
    if (error) {
      res.failed++;
      continue; // reste dans la file : nouvel essai plus tard
    }
    if (sessionUsed && v.sub) await supabase.from("subscriptions").update({ sessions_left: (v.sub.sessions_left ?? 1) - 1 }).eq("id", v.sub.id);
    if (v.appt && v.appt.status !== "arrive") await supabase.from("appointments").update({ status: "arrive" }).eq("id", v.appt.id);
    if (!v.ok) {
      await supabase.from("activities").insert({
        contact_id: contact.id,
        entity_id: it.entity_id,
        kind: "visite",
        body: `Entrée enregistrée hors ligne à ${fmtTime(iso)} malgré : ${v.reason}`,
        author_id: profile.id,
      });
    }
    res.done.push(it.id);
    res.imported++;
  }

  if (res.imported) {
    await logAudit({
      action: "acces.hors_ligne",
      entity_id: scope.current?.id ?? null,
      target_type: "checkin",
      target_id: null,
      summary: `${res.imported} entrée${res.imported > 1 ? "s" : ""} enregistrée${res.imported > 1 ? "s" : ""} hors ligne envoyée${res.imported > 1 ? "s" : ""}${res.skipped ? ` (${res.skipped} doublon${res.skipped > 1 ? "s" : ""} ignoré${res.skipped > 1 ? "s" : ""})` : ""}`,
      actor: profile,
    });
    revalidatePath("/acces");
    revalidatePath("/tablette");
  }
  return res;
}
