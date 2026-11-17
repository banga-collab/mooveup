"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getProfile, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { flash } from "@/lib/flash";
import { recordUndo, type UndoOp } from "@/lib/undo";
import type { Contact } from "@/lib/types";
import { dayKey, parseNum, str } from "@/lib/utils";
import { ATTENDANCE_LABEL, type AttendanceStatus, type KidsAttendance, type KidsGroup, type KidsMember } from "@/lib/types-care";
import type { FormState } from "@/components/action-form";

const STATUSES: AttendanceStatus[] = ["present", "absent", "excuse"];

/** Vérifie que l'utilisateur a accès à Moov'Up Kids */
async function kidsCtx() {
  const [me, scope] = await Promise.all([getProfile(), getScope()]);
  if (!scope.allowed.some((e) => e.id === "kids")) return null;
  return { me, supabase: await createClient() };
}

function refresh(groupId?: string) {
  revalidatePath("/kids");
  if (groupId) revalidatePath(`/kids/groupes/${groupId}`);
}

async function getGroup(supabase: Awaited<ReturnType<typeof createClient>>, id: string) {
  const { data } = await supabase.from("kids_groups").select("*").eq("id", id).maybeSingle();
  const g = data as KidsGroup | null;
  return g && g.entity_id === "kids" ? g : null;
}

async function note(supabase: Awaited<ReturnType<typeof createClient>>, contactId: string, body: string, authorId: string) {
  await supabase.from("activities").insert({ contact_id: contactId, entity_id: "kids", kind: "note", body, author_id: authorId });
}

/* ---------- Groupes ---------- */

export async function saveGroup(groupId: string | null, _s: FormState, fd: FormData): Promise<FormState> {
  const c = await kidsCtx();
  if (!c) return { error: "Moov'Up Kids n'est pas dans votre périmètre." };
  if (c.me.role !== "direction" && c.me.role !== "manager") return { error: "Seuls la direction et les managers gèrent les groupes." };

  const name = str(fd.get("name"));
  const activity = str(fd.get("activity"));
  if (!name || !activity) return { error: "Indiquez le nom du groupe et l'activité." };
  const days = fd
    .getAll("days")
    .map((d) => Number(d))
    .filter((d) => d >= 1 && d <= 7);
  if (!days.length) return { error: "Choisissez au moins un jour." };
  const start = str(fd.get("start_time"));
  const end = str(fd.get("end_time"));
  if (!start || !end || !/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end) || end <= start) return { error: "Horaires invalides." };
  const ageMin = parseNum(fd.get("age_min")) ?? 4;
  const ageMax = parseNum(fd.get("age_max")) ?? 14;
  if (ageMin > ageMax || ageMin < 1 || ageMax > 18) return { error: "Tranche d'âge invalide." };
  const capacity = Math.round(parseNum(fd.get("capacity")) ?? 12);
  if (capacity < 1 || capacity > 60) return { error: "Capacité entre 1 et 60 enfants." };

  const coach = str(fd.get("coach_id"));
  if (coach) {
    const { data } = await c.supabase.from("profiles").select("id").eq("id", coach).maybeSingle();
    if (!data) return { error: "Coach introuvable." };
  }

  const row = {
    entity_id: "kids",
    name: name.slice(0, 80),
    activity: activity.slice(0, 60),
    age_min: Math.round(ageMin),
    age_max: Math.round(ageMax),
    days: [...new Set(days)].sort(),
    start_time: start,
    end_time: end,
    coach_id: coach,
    capacity,
    location: str(fd.get("location"))?.slice(0, 60) ?? null,
    active: true,
  };

  let id = groupId;
  if (groupId) {
    if (!(await getGroup(c.supabase, groupId))) return { error: "Groupe introuvable." };
    const { error } = await c.supabase.from("kids_groups").update(row).eq("id", groupId);
    if (error) return { error: "Impossible d'enregistrer le groupe." };
  } else {
    const { data, error } = await c.supabase.from("kids_groups").insert(row).select("id").single();
    if (error || !data) return { error: "Impossible de créer le groupe." };
    id = (data as { id: string }).id;
  }

  await flash(groupId ? "Groupe modifié" : "Groupe créé");
  refresh(id ?? undefined);
  redirect(`/kids/groupes/${id}`);
}

export async function deleteGroup(groupId: string) {
  const c = await kidsCtx();
  if (!c || (c.me.role !== "direction" && c.me.role !== "manager")) return;
  if (!(await getGroup(c.supabase, groupId))) return;
  await c.supabase.from("kids_attendance").delete().eq("group_id", groupId);
  await c.supabase.from("kids_members").delete().eq("group_id", groupId);
  await c.supabase.from("kids_groups").delete().eq("id", groupId);
  await flash("Groupe supprimé");
  refresh();
  redirect("/kids?v=groupes");
}

