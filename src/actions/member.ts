"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEMO, demoDb } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";
import { flash } from "@/lib/flash";
import { BOOKABLE, bookingRef, cmiConfigured, computeSlots, siteOrigin } from "@/lib/access";
import { DEMO_MEMBER_PASSWORD, MEMBER_COOKIE, demoMemberAccounts, memberSettings, memberWriteDb, requireMember } from "@/lib/member-auth";
import { ENTITY_IDS, entity, type EntityId } from "@/lib/entities";
import { addDaysKey, agadirToIso, dayKey, fmtDate, fmtTime, mad, str } from "@/lib/utils";
import { formatPhone, phoneDigits } from "@/components/contacts/helpers";
import type { Appointment, CatalogItem, Contact, Profile, Subscription, TaskPriority } from "@/lib/types";
import type { MemberAccount, MemberRequest } from "@/lib/types-member";
import type { FormState } from "@/components/action-form";

const MAX_DAYS_AHEAD = 60;
const CANCEL_LIMIT_MS = 24 * 3600_000;
const COOKIE_OPTS = { path: "/", httpOnly: true, sameSite: "lax" as const, maxAge: 60 * 60 * 24 * 60 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ---------- Journal + tâche pour l'accueil ---------- */

async function notifyDesk(
  db: SupabaseClient,
  input: { contactId: string; entityId: EntityId; body: string; kind?: "rdv" | "note"; task?: { title: string; priority?: TaskPriority; assignedTo?: string | null } },
) {
  await Promise.all([
    db.from("activities").insert({ contact_id: input.contactId, entity_id: input.entityId, kind: input.kind ?? "note", body: input.body, author_id: null }),
    input.task
      ? db.from("tasks").insert({
          title: input.task.title,
          contact_id: input.contactId,
          lead_id: null,
          entity_id: input.entityId,
          assigned_to: input.task.assignedTo ?? null,
          due_date: dayKey(),
          priority: input.task.priority ?? "normale",
          done: false,
          created_by: null,
        })
      : Promise.resolve(null),
  ]);
}

function refresh(...paths: string[]) {
  for (const p of ["/espace", ...paths]) revalidatePath(p);
}

/* ---------- Connexion ---------- */

/** Connexion de l'adhérent (e-mail ou téléphone + mot de passe) */
export async function memberLogin(_s: FormState, fd: FormData): Promise<FormState> {
  const id = (str(fd.get("id")) ?? "").toLowerCase();
  const password = str(fd.get("password")) ?? "";
  if (!id || !password) return { error: "Indiquez votre e-mail (ou téléphone) et votre mot de passe." };
  const digits = phoneDigits(id);
  const byId = (a: MemberAccount) => (id.includes("@") ? a.email?.toLowerCase() === id : digits.length >= 9 && phoneDigits(a.phone) === digits);

  if (DEMO) {
    const account = demoMemberAccounts().find(byId);
    if (!account || password !== DEMO_MEMBER_PASSWORD) return { error: "Identifiants incorrects. En démonstration, utilisez un des comptes ci-dessous." };
    account.last_login_at = new Date().toISOString();
    (await cookies()).set(MEMBER_COOKIE, account.user_id, COOKIE_OPTS);
    redirect("/espace");
  }

  let email = id;
  if (!id.includes("@")) {
    if (digits.length < 9) return { error: "Indiquez une adresse e-mail ou un numéro de téléphone valide." };
    const { data } = await memberWriteDb().from("member_accounts").select("email, phone").ilike("phone", `%${digits.slice(-2)}%`);
    const found = ((data ?? []) as Pick<MemberAccount, "email" | "phone">[]).find((a) => phoneDigits(a.phone) === digits);
    if (!found?.email) return { error: "Aucun espace adhérent avec ce numéro. Connectez-vous avec votre e-mail ou créez votre espace." };
    email = found.email;
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: /confirm/i.test(error.message) ? "Confirmez d'abord votre adresse e-mail (lien reçu par e-mail)." : "E-mail ou mot de passe incorrect." };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: acc } = await supabase.from("member_accounts").select("id").eq("user_id", user?.id ?? "").maybeSingle();
  if (!acc) {
    await supabase.auth.signOut();
    return { error: "Ce compte appartient à l'équipe Moov'Up : utilisez la connexion équipe." };
  }
  await memberWriteDb().from("member_accounts").update({ last_login_at: new Date().toISOString() }).eq("id", (acc as { id: string }).id);
  redirect("/espace");
}

