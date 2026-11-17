"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getProfile, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { EntityId } from "@/lib/entities";
import type { ActivityKind, Campaign, CampaignChannel, Profile } from "@/lib/types";
import { CHANNEL_LABEL, agadirToIso, str } from "@/lib/utils";
import type { FormState } from "@/components/action-form";
import { firstName, parseSegment, personalize } from "@/components/campaigns/shared";
import { resolveRecipients, type Recipient } from "@/components/campaigns/recipients";

const CHANNELS: CampaignChannel[] = ["whatsapp", "sms", "email"];

async function guard() {
  const [me, scope] = await Promise.all([getProfile(), getScope()]);
  if (!["direction", "manager", "reception"].includes(me.role)) throw new Error("Accès réservé à la direction, aux managers et à la réception.");
  return { me, allowed: scope.allowed.map((e) => e.id) as EntityId[] };
}

/** Compteur en direct du constructeur de segment */
export async function countSegment(rawSegment: unknown, channel: CampaignChannel): Promise<{ count: number; sample: string[] }> {
  const { allowed } = await guard();
  const segment = parseSegment(rawSegment);
  if (!segment.entity_ids.length) return { count: 0, sample: [] };
  const list = await resolveRecipients(segment, CHANNELS.includes(channel) ? channel : "whatsapp", allowed);
  return { count: list.length, sample: list.slice(0, 4).map((r) => r.full_name) };
}

/** « Envoi » en démo : historique sur chaque fiche client + statut envoyée */
async function deliver(campaign: Pick<Campaign, "id" | "name" | "channel" | "message">, recipients: Recipient[], me: Profile) {
  const supabase = await createClient();
  const kind: ActivityKind = campaign.channel === "email" ? "email" : campaign.channel === "whatsapp" ? "whatsapp" : "note";
  const now = new Date().toISOString();
  if (recipients.length) {
    await supabase.from("activities").insert(
      recipients.map((r) => ({
        contact_id: r.id,
        entity_id: r.entity_id,
        kind,
        body: `Campagne ${CHANNEL_LABEL[campaign.channel]} « ${campaign.name} » : ${personalize(campaign.message, firstName(r.full_name), r.entity_short)}`,
        author_id: me.id,
        created_at: now,
      })),
    );
  }
  await supabase.from("campaigns").update({ status: "envoyee", sent_at: now, scheduled_at: null, recipients_count: recipients.length }).eq("id", campaign.id);
}

/** Création : brouillon, programmation ou envoi immédiat */
export async function saveCampaign(_state: FormState, formData: FormData): Promise<FormState> {
  const { me, allowed } = await guard();
  const name = str(formData.get("name"));
  const message = str(formData.get("message"));
  const channel = str(formData.get("channel")) as CampaignChannel | null;
  const intent = str(formData.get("intent")) ?? "brouillon";
  if (!name) return { error: "Donnez un nom à la campagne." };
  if (!channel || !CHANNELS.includes(channel)) return { error: "Choisissez un canal d'envoi." };
  if (!message) return { error: "Écrivez le message à envoyer." };
  if (message.length > 1500) return { error: "Le message est trop long (1 500 caractères au maximum)." };

  let segment;
  try {
    segment = parseSegment(JSON.parse(String(formData.get("segment") ?? "{}")));
  } catch {
    return { error: "Segment invalide." };
  }
  segment.entity_ids = segment.entity_ids.filter((id) => allowed.includes(id));
  if (!segment.entity_ids.length) return { error: "Choisissez au moins un établissement." };

  let scheduledAt: string | null = null;
  if (intent === "programmer") {
    const date = str(formData.get("date"));
    const time = str(formData.get("time"));
    if (!date || !time) return { error: "Indiquez la date et l'heure d'envoi." };
    scheduledAt = agadirToIso(date, time);
    if (new Date(scheduledAt).getTime() <= Date.now()) return { error: "La date d'envoi doit être dans le futur." };
  }

  const recipients = intent === "envoyer" ? await resolveRecipients(segment, channel, allowed) : [];
  if (intent === "envoyer" && !recipients.length) return { error: "Aucun destinataire ne correspond à ce segment." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campaigns")
    .insert({
      name: name.slice(0, 120),
      channel,
      segment,
      message,
      status: intent === "programmer" ? "programmee" : "brouillon",
      scheduled_at: scheduledAt,
      sent_at: null,
      recipients_count: 0,
      created_by: me.id,
    })
    .select()
    .single();
  if (error || !data) return { error: "Impossible d'enregistrer la campagne." };
  const campaign = data as Campaign;

  if (intent === "envoyer") await deliver(campaign, recipients, me);

  revalidatePath("/campagnes");
  redirect(`/campagnes/${campaign.id}`);
}

async function loadCampaign(id: string) {
  const { me, allowed } = await guard();
  const supabase = await createClient();
  const { data } = await supabase.from("campaigns").select("*").eq("id", id).maybeSingle();
  const c = data as Campaign | null;
  if (!c) return null;
  const segment = parseSegment(c.segment);
  if (segment.entity_ids.length && !segment.entity_ids.some((e) => allowed.includes(e))) return null;
  return { c: { ...c, segment }, me, allowed };
}

/** Envoi immédiat d'un brouillon ou d'une campagne programmée */
export async function sendCampaign(id: string) {
  const res = await loadCampaign(id);
  if (!res || res.c.status === "envoyee") return;
  const recipients = await resolveRecipients(res.c.segment, res.c.channel, res.allowed);
  await deliver(res.c, recipients, res.me);
  revalidatePath("/campagnes");
  revalidatePath(`/campagnes/${id}`);
}

/** Repasse une campagne programmée en brouillon */
export async function unscheduleCampaign(id: string) {
  const res = await loadCampaign(id);
  if (!res || res.c.status !== "programmee") return;
  const supabase = await createClient();
  await supabase.from("campaigns").update({ status: "brouillon", scheduled_at: null }).eq("id", id);
  revalidatePath("/campagnes");
  revalidatePath(`/campagnes/${id}`);
}

export async function deleteCampaign(id: string) {
  const res = await loadCampaign(id);
  if (!res || res.c.status === "envoyee") return;
  const supabase = await createClient();
  await supabase.from("campaigns").delete().eq("id", id);
  revalidatePath("/campagnes");
  redirect("/campagnes");
}
