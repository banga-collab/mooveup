"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile, getScope } from "@/lib/auth";
import { entity, type EntityId } from "@/lib/entities";
import { APPT_STATUS_LABEL, addDaysKey, agadirToIso, fmtDate, fmtTime, isoToAgadir, parseNum, str } from "@/lib/utils";
import type { AppointmentStatus, CatalogItem, Contact, Profile } from "@/lib/types";
import type { AppointmentSeries, ApptSnapshot, QuickResult, SeriesAppointment, StatusSnapshot } from "@/lib/types-agenda";
import { REPEAT_LABEL } from "@/lib/types-agenda";
import type { FormState } from "@/components/action-form";
import { daysBetween, isFreq, MAX_OCCURRENCES, seriesDates, shortDay } from "@/components/agenda/recurrence";
import { flash } from "@/lib/flash";
import { saveAppointment } from "./agenda";

type DB = Awaited<ReturnType<typeof createClient>>;

const STATUSES: AppointmentStatus[] = ["prevu", "confirme", "arrive", "termine", "absent", "annule"];
const INACTIVE: AppointmentStatus[] = ["annule", "absent"];

const endIso = (iso: string, dur: number) => new Date(new Date(iso).getTime() + dur * 60000).toISOString();
const overlap = (aIso: string, aDur: number, bIso: string, bDur: number) => {
  const a = new Date(aIso).getTime();
  const b = new Date(bIso).getTime();
  return a < b + bDur * 60000 && b < a + aDur * 60000;
};

function refresh(contactId?: string) {
  revalidatePath("/agenda");
  revalidatePath("/");
  if (contactId) revalidatePath(`/contacts/${contactId}`);
}

async function loadAppt(supabase: DB, id: string) {
  const scope = await getScope();
  const { data } = await supabase.from("appointments").select("*").eq("id", id).in("entity_id", scope.allowed.map((e) => e.id)).maybeSingle();
  return data as SeriesAppointment | null;
}

/** Rendez-vous actifs d'un praticien entre deux dates (incluses) */
async function staffBusy(supabase: DB, staffId: string, from: string, to: string) {
  const { data } = await supabase
    .from("appointments")
    .select("*")
    .eq("staff_id", staffId)
    .gte("starts_at", agadirToIso(addDaysKey(from, -1), "00:00"))
    .lt("starts_at", agadirToIso(addDaysKey(to, 2), "00:00"));
  return ((data ?? []) as SeriesAppointment[]).filter((a) => !INACTIVE.includes(a.status));
}

async function staffName(supabase: DB, id: string | null) {
  if (!id) return null;
  const { data } = await supabase.from("profiles").select("full_name").eq("id", id).maybeSingle();
  return (data as { full_name: string } | null)?.full_name ?? null;
}

/* =====================================================================
 * Glisser-déposer : déplacer / redimensionner un rendez-vous
 * ===================================================================== */

/**
 * Déplace un rendez-vous (date, heure, praticien) et/ou change sa durée.
 * `staff_id` absent = praticien inchangé. Renvoie l'état précédent pour l'annulation.
 */
