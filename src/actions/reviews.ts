"use server";

import { revalidatePath } from "next/cache";
import { getProfile, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { flash } from "@/lib/flash";
import { getSettings } from "@/lib/settings";
import { entity, type EntityId } from "@/lib/entities";
import type { Contact, Profile } from "@/lib/types";
import type { Review } from "@/lib/types-loyalty";
import { addDaysKey, dayKey, str } from "@/lib/utils";
import { firstName } from "@/lib/loyalty";
import { loadRules, reviewToken, serviceClient, siteOrigin } from "@/lib/automations";
import { sendAndLog } from "@/lib/whatsapp";
import { renderTemplate } from "@/components/automations/defs";
import type { FormState } from "@/components/action-form";

export type ReviewFormState = { error?: string; done?: boolean; rating?: number } | undefined;

/** Réponse du client depuis la page publique /r/<token> */
export async function submitReview(_s: ReviewFormState, fd: FormData): Promise<ReviewFormState> {
  const token = str(fd.get("token"));
  const rating = Math.round(Number(fd.get("rating")));
  const comment = str(fd.get("comment"))?.slice(0, 1000) ?? null;
  if (!token || !/^[a-z0-9]{6,16}$/.test(token)) return { error: "Lien invalide." };
  if (!(rating >= 1 && rating <= 5)) return { error: "Choisissez une note de 1 à 5 étoiles." };

  const supabase = await serviceClient();
  const { data } = await supabase.from("reviews").select("*").eq("token", token).maybeSingle();
  const review = data as Review | null;
  if (!review) return { error: "Ce lien n'est plus valable." };
  if (review.rating) return { done: true, rating: review.rating };

  const now = new Date().toISOString();
  await supabase.from("reviews").update({ rating, comment, answered_at: now }).eq("id", review.id);

  const { data: c } = await supabase.from("contacts").select("*").eq("id", review.contact_id).maybeSingle();
  const contact = c as Contact | null;
  if (contact) {
    await supabase.from("activities").insert({
      contact_id: contact.id,
      entity_id: review.entity_id,
      kind: "note",
      body: `Avis client : ${rating}/5${comment ? ` « ${comment} »` : ""}`,
      author_id: null,
    });
  }

  // Avis négatif : tâche pour le manager de l'établissement
  if (rating <= 3) {
    const { data: people } = await supabase.from("profiles").select("*").eq("active", true);
    const team = (people ?? []) as Profile[];
    const manager =
      team.find((p) => p.role === "manager" && p.entity_ids.includes(review.entity_id)) ?? team.find((p) => p.role === "direction") ?? null;
    const { data: task } = await supabase
      .from("tasks")
      .insert({
        title: `Avis ${rating}/5 de ${contact?.full_name ?? "un client"} : rappeler le client`,
        contact_id: contact?.id ?? null,
        lead_id: null,
        entity_id: review.entity_id,
        assigned_to: manager?.id ?? null,
        due_date: addDaysKey(dayKey(), 1),
        priority: "haute",
        done: false,
        created_by: null,
      })
      .select()
      .single();
    if (task) await supabase.from("reviews").update({ task_id: (task as { id: string }).id }).eq("id", review.id);
  }
  return { done: true, rating };
}

/** Avis négatif traité */
export async function markReviewHandled(fd: FormData) {
  const [me, scope] = await Promise.all([getProfile(), getScope()]);
  if (me.role === "staff") return;
  const id = str(fd.get("id"));
  if (!id) return;
  const supabase = await createClient();
  const { data } = await supabase.from("reviews").select("*").eq("id", id).maybeSingle();
  const review = data as Review | null;
  if (!review || !scope.allowed.some((e) => e.id === review.entity_id)) return;
  await supabase.from("reviews").update({ handled: true, handled_at: new Date().toISOString(), handled_by: me.id }).eq("id", id);
  if (review.task_id) await supabase.from("tasks").update({ done: true }).eq("id", review.task_id);
  await flash("Avis marqué comme traité");
  revalidatePath("/avis");
}

/** Demande d'avis manuelle (WhatsApp avec lien court) */
export async function requestReview(_s: FormState, fd: FormData): Promise<FormState> {
  const [me, scope] = await Promise.all([getProfile(), getScope()]);
  if (me.role === "staff") return { error: "Accès réservé à l'accueil et aux managers." };
  const contactId = str(fd.get("contact_id"));
  const entityId = str(fd.get("entity_id")) as EntityId | null;
  const service = str(fd.get("service"));
  if (!contactId) return { error: "Choisissez le client." };
  if (!entityId || !scope.allowed.some((e) => e.id === entityId)) return { error: "Choisissez l'établissement." };
  const supabase = await createClient();
  const { data: c } = await supabase.from("contacts").select("*").eq("id", contactId).maybeSingle();
  const contact = c as Contact | null;
  if (!contact) return { error: "Client introuvable." };
  if (!contact.phone) return { error: "Ce client n'a pas de numéro de téléphone." };

  const token = reviewToken();
  await supabase.from("reviews").insert({
    token,
    contact_id: contact.id,
    entity_id: entityId,
    appointment_id: null,
    sale_id: null,
    service,
    rating: null,
    comment: null,
    answered_at: null,
    handled: false,
    handled_at: null,
    handled_by: null,
    task_id: null,
  });
  const [rules, settings, origin] = await Promise.all([loadRules(supabase), getSettings(), siteOrigin()]);
  const rule = rules.find((r) => r.key === "avis")!;
  const body = renderTemplate(rule.message, { prenom: firstName(contact.full_name), etablissement: entity(entityId)?.short ?? "Moov'Up", service: service ?? "votre visite", lien: `${origin}/r/${token}`, date: "", heure: "" });
  const r = await sendAndLog(supabase, { contact_id: contact.id, entity_id: entityId, phone: contact.phone, body, rule_key: "avis", ref_id: null, author_id: me.id, label: "Demande d'avis" }, settings);
  if (r.status === "echec") return { error: `Envoi impossible : ${r.error}` };
  await flash(r.status === "envoye" ? "Demande d'avis envoyée" : "Demande d'avis prête : envoyez-la depuis « Derniers envois »");
  revalidatePath("/avis");
  revalidatePath("/automatisations");
  return undefined;
}
