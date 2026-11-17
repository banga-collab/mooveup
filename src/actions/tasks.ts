"use server";

import { revalidatePath } from "next/cache";
import { getProfile, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Task, TaskPriority } from "@/lib/types";
import { str } from "@/lib/utils";

export type TaskFormState = { error?: string; ok?: number } | undefined;

const PRIORITIES: TaskPriority[] = ["basse", "normale", "haute"];

function refresh() {
  revalidatePath("/taches");
  revalidatePath("/", "layout");
}

/** Ajout rapide d'une tâche */
export async function createTask(_state: TaskFormState, formData: FormData): Promise<TaskFormState> {
  const [me, scope] = await Promise.all([getProfile(), getScope()]);
  const title = str(formData.get("title"));
  if (!title) return { error: "Indiquez ce qu'il faut faire." };

  const entityId = str(formData.get("entity_id"));
  if (!entityId || !scope.allowed.some((e) => e.id === entityId)) return { error: "Choisissez un établissement autorisé." };

  const due = str(formData.get("due_date"));
  if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) return { error: "Date d'échéance invalide." };

  const priorityRaw = str(formData.get("priority")) as TaskPriority | null;
  const priority = priorityRaw && PRIORITIES.includes(priorityRaw) ? priorityRaw : "normale";

  const supabase = await createClient();
  const assigned = str(formData.get("assigned_to"));
  if (assigned) {
    const { data: member } = await supabase.from("profiles").select("id").eq("id", assigned).maybeSingle();
    if (!member) return { error: "Membre de l'équipe introuvable." };
  }

  const contactId = str(formData.get("contact_id"));
  if (contactId) {
    const { data: c } = await supabase.from("contacts").select("id").eq("id", contactId).maybeSingle();
    if (!c) return { error: "Client introuvable." };
  }

  const { error } = await supabase.from("tasks").insert({
    title: title.slice(0, 200),
    entity_id: entityId,
    assigned_to: assigned ?? me.id,
    due_date: due,
    priority,
    contact_id: contactId,
    lead_id: null,
    done: false,
    created_by: me.id,
  });
  if (error) return { error: "Impossible d'enregistrer la tâche." };

  refresh();
  return { ok: Date.now() };
}

/** Charge une tâche si elle est dans le périmètre autorisé */
async function ownTask(id: string) {
  const [me, scope] = await Promise.all([getProfile(), getScope()]);
  const supabase = await createClient();
  const { data } = await supabase.from("tasks").select("*").eq("id", id).maybeSingle();
  const task = data as Task | null;
  if (!task) return null;
  const allowed = scope.allowed.map((e) => e.id as string);
  if (task.entity_id && !allowed.includes(task.entity_id) && task.assigned_to !== me.id) return null;
  return { task, supabase };
}

/** Coche / décoche une tâche */
export async function toggleTask(id: string) {
  const res = await ownTask(id);
  if (!res) return;
  await res.supabase.from("tasks").update({ done: !res.task.done }).eq("id", id);
  refresh();
}

export async function deleteTask(id: string) {
  const res = await ownTask(id);
  if (!res) return;
  await res.supabase.from("tasks").delete().eq("id", id);
  refresh();
}
