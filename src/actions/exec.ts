"use server";

import { revalidatePath } from "next/cache";
import { getScope, requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { flash } from "@/lib/flash";
import { addDaysKey, dayKey, parseNum } from "@/lib/utils";

type FormState = { error?: string } | undefined;

const RELANCE_PREFIX = "Relance fidélisation";

/** Crée une tâche de relance pour un client à risque de départ (et la note sur sa fiche) */
export async function createRetentionTask(input: { contactId: string; entityId: string; score: number; reason: string }): Promise<{ error?: string }> {
  const [me, scope] = await Promise.all([requireManager(), getScope()]);
  if (!scope.allowed.some((e) => e.id === input.entityId)) return { error: "Établissement hors de votre périmètre." };

  const supabase = await createClient();
  const { data: contact } = await supabase.from("contacts").select("id, full_name, owner_id, entity_ids").eq("id", input.contactId).maybeSingle();
  const c = contact as { id: string; full_name: string; owner_id: string | null; entity_ids: string[] } | null;
  if (!c) return { error: "Client introuvable : la fiche a peut-être été supprimée." };

  const { data: open } = await supabase.from("tasks").select("id").eq("contact_id", c.id).eq("done", false).ilike("title", `${RELANCE_PREFIX}%`).limit(1);
  if (open?.length) return { error: "Une tâche de relance est déjà ouverte pour ce client (voir Tâches)." };

  const score = Math.max(0, Math.min(100, Math.round(Number(input.score) || 0)));
  const reason = String(input.reason ?? "").slice(0, 140);
  const due = score >= 60 ? dayKey() : addDaysKey(dayKey(), 2);

  let assignee = me.id;
  if (c.owner_id) {
    const { data: owner } = await supabase.from("profiles").select("id, active").eq("id", c.owner_id).maybeSingle();
    if ((owner as { active?: boolean } | null)?.active) assignee = c.owner_id;
  }

  const { error } = await supabase.from("tasks").insert({
    title: `${RELANCE_PREFIX} : ${c.full_name}${reason ? ` — ${reason}` : ""}`.slice(0, 200),
    contact_id: c.id,
    lead_id: null,
    entity_id: input.entityId,
    assigned_to: assignee,
    due_date: due,
    priority: score >= 60 ? "haute" : "normale",
    done: false,
    created_by: me.id,
  });
  if (error) return { error: "Impossible de créer la tâche. Réessayez dans un instant." };

  await supabase.from("activities").insert({
    contact_id: c.id,
    entity_id: input.entityId,
    kind: "note",
    body: `Risque de départ ${score}/100${reason ? ` (${reason})` : ""} : tâche de relance créée.`,
    author_id: me.id,
  });

  revalidatePath("/pilotage");
  revalidatePath("/taches");
  await flash("Tâche de relance créée");
  return {};
}

/** Enregistre les objectifs mensuels de CA (champ vide = objectif retiré) */
export async function saveMonthlyTargets(_state: FormState, formData: FormData): Promise<FormState> {
  const [me, scope] = await Promise.all([requireManager(), getScope()]);
  const supabase = await createClient();
  const now = new Date().toISOString();
  let changed = 0;

  for (const e of scope.allowed) {
    const key = `target_${e.id}`;
    if (!formData.has(key)) continue;
    const raw = String(formData.get(key) ?? "").trim();
    if (!raw) {
      await supabase.from("monthly_targets").delete().eq("id", e.id);
      changed++;
      continue;
    }
    const amount = parseNum(raw);
    if (amount === null || amount < 0 || amount > 100_000_000) return { error: `Objectif invalide pour ${e.short} : saisissez un montant en MAD (ex. 120000).` };
    const { error } = await supabase
      .from("monthly_targets")
      .upsert({ id: e.id, entity_id: e.id, amount_mad: Math.round(amount), updated_by: me.id, updated_at: now });
    if (error) return { error: "Enregistrement impossible : la table « monthly_targets » est-elle créée (supabase/exec.sql) ?" };
    changed++;
  }

  revalidatePath("/pilotage");
  await flash(changed ? "Objectifs enregistrés" : "Aucun changement");
  return undefined;
}
