"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getProfile, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { publicDb } from "@/lib/access";
import { logAudit } from "@/lib/audit";
import { flash } from "@/lib/flash";
import { entity, ENTITIES, type EntityId } from "@/lib/entities";
import { addDaysKey, dayKey, str } from "@/lib/utils";
import type { Profile } from "@/lib/types";
import type { FormState } from "@/components/action-form";
import {
  COMPLAINT_PRIORITY_LABEL,
  COMPLAINT_STATUS_LABEL,
  COMPLAINT_TYPE_LABEL,
  DEFAULT_PRIORITY,
  DEFAULT_ZONES,
  type Complaint,
  type ComplaintPriority,
  type ComplaintStatus,
  type ComplaintType,
  type ComplaintZone,
} from "@/lib/types-business";
import { storeImage } from "@/components/complaints/store-image";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newRef = () => `R-${Array.from({ length: 5 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("")}`;

/** Manager responsable d'un établissement (à défaut : la direction) */
async function managerOf(db: ReturnType<typeof publicDb>, entityId: string): Promise<string | null> {
  const { data } = await db.from("profiles").select("*").in("role", ["manager", "direction"]).eq("active", true);
  const rows = (data ?? []) as Profile[];
  return (rows.find((p) => p.role === "manager" && (p.entity_ids ?? []).includes(entityId as EntityId)) ?? rows.find((p) => p.role === "direction"))?.id ?? null;
}

/* ---------- Dépôt public (page /signaler, sans connexion) ---------- */

export async function submitComplaint(_state: FormState, fd: FormData): Promise<FormState> {
  // Piège à robots : champ invisible pour un humain
  if (str(fd.get("website"))) redirect("/signaler/merci");
  const entityId = str(fd.get("e"));
  const ent = ENTITIES.find((x) => x.id === entityId);
  if (!ent) return { error: "Choisissez l'établissement concerné." };
  const type = str(fd.get("type")) as ComplaintType | null;
  if (!type || !(type in COMPLAINT_TYPE_LABEL)) return { error: "Choisissez le type de problème." };
  const description = str(fd.get("description"))?.slice(0, 1500) ?? "";
  if (description.length < 5) return { error: "Décrivez le problème en quelques mots." };
  const phone = str(fd.get("contact_phone"))?.slice(0, 30) ?? null;
  if (phone && phone.replace(/\D/g, "").length < 9) return { error: "Numéro de téléphone incomplet (ou laissez le champ vide)." };

  const db = publicDb();
  // Anti-abus simple : pas plus de 15 signalements en 10 minutes par établissement
  const { count } = await db.from("complaints").select("id", { count: "exact", head: true }).eq("entity_id", ent.id).gte("created_at", new Date(Date.now() - 10 * 60_000).toISOString());
  if ((count ?? 0) >= 15) return { error: "Trop de signalements en peu de temps. Merci de prévenir directement l'accueil." };

  let zone: ComplaintZone | null = null;
  const zoneId = str(fd.get("z"));
  if (zoneId) {
    const { data } = await db.from("complaint_zones").select("*").eq("id", zoneId).maybeSingle();
    zone = (data as ComplaintZone | null)?.entity_id === ent.id ? (data as ComplaintZone) : null;
  }
  const photo_url = await storeImage(db, fd.get("photo"), `reclamations/${ent.id}`);
  const priority = DEFAULT_PRIORITY[type];
  const assigned_to = await managerOf(db, ent.id);

  let ref = newRef();
  const { data: taken } = await db.from("complaints").select("id").eq("ref", ref).maybeSingle();
  if (taken) ref = newRef();

  const { data: task } = await db
    .from("tasks")
    .insert({
      title: `Réclamation ${ref} · ${COMPLAINT_TYPE_LABEL[type]}${zone ? ` · ${zone.label}` : ""} : ${description.slice(0, 80)}${description.length > 80 ? "…" : ""}`,
      contact_id: null,
      lead_id: null,
      entity_id: ent.id,
      assigned_to,
      due_date: priority === "haute" ? dayKey() : addDaysKey(dayKey(), 1),
      priority,
      done: false,
      created_by: null,
    })
    .select()
    .single();

  const { error } = await db.from("complaints").insert({
    ref,
    entity_id: ent.id,
    zone_id: zone?.id ?? null,
    zone_label: zone?.label ?? null,
    type,
    description,
    photo_url,
    contact_name: str(fd.get("contact_name"))?.slice(0, 80) ?? null,
    contact_phone: phone,
    status: "nouvelle",
    priority,
    assigned_to,
    task_id: (task as { id: string } | null)?.id ?? null,
    source: "qr",
    resolution: null,
    taken_at: null,
    resolved_at: null,
  });
  if (error) return { error: "Envoi impossible pour le moment. Merci de prévenir l'accueil." };
  redirect(`/signaler/merci?ref=${ref}&e=${ent.id}`);
}

/* ---------- Traitement par l'équipe ---------- */

async function loadComplaint(id: string) {
  const [me, scope] = await Promise.all([getProfile(), getScope()]);
  const supabase = await createClient();
  const { data } = await supabase.from("complaints").select("*").eq("id", id).maybeSingle();
  const c = data as Complaint | null;
  if (!c || !scope.allowed.some((e) => e.id === c.entity_id)) redirect("/reclamations");
  return { me, c, supabase };
}

