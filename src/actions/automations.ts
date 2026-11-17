"use server";

import { revalidatePath } from "next/cache";
import { getProfile, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { flash } from "@/lib/flash";
import { runAutomations, siteOrigin } from "@/lib/automations";
import { automationDef } from "@/components/automations/defs";
import type { FormState } from "@/components/action-form";
import { str } from "@/lib/utils";

async function guard() {
  const [me, scope] = await Promise.all([getProfile(), getScope()]);
  if (!["direction", "manager", "reception"].includes(me.role)) throw new Error("Accès réservé à la direction, aux managers et à la réception.");
  return { me, scope, supabase: await createClient() };
}

async function upsertRule(key: string, patch: { enabled?: boolean; message?: string }, userId: string) {
  const def = automationDef(key);
  if (!def) return false;
  const supabase = await createClient();
  const { data } = await supabase.from("automation_rules").select("*").eq("id", def.key).maybeSingle();
  const row = { enabled: def.defaultEnabled, message: def.defaultMessage, ...((data as object | null) ?? {}), ...patch, id: def.key, updated_by: userId, updated_at: new Date().toISOString() };
  if (data) await supabase.from("automation_rules").update(row).eq("id", def.key);
  else await supabase.from("automation_rules").insert(row);
  return true;
}

/** Interrupteur actif / inactif */
export async function toggleRule(fd: FormData) {
  const { me } = await guard();
  const key = str(fd.get("key"));
  const enabled = fd.get("enabled") === "1";
  if (!key || !(await upsertRule(key, { enabled }, me.id))) return;
  await flash(enabled ? "Rappel activé" : "Rappel désactivé");
  revalidatePath("/automatisations");
}

/** Texte du message */
export async function saveRuleMessage(_s: FormState, fd: FormData): Promise<FormState> {
  const { me } = await guard();
  const key = str(fd.get("key"));
  const message = str(fd.get("message"));
  if (!message) return { error: "Le message ne peut pas être vide." };
  if (message.length > 900) return { error: "Message trop long (900 caractères au maximum)." };
  const def = automationDef(key);
  if (!def) return { error: "Règle inconnue." };
  if (def.key === "avis" && !message.includes("{lien}")) return { error: "Gardez la variable {lien} : c'est le lien vers la page d'avis." };
  await upsertRule(def.key, { message }, me.id);
  await flash("Message enregistré");
  revalidatePath("/automatisations");
  return undefined;
}

/** Bouton « Exécuter maintenant » */
export async function runNow(_s: FormState, fd: FormData): Promise<FormState> {
  const { me, scope, supabase } = await guard();
  const only = automationDef(str(fd.get("only")))?.key;
  const r = await runAutomations({ supabase, entityIds: scope.ids, authorId: me.id, origin: await siteOrigin(), only });
  const done = r.sent + r.simulated;
  const parts = [done ? `${done} message${done > 1 ? "s" : ""} ${r.sent ? "envoyé" : "préparé"}${done > 1 ? "s" : ""}` : "Aucun nouveau message à envoyer"];
  if (r.failed) parts.push(`${r.failed} échec${r.failed > 1 ? "s" : ""}`);
  if (r.skipped) parts.push(`${r.skipped} sans WhatsApp`);
  await flash(parts.join(" · "), r.failed ? "error" : done ? "success" : "info");
  revalidatePath("/automatisations");
  revalidatePath("/avis");
  return undefined;
}