export async function moveAppointment(
  id: string,
  target: { date: string; time: string; staff_id?: string | null; duration_min?: number },
): Promise<QuickResult<ApptSnapshot>> {
  const profile = await getProfile();
  const supabase = await createClient();
  const appt = await loadAppt(supabase, id);
  if (!appt) return { ok: false, error: "Rendez-vous introuvable." };
  if (appt.status === "termine" || appt.status === "annule") return { ok: false, error: `Un rendez-vous ${APPT_STATUS_LABEL[appt.status].toLowerCase()} ne peut pas être déplacé.` };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(target.date) || !/^\d{2}:\d{2}$/.test(target.time)) return { ok: false, error: "Horaire invalide." };
  const duration = Math.round(target.duration_min ?? appt.duration_min);
  if (duration < 5 || duration > 600) return { ok: false, error: "La durée doit être comprise entre 5 et 600 minutes." };
  const staffId = target.staff_id === undefined ? appt.staff_id : target.staff_id || null;

  if (staffId && staffId !== appt.staff_id) {
    const { data } = await supabase.from("profiles").select("*").eq("id", staffId).maybeSingle();
    const p = data as Profile | null;
    if (!p || !p.active) return { ok: false, error: "Praticien introuvable." };
    if (p.entity_ids.length && !p.entity_ids.includes(appt.entity_id)) return { ok: false, error: `${p.full_name} ne travaille pas chez ${entity(appt.entity_id)?.short ?? "cet établissement"}.` };
  }

  const startsAt = agadirToIso(target.date, target.time);
  if (staffId) {
    const clash = (await staffBusy(supabase, staffId, target.date, target.date)).find((b) => b.id !== id && overlap(startsAt, duration, b.starts_at, b.duration_min));
    if (clash) return { ok: false, error: `Créneau occupé : ${clash.service} de ${fmtTime(clash.starts_at)} à ${fmtTime(endIso(clash.starts_at, clash.duration_min))}.` };
  }

  const prev: ApptSnapshot = { id, starts_at: appt.starts_at, staff_id: appt.staff_id, duration_min: appt.duration_min };
  if (prev.starts_at === startsAt && prev.staff_id === staffId && prev.duration_min === duration) return { ok: true, prev, message: "Aucun changement" };

  await supabase.from("appointments").update({ starts_at: startsAt, staff_id: staffId, duration_min: duration }).eq("id", id);

  const who = staffId !== appt.staff_id ? await staffName(supabase, staffId) : null;
  const moved = startsAt !== appt.starts_at;
  if (moved || staffId !== appt.staff_id) {
    await supabase.from("activities").insert({
      contact_id: appt.contact_id,
      entity_id: appt.entity_id,
      kind: "rdv",
      body: `Rendez-vous déplacé : ${appt.service} le ${fmtDate(startsAt, { weekday: "long", day: "numeric", month: "long" })} à ${fmtTime(startsAt)}${who ? ` avec ${who}` : ""}`,
      author_id: profile.id,
    });
  }
  refresh(appt.contact_id);
  const message = moved
    ? `Déplacé ${target.date !== isoToAgadir(appt.starts_at).date ? `au ${shortDay(target.date)} ` : ""}à ${target.time}${who ? ` · ${who}` : ""}`
    : staffId !== appt.staff_id
      ? `Attribué à ${who ?? "personne"}`
      : `Durée : ${duration} min`;
  return { ok: true, prev, message };
}

/** Remet un rendez-vous dans son état précédent (annulation d'un déplacement) */
export async function restoreAppointment(snap: ApptSnapshot): Promise<QuickResult> {
  const { date, time } = isoToAgadir(snap.starts_at);
  const r = await moveAppointment(snap.id, { date, time, staff_id: snap.staff_id, duration_min: snap.duration_min });
  return r.ok ? { ok: true, prev: undefined, message: "Déplacement annulé" } : r;
}

/* =====================================================================
 * Statuts (mises à jour instantanées)
 * ===================================================================== */

/** Change le statut d'un rendez-vous ; renvoie le statut précédent pour l'annulation. */
export async function setStatusQuick(id: string, status: AppointmentStatus): Promise<QuickResult<StatusSnapshot[]>> {
  if (!STATUSES.includes(status)) return { ok: false, error: "Statut inconnu." };
  const profile = await getProfile();
  const supabase = await createClient();
  const appt = await loadAppt(supabase, id);
  if (!appt) return { ok: false, error: "Rendez-vous introuvable." };
  const prev: StatusSnapshot[] = [{ id, status: appt.status }];
  if (appt.status === status) return { ok: true, prev, message: `Rendez-vous ${APPT_STATUS_LABEL[status].toLowerCase()}` };

  await supabase.from("appointments").update({ status }).eq("id", id);
  if (status === "absent" || status === "annule" || status === "termine" || status === "arrive") {
    await supabase.from("activities").insert({
      contact_id: appt.contact_id,
      entity_id: appt.entity_id,
      kind: status === "arrive" ? "visite" : "rdv",
      body:
        status === "arrive"
          ? `Arrivé(e) pour ${appt.service} (${fmtTime(appt.starts_at)})`
          : `Rendez-vous ${APPT_STATUS_LABEL[status].toLowerCase()} : ${appt.service} du ${fmtDate(appt.starts_at, { day: "numeric", month: "long" })} à ${fmtTime(appt.starts_at)}`,
      author_id: profile.id,
    });
  }
  refresh(appt.contact_id);
  return { ok: true, prev, message: `Rendez-vous ${APPT_STATUS_LABEL[status].toLowerCase()}` };
}

