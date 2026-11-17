"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile, getScope } from "@/lib/auth";
import { flash } from "@/lib/flash";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/settings";
import { entity, type EntityId } from "@/lib/entities";
import { BOOKABLE, bookingRef, cmiConfigured, computeSlots, publicDb } from "@/lib/access";
import { addDaysKey, agadirToIso, dayKey, fmtDate, str } from "@/lib/utils";
import type { Appointment, CatalogItem, Contact, Profile } from "@/lib/types";
import type { DepositStatus, OnlineBooking } from "@/lib/types-access";
import type { FormState } from "@/components/action-form";
import { formatPhone, phoneDigits } from "@/components/contacts/helpers";

const MAX_DAYS_AHEAD = 60;

/** Réglages lus côté serveur (page publique : sans session) */
async function publicSettings(): Promise<Settings> {
  const { data } = await publicDb().from("settings").select("*").eq("id", 1).maybeSingle();
  return { ...DEFAULT_SETTINGS, ...((data as Partial<Settings> | null) ?? {}) };
}

/** Prestation réservable en ligne */
async function loadItem(entityId: string, itemId: string) {
  if (!BOOKABLE.includes(entityId as EntityId)) return null;
  const { data } = await publicDb().from("catalog_items").select("*").eq("id", itemId).maybeSingle();
  const item = data as CatalogItem | null;
  if (!item || item.entity_id !== entityId || item.kind !== "prestation" || !item.active) return null;
  return item;
}

function validDate(date: string | null) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const today = dayKey();
  return date >= today && date <= addDaysKey(today, MAX_DAYS_AHEAD);
}

