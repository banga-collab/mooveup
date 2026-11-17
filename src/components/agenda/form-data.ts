import { createClient } from "@/lib/supabase/server";
import { getTeam, getContacts } from "@/lib/data";
import type { Scope } from "@/lib/auth";
import { addDaysKey, agadirToIso, dayKey } from "@/lib/utils";
import type { Appointment, CatalogItem, Contact } from "@/lib/types";
import type { BusySlot, FormEntity, FormItem, FormStaff } from "./appointment-form";

/** Données des listes du formulaire de rendez-vous (établissements autorisés) */
export async function loadAppointmentFormData(scope: Scope, opts: { extraContactId?: string | null; aroundDate?: string } = {}) {
  const supabase = await createClient();
  const allowedIds = scope.allowed.map((e) => e.id);
  const wide: Scope = { ...scope, current: null, ids: allowedIds };
  const today = dayKey();
  const from = opts.aroundDate && opts.aroundDate < today ? opts.aroundDate : today;

  const [contacts, team, { data: itemRows }, { data: apptRows }] = await Promise.all([
    getContacts(wide),
    getTeam(wide),
    supabase.from("catalog_items").select("*").in("entity_id", allowedIds).in("kind", ["prestation", "pack"]).eq("active", true).order("name"),
    supabase
      .from("appointments")
      .select("*")
      .in("entity_id", allowedIds)
      .gte("starts_at", agadirToIso(addDaysKey(from, -1), "00:00"))
      .lt("starts_at", agadirToIso(addDaysKey(today, 120), "00:00")),
  ]);

  let pickerContacts = contacts;
  if (opts.extraContactId && !contacts.some((c) => c.id === opts.extraContactId)) {
    const { data } = await supabase.from("contacts").select("*").eq("id", opts.extraContactId).maybeSingle();
    if (data) pickerContacts = [data as Contact, ...contacts];
  }

  const appts = (apptRows ?? []) as Appointment[];
  const rooms: Record<string, string[]> = {};
  for (const a of appts) {
    if (!a.room) continue;
    const list = (rooms[a.entity_id] ??= []);
    if (!list.includes(a.room)) list.push(a.room);
  }
  for (const k of Object.keys(rooms)) rooms[k]!.sort((a, b) => a.localeCompare(b, "fr"));

  const entities: FormEntity[] = scope.allowed.map((e) => ({ id: e.id, short: e.short, color: e.color, soft: e.soft }));
  const items: FormItem[] = ((itemRows ?? []) as CatalogItem[]).map((i) => ({
    id: i.id,
    entity_id: i.entity_id,
    kind: i.kind,
    name: i.name,
    category: i.category,
    price_mad: Number(i.price_mad),
    duration_min: i.duration_min,
  }));
  // Praticiens en premier, puis le reste de l'équipe de l'établissement
  const staff: FormStaff[] = team
    .filter((p) => p.entity_ids.length > 0)
    .sort((a, b) => Number(b.role === "staff") - Number(a.role === "staff") || a.full_name.localeCompare(b.full_name, "fr"))
    .map((p) => ({ id: p.id, full_name: p.full_name, entity_ids: p.entity_ids, job_title: p.job_title }));
  const busy: BusySlot[] = appts
    .filter((a) => a.status !== "annule" && a.status !== "absent")
    .map((a) => ({ id: a.id, entity_id: a.entity_id, staff_id: a.staff_id, room: a.room, starts_at: a.starts_at, duration_min: a.duration_min, service: a.service }));

  return {
    contacts: pickerContacts.map((c) => ({ id: c.id, full_name: c.full_name, phone: c.phone })),
    entities,
    items,
    staff,
    busy,
    rooms,
  };
}
