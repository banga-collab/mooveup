"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getProfile, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ENTITY_IDS, entity, type EntityId } from "@/lib/entities";
import { STAGE_LABEL, STAGES, parseNum, str } from "@/lib/utils";
import type { Contact, Lead, LeadSource, LeadStage } from "@/lib/types";
import type { FormState } from "@/components/action-form";
import { flash } from "@/lib/flash";
import { recordUndo, type UndoOp } from "@/lib/undo";
import { formatPhone, phoneDigits, SOURCES } from "@/components/contacts/helpers";

const isSource = (v: string | null): v is LeadSource => SOURCES.some(([k]) => k === v);

/** Crée un prospect pour un contact existant ou un nouveau contact */
export async function createLead(_: FormState, fd: FormData): Promise<FormState> {
  const [profile, scope] = await Promise.all([getProfile(), getScope()]);
  const allowedIds = scope.allowed.map((e) => e.id);
  const supabase = await createClient();

  const entity_id = str(fd.get("entity_id")) as EntityId | null;
  if (!entity_id || !allowedIds.includes(entity_id)) return { error: "Choisis un établissement autorisé." };
  const interest = str(fd.get("interest"));
  if (!interest) return { error: "Indique l'intérêt du prospect (ex. : abonnement fitness)." };
  const source = str(fd.get("source"));
  if (!isSource(source)) return { error: "Choisis la source du prospect." };
  const value = parseNum(fd.get("value_mad")) ?? 0;
  if (value < 0) return { error: "La valeur estimée ne peut pas être négative." };
  const next = str(fd.get("next_action_on"));
  const ownerRaw = str(fd.get("owner_id"));

  let contact: Contact | null = null;
  if (fd.get("mode") === "new") {
    const full_name = str(fd.get("full_name"));
    const phone = formatPhone(str(fd.get("phone")));
    if (!full_name) return { error: "Le nom du contact est obligatoire." };
    if (!phone || phoneDigits(phone).length < 9) return { error: "Un numéro de téléphone valide est obligatoire." };
    // Numéro déjà connu : on réutilise la fiche existante
    const { data: same } = await supabase.from("contacts").select("*").ilike("phone", `%${phoneDigits(phone).slice(-2)}%`);
    const existing = ((same ?? []) as Contact[]).find((c) => phoneDigits(c.phone) === phoneDigits(phone));
    if (existing) {
      if (!existing.entity_ids.some((e) => allowedIds.includes(e))) return { error: "Ce numéro appartient à un client d'un autre établissement du groupe." };
      contact = existing;
    } else {
      const { data, error } = await supabase
        .from("contacts")
        .insert({ full_name: full_name.replace(/\s+/g, " "), phone, source, entity_ids: [entity_id], status: "prospect", tags: [], whatsapp_optin: true, owner_id: ownerRaw ?? profile.id })
        .select()
        .single();
      if (error || !data) return { error: "Impossible de créer le contact." };
      contact = data as Contact;
    }
  } else {
    const id = str(fd.get("contact_id"));
    if (!id) return { error: "Choisis un client ou crée un nouveau contact." };
    const { data } = await supabase.from("contacts").select("*").eq("id", id).maybeSingle();
    contact = data as Contact | null;
    if (!contact || !contact.entity_ids.some((e) => allowedIds.includes(e))) return { error: "Contact introuvable." };
  }

  // Le contact apparaît désormais dans cet établissement
  if (!contact.entity_ids.includes(entity_id)) {
    const entity_ids = ENTITY_IDS.filter((e) => contact!.entity_ids.includes(e) || e === entity_id);
    await supabase.from("contacts").update({ entity_ids }).eq("id", contact.id);
  }

  const now = new Date().toISOString();
  const { error } = await supabase.from("leads").insert({
    contact_id: contact.id,
    entity_id,
    interest: interest.slice(0, 120),
    stage: "nouveau",
    source,
    value_mad: Math.round(value),
    owner_id: ownerRaw,
    next_action_on: next && /^\d{4}-\d{2}-\d{2}$/.test(next) ? next : null,
    lost_reason: null,
    updated_at: now,
  });
  if (error) return { error: "Impossible d'enregistrer le prospect." };
  await supabase.from("activities").insert({
    contact_id: contact.id,
    entity_id,
    kind: "statut",
    body: `Nouveau prospect ${entity(entity_id)?.short ?? ""} : ${interest}`,
    author_id: profile.id,
  });
  revalidatePath("/", "layout");
  await flash(`Prospect ${contact.full_name} ajouté`);
  redirect(fd.get("back") === "contact" ? `/contacts/${contact.id}?tab=prospects` : "/prospects");
}