/* ---------- Inscriptions ---------- */

export async function enrollChild(groupId: string, _s: FormState, fd: FormData): Promise<FormState> {
  const c = await kidsCtx();
  if (!c) return { error: "Moov'Up Kids n'est pas dans votre périmètre." };
  const group = await getGroup(c.supabase, groupId);
  if (!group) return { error: "Groupe introuvable." };
  const contactId = str(fd.get("contact_id"));
  if (!contactId) return { error: "Choisissez un enfant." };
  const { data } = await c.supabase.from("contacts").select("*").eq("id", contactId).maybeSingle();
  const contact = data as Contact | null;
  if (!contact) return { error: "Enfant introuvable." };

  const { data: existing } = await c.supabase.from("kids_members").select("id").eq("group_id", groupId).eq("contact_id", contactId).maybeSingle();
  if (existing) return { error: `${contact.full_name} est déjà dans ce groupe.` };

  const { count } = await c.supabase.from("kids_members").select("id", { count: "exact", head: true }).eq("group_id", groupId).eq("status", "inscrit");
  const full = (count ?? 0) >= group.capacity;
  const status = full || fd.get("waitlist") === "on" ? "attente" : "inscrit";

  const { error } = await c.supabase.from("kids_members").insert({ entity_id: "kids", group_id: groupId, contact_id: contactId, status, joined_on: dayKey() });
  if (error) return { error: "Impossible d'inscrire l'enfant." };
  if (!contact.entity_ids.includes("kids")) await c.supabase.from("contacts").update({ entity_ids: [...contact.entity_ids, "kids"] }).eq("id", contactId);

  await note(c.supabase, contactId, status === "inscrit" ? `Inscrit(e) au groupe ${group.name}` : `Liste d'attente : ${group.name}`, c.me.id);
  await flash(status === "inscrit" ? `${contact.full_name.split(" ")[0]} inscrit(e)` : full ? "Groupe complet : ajouté(e) en liste d'attente" : "Ajouté(e) en liste d'attente");
  refresh(groupId);
  return undefined;
}

async function ownMember(memberId: string) {
  const c = await kidsCtx();
  if (!c) return null;
  const { data } = await c.supabase.from("kids_members").select("*").eq("id", memberId).maybeSingle();
  const m = data as KidsMember | null;
  if (!m || m.entity_id !== "kids") return null;
  const group = await getGroup(c.supabase, m.group_id);
  return group ? { ...c, m, group } : null;
}

export async function removeMember(memberId: string) {
  const r = await ownMember(memberId);
  if (!r) return;
  await r.supabase.from("kids_members").delete().eq("id", memberId);
  await note(r.supabase, r.m.contact_id, `Retiré(e) du groupe ${r.group.name}`, r.me.id);
  await flash("Enfant retiré du groupe");
  refresh(r.group.id);
}

export async function promoteMember(memberId: string) {
  const r = await ownMember(memberId);
  if (!r || r.m.status !== "attente") return;
  await r.supabase.from("kids_members").update({ status: "inscrit", joined_on: dayKey() }).eq("id", memberId);
  await note(r.supabase, r.m.contact_id, `Inscrit(e) au groupe ${r.group.name} (depuis la liste d'attente)`, r.me.id);
  await flash("Inscription confirmée");
  refresh(r.group.id);
}

/* ---------- Présences ---------- */

/** Pointe un enfant (annulable 5 s) ; renvoie { error } pour la mise à jour optimiste */
export async function markAttendance(groupId: string, contactId: string, date: string, status: AttendanceStatus): Promise<{ error?: string }> {
  const c = await kidsCtx();
  if (!c) return { error: "Moov'Up Kids n'est pas dans votre périmètre." };
  if (!STATUSES.includes(status) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date > dayKey()) return { error: "Impossible de pointer une date future." };
  if (!(await getGroup(c.supabase, groupId))) return { error: "Groupe introuvable." };
  const { data } = await c.supabase.from("kids_attendance").select("*").eq("group_id", groupId).eq("contact_id", contactId).eq("date", date).maybeSingle();
  const row = data as KidsAttendance | null;
  let op: UndoOp;
  let cleared = false;
  if (row) {
    // Un second clic sur le même statut efface la saisie
    if (row.status === status) {
      const { error } = await c.supabase.from("kids_attendance").delete().eq("id", row.id);
      if (error) return { error: "Impossible d'effacer le pointage." };
      op = { op: "restore", table: "kids_attendance", rows: [row] };
      cleared = true;
    } else {
      const { error } = await c.supabase.from("kids_attendance").update({ status, marked_by: c.me.id }).eq("id", row.id);
      if (error) return { error: "Impossible d'enregistrer le pointage." };
      op = { op: "update", table: "kids_attendance", id: row.id, values: { status: row.status, marked_by: row.marked_by } };
    }
  } else {
    const { data: ins, error } = await c.supabase
      .from("kids_attendance")
      .insert({ entity_id: "kids", group_id: groupId, contact_id: contactId, date, status, marked_by: c.me.id })
      .select("id")
      .single();
    if (error || !ins) return { error: "Impossible d'enregistrer le pointage." };
    op = { op: "remove", table: "kids_attendance", ids: [(ins as { id: string }).id] };
  }
  refresh(groupId);
  const undo = await recordUndo("kids.presence", { ops: [op], message: "Pointage annulé" });
  await flash(cleared ? "Pointage effacé" : `${ATTENDANCE_LABEL[status]} · enregistré`, "success", { undo });
  return {};
}

