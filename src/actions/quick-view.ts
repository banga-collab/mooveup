"use server";

import { revalidatePath } from "next/cache";
import { getProfile, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { entity, type EntityId } from "@/lib/entities";
import { flash } from "@/lib/flash";
import { recordUndo } from "@/lib/undo";
import { loadBalances } from "@/lib/loyalty";
import { canSeeMedical, careAlerts, type CareProfile } from "@/lib/types-care";
import type { Checkin } from "@/lib/types-access";
import type { Activity, ActivityKind, Appointment, Contact, ContactStatus, Profile, Sale, Subscription } from "@/lib/types";
import { daysUntil, dayKey, waLink } from "@/lib/utils";

export type QuickAlert = { tone: "red" | "amber"; text: string };

export type QuickView = {
  id: string;
  full_name: string;
  status: ContactStatus;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  guardian_name: string | null;
  entity_ids: EntityId[];
  tags: string[];
  alerts: QuickAlert[];
  subs: { id: string; name: string; entity_id: EntityId; end_date: string; days_left: number; sessions_left: number | null; status: Subscription["status"] }[];
  due_mad: number;
  points: number | null;
  next_appt: { id: string; starts_at: string; service: string; entity_id: EntityId } | null;
  visits: { at: string; entity_id: EntityId | null; label: string }[];
  exchanges: { id: string; kind: ActivityKind; body: string; at: string; author: string | null; can_delete: boolean }[];
};

const EXCHANGE_KINDS: ActivityKind[] = ["note", "appel", "whatsapp", "email"];

/** Client visible par l'utilisateur (au moins un établissement en commun) */
async function visibleContact(id: string) {
  if (typeof id !== "string" || !id) return null;
  const [me, scope, supabase] = await Promise.all([getProfile(), getScope(), createClient()]);
  const allowed = scope.allowed.map((e) => e.id as EntityId);
  const { data } = await supabase.from("contacts").select("*").eq("id", id).maybeSingle();
  const contact = data as Contact | null;
  if (!contact || !contact.entity_ids.some((e) => allowed.includes(e))) return null;
  return { me, allowed, supabase, contact };
}

const canDeleteNote = (me: Profile, a: Pick<Activity, "kind" | "author_id">) =>
  EXCHANGE_KINDS.includes(a.kind) && (a.author_id === me.id || me.role === "direction" || me.role === "manager");

/** Données de l'aperçu rapide d'un client (panneau latéral) */
export async function getQuickView(id: string): Promise<QuickView | null> {
  const ctx = await visibleContact(id);
  if (!ctx) return null;
  const { me, allowed, supabase, contact } = ctx;
  const nowIso = new Date().toISOString();
  const today = dayKey();

  const [subsRes, salesRes, apptRes, actRes, checkRes, careRes, balances] = await Promise.all([
    supabase.from("subscriptions").select("*").eq("contact_id", id).in("entity_id", allowed).order("end_date", { ascending: false }),
    supabase.from("sales").select("*").eq("contact_id", id).in("entity_id", allowed),
    supabase.from("appointments").select("*").eq("contact_id", id).in("entity_id", allowed).order("starts_at", { ascending: false }).limit(60),
    supabase.from("activities").select("*").eq("contact_id", id).order("created_at", { ascending: false }).limit(60),
    supabase.from("checkins").select("*").eq("contact_id", id).in("entity_id", allowed).order("created_at", { ascending: false }).limit(5),
    canSeeMedical(me) ? supabase.from("care_profiles").select("*").eq("contact_id", id).maybeSingle() : Promise.resolve({ data: null }),
    loadBalances(supabase, [id]).catch(() => new Map<string, { balance: number }>()),
  ]);

  const subsAll = (subsRes.data ?? []) as Subscription[];
  const sales = (salesRes.data ?? []) as Sale[];
  const appts = (apptRes.data ?? []) as Appointment[];
  const acts = ((actRes.data ?? []) as Activity[]).filter((a) => !a.entity_id || allowed.includes(a.entity_id));
  const checkins = (checkRes.data ?? []) as Checkin[];
  const care = careRes.data as CareProfile | null;

  // Abonnements en cours (actifs ou suspendus, non échus)
  const subs = subsAll
    .filter((s) => (s.status === "actif" || s.status === "suspendu") && s.end_date >= today)
    .sort((a, b) => a.end_date.localeCompare(b.end_date))
    .map((s) => ({ id: s.id, name: s.name, entity_id: s.entity_id, end_date: s.end_date, days_left: daysUntil(s.end_date), sessions_left: s.sessions_left, status: s.status }));

  const due = sales.filter((s) => s.status === "impayee" || s.status === "partielle").reduce((a, s) => a + Math.max(0, Number(s.total_mad) - Number(s.paid_mad)), 0);

  // Alertes
  const alerts: QuickAlert[] = [];
  for (const text of careAlerts(care)) alerts.push({ tone: "red", text });
  if (due > 0) alerts.push({ tone: "red", text: `Impayé : ${Math.round(due * 100) / 100} MAD à régler` });
  const coveredEntities = new Set(subs.map((s) => s.entity_id));
  const expired = subsAll.filter(
    (s) => !coveredEntities.has(s.entity_id) && s.status !== "resilie" && s.end_date < today && daysUntil(s.end_date) >= -60,
  );
  const seenExpired = new Set<string>();
  for (const s of expired) {
    if (seenExpired.has(s.entity_id)) continue;
    seenExpired.add(s.entity_id);
    const d = -daysUntil(s.end_date);
    alerts.push({ tone: "amber", text: `Abonnement expiré : ${s.name} (${d === 0 ? "aujourd'hui" : `il y a ${d} j`})` });
  }
  for (const s of subs) {
    if (s.status === "suspendu") alerts.push({ tone: "amber", text: `Abonnement suspendu : ${s.name}` });
    else if (s.days_left <= 7) alerts.push({ tone: "amber", text: `${s.name} expire ${s.days_left === 0 ? "aujourd'hui" : s.days_left === 1 ? "demain" : `dans ${s.days_left} j`}` });
    else if (s.sessions_left !== null && s.sessions_left <= 1) alerts.push({ tone: "amber", text: `${s.name} : ${s.sessions_left ? "dernière séance" : "plus de séance"}` });
  }

  const next = appts.filter((a) => a.starts_at >= nowIso && a.status !== "annule" && a.status !== "absent").sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];

  // Dernières visites : passages à l'accueil, RDV honorés, visites notées
  const visits = [
    ...checkins.map((c) => ({ at: c.created_at, entity_id: c.entity_id as EntityId | null, label: c.forced ? "Entrée forcée" : "Passage à l'accueil" })),
    ...appts.filter((a) => (a.status === "arrive" || a.status === "termine") && a.starts_at < nowIso).map((a) => ({ at: a.starts_at, entity_id: a.entity_id as EntityId | null, label: a.service })),
    ...acts.filter((a) => a.kind === "visite").map((a) => ({ at: a.created_at, entity_id: a.entity_id, label: a.body })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 3);

  // 3 derniers échanges (notes, appels, messages)
  const exchangeRows = acts.filter((a) => EXCHANGE_KINDS.includes(a.kind)).slice(0, 3);
  const authorIds = [...new Set(exchangeRows.map((a) => a.author_id).filter(Boolean))] as string[];
  const { data: authors } = authorIds.length ? await supabase.from("profiles").select("id, full_name").in("id", authorIds) : { data: [] };
  const names = new Map(((authors ?? []) as Pick<Profile, "id" | "full_name">[]).map((p) => [p.id, p.full_name]));

  const bal = balances.get(id);
  return {
    id: contact.id,
    full_name: contact.full_name,
    status: contact.status,
    phone: contact.phone,
    email: contact.email,
    whatsapp: contact.whatsapp_optin !== false ? waLink(contact.phone) : null,
    guardian_name: contact.guardian_name,
    entity_ids: contact.entity_ids.filter((e) => entity(e)),
    tags: contact.tags ?? [],
    alerts,
    subs,
    due_mad: Math.round(due * 100) / 100,
    points: bal ? Math.round(bal.balance) : 0,
    next_appt: next ? { id: next.id, starts_at: next.starts_at, service: next.service, entity_id: next.entity_id } : null,
    visits,
    exchanges: exchangeRows.map((a) => ({
      id: a.id,
      kind: a.kind,
      body: a.body,
      at: a.created_at,
      author: a.author_id ? (a.author_id === me.id ? "Moi" : (names.get(a.author_id) ?? null)) : null,
      can_delete: canDeleteNote(me, a),
    })),
  };
}

export type QuickNoteResult = { ok: boolean; error?: string };

/** Note rapide ajoutée depuis l'aperçu, sans quitter la page */
export async function addQuickNote(contactId: string, body: string): Promise<QuickNoteResult> {
  const text = typeof body === "string" ? body.trim() : "";
  if (!text) return { ok: false, error: "Écrivez quelques mots avant d'enregistrer." };
  const ctx = await visibleContact(contactId);
  if (!ctx) return { ok: false, error: "Client introuvable ou hors de votre périmètre." };
  const scope = await getScope();
  const entity_id = scope.current?.id ?? ctx.contact.entity_ids.find((e) => ctx.allowed.includes(e)) ?? null;
  const { error } = await ctx.supabase.from("activities").insert({ contact_id: contactId, entity_id, kind: "note", body: text.slice(0, 2000), author_id: ctx.me.id });
  if (error) return { ok: false, error: "Impossible d'enregistrer la note. Réessayez." };
  revalidatePath(`/contacts/${contactId}`);
  return { ok: true };
}

/** Supprime une note / un échange (annulable 5 s) */
export async function deleteQuickNote(activityId: string): Promise<QuickNoteResult> {
  if (typeof activityId !== "string" || !activityId) return { ok: false, error: "Note introuvable." };
  const supabase = await createClient();
  const { data } = await supabase.from("activities").select("*").eq("id", activityId).maybeSingle();
  const act = data as Activity | null;
  if (!act) return { ok: false, error: "Note introuvable." };
  const ctx = await visibleContact(act.contact_id);
  if (!ctx || !canDeleteNote(ctx.me, act)) return { ok: false, error: "Vous ne pouvez supprimer que vos propres notes." };
  const { error } = await supabase.from("activities").delete().eq("id", activityId);
  if (error) return { ok: false, error: "Impossible de supprimer la note." };
  revalidatePath(`/contacts/${act.contact_id}`);
  const undo = await recordUndo("note.suppression", { ops: [{ op: "restore", table: "activities", rows: [act] }], message: "Note restaurée" });
  await flash("Note supprimée", "success", { undo });
  return { ok: true };
}