/** Démo : entrer directement avec un compte adhérent de démonstration */
export async function demoMemberLogin(fd: FormData): Promise<void> {
  if (!DEMO) return;
  const userId = str(fd.get("user_id"));
  const account = demoMemberAccounts().find((a) => a.user_id === userId);
  if (!account) return;
  account.last_login_at = new Date().toISOString();
  (await cookies()).set(MEMBER_COOKIE, account.user_id, COOKIE_OPTS);
  redirect("/espace");
}

export async function memberLogout(): Promise<void> {
  if (DEMO) (await cookies()).delete(MEMBER_COOKIE);
  else {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/espace/connexion");
}

/** Création de l'espace : compte Auth « member », rattaché à la fiche client par e-mail / téléphone vérifié */
export async function memberSignup(_s: FormState, fd: FormData): Promise<FormState> {
  const fullName = (str(fd.get("full_name")) ?? "").replace(/\s+/g, " ").slice(0, 80);
  const email = str(fd.get("email"))?.toLowerCase().slice(0, 120) ?? "";
  const phone = formatPhone(str(fd.get("phone")));
  const password = str(fd.get("password")) ?? "";
  if (fullName.length < 3) return { error: "Indiquez votre nom et prénom." };
  if (!EMAIL_RE.test(email)) return { error: "Indiquez une adresse e-mail valide : elle sert à vous connecter." };
  const digits = phoneDigits(phone);
  if (phone && (digits.length < 9 || digits.length > 13)) return { error: "Le numéro de téléphone n'est pas valide (ex. 06 12 34 56 78)." };
  if (password.length < 8) return { error: "Choisissez un mot de passe d'au moins 8 caractères." };
  if (fd.get("consent") !== "on") return { error: "Merci d'accepter l'utilisation de vos coordonnées pour créer votre espace." };

  if (DEMO) {
    const db = demoDb();
    const accounts = demoMemberAccounts();
    if (accounts.some((a) => a.email?.toLowerCase() === email)) return { error: "Un espace existe déjà avec cet e-mail : connectez-vous." };
    // En démo, l'e-mail est considéré comme vérifié : rattachement par e-mail puis téléphone
    const contacts = (db.contacts ?? []) as Contact[];
    const contact = contacts.find((c) => c.email?.toLowerCase() === email) ?? (digits.length >= 9 ? contacts.find((c) => phoneDigits(c.phone) === digits) : undefined) ?? null;
    if (contact && accounts.some((a) => a.contact_id === contact.id)) return { error: "Cette fiche client a déjà un espace : connectez-vous avec l'e-mail utilisé à la création." };
    const account: MemberAccount = { id: crypto.randomUUID(), user_id: crypto.randomUUID(), contact_id: contact?.id ?? null, email, phone, last_login_at: new Date().toISOString(), created_at: new Date().toISOString() };
    accounts.push(account);
    if (contact) await notifyDesk(memberWriteDb(), { contactId: contact.id, entityId: (contact.entity_ids[0] ?? "sports") as EntityId, body: "Espace adhérent créé par le client" });
    (await cookies()).set(MEMBER_COOKIE, account.user_id, COOKIE_OPTS);
    await flash("Espace créé, bienvenue !");
    redirect("/espace");
  }

  const supabase = await createClient();
  const origin = await siteOrigin();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { kind: "member", full_name: fullName, phone }, emailRedirectTo: `${origin}/espace/confirmation` },
  });
  if (error) return { error: /registered|exists/i.test(error.message) ? "Un compte existe déjà avec cet e-mail : connectez-vous." : "La création de l'espace a échoué. Réessayez dans un instant." };
  if (data.session) redirect("/espace");
  redirect("/espace/inscription?envoye=1");
}

/* ---------- Rendez-vous ---------- */

function validDate(date: string | null) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const today = dayKey();
  return date >= today && date <= addDaysKey(today, MAX_DAYS_AHEAD);
}