/** Marque présents tous les enfants pas encore pointés */
export async function markAllPresent(groupId: string, date: string) {
  const c = await kidsCtx();
  if (!c || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date > dayKey()) return;
  if (!(await getGroup(c.supabase, groupId))) return;
  const [{ data: mem }, { data: att }] = await Promise.all([
    c.supabase.from("kids_members").select("*").eq("group_id", groupId).eq("status", "inscrit"),
    c.supabase.from("kids_attendance").select("*").eq("group_id", groupId).eq("date", date),
  ]);
  const marked = new Set(((att ?? []) as KidsAttendance[]).map((a) => a.contact_id));
  const rows = ((mem ?? []) as KidsMember[])
    .filter((m) => !marked.has(m.contact_id))
    .map((m) => ({ entity_id: "kids", group_id: groupId, contact_id: m.contact_id, date, status: "present", marked_by: c.me.id }));
  let undo: string | null = null;
  if (rows.length) {
    const { data: ins } = await c.supabase.from("kids_attendance").insert(rows).select("id");
    const ids = ((ins ?? []) as { id: string }[]).map((r) => r.id);
    if (ids.length) undo = await recordUndo("kids.presences", { ops: [{ op: "remove", table: "kids_attendance", ids }], message: "Pointage collectif annulé" });
  }
  await flash(rows.length ? `${rows.length} présence${rows.length > 1 ? "s" : ""} enregistrée${rows.length > 1 ? "s" : ""}` : "Tout le groupe est déjà pointé", rows.length ? "success" : "info", { undo });
  refresh(groupId);
}

/* ---------- Fiche enfant (parents, autorisations) ---------- */

export async function saveChild(contactId: string, _s: FormState, fd: FormData): Promise<FormState> {
  const c = await kidsCtx();
  if (!c) return { error: "Moov'Up Kids n'est pas dans votre périmètre." };
  const { data } = await c.supabase.from("contacts").select("*").eq("id", contactId).maybeSingle();
  const contact = data as Contact | null;
  if (!contact || !contact.entity_ids.includes("kids")) return { error: "Enfant introuvable." };

  const p1 = str(fd.get("parent1_name"));
  const p1phone = str(fd.get("parent1_phone"));
  if (!p1 || !p1phone) return { error: "Indiquez au moins un parent avec son téléphone." };
  const s = (k: string, n = 80) => str(fd.get(k))?.slice(0, n) ?? null;
  const row = {
    entity_id: "kids",
    contact_id: contactId,
    parent1_name: p1.slice(0, 80),
    parent1_phone: p1phone.slice(0, 30),
    parent1_relation: s("parent1_relation", 30),
    parent2_name: s("parent2_name"),
    parent2_phone: s("parent2_phone", 30),
    parent2_relation: s("parent2_relation", 30),
    allow_leave_alone: fd.get("allow_leave_alone") === "on",
    allow_photos: fd.get("allow_photos") === "on",
    allow_medical: fd.get("allow_medical") === "on",
    pickup_names: s("pickup_names", 200),
    health_notes: s("health_notes", 300),
    updated_at: new Date().toISOString(),
  };
  const { data: existing } = await c.supabase.from("kids_children").select("id").eq("contact_id", contactId).maybeSingle();
  const { error } = existing
    ? await c.supabase.from("kids_children").update(row).eq("id", (existing as { id: string }).id)
    : await c.supabase.from("kids_children").insert(row);
  if (error) return { error: "Impossible d'enregistrer la fiche enfant." };
  if (contact.guardian_name !== row.parent1_name) await c.supabase.from("contacts").update({ guardian_name: row.parent1_name }).eq("id", contactId);

  await flash("Fiche enfant enregistrée");
  revalidatePath(`/contacts/${contactId}`);
  revalidatePath("/kids");
  return undefined;
}
