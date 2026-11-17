"use server";

import { revalidatePath } from "next/cache";
import { requireDirection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ENTITY_IDS, type EntityId } from "@/lib/entities";
import type { Profile, Role } from "@/lib/types";
import { str } from "@/lib/utils";

export type MemberFormState = { error?: string; ok?: number } | undefined;

const ROLES: Role[] = ["direction", "manager", "reception", "staff"];

/** Direction : rôle, établissements, poste, téléphone, actif */
export async function updateMember(id: string, _state: MemberFormState, formData: FormData): Promise<MemberFormState> {
  const me = await requireDirection();
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
  const member = data as Profile | null;
  if (!member) return { error: "Membre introuvable." };
  const self = member.id === me.id;

  const roleRaw = str(formData.get("role")) as Role | null;
  const role: Role = self ? member.role : roleRaw && ROLES.includes(roleRaw) ? roleRaw : member.role;
  const entityIds = formData
    .getAll("entity_ids")
    .map(String)
    .filter((e): e is EntityId => ENTITY_IDS.includes(e as EntityId));
  if (role !== "direction" && !entityIds.length) return { error: "Attribuez au moins un établissement." };

  const active = self ? true : formData.get("active") === "on";
  const phone = str(formData.get("phone"));
  const job = str(formData.get("job_title"));

  const { error } = await supabase
    .from("profiles")
    .update({
      role,
      entity_ids: role === "direction" ? [] : [...new Set(entityIds)],
      job_title: job ? job.slice(0, 80) : null,
      phone: phone ? phone.slice(0, 30) : null,
      active,
    })
    .eq("id", id);
  if (error) return { error: "Impossible d'enregistrer les modifications." };

  revalidatePath("/equipe");
  return { ok: Date.now() };
}