/** Créneaux libres (même logique que la réservation publique : computeSlots de lib/access) */
async function freeSlots(db: SupabaseClient, item: CatalogItem, date: string) {
  const [{ data: staffRows }, { data: apptRows }] = await Promise.all([
    db.from("profiles").select("id, role, entity_ids, active").eq("role", "staff").eq("active", true),
    db
      .from("appointments")
      .select("starts_at, duration_min, staff_id, status")
      .eq("entity_id", item.entity_id)
      .gte("starts_at", agadirToIso(date, "00:00"))
      .lt("starts_at", agadirToIso(addDaysKey(date, 1), "00:00")),
  ]);
  const staffIds = ((staffRows ?? []) as Pick<Profile, "id" | "entity_ids">[]).filter((p) => p.entity_ids?.includes(item.entity_id)).map((p) => p.id);
  return computeSlots({
    date,
    entityId: item.entity_id,
    duration: item.duration_min ?? 60,
    staffIds,
    appts: (apptRows ?? []) as Pick<Appointment, "starts_at" | "duration_min" | "staff_id" | "status">[],
  });
}

/** L'adhérent réserve un rendez-vous (RDV + réservation en ligne + activité + tâche de confirmation pour l'accueil) */
export async function bookMemberAppointment(_s: FormState, fd: FormData): Promise<FormState> {
  const { contact } = await requireMember();
  const entityId = str(fd.get("entity_id")) ?? "";
  const itemId = str(fd.get("item_id")) ?? "";
  const date = str(fd.get("date"));
  const time = str(fd.get("time"));
  const note = str(fd.get("note"))?.slice(0, 300) ?? null;
  if (!BOOKABLE.includes(entityId as EntityId)) return { error: "Choisissez un établissement." };
  if (!validDate(date) || !time || !/^\d{2}:\d{2}$/.test(time)) return { error: "Choisissez une date et un horaire." };

  const db = memberWriteDb();
  const { data: itemRow } = await db.from("catalog_items").select("*").eq("id", itemId).maybeSingle();
  const item = itemRow as CatalogItem | null;
  if (!item || item.entity_id !== entityId || item.kind !== "prestation" || !item.active) return { error: "Cette prestation n'est plus réservable en ligne. Choisissez-en une autre." };

  const slot = (await freeSlots(db, item, date!)).find((s) => s.time === time);
  if (!slot) return { error: "Ce créneau vient d'être réservé. Choisissez un autre horaire." };
  const startsAt = agadirToIso(date!, time);
  const { data: mine } = await db.from("appointments").select("id, status").eq("contact_id", contact.id).eq("starts_at", startsAt);
  if (((mine ?? []) as Pick<Appointment, "status">[]).some((a) => a.status !== "annule")) return { error: "Vous avez déjà un rendez-vous à cette heure-là." };

  const eid = item.entity_id;
  if (!contact.entity_ids.includes(eid)) await db.from("contacts").update({ entity_ids: [...contact.entity_ids, eid] }).eq("id", contact.id);

  const { data: appt, error } = await db
    .from("appointments")
    .insert({
      entity_id: eid,
      contact_id: contact.id,
      item_id: item.id,
      service: item.name,
      staff_id: slot.staffId,
      starts_at: startsAt,
      duration_min: item.duration_min ?? 60,
      status: "prevu",
      room: null,
      price_mad: item.price_mad,
      notes: note ? `Espace adhérent : ${note}` : "Réservé depuis l'espace adhérent",
    })
    .select()
    .single();
  if (error || !appt) return { error: "Le rendez-vous n'a pas pu être enregistré. Réessayez ou appelez-nous." };

  const ref = bookingRef();
  await db.from("online_bookings").insert({
    ref,
    entity_id: eid,
    contact_id: contact.id,
    appointment_id: (appt as Appointment).id,
    item_id: item.id,
    service: item.name,
    starts_at: startsAt,
    duration_min: item.duration_min ?? 60,
    price_mad: item.price_mad,
    full_name: contact.full_name,
    phone: contact.phone ?? "",
    email: contact.email,
    status: "nouvelle",
    source: "en_ligne",
    deposit_mad: 0,
    deposit_status: "aucun",
  });

  const when = `${fmtDate(startsAt, { weekday: "long", day: "numeric", month: "long" })} à ${time}`;
  await notifyDesk(db, {
    contactId: contact.id,
    entityId: eid,
    kind: "rdv",
    body: `Réservation depuis l'espace adhérent (${ref}) : ${item.name} le ${when}${note ? ` · « ${note} »` : ""}`,
    // Même intitulé que la réservation publique : la confirmation depuis l'accueil coche la tâche
    task: { title: "Confirmer la réservation en ligne", priority: "haute" },
  });
  await flash("Rendez-vous réservé");
  refresh("/espace/rdv");
  redirect("/espace/rdv");
}

