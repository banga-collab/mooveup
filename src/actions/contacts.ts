"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getProfile, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ENTITY_IDS, type EntityId } from "@/lib/entities";
import { str } from "@/lib/utils";
import type { ActivityKind, Contact, ContactStatus, LeadSource } from "@/lib/types";
import type { FormState } from "@/components/action-form";
import { logAudit } from "@/lib/audit";
import { flash } from "@/lib/flash";
import { contactSnapshotOps, recordUndo } from "@/lib/undo";
import { formatPhone, parseTags, phoneDigits, SOURCES } from "@/components/contacts/helpers";

export type ContactFormState = { error?: string; duplicate?: { id: string; name: string } } | undefined;

const STATUSES: ContactStatus[] = ["client", "prospect", "ancien"];

/** Lecture et contrôle des champs du formulaire contact */
async function readContact(fd: FormData) {
  const scope = await getScope();
  const allowedIds = scope.allowed.map((e) => e.id);
  const full_name = str(fd.get("full_name"));
  if (!full_name) return { error: "Le nom est obligatoire." } as const;
  const phone = formatPhone(str(fd.get("phone")));
  if (phone && phoneDigits(phone).length < 9) return { error: "Le numéro de téléphone semble incomplet." } as const;
  const email = str(fd.get("email"))?.toLowerCase() ?? null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "L'adresse e-mail n'est pas valide." } as const;
  const chosen = fd.getAll("entity_ids").map(String) as EntityId[];
  if (chosen.some((e) => !allowedIds.includes(e))) return { error: "Établissement non autorisé." } as const;
  if (!chosen.length) return { error: "Coche au moins un établissement fréquenté." } as const;
  const sexRaw = str(fd.get("sex"));
  const sourceRaw = str(fd.get("source"));
  const statusRaw = str(fd.get("status")) as ContactStatus | null;
  const birth = str(fd.get("birth_date"));
  return {
    scope,
    allowedIds,
    chosen,
    values: {
      full_name: full_name.replace(/\s+/g, " "),
      phone,
      email,
      sex: sexRaw === "H" || sexRaw === "F" ? sexRaw : null,
      birth_date: birth && /^\d{4}-\d{2}-\d{2}$/.test(birth) ? birth : null,
      city: str(fd.get("city")),
      source: SOURCES.some(([k]) => k === sourceRaw) ? (sourceRaw as LeadSource) : null,
      tags: parseTags(fd.get("tags")),
      status: statusRaw && STATUSES.includes(statusRaw) ? statusRaw : "prospect",
      guardian_name: str(fd.get("guardian_name")),
      notes: str(fd.get("notes")),
      whatsapp_optin: fd.get("whatsapp_optin") === "on",
    },
  } as const;
}

/** Contact déjà enregistré avec ce numéro (hors `exceptId`) */
async function findByPhone(phone: string, exceptId?: string) {
  const supabase = await createClient();
  const digits = phoneDigits(phone);
  const last = digits.slice(-4);
  const { data } = await supabase.from("contacts").select("id, full_name, phone, entity_ids").ilike("phone", `%${last.slice(-2)}%`);
  return ((data ?? []) as Pick<Contact, "id" | "full_name" | "phone" | "entity_ids">[]).find((c) => c.id !== exceptId && phoneDigits(c.phone) === digits) ?? null;
}