/** Charge un prospect du périmètre autorisé */
async function loadLead(id: string) {
  const scope = await getScope();
  const supabase = await createClient();
  const { data } = await supabase.from("leads").select("*").eq("id", id).maybeSingle();
  const lead = data as Lead | null;
  if (!lead || !scope.allowed.some((e) => e.id === lead.entity_id)) return null;
  return { lead, supabase };
}

async function applyStage(id: string, stage: LeadStage, lostReason: string | null) {
  const profile = await getProfile();
  const loaded = await loadLead(id);
  if (!loaded || !STAGES.some((s) => s.id === stage)) return;
  const { lead, supabase } = loaded;
  if (lead.stage === stage && stage !== "perdu") return;
  const undoOps: UndoOp[] = [{ op: "update", table: "leads", id, values: { stage: lead.stage, updated_at: lead.updated_at, lost_reason: lead.lost_reason } }];
  await supabase
    .from("leads")
    .update({ stage, updated_at: new Date().toISOString(), lost_reason: stage === "perdu" ? lostReason : null })
    .eq("id", id);

  if (stage === "gagne") {
    const { data } = await supabase.from("contacts").select("*").eq("id", lead.contact_id).maybeSingle();
    const contact = data as Contact | null;
    if (contact) {
      undoOps.push({ op: "update", table: "contacts", id: contact.id, values: { status: contact.status, entity_ids: contact.entity_ids } });
      const entity_ids = ENTITY_IDS.filter((e) => contact.entity_ids.includes(e) || e === lead.entity_id);
      await supabase.from("contacts").update({ status: "client", entity_ids }).eq("id", contact.id);
    }
  }

  const label = `Prospect « ${lead.interest} » : ${STAGE_LABEL[lead.stage]} → ${STAGE_LABEL[stage]}`;
  const { data: act } = await supabase
    .from("activities")
    .insert({
      contact_id: lead.contact_id,
      entity_id: lead.entity_id,
      kind: "statut",
      body: stage === "perdu" && lostReason ? `${label} (${lostReason})` : label,
      author_id: profile.id,
    })
    .select("id")
    .maybeSingle();
  if (act) undoOps.push({ op: "remove", table: "activities", ids: [(act as { id: string }).id] });
  revalidatePath("/", "layout");
  const undo = await recordUndo(`prospect.${stage}`, { ops: undoOps, message: `Prospect remis à « ${STAGE_LABEL[lead.stage]} »` });
  await flash(stage === "gagne" ? "Prospect gagné · devenu client" : `Prospect passé à « ${STAGE_LABEL[stage]} »`, "success", { undo });
}

/** Passe un prospect à une étape (bouton lié par .bind(null, id, étape)) */
export async function moveLead(id: string, stage: LeadStage) {
  await applyStage(id, stage, null);
}

/** Marque un prospect perdu avec sa raison */
export async function loseLead(id: string, fd: FormData) {
  const reason = str(fd.get("reason")) ?? "Sans raison";
  const detail = str(fd.get("detail"));
  await applyStage(id, "perdu", detail ? `${reason} – ${detail}`.slice(0, 200) : reason);
}