/** L'adhérent annule un rendez-vous (jusqu'à 24 h avant) */
export async function cancelMemberAppointment(fd: FormData): Promise<void> {
  const { contact } = await requireMember();
  const id = str(fd.get("id"));
  if (!id) return;
  const db = memberWriteDb();
  const { data } = await db.from("appointments").select("*").eq("id", id).eq("contact_id", contact.id).maybeSingle();
  const appt = data as Appointment | null;
  if (!appt || !["prevu", "confirme"].includes(appt.status)) {
    await flash("Ce rendez-vous ne peut plus être annulé.", "error");
    refresh("/espace/rdv");
    return;
  }
  if (new Date(appt.starts_at).getTime() - Date.now() < CANCEL_LIMIT_MS) {
    await flash("Moins de 24 h avant le rendez-vous : appelez-nous pour annuler.", "error");
    refresh("/espace/rdv");
    return;
  }
  await db.from("appointments").update({ status: "annule" }).eq("id", appt.id);
  await db.from("online_bookings").update({ status: "annulee" }).eq("appointment_id", appt.id);
  const when = `${fmtDate(appt.starts_at, { weekday: "long", day: "numeric", month: "long" })} à ${fmtTime(appt.starts_at)}`;
  await notifyDesk(db, {
    contactId: contact.id,
    entityId: appt.entity_id,
    kind: "rdv",
    body: `Rendez-vous annulé par le client depuis son espace : ${appt.service} du ${when}`,
    task: { title: `Créneau libéré : ${appt.service} du ${fmtDate(appt.starts_at, { day: "numeric", month: "short" })} à ${fmtTime(appt.starts_at)} (annulé par le client)`, priority: "normale" },
  });
  await flash("Rendez-vous annulé");
  refresh("/espace/rdv");
}

/* ---------- Abonnements ---------- */

function requestRef() {
  const a = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 5; i++) s += a[Math.floor(Math.random() * a.length)];
  return `A-${s}`;
}

/** Renouvellement : paiement en ligne CMI si configuré, sinon demande transmise à l'accueil */
export async function requestRenewal(fd: FormData): Promise<void> {
  const { contact } = await requireMember();
  const subId = str(fd.get("subscription_id"));
  if (!subId) return;
  const db = memberWriteDb();
  const { data } = await db.from("subscriptions").select("*").eq("id", subId).eq("contact_id", contact.id).maybeSingle();
  const sub = data as Subscription | null;
  if (!sub) return;

  // Demande déjà en cours pour cet abonnement
  const { data: openRows } = await db.from("member_requests").select("*").eq("subscription_id", sub.id).in("status", ["a_payer", "accueil"]);
  const open = ((openRows ?? []) as MemberRequest[])[0];
  if (open) {
    if (open.status === "a_payer") redirect(`/espace/paiement/${open.id}`);
    await flash("Demande déjà transmise : réglez à l'accueil", "info");
    refresh("/espace/abonnements");
    return;
  }

  let item: CatalogItem | null = null;
  if (sub.item_id) {
    const { data: it } = await db.from("catalog_items").select("*").eq("id", sub.item_id).maybeSingle();
    item = it as CatalogItem | null;
  }
  if (!item || !item.active) {
    const { data: same } = await db.from("catalog_items").select("*").eq("entity_id", sub.entity_id).eq("name", sub.name).eq("active", true).maybeSingle();
    item = (same as CatalogItem | null) ?? item;
  }
  const amount = Number(item?.price_mad ?? sub.price_mad);
  const settings = await memberSettings();
  const online = settings.cmi_enabled && amount > 0 && cmiConfigured(settings.cmi_client_id);

  const { data: created } = await db
    .from("member_requests")
    .insert({
      ref: requestRef(),
      kind: "renouvellement",
      contact_id: contact.id,
      entity_id: sub.entity_id,
      subscription_id: sub.id,
      item_id: item?.id ?? sub.item_id,
      label: item?.name ?? sub.name,
      amount_mad: amount,
      status: online ? "a_payer" : "accueil",
      task_id: null,
    })
    .select()
    .single();
  const req = created as MemberRequest | null;
  if (!req) {
    await flash("La demande n'a pas pu être envoyée. Réessayez ou passez à l'accueil.", "error");
    return;
  }
  await notifyDesk(db, {
    contactId: contact.id,
    entityId: sub.entity_id,
    body: `Renouvellement demandé depuis l'espace adhérent (${req.ref}) : ${req.label}, ${mad(amount)}${online ? " · paiement en ligne en cours" : " · à régler à l'accueil"}`,
    task: { title: `Renouveler l'abonnement : ${req.label} (${mad(amount)}${online ? ", paiement en ligne" : ", à encaisser"})`, priority: "haute" },
  });
  if (online) redirect(`/espace/paiement/${req.id}`);
  await flash("Demande envoyée : réglez à l'accueil");
  refresh("/espace/abonnements");
}