export async function createContact(_: ContactFormState, fd: FormData): Promise<ContactFormState> {
  const r = await readContact(fd);
  if ("error" in r) return { error: r.error };
  const profile = await getProfile();
  if (r.values.phone) {
    const dup = await findByPhone(r.values.phone);
    if (dup) {
      const visible = dup.entity_ids.some((e) => r.allowedIds.includes(e));
      return visible
        ? { error: `Ce numéro est déjà enregistré pour ${dup.full_name}.`, duplicate: { id: dup.id, name: dup.full_name } }
        : { error: "Ce numéro est déjà enregistré pour un client d'un autre établissement du groupe. Demandez à la direction de vous y donner accès." };
    }
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contacts")
    .insert({ ...r.values, entity_ids: r.chosen, owner_id: profile.id })
    .select()
    .single();
  if (error || !data) return { error: "Impossible d'enregistrer le contact. Réessayez." };
  revalidatePath("/", "layout");
  await flash(r.values.status === "prospect" ? "Contact ajouté" : "Client ajouté");
  redirect(`/contacts/${(data as Contact).id}`);
}

export async function updateContact(id: string, _: ContactFormState, fd: FormData): Promise<ContactFormState> {
  const r = await readContact(fd);
  if ("error" in r) return { error: r.error };
  const supabase = await createClient();
  const { data: current } = await supabase.from("contacts").select("*").eq("id", id).maybeSingle();
  const contact = current as Contact | null;
  if (!contact || !contact.entity_ids.some((e) => r.allowedIds.includes(e))) return { error: "Contact introuvable." };
  if (r.values.phone && phoneDigits(r.values.phone) !== phoneDigits(contact.phone)) {
    const dup = await findByPhone(r.values.phone, id);
    if (dup) return { error: `Ce numéro est déjà utilisé par ${dup.full_name}.`, duplicate: dup.entity_ids.some((e) => r.allowedIds.includes(e)) ? { id: dup.id, name: dup.full_name } : undefined };
  }
  // On conserve les établissements que l'utilisateur ne gère pas
  const kept = contact.entity_ids.filter((e) => !r.allowedIds.includes(e));
  const entity_ids = ENTITY_IDS.filter((e) => kept.includes(e) || r.chosen.includes(e));
  const { error } = await supabase.from("contacts").update({ ...r.values, entity_ids }).eq("id", id);
  if (error) return { error: "Impossible d'enregistrer les modifications." };
  revalidatePath("/", "layout");
  await flash("Fiche client mise à jour");
  redirect(`/contacts/${id}`);
}

/** Supprime le contact, ou le détache seulement des établissements de l'utilisateur s'il en fréquente d'autres */
export async function deleteContact(id: string) {
  const profile = await getProfile();
  if (profile.role !== "direction" && profile.role !== "manager") redirect(`/contacts/${id}`);
  const scope = await getScope();
  const allowedIds = scope.allowed.map((e) => e.id);
  const supabase = await createClient();
  const { data } = await supabase.from("contacts").select("*").eq("id", id).maybeSingle();
  const contact = data as Contact | null;
  if (contact && contact.entity_ids.some((e) => allowedIds.includes(e))) {
    const others = contact.entity_ids.filter((e) => !allowedIds.includes(e));
    // Annulation 5 s : fiche et lignes liées mémorisées avant suppression
    const undoOps = others.length ? [{ op: "update" as const, table: "contacts", id, values: { entity_ids: contact.entity_ids } }] : await contactSnapshotOps(supabase, contact);
    if (others.length) await supabase.from("contacts").update({ entity_ids: others }).eq("id", id);
    else await supabase.from("contacts").delete().eq("id", id);
    const mine = contact.entity_ids.filter((e) => allowedIds.includes(e));
    await logAudit({
      action: others.length ? "contact.retrait" : "contact.suppression",
      entity_id: scope.current?.id ?? mine[0] ?? null,
      target_type: "contact",
      target_id: others.length ? contact.id : null,
      summary: others.length ? `${contact.full_name} retiré(e) de ${mine.length} établissement${mine.length > 1 ? "s" : ""} (fiche conservée ailleurs)` : `Fiche client ${contact.full_name}${contact.phone ? ` (${contact.phone})` : ""} supprimée`,
      actor: profile,
    });
    const undo = await recordUndo(others.length ? "contact.retrait" : "contact.suppression", { ops: undoOps, message: `Fiche de ${contact.full_name} restaurée`, href: `/contacts/${id}` });
    await flash(others.length ? "Client retiré de vos établissements" : "Client supprimé", "success", { undo });
  }
  revalidatePath("/", "layout");
  redirect("/contacts");
}

const NOTE_KINDS: ActivityKind[] = ["note", "appel", "whatsapp", "email", "visite"];

/** Ajoute une note / un appel / un message / une visite à l'historique */
export async function addActivity(contactId: string, _: FormState, fd: FormData): Promise<FormState> {
  const [profile, scope] = await Promise.all([getProfile(), getScope()]);
  const body = str(fd.get("body"));
  if (!body) return { error: "Écris quelques mots avant d'enregistrer." };
  const kind = str(fd.get("kind")) as ActivityKind | null;
  if (!kind || !NOTE_KINDS.includes(kind)) return { error: "Type d'échange inconnu." };
  const entityRaw = str(fd.get("entity_id"));
  const allowedIds = scope.allowed.map((e) => e.id);
  if (entityRaw && !allowedIds.includes(entityRaw as EntityId)) return { error: "Établissement non autorisé." };
  const supabase = await createClient();
  const { data } = await supabase.from("contacts").select("id, entity_ids").eq("id", contactId).maybeSingle();
  const contact = data as Pick<Contact, "id" | "entity_ids"> | null;
  if (!contact || !contact.entity_ids.some((e) => allowedIds.includes(e))) return { error: "Contact introuvable." };
  const entity_id = (entityRaw as EntityId | null) ?? scope.current?.id ?? contact.entity_ids.find((e) => allowedIds.includes(e)) ?? null;
  const { error } = await supabase.from("activities").insert({ contact_id: contactId, entity_id, kind, body: body.slice(0, 2000), author_id: profile.id });
  if (error) return { error: "Impossible d'enregistrer cet échange." };
  revalidatePath(`/contacts/${contactId}`);
  await flash("Ajouté à l'historique");
  return undefined;
}
