import type { SupabaseClient } from "@supabase/supabase-js";
import type { Contact } from "@/lib/types";
import { addDaysKey, dayKey } from "@/lib/utils";
import type { KidsAttendance, KidsChild, KidsGroup, KidsMember } from "@/lib/types-care";

/** Chiffres d'un téléphone au format national (clé de regroupement des familles) */
export function phoneKey(phone: string | null | undefined) {
  let d = (phone ?? "").replace(/\D/g, "");
  if (d.startsWith("00212")) d = "0" + d.slice(5);
  else if (d.startsWith("212") && d.length === 12) d = "0" + d.slice(3);
  return d;
}

/** Toutes les données Kids nécessaires aux pages (sans jointure) */
export async function loadKids(supabase: SupabaseClient, opts: { since?: string } = {}) {
  const since = opts.since ?? addDaysKey(dayKey(), -28);
  const [g, m, ch, att, c] = await Promise.all([
    supabase.from("kids_groups").select("*").eq("entity_id", "kids").order("start_time"),
    supabase.from("kids_members").select("*").eq("entity_id", "kids"),
    supabase.from("kids_children").select("*").eq("entity_id", "kids"),
    supabase.from("kids_attendance").select("*").eq("entity_id", "kids").gte("date", since),
    supabase.from("contacts").select("*").overlaps("entity_ids", ["kids"]).order("full_name"),
  ]);
  const groups = ((g.data ?? []) as KidsGroup[]).filter((x) => x.active);
  const members = (m.data ?? []) as KidsMember[];
  const children = (ch.data ?? []) as KidsChild[];
  const attendance = (att.data ?? []) as KidsAttendance[];
  const contacts = (c.data ?? []) as Contact[];
  return {
    groups,
    members,
    children,
    attendance,
    contacts,
    contactById: new Map(contacts.map((x) => [x.id, x])),
    childByContact: new Map(children.map((x) => [x.contact_id, x])),
  };
}

/** Parent principal d'un enfant (fiche enfant, sinon fiche contact) */
export function mainParent(contact: Contact, child: KidsChild | undefined) {
  return {
    name: child?.parent1_name ?? contact.guardian_name ?? "Parent",
    phone: child?.parent1_phone ?? contact.phone,
  };
}

export function absenceMessage(kid: Contact, group: KidsGroup, date: string, today: string) {
  const first = kid.full_name.split(" ")[0];
  const when = date === today ? "aujourd'hui" : `le ${new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`))}`;
  return `Bonjour, ${first} était absent(e) ${when} au cours « ${group.name} » (${group.start_time}). Tout va bien ? N'hésitez pas à nous prévenir pour les prochaines séances. L'équipe Moov'Up Kids`;
}