/** Créneaux libres d'une journée pour une prestation */
async function slotsFor(item: CatalogItem, date: string) {
  const db = publicDb();
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

/** Page publique : heures disponibles (« HH:MM ») */
export async function fetchSlots(entityId: string, itemId: string, date: string): Promise<string[]> {
  if (!validDate(date)) return [];
  const item = await loadItem(String(entityId), String(itemId));
  if (!item) return [];
  return (await slotsFor(item, date)).map((s) => s.time);
}

/** Page publique : crée (ou retrouve) le client, le rendez-vous, la réservation et la tâche de confirmation */
export async function createOnlineBooking(_state: FormState, fd: FormData): Promise<FormState> {
  if (str(fd.get("website"))) return { error: "Réservation impossible." }; // champ piège anti-robots
  const entityId = str(fd.get("entity_id")) ?? "";
  const itemId = str(fd.get("item_id")) ?? "";
  const date = str(fd.get("date"));
  const time = str(fd.get("time"));
  const fullName = (str(fd.get("full_name")) ?? "").replace(/\s+/g, " ").slice(0, 80);
  const phone = formatPhone(str(fd.get("phone")));
  const email = str(fd.get("email"))?.toLowerCase().slice(0, 120) ?? null;

  const item = await loadItem(entityId, itemId);
  if (!item) return { error: "Choisissez une prestation." };
  if (!validDate(date) || !time || !/^\d{2}:\d{2}$/.test(time)) return { error: "Choisissez une date et un horaire." };
  if (fullName.length < 3) return { error: "Indiquez votre nom et prénom." };
  const digits = phoneDigits(phone);
  if (!phone || digits.length < 9 || digits.length > 13) return { error: "Indiquez un numéro de téléphone valide (ex. 06 12 34 56 78)." };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "L'adresse e-mail n'est pas valide." };
  if (fd.get("consent") !== "on") return { error: "Merci d'accepter l'utilisation de vos coordonnées pour ce rendez-vous." };

  const slot = (await slotsFor(item, date!)).find((s) => s.time === time);
  if (!slot) return { error: "Ce créneau vient d'être réservé. Choisissez un autre horaire." };

  const db = publicDb();
  const eid = item.entity_id;

  // Client existant (même téléphone) ou nouveau prospect
  const { data: sameRows } = await db.from("contacts").select("*").ilike("phone", `%${digits.slice(-2)}%`);
  let contact = ((sameRows ?? []) as Contact[]).find((c) => phoneDigits(c.phone) === digits) ?? null;
  if (contact) {
    const patch: Partial<Contact> = {};
    if (!contact.entity_ids.includes(eid)) patch.entity_ids = [...contact.entity_ids, eid];
    if (!contact.email && email) patch.email = email;
    if (Object.keys(patch).length) await db.from("contacts").update(patch).eq("id", contact.id);
  } else {
    const { data: created, error } = await db
      .from("contacts")
      .insert({
        full_name: fullName,
        phone,
        email,
        sex: eid === "evolve" ? "H" : null,
        birth_date: null,
        city: "Agadir",
        source: "site",
        tags: [],
        entity_ids: [eid],
        status: "prospect",
        guardian_name: null,
        notes: null,
        owner_id: null,
        whatsapp_optin: true,
      })
      .select()
      .single();
    if (error || !created) return { error: "La réservation n'a pas pu être enregistrée. Réessayez ou appelez-nous." };
    contact = created as Contact;
  }

  const startsAt = agadirToIso(date!, time);
  const { data: appt, error: apptError } = await db
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
      notes: "Réservation en ligne",
    })
    .select()
    .single();
  if (apptError || !appt) return { error: "La réservation n'a pas pu être enregistrée. Réessayez ou appelez-nous." };

  const settings = await publicSettings();
  const deposit = settings.cmi_enabled && settings.booking_deposit_mad > 0 ? Math.min(settings.booking_deposit_mad, item.price_mad || settings.booking_deposit_mad) : 0;
  const depositStatus: DepositStatus = deposit > 0 ? (cmiConfigured(settings.cmi_client_id) ? "a_payer" : "accueil") : "aucun";

  let booking: OnlineBooking | null = null;
  for (let i = 0; i < 3 && !booking; i++) {
    const { data } = await db
      .from("online_bookings")
      .insert({
        ref: bookingRef(),
        entity_id: eid,
        contact_id: contact.id,
        appointment_id: (appt as Appointment).id,
        item_id: item.id,
        service: item.name,
        starts_at: startsAt,
        duration_min: item.duration_min ?? 60,
        price_mad: item.price_mad,
        full_name: fullName,
        phone,
        email,
        status: "nouvelle",
        source: "en_ligne",
        deposit_mad: deposit,
        deposit_status: depositStatus,
      })
      .select()
      .single();
    booking = (data as OnlineBooking | null) ?? null;
  }
  if (!booking) return { error: "La réservation n'a pas pu être enregistrée. Réessayez ou appelez-nous." };

  const when = `${fmtDate(startsAt, { weekday: "long", day: "numeric", month: "long" })} à ${time}`;
  await Promise.all([
    db.from("tasks").insert({
      title: "Confirmer la réservation en ligne",
      contact_id: contact.id,
      lead_id: null,
      entity_id: eid,
      assigned_to: null,
      due_date: dayKey(),
      priority: "haute",
      done: false,
      created_by: null,
    }),
    db.from("activities").insert({
      contact_id: contact.id,
      entity_id: eid,
      kind: "rdv",
      body: `Réservation en ligne (${booking.ref}) : ${item.name} le ${when}${deposit ? ` · acompte ${deposit} MAD ${depositStatus === "a_payer" ? "en ligne" : "à l'accueil"}` : ""}`,
      author_id: null,
    }),
  ]);

  redirect(depositStatus === "a_payer" ? `/reserver/paiement/${booking.id}` : `/reserver/confirmation/${booking.id}`);
}

/** Équipe : confirme une réservation en ligne (RDV confirmé, tâche cochée) */
export async function confirmOnlineBooking(id: string): Promise<void> {
  const [profile, scope] = await Promise.all([getProfile(), getScope()]);
  const supabase = await createClient();
  const { data } = await supabase.from("online_bookings").select("*").eq("id", id).in("entity_id", scope.allowed.map((e) => e.id)).maybeSingle();
  const b = data as OnlineBooking | null;
  if (!b || b.status !== "nouvelle") return;
  await supabase.from("online_bookings").update({ status: "confirmee" }).eq("id", id);
  if (b.appointment_id) await supabase.from("appointments").update({ status: "confirme" }).eq("id", b.appointment_id).eq("status", "prevu");
  await supabase.from("tasks").update({ done: true }).eq("contact_id", b.contact_id).eq("title", "Confirmer la réservation en ligne").eq("done", false);
  await supabase.from("activities").insert({
    contact_id: b.contact_id,
    entity_id: b.entity_id,
    kind: "rdv",
    body: `Réservation en ligne ${b.ref} confirmée (${entity(b.entity_id)?.short ?? b.entity_id})`,
    author_id: profile.id,
  });
  await flash("Réservation confirmée");
  revalidatePath("/acces");
  revalidatePath("/agenda");
}
