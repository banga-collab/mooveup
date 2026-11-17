"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile, getScope } from "@/lib/auth";
import { entity, type EntityId } from "@/lib/entities";
import { APPT_STATUS_LABEL, addDaysKey, agadirToIso, fmtDate, fmtTime, isoToAgadir, parseNum, str } from "@/lib/utils";
import type { Appointment, AppointmentStatus, CatalogItem, Contact } from "@/lib/types";
import type { FormState } from "@/components/action-form";

const STATUSES: AppointmentStatus[] = ["prevu", "confirme", "arrive", "termine", "absent", "annule"];

function overlaps(aStart: number, aDur: number, bStart: number, bDur: number) {
  return aStart < bStart + bDur * 60000 && bStart < aStart + aDur * 60000;
}

/** Crée ou modifie un rendez-vous (champ caché `id` pour la modification). */
export async function saveAppointment(_state: FormState, formData: FormData): Promise<FormState> {
  const [profile, scope] = await Promise.all([getProfile(), getScope()]);
  const supabase = await createClient();

  const id = str(formData.get("id"));
  const contactId = str(formData.get("contact_id"));
  const entityId = str(formData.get("entity_id")) as EntityId | null;
  const itemId = str(formData.get("item_id"));
  let service = str(formData.get("service"));
  const staffId = str(formData.get("staff_id"));
  const date = str(formData.get("date"));
  const time = str(formData.get("time"));
  const duration = Math.round(parseNum(formData.get("duration_min")) ?? 0);
  const price = parseNum(formData.get("price_mad")) ?? 0;
  const room = str(formData.get("room"));
  const notes = str(formData.get("notes"));
  const statusRaw = str(formData.get("status")) as AppointmentStatus | null;

  if (!contactId) return { error: "Choisissez le client." };
  if (!entityId || !scope.allowed.some((e) => e.id === entityId)) return { error: "Choisissez un établissement autorisé." };
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Indiquez la date du rendez-vous." };
  if (!time || !/^\d{1,2}:\d{2}$/.test(time)) return { error: "Indiquez l'heure du rendez-vous." };
  if (duration < 5 || duration > 600) return { error: "La durée doit être comprise entre 5 et 600 minutes." };
  if (price < 0) return { error: "Le prix ne peut pas être négatif." };

  // Prestation du catalogue (doit appartenir à l'établissement)
  if (itemId) {
    const { data: item } = await supabase.from("catalog_items").select("*").eq("id", itemId).maybeSingle();
    const it = item as CatalogItem | null;
    if (!it || it.entity_id !== entityId) return { error: "Cette prestation n'est pas proposée par l'établissement choisi." };
    if (!service) service = it.name;
  }
  if (!service) return { error: "Indiquez la prestation." };

  const { data: contactRow } = await supabase.from("contacts").select("*").eq("id", contactId).maybeSingle();
  const contact = contactRow as Contact | null;
  if (!contact) return { error: "Client introuvable." };

  // Rendez-vous existant (modification)
  let existing: Appointment | null = null;
  if (id) {
    const { data } = await supabase.from("appointments").select("*").eq("id", id).in("entity_id", scope.allowed.map((e) => e.id)).maybeSingle();
    existing = data as Appointment | null;
    if (!existing) return { error: "Rendez-vous introuvable." };
  }

  const startsAt = agadirToIso(date, time);
  const startMs = new Date(startsAt).getTime();

  // Conflit praticien : bloquant
  if (staffId) {
    const { data: sameDay } = await supabase
      .from("appointments")
      .select("*")
      .eq("staff_id", staffId)
      .gte("starts_at", agadirToIso(addDaysKey(date, -1), "00:00"))
      .lt("starts_at", agadirToIso(addDaysKey(date, 1), "00:00"));
    const clash = ((sameDay ?? []) as Appointment[]).find(
      (a) => a.id !== id && a.status !== "annule" && a.status !== "absent" && overlaps(startMs, duration, new Date(a.starts_at).getTime(), a.duration_min),
    );
    if (clash) {
      const end = new Date(new Date(clash.starts_at).getTime() + clash.duration_min * 60000).toISOString();
      return { error: `Le praticien a déjà un rendez-vous de ${fmtTime(clash.starts_at)} à ${fmtTime(end)} (${clash.service}). Choisissez un autre horaire ou un autre praticien.` };
    }
  }

  const status = statusRaw && STATUSES.includes(statusRaw) ? statusRaw : existing?.status ?? "prevu";
  const row = {
    entity_id: entityId,
    contact_id: contactId,
    item_id: itemId,
    service,
    staff_id: staffId,
    starts_at: startsAt,
    duration_min: duration,
    status,
    room,
    price_mad: price,
    notes,
  };

  if (existing) {
    const { error } = await supabase.from("appointments").update(row).eq("id", existing.id);
    if (error) return { error: "Impossible d'enregistrer le rendez-vous." };
    const moved = existing.starts_at !== startsAt;
    if (moved) {
      await supabase.from("activities").insert({
        contact_id: contactId,
        entity_id: entityId,
        kind: "rdv",
        body: `Rendez-vous déplacé : ${service} le ${fmtDate(startsAt, { weekday: "long", day: "numeric", month: "long" })} à ${fmtTime(startsAt)} (${entity(entityId)?.short ?? ""})`,
        author_id: profile.id,
      });
    }
  } else {
    const { error } = await supabase.from("appointments").insert(row);
    if (error) return { error: "Impossible de créer le rendez-vous." };
    await supabase.from("activities").insert({
      contact_id: contactId,
      entity_id: entityId,
      kind: "rdv",
      body: `Rendez-vous pris : ${service} le ${fmtDate(startsAt, { weekday: "long", day: "numeric", month: "long" })} à ${fmtTime(startsAt)} (${entity(entityId)?.short ?? ""})`,
      author_id: profile.id,
    });
  }

  // Le client fréquente désormais cet établissement
  if (!contact.entity_ids.includes(entityId)) {
    await supabase.from("contacts").update({ entity_ids: [...contact.entity_ids, entityId] }).eq("id", contactId);
  }

  revalidatePath("/agenda");
  revalidatePath("/");
  revalidatePath(`/contacts/${contactId}`);
  redirect(`/agenda?date=${isoToAgadir(startsAt).date}`);
}

