"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getProfile, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { flash } from "@/lib/flash";
import { addDaysKey, dayKey, fmtDate, parseNum, str } from "@/lib/utils";
import type { EntityId } from "@/lib/entities";
import type { FormState } from "@/components/action-form";
import { NATURE_LABEL, PARTNER_KIND_LABEL, PARTNERSHIP_STATUS_LABEL, type PartnerKind, type Partnership, type PartnershipNature, type PartnershipStatus } from "@/lib/types-business";
import { storeImages } from "@/components/complaints/store-image";

const clip = (v: FormDataEntryValue | null, n: number) => str(v)?.slice(0, n) ?? null;
const isDate = (d: string | null): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);

async function mgmt() {
  const [me, scope] = await Promise.all([getProfile(), getScope()]);
  if (me.role !== "direction" && me.role !== "manager") redirect("/");
  return { me, scope };
}

async function load(id: string, allowed: string[]) {
  const supabase = await createClient();
  const { data } = await supabase.from("partnerships").select("*").eq("id", id).maybeSingle();
  const p = data as Partnership | null;
  if (!p || ((p.entity_ids ?? []).length && !p.entity_ids.some((e) => allowed.includes(e)))) return null;
  return p;
}

/** Tâche de rappel d'échéance (créée ou mise à jour) */
async function syncReminder(p: Pick<Partnership, "title" | "partner_name" | "entity_ids" | "reminder_date" | "reminder_task_id" | "end_date" | "status">, userId: string) {
  const supabase = await createClient();
  if (!p.reminder_date || p.status === "terminee") {
    if (p.reminder_task_id) await supabase.from("tasks").update({ done: true }).eq("id", p.reminder_task_id);
    return p.reminder_task_id;
  }
  const title = `Collaboration ${p.partner_name} : ${p.end_date ? `fin le ${fmtDate(p.end_date)}` : "point d'étape"} (renouveler ou clôturer)`;
  if (p.reminder_task_id) {
    await supabase.from("tasks").update({ title, due_date: p.reminder_date, done: false }).eq("id", p.reminder_task_id);
    return p.reminder_task_id;
  }
  const { data } = await supabase
    .from("tasks")
    .insert({ title, contact_id: null, lead_id: null, entity_id: p.entity_ids[0] ?? null, assigned_to: userId, due_date: p.reminder_date, priority: "normale", done: false, created_by: userId })
    .select()
    .single();
  return (data as { id: string } | null)?.id ?? null;
}