/** Rétablit des statuts (annulation) */
export async function restoreStatuses(snaps: StatusSnapshot[], seriesId?: string | null): Promise<QuickResult> {
  const scope = await getScope();
  const supabase = await createClient();
  const allowed = scope.allowed.map((e) => e.id);
  let contactId: string | undefined;
  for (const s of snaps.slice(0, MAX_OCCURRENCES + 1)) {
    if (!STATUSES.includes(s.status)) continue;
    const { data } = await supabase.from("appointments").select("*").eq("id", s.id).in("entity_id", allowed).maybeSingle();
    const a = data as SeriesAppointment | null;
    if (!a) continue;
    contactId = a.contact_id;
    await supabase.from("appointments").update({ status: s.status }).eq("id", s.id);
  }
  if (seriesId) await supabase.from("appointment_series").update({ cancelled_at: null }).eq("id", seriesId).in("entity_id", allowed);
  refresh(contactId);
  return { ok: true, prev: undefined, message: "Modification annulée" };
}

/** Annule ce rendez-vous et toutes les séances suivantes de sa série */
export async function cancelSeries(id: string): Promise<QuickResult<{ seriesId: string; snaps: StatusSnapshot[] }>> {
  const profile = await getProfile();
  const supabase = await createClient();
  const appt = await loadAppt(supabase, id);
  if (!appt?.series_id) return { ok: false, error: "Ce rendez-vous ne fait pas partie d'une série." };
  const { data } = await supabase.from("appointments").select("*").eq("series_id", appt.series_id).gte("starts_at", appt.starts_at);
  const rows = ((data ?? []) as SeriesAppointment[]).filter((a) => a.status === "prevu" || a.status === "confirme");
  const snaps = rows.map((a) => ({ id: a.id, status: a.status }));
  for (const a of rows) await supabase.from("appointments").update({ status: "annule" }).eq("id", a.id);
  await supabase.from("appointment_series").update({ cancelled_at: new Date().toISOString() }).eq("id", appt.series_id);
  if (rows.length) {
    await supabase.from("activities").insert({
      contact_id: appt.contact_id,
      entity_id: appt.entity_id,
      kind: "rdv",
      body: `Série annulée : ${rows.length} séance${rows.length > 1 ? "s" : ""} de ${appt.service} à partir du ${fmtDate(appt.starts_at, { day: "numeric", month: "long" })}`,
      author_id: profile.id,
    });
  }
  refresh(appt.contact_id);
  return { ok: true, prev: { seriesId: appt.series_id, snaps }, message: `${rows.length} séance${rows.length > 1 ? "s" : ""} annulée${rows.length > 1 ? "s" : ""}` };
}

/* =====================================================================
 * Formulaire : séries (création / modification de toute la série)
 * ===================================================================== */

/**
 * Enregistrement du formulaire de rendez-vous :
 * - « Répéter » à la création → série ;
 * - modification d'une séance avec « toute la série » → séances à venir ;
 * - sinon → `saveAppointment` (rendez-vous simple).
 */
export async function saveAppointmentPlus(state: FormState, formData: FormData): Promise<FormState> {
  const id = str(formData.get("id"));
  const repeat = str(formData.get("repeat"));
  if (id && formData.get("apply_to") === "series") return updateSeries(id, formData);
  if (!id && isFreq(repeat)) return createSeries(formData);
  return saveAppointment(state, formData);
}

/** Champs communs du formulaire */
async function readForm(supabase: DB, formData: FormData) {
  const scope = await getScope();
  const entityId = str(formData.get("entity_id")) as EntityId | null;
  const itemId = str(formData.get("item_id"));
  let service = str(formData.get("service"));
  const date = str(formData.get("date"));
  const time = str(formData.get("time"));
  const duration = Math.round(parseNum(formData.get("duration_min")) ?? 0);
  const price = parseNum(formData.get("price_mad")) ?? 0;
  if (!entityId || !scope.allowed.some((e) => e.id === entityId)) return { error: "Choisissez un établissement autorisé." } as const;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Indiquez la date du rendez-vous." } as const;
  if (!time || !/^\d{1,2}:\d{2}$/.test(time)) return { error: "Indiquez l'heure du rendez-vous." } as const;
  if (duration < 5 || duration > 600) return { error: "La durée doit être comprise entre 5 et 600 minutes." } as const;
  if (price < 0) return { error: "Le prix ne peut pas être négatif." } as const;
  if (itemId) {
    const { data } = await supabase.from("catalog_items").select("*").eq("id", itemId).maybeSingle();
    const it = data as CatalogItem | null;
    if (!it || it.entity_id !== entityId) return { error: "Cette prestation n'est pas proposée par l'établissement choisi." } as const;
    if (!service) service = it.name;
  }
  if (!service) return { error: "Indiquez la prestation." } as const;
  return {
    values: {
      entity_id: entityId,
      item_id: itemId,
      service,
      staff_id: str(formData.get("staff_id")),
      date,
      time: time.padStart(5, "0"),
      duration_min: duration,
      price_mad: price,
      room: str(formData.get("room")),
      notes: str(formData.get("notes")),
    },
  } as const;
}