/** Applique un changement et synchronise la tâche liée */
async function apply(c: Complaint, me: Profile, patch: Partial<Complaint>) {
  const supabase = await createClient();
  const now = new Date().toISOString();
  if (patch.status && patch.status !== c.status) {
    if (patch.status === "en_cours" && !c.taken_at) patch.taken_at = now;
    if (patch.status === "resolue") {
      patch.resolved_at = now;
      if (!c.taken_at) patch.taken_at = now;
    }
    if (patch.status !== "resolue") patch.resolved_at = null;
  }
  await supabase.from("complaints").update(patch).eq("id", c.id);
  if (c.task_id) {
    const t: Record<string, unknown> = {};
    if (patch.status) t.done = patch.status === "resolue";
    if (patch.assigned_to !== undefined) t.assigned_to = patch.assigned_to;
    if (patch.priority) t.priority = patch.priority;
    if (Object.keys(t).length) await supabase.from("tasks").update(t).eq("id", c.task_id);
  }
  const parts = [
    patch.status && patch.status !== c.status ? COMPLAINT_STATUS_LABEL[patch.status] : null,
    patch.priority && patch.priority !== c.priority ? `priorité ${COMPLAINT_PRIORITY_LABEL[patch.priority].toLowerCase()}` : null,
    patch.assigned_to !== undefined && patch.assigned_to !== c.assigned_to ? "réassignée" : null,
  ].filter(Boolean);
  if (parts.length)
    await logAudit({ action: "reclamation.suivi", entity_id: c.entity_id, target_type: "complaint", target_id: c.id, summary: `Réclamation ${c.ref} (${COMPLAINT_TYPE_LABEL[c.type]}) : ${parts.join(", ")}`, actor: me });
  revalidatePath("/reclamations");
  revalidatePath(`/reclamations/${c.id}`);
  revalidatePath("/taches");
}

/** Bouton rapide : prendre en charge (assignée à moi, en cours) */
export async function takeComplaint(id: string) {
  const { me, c } = await loadComplaint(id);
  await apply(c, me, { status: "en_cours", assigned_to: me.id });
  await flash(`Réclamation ${c.ref} prise en charge`);
  redirect(`/reclamations/${id}`);
}

/** Bouton rapide : marquer résolue */
export async function resolveComplaint(id: string, back: string) {
  const { me, c } = await loadComplaint(id);
  await apply(c, me, { status: "resolue" });
  await flash(`Réclamation ${c.ref} résolue`);
  redirect(back.startsWith("/reclamations") ? back : "/reclamations");
}

/** Formulaire de suivi : statut, priorité, assignation, note de résolution */
export async function updateComplaint(id: string, _state: FormState, fd: FormData): Promise<FormState> {
  const { me, c } = await loadComplaint(id);
  const status = str(fd.get("status")) as ComplaintStatus | null;
  const priority = str(fd.get("priority")) as ComplaintPriority | null;
  if (!status || !(status in COMPLAINT_STATUS_LABEL)) return { error: "Statut invalide." };
  if (!priority || !(priority in COMPLAINT_PRIORITY_LABEL)) return { error: "Priorité invalide." };
  const resolution = str(fd.get("resolution"))?.slice(0, 1500) ?? null;
  if (status === "resolue" && !resolution && !c.resolution) return { error: "Indiquez en une phrase ce qui a été fait." };
  const assigned = str(fd.get("assigned_to"));
  await apply(c, me, { status, priority, assigned_to: assigned || null, resolution: resolution ?? c.resolution });
  await flash("Réclamation mise à jour");
  redirect(`/reclamations/${id}`);
}

/* ---------- Zones (QR codes) ---------- */

async function zoneAccess(entityId: string | null) {
  const [me, scope] = await Promise.all([getProfile(), getScope()]);
  if (me.role !== "direction" && me.role !== "manager") redirect("/reclamations");
  if (!entityId || !scope.allowed.some((e) => e.id === entityId)) redirect("/reclamations/qr");
  return me;
}

export async function addZone(_state: FormState, fd: FormData): Promise<FormState> {
  const entityId = str(fd.get("entity_id"));
  await zoneAccess(entityId);
  const label = str(fd.get("label"))?.slice(0, 60);
  if (!label) return { error: "Nommez la zone (ex. : Vestiaires femmes, Piscine, Tapis de course n° 3)." };
  const supabase = await createClient();
  const { data } = await supabase.from("complaint_zones").select("*").eq("entity_id", entityId);
  if (((data ?? []) as ComplaintZone[]).some((z) => z.label.toLowerCase() === label.toLowerCase())) return { error: "Cette zone existe déjà." };
  await supabase.from("complaint_zones").insert({ entity_id: entityId, label });
  await flash(`Zone « ${label} » ajoutée`);
  revalidatePath("/reclamations/qr");
  redirect(`/reclamations/qr?e=${entityId}`);
}

export async function addDefaultZones(entityId: string) {
  await zoneAccess(entityId);
  const ent = entity(entityId)!;
  const supabase = await createClient();
  const { data } = await supabase.from("complaint_zones").select("*").eq("entity_id", entityId);
  const have = new Set(((data ?? []) as ComplaintZone[]).map((z) => z.label.toLowerCase()));
  const rows = DEFAULT_ZONES[ent.kind].filter((l) => !have.has(l.toLowerCase())).map((label) => ({ entity_id: entityId, label }));
  if (rows.length) await supabase.from("complaint_zones").insert(rows);
  await flash(`${rows.length} zone${rows.length > 1 ? "s" : ""} ajoutée${rows.length > 1 ? "s" : ""}`);
  revalidatePath("/reclamations/qr");
  redirect(`/reclamations/qr?e=${entityId}`);
}

export async function removeZone(id: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("complaint_zones").select("*").eq("id", id).maybeSingle();
  const z = data as ComplaintZone | null;
  await zoneAccess(z?.entity_id ?? null);
  await supabase.from("complaint_zones").delete().eq("id", id);
  await flash(`Zone « ${z!.label} » supprimée (son QR code ne fonctionne plus)`);
  revalidatePath("/reclamations/qr");
  redirect(`/reclamations/qr?e=${z!.entity_id}`);
}