export async function savePartnership(id: string | null, _state: FormState, fd: FormData): Promise<FormState> {
  const { me, scope } = await mgmt();
  const allowed = scope.allowed.map((e) => e.id as string);
  const partner_name = clip(fd.get("partner_name"), 120);
  if (!partner_name) return { error: "Indiquez le nom du partenaire." };
  const kind = str(fd.get("partner_kind")) as PartnerKind | null;
  const nature = str(fd.get("nature")) as PartnershipNature | null;
  const status = str(fd.get("status")) as PartnershipStatus | null;
  if (!kind || !(kind in PARTNER_KIND_LABEL)) return { error: "Choisissez le type de partenaire." };
  if (!nature || !(nature in NATURE_LABEL)) return { error: "Choisissez la nature de la collaboration." };
  if (!status || !(status in PARTNERSHIP_STATUS_LABEL)) return { error: "Choisissez le statut." };
  const start = str(fd.get("start_date"));
  const end = str(fd.get("end_date"));
  if (start && !isDate(start)) return { error: "Date de début invalide." };
  if (end && !isDate(end)) return { error: "Date de fin invalide." };
  if (start && end && end < start) return { error: "La date de fin doit être après la date de début." };
  const value = parseNum(fd.get("value_mad"));
  if (value !== null && (value < 0 || value > 100_000_000)) return { error: "Valeur estimée invalide." };
  const entity_ids = fd.getAll("entity_ids").map(String).filter((e) => allowed.includes(e)) as EntityId[];
  if (!entity_ids.length && me.role !== "direction") return { error: "Choisissez au moins un établissement." };
  const reminderRaw = str(fd.get("reminder_date"));
  if (reminderRaw && !isDate(reminderRaw)) return { error: "Date de rappel invalide." };
  // Rappel par défaut : 15 jours avant la fin
  const reminder_date = reminderRaw ?? (end && status !== "terminee" && addDaysKey(end, -15) >= dayKey() ? addDaysKey(end, -15) : null);

  const supabase = await createClient();
  const current = id ? await load(id, allowed) : null;
  if (id && !current) return { error: "Collaboration introuvable." };
  const photos = await storeImages(supabase, fd.getAll("photos"), `collaborations/${id ?? "nouvelle"}`, 20);
  const title = clip(fd.get("title"), 140) ?? `${NATURE_LABEL[nature]} · ${partner_name}`;

  const row = {
    title,
    partner_name,
    partner_kind: kind,
    nature,
    status,
    start_date: start,
    end_date: end,
    entity_ids,
    our_part: clip(fd.get("our_part"), 2000),
    their_part: clip(fd.get("their_part"), 2000),
    value_mad: value === null ? null : Math.round(value),
    contact_name: clip(fd.get("contact_name"), 120),
    contact_phone: clip(fd.get("contact_phone"), 30),
    contact_email: clip(fd.get("contact_email"), 160),
    social: clip(fd.get("social"), 160),
    photos: [...(current?.photos ?? []), ...photos],
    results: clip(fd.get("results"), 3000),
    notes: clip(fd.get("notes"), 3000),
    reminder_date,
    updated_at: new Date().toISOString(),
  };
  const reminder_task_id = await syncReminder({ ...row, reminder_task_id: current?.reminder_task_id ?? null }, me.id);

  let savedId = id;
  if (id) {
    await supabase.from("partnerships").update({ ...row, reminder_task_id }).eq("id", id);
  } else {
    const { data, error } = await supabase.from("partnerships").insert({ ...row, reminder_task_id, created_by: me.id }).select().single();
    if (error || !data) return { error: "Impossible d'enregistrer la collaboration." };
    savedId = (data as Partnership).id;
  }
  await logAudit({
    action: id ? "collaboration.modification" : "collaboration.ajout",
    entity_id: entity_ids[0] ?? null,
    target_type: "partnership",
    target_id: savedId,
    summary: `Collaboration ${id ? "modifiée" : "ajoutée"} : ${title} (${PARTNERSHIP_STATUS_LABEL[status]})`,
    actor: me,
    meta: { value: row.value_mad, photos: photos.length },
  });
  await flash(id ? "Collaboration enregistrée" : `Collaboration avec ${partner_name} ajoutée`);
  revalidatePath("/collaborations");
  redirect(`/collaborations/${savedId}`);
}

export async function setPartnershipStatus(id: string, status: PartnershipStatus) {
  const { me, scope } = await mgmt();
  const p = await load(id, scope.allowed.map((e) => e.id));
  if (!p || !(status in PARTNERSHIP_STATUS_LABEL)) redirect("/collaborations");
  const supabase = await createClient();
  const patch: Partial<Partnership> = { status, updated_at: new Date().toISOString() };
  if (status === "active" && !p.start_date) patch.start_date = dayKey();
  if (status === "terminee" && (!p.end_date || p.end_date > dayKey())) patch.end_date = dayKey();
  await supabase.from("partnerships").update(patch).eq("id", id);
  await syncReminder({ ...p, ...patch }, me.id);
  await logAudit({ action: "collaboration.statut", entity_id: p.entity_ids[0] ?? null, target_type: "partnership", target_id: id, summary: `Collaboration ${p.partner_name} : ${PARTNERSHIP_STATUS_LABEL[status]}`, actor: me });
  await flash(`Collaboration ${PARTNERSHIP_STATUS_LABEL[status].toLowerCase()}`);
  revalidatePath("/collaborations");
  redirect(`/collaborations/${id}`);
}

export async function removePartnershipPhoto(id: string, index: number) {
  const { scope } = await mgmt();
  const p = await load(id, scope.allowed.map((e) => e.id));
  if (!p) redirect("/collaborations");
  const supabase = await createClient();
  await supabase.from("partnerships").update({ photos: (p.photos ?? []).filter((_, i) => i !== index) }).eq("id", id);
  await flash("Photo retirée");
  revalidatePath(`/collaborations/${id}`);
  redirect(`/collaborations/${id}`);
}

export async function deletePartnership(id: string) {
  const { me, scope } = await mgmt();
  const p = await load(id, scope.allowed.map((e) => e.id));
  if (!p) redirect("/collaborations");
  const supabase = await createClient();
  if (p.reminder_task_id) await supabase.from("tasks").delete().eq("id", p.reminder_task_id);
  await supabase.from("partnerships").delete().eq("id", id);
  await logAudit({ action: "collaboration.suppression", entity_id: p.entity_ids[0] ?? null, target_type: "partnership", target_id: null, summary: `Collaboration supprimée : ${p.title}`, actor: me });
  await flash("Collaboration supprimée");
  revalidatePath("/collaborations");
  redirect("/collaborations");
}