/** Change le statut d'un rendez-vous (actions rapides). */
export async function setAppointmentStatus(id: string, status: AppointmentStatus) {
  if (!STATUSES.includes(status)) return;
  const [profile, scope] = await Promise.all([getProfile(), getScope()]);
  const supabase = await createClient();
  const { data } = await supabase.from("appointments").select("*").eq("id", id).in("entity_id", scope.allowed.map((e) => e.id)).maybeSingle();
  const appt = data as Appointment | null;
  if (!appt || appt.status === status) return;

  await supabase.from("appointments").update({ status }).eq("id", id);
  if (status === "absent" || status === "annule" || status === "termine") {
    await supabase.from("activities").insert({
      contact_id: appt.contact_id,
      entity_id: appt.entity_id,
      kind: "rdv",
      body: `Rendez-vous ${APPT_STATUS_LABEL[status].toLowerCase()} : ${appt.service} du ${fmtDate(appt.starts_at, { day: "numeric", month: "long" })} à ${fmtTime(appt.starts_at)}`,
      author_id: profile.id,
    });
  }
  revalidatePath("/agenda");
  revalidatePath("/");
  revalidatePath(`/contacts/${appt.contact_id}`);
}

/** Supprime un rendez-vous puis revient à l'agenda du jour concerné. */
export async function deleteAppointment(id: string) {
  const scope = await getScope();
  const supabase = await createClient();
  const { data } = await supabase.from("appointments").select("*").eq("id", id).in("entity_id", scope.allowed.map((e) => e.id)).maybeSingle();
  const appt = data as Appointment | null;
  if (!appt) redirect("/agenda");
  await supabase.from("appointments").delete().eq("id", id);
  revalidatePath("/agenda");
  revalidatePath("/");
  revalidatePath(`/contacts/${appt.contact_id}`);
  redirect(`/agenda?date=${isoToAgadir(appt.starts_at).date}`);
}
