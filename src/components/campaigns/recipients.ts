import { createClient } from "@/lib/supabase/server";
import { entity, type EntityId } from "@/lib/entities";
import type { Appointment, CampaignChannel, CampaignSegment, Contact, Sale, Subscription } from "@/lib/types";
import { addDaysKey, agadirToIso, dayKey } from "@/lib/utils";

export type Recipient = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  /** Établissement utilisé pour {etablissement} */
  entity_id: EntityId;
  entity_short: string;
};

/**
 * Contacts visés par un segment, limités aux établissements autorisés.
 * Segment sans établissement = tous les établissements autorisés.
 */
export async function resolveRecipients(segment: CampaignSegment, channel: CampaignChannel, allowedIds: EntityId[]): Promise<Recipient[]> {
  const ids = segment.entity_ids.length ? segment.entity_ids.filter((id) => allowedIds.includes(id)) : allowedIds;
  if (!ids.length) return [];
  const supabase = await createClient();
  const today = dayKey();

  let q = supabase.from("contacts").select("*").overlaps("entity_ids", ids);
  if (segment.statuses.length) q = q.in("status", segment.statuses);
  if (segment.sex) q = q.eq("sex", segment.sex);
  const { data } = await q.order("full_name");
  let list = (data ?? []) as Contact[];

  if (segment.tags.length) {
    const wanted = segment.tags.map((t) => t.toLowerCase());
    list = list.filter((c) => (c.tags ?? []).some((t) => wanted.includes(t.toLowerCase())));
  }
  if (channel === "whatsapp") list = list.filter((c) => c.whatsapp_optin && c.phone);
  else if (channel === "sms") list = list.filter((c) => c.phone);
  else list = list.filter((c) => c.email);

  /** Établissement de référence pour chaque contact (celui de l'abonnement si filtre d'expiration) */
  const ref = new Map<string, EntityId>();

  if (segment.expiring_days) {
    const { data: subs } = await supabase
      .from("subscriptions")
      .select("*")
      .in("entity_id", ids)
      .eq("status", "actif")
      .gte("end_date", today)
      .lte("end_date", addDaysKey(today, segment.expiring_days));
    for (const s of (subs ?? []) as Subscription[]) if (!ref.has(s.contact_id)) ref.set(s.contact_id, s.entity_id);
    list = list.filter((c) => ref.has(c.id));
  }

  if (segment.inactive_days) {
    const since = addDaysKey(today, -segment.inactive_days);
    const sinceIso = agadirToIso(since, "00:00");
    const [{ data: sales }, { data: appts }] = await Promise.all([
      supabase.from("sales").select("*").in("entity_id", ids).gte("sold_at", sinceIso),
      supabase.from("appointments").select("*").in("entity_id", ids).gte("starts_at", sinceIso).lte("starts_at", new Date().toISOString()),
    ]);
    const active = new Set<string>();
    for (const s of (sales ?? []) as Sale[]) if (s.contact_id) active.add(s.contact_id);
    for (const a of (appts ?? []) as Appointment[]) if (a.status === "arrive" || a.status === "termine") active.add(a.contact_id);
    // Ne garder que les contacts déjà venus au moins une fois (inscrits depuis plus longtemps que la période)
    list = list.filter((c) => !active.has(c.id) && c.created_at.slice(0, 10) <= since);
  }

  return list.map((c) => {
    const eid = ref.get(c.id) ?? c.entity_ids.find((e) => ids.includes(e)) ?? ids[0]!;
    return { id: c.id, full_name: c.full_name, phone: c.phone, email: c.email, entity_id: eid, entity_short: entity(eid)?.short ?? "Moov'Up" };
  });
}
