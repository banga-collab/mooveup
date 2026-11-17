/* Journal des actions sensibles (table `audit_log`, page /journal). */
import { createClient } from "./supabase/server";
import type { Profile } from "./types";

export type AuditInput = {
  /** ex. "vente.remise", "vente.remboursement", "contact.suppression", "caisse.cloture" */
  action: string;
  entity_id: string | null;
  target_type: string;
  target_id: string | null;
  summary: string;
  actor: Profile;
  /** Données complémentaires (montant, mode de paiement, lien…) */
  meta?: Record<string, unknown>;
};

/** Enregistre une action sensible dans le journal (n'interrompt jamais l'action en cas d'échec). */
export async function logAudit(input: AuditInput): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.from("audit_log").insert({
      action: input.action,
      entity_id: input.entity_id,
      target_type: input.target_type,
      target_id: input.target_id,
      summary: input.summary.slice(0, 500),
      actor_id: input.actor.id,
      actor_name: input.actor.full_name || input.actor.email,
      meta: input.meta ?? null,
      created_at: new Date().toISOString(),
    });
  } catch {
    /* le journal ne doit jamais bloquer une vente */
  }
}