const listDates = (dates: string[]) => {
  const shown = dates.slice(0, 6).map(shortDay).join(", ");
  return dates.length > 6 ? `${shown}… (+${dates.length - 6})` : shown;
};

async function createSeries(formData: FormData): Promise<FormState> {
  const profile = await getProfile();
  const supabase = await createClient();
  const r = await readForm(supabase, formData);
  if ("error" in r) return { error: r.error };
  const v = r.values;

  const contactId = str(formData.get("contact_id"));
  if (!contactId) return { error: "Choisissez le client." };
  const { data: contactRow } = await supabase.from("contacts").select("*").eq("id", contactId).maybeSingle();
  const contact = contactRow as Contact | null;
  if (!contact) return { error: "Client introuvable." };

  const freqRaw = str(formData.get("repeat"));
  if (!isFreq(freqRaw)) return { error: "Choisissez la fréquence de répétition." };
  const freq = freqRaw;
  const endMode = formData.get("repeat_end") === "until" ? "until" : "count";
  const until = endMode === "until" ? str(formData.get("repeat_until")) : null;
  const count = endMode === "count" ? Math.round(parseNum(formData.get("repeat_count")) ?? 0) : null;
  if (endMode === "until" && (!until || !/^\d{4}-\d{2}-\d{2}$/.test(until) || until < v.date)) return { error: "La date de fin de la série doit être après la première séance." };
  if (endMode === "count" && (!count || count < 2 || count > MAX_OCCURRENCES)) return { error: `Le nombre de séances doit être compris entre 2 et ${MAX_OCCURRENCES}.` };

  const dates = seriesDates(v.date, freq, { until, count });
  if (dates.length < 2) return { error: "La série ne contient qu'une séance : allongez la période ou retirez la répétition." };

  // Conflits praticien
  let conflicts: string[] = [];
  if (v.staff_id) {
    const busy = await staffBusy(supabase, v.staff_id, dates[0]!, dates[dates.length - 1]!);
    conflicts = dates.filter((d) => {
      const s = agadirToIso(d, v.time);
      return busy.some((b) => overlap(s, v.duration_min, b.starts_at, b.duration_min));
    });
  }
  const keep = dates.filter((d) => !conflicts.includes(d));
  if (conflicts.length && formData.get("skip_conflicts") !== "1") {
    return {
      error: `${conflicts.length} date${conflicts.length > 1 ? "s" : ""} en conflit avec l'agenda du praticien : ${listDates(conflicts)}. Cochez « Créer sans ces dates » ou changez l'horaire.`,
    };
  }
  if (!keep.length) return { error: "Toutes les dates sont en conflit : changez l'horaire ou le praticien." };

  const { data: seriesRow, error } = await supabase
    .from("appointment_series")
    .insert({
      entity_id: v.entity_id,
      contact_id: contactId,
      item_id: v.item_id,
      service: v.service,
      staff_id: v.staff_id,
      freq,
      start_date: v.date,
      time: v.time,
      duration_min: v.duration_min,
      price_mad: v.price_mad,
      room: v.room,
      notes: v.notes,
      until_date: until,
      occurrences: count,
      cancelled_at: null,
      created_by: profile.id,
    })
    .select()
    .single();
  const series = seriesRow as AppointmentSeries | null;
  if (error || !series) return { error: "Impossible de créer la série." };

  await supabase.from("appointments").insert(
    keep.map((d) => ({
      entity_id: v.entity_id,
      contact_id: contactId,
      item_id: v.item_id,
      service: v.service,
      staff_id: v.staff_id,
      starts_at: agadirToIso(d, v.time),
      duration_min: v.duration_min,
      status: "prevu",
      room: v.room,
      price_mad: v.price_mad,
      notes: v.notes,
      series_id: series.id,
    })),
  );
  await supabase.from("activities").insert({
    contact_id: contactId,
    entity_id: v.entity_id,
    kind: "rdv",
    body: `Série de ${keep.length} rendez-vous : ${v.service}, ${REPEAT_LABEL[freq].toLowerCase()} à ${v.time}, du ${fmtDate(agadirToIso(keep[0]!, v.time), { day: "numeric", month: "long" })} au ${fmtDate(agadirToIso(keep[keep.length - 1]!, v.time), { day: "numeric", month: "long" })} (${entity(v.entity_id)?.short ?? ""})${conflicts.length ? ` — ${conflicts.length} date${conflicts.length > 1 ? "s" : ""} écartée${conflicts.length > 1 ? "s" : ""}` : ""}`,
    author_id: profile.id,
  });
  if (!contact.entity_ids.includes(v.entity_id)) await supabase.from("contacts").update({ entity_ids: [...contact.entity_ids, v.entity_id] }).eq("id", contactId);

  refresh(contactId);
  await flash(`Série créée · ${keep.length} rendez-vous${conflicts.length ? ` (${conflicts.length} date${conflicts.length > 1 ? "s" : ""} écartée${conflicts.length > 1 ? "s" : ""})` : ""}`);
  redirect(`/agenda?date=${keep[0]}`);
}

