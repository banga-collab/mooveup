"use server";

import { revalidatePath } from "next/cache";
import { requireDirection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ENTITY_IDS, type EntityId } from "@/lib/entities";
import type { Profile, Role } from "@/lib/types";
import { ROLE_LABEL, str } from "@/lib/utils";
import { logAudit } from "@/lib/audit";
import { flash } from "@/lib/flash";

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

  if (role !== member.role) {
    await logAudit({
      action: "equipe.role",
      entity_id: null,
      target_type: "profile",
      target_id: member.id,
      summary: `Rôle de ${member.full_name} : ${ROLE_LABEL[member.role]} → ${ROLE_LABEL[role]}`,
      actor: me,
      meta: { from: member.role, to: role },
    });
  }
  if (active !== member.active) {
    await logAudit({
      action: "equipe.acces",
      entity_id: null,
      target_type: "profile",
      target_id: member.id,
      summary: `Accès de ${member.full_name} ${active ? "réactivé" : "désactivé"}`,
      actor: me,
    });
  }

  revalidatePath("/equipe");
  await flash(`${member.full_name} mis à jour`);
  return { ok: Date.now() };
}
