"use server";

import { revalidatePath } from "next/cache";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { applyUndoOps, type UndoLog } from "@/lib/undo";

export type UndoResult = { ok: boolean; message: string; href?: string | null };

/** Annule une action récente (bouton « Annuler » du toast, ou Ctrl+Z) */
export async function undoAction(token: string): Promise<UndoResult> {
  if (typeof token !== "string" || !/^[a-f0-9]{32,80}$/.test(token)) return { ok: false, message: "Annulation impossible." };
  const [me, supabase] = await Promise.all([getProfile(), createClient()]);
  const { data } = await supabase.from("undo_log").select("*").eq("token", token).maybeSingle();
  const log = data as UndoLog | null;
  if (!log || log.user_id !== me.id) return { ok: false, message: "Cette action ne peut plus être annulée." };

  // Un jeton ne sert qu'une fois
  await supabase.from("undo_log").delete().eq("token", token);
  if (new Date(log.expires_at).getTime() < Date.now()) return { ok: false, message: "Délai d'annulation dépassé." };

  const ok = await applyUndoOps(supabase, log.payload?.ops ?? []);
  revalidatePath("/", "layout");
  return ok
    ? { ok: true, message: log.payload.message ?? "Action annulée", href: log.payload.href ?? null }
    : { ok: false, message: "Annulation incomplète : vérifiez la fiche concernée.", href: log.payload.href ?? null };
}