/** Applique la modification à cette séance et à toutes les séances suivantes de la série */
async function updateSeries(id: string, formData: FormData): Promise<FormState> {
  const profile = await getProfile();
  const supabase = await createClient();
  const appt = await loadAppt(supabase, id);
  if (!appt) return { error: "Rendez-vous introuvable." };
  if (!appt.series_id) return { error: "Ce rendez-vous ne fait pas partie d'une série." };
  const r = await readForm(supabase, formData);
  if ("error" in r) return { error: r.error };
  const v = r.values;

  const { data } = await supabase.from("appointments").select("*").eq("series_id", appt.series_id).gte("starts_at", appt.starts_at);
  const rows = ((data ?? []) as SeriesAppointment[]).filter((a) => a.id === id || a.status === "prevu" || a.status === "confirme").sort((a, b) => (a.starts_at < b.starts_at ? -1 : 1));
  const shift = daysBetween(isoToAgadir(appt.starts_at).date, v.date);
  const plan = rows.map((a) => ({ a, date: addDaysKey(isoToAgadir(a.starts_at).date, shift) }));
  const ids = new Set(rows.map((a) => a.id));

  if (v.staff_id && plan.length) {
    const busy = (await staffBusy(supabase, v.staff_id, plan[0]!.date, plan[plan.length - 1]!.date)).filter((b) => !ids.has(b.id));
    const conflicts = plan.filter((p) => busy.some((b) => overlap(agadirToIso(p.date, v.time), v.duration_min, b.starts_at, b.duration_min))).map((p) => p.date);
    if (conflicts.length) return { error: `Impossible de modifier toute la série : ${conflicts.length} date${conflicts.length > 1 ? "s" : ""} en conflit (${listDates(conflicts)}). Modifiez seulement cette séance ou changez l'horaire.` };
  }

  const statusRaw = str(formData.get("status")) as AppointmentStatus | null;
  for (const p of plan) {
    await supabase
      .from("appointments")
      .update({
        entity_id: v.entity_id,
        item_id: v.item_id,
        service: v.service,
        staff_id: v.staff_id,
        starts_at: agadirToIso(p.date, v.time),
        duration_min: v.duration_min,
        room: v.room,
        price_mad: v.price_mad,
        notes: v.notes,
        ...(p.a.id === id && statusRaw && STATUSES.includes(statusRaw) ? { status: statusRaw } : {}),
      })
      .eq("id", p.a.id);
  }
  await supabase
    .from("appointment_series")
    .update({ entity_id: v.entity_id, item_id: v.item_id, service: v.service, staff_id: v.staff_id, time: v.time, duration_min: v.duration_min, price_mad: v.price_mad, room: v.room, notes: v.notes })
    .eq("id", appt.series_id);
  await supabase.from("activities").insert({
    contact_id: appt.contact_id,
    entity_id: v.entity_id,
    kind: "rdv",
    body: `Série modifiée : ${plan.length} séance${plan.length > 1 ? "s" : ""} de ${v.service} à ${v.time} à partir du ${fmtDate(agadirToIso(v.date, v.time), { day: "numeric", month: "long" })}`,
    author_id: profile.id,
  });
  refresh(appt.contact_id);
  await flash(`Série modifiée · ${plan.length} séance${plan.length > 1 ? "s" : ""}`);
  redirect(`/agenda?date=${v.date}`);
}