/* ---------- Profil ---------- */

export async function updateMemberProfile(_s: FormState, fd: FormData): Promise<FormState> {
  const { contact, account } = await requireMember();
  const phone = formatPhone(str(fd.get("phone")));
  const email = str(fd.get("email"))?.toLowerCase().slice(0, 120) ?? null;
  const optin = fd.get("whatsapp_optin") === "on";
  const digits = phoneDigits(phone);
  if (!phone || digits.length < 9 || digits.length > 13) return { error: "Indiquez un numéro de téléphone valide (ex. 06 12 34 56 78)." };
  if (email && !EMAIL_RE.test(email)) return { error: "L'adresse e-mail n'est pas valide." };
  const db = memberWriteDb();
  await db.from("contacts").update({ phone, email, whatsapp_optin: optin }).eq("id", contact.id);
  await db.from("member_accounts").update({ phone }).eq("id", account.id);
  const changes = [phone !== contact.phone && "téléphone", email !== contact.email && "e-mail", optin !== contact.whatsapp_optin && (optin ? "WhatsApp activé" : "WhatsApp désactivé")].filter(Boolean);
  if (changes.length) {
    await notifyDesk(db, { contactId: contact.id, entityId: (contact.entity_ids[0] ?? "sports") as EntityId, body: `Coordonnées mises à jour par le client depuis son espace (${changes.join(", ")})` });
  }
  await flash("Coordonnées enregistrées");
  refresh("/espace/profil");
  return undefined;
}

export async function changeMemberPassword(_s: FormState, fd: FormData): Promise<FormState> {
  await requireMember();
  const password = str(fd.get("password")) ?? "";
  if (password.length < 8) return { error: "Choisissez un mot de passe d'au moins 8 caractères." };
  if (DEMO) return { error: "En démonstration, le mot de passe ne peut pas être changé (mot de passe commun : adherent2026)." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "Le mot de passe n'a pas pu être changé. Déconnectez-vous puis reconnectez-vous, et réessayez." };
  await flash("Mot de passe changé");
  refresh("/espace/profil");
  return undefined;
}

/* ---------- Avis ---------- */

function token() {
  const a = "abcdefghjkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}

export async function submitMemberReview(_s: FormState, fd: FormData): Promise<FormState> {
  const { contact } = await requireMember();
  const entityId = str(fd.get("entity_id")) as EntityId | null;
  const rating = Math.round(Number(fd.get("rating")));
  const comment = str(fd.get("comment"))?.slice(0, 1000) ?? null;
  if (!entityId || !ENTITY_IDS.includes(entityId)) return { error: "Choisissez l'établissement concerné." };
  if (!(rating >= 1 && rating <= 5)) return { error: "Choisissez une note de 1 à 5 étoiles." };
  const db = memberWriteDb();
  const now = new Date().toISOString();

  let assignedTo: string | null = null;
  if (rating <= 3) {
    const { data: people } = await db.from("profiles").select("*").eq("active", true);
    const team = (people ?? []) as Profile[];
    assignedTo = (team.find((p) => p.role === "manager" && p.entity_ids.includes(entityId)) ?? team.find((p) => p.role === "direction"))?.id ?? null;
  }
  await db.from("reviews").insert({
    token: token(),
    contact_id: contact.id,
    entity_id: entityId,
    appointment_id: null,
    sale_id: null,
    service: "Avis depuis l'espace adhérent",
    rating,
    comment,
    answered_at: now,
    handled: false,
    handled_at: null,
    handled_by: null,
    task_id: null,
  });
  await notifyDesk(db, {
    contactId: contact.id,
    entityId,
    body: `Avis client depuis son espace : ${rating}/5${comment ? ` « ${comment} »` : ""}`,
    task: rating <= 3 ? { title: `Avis ${rating}/5 de ${contact.full_name} (${entity(entityId)?.short ?? entityId}) : rappeler le client`, priority: "haute", assignedTo } : undefined,
  });
  await flash("Merci pour votre avis !");
  refresh("/espace/avis");
  return undefined;
}

