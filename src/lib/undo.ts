/**
 * Annulation (5 s) des actions réversibles.
 *
 * Une server action réversible mémorise l'état précédent dans `undo_log`
 * puis passe le jeton à `flash()` :
 *
 *   const undo = await recordUndo("tache.suppression", { ops: [{ op: "restore", table: "tasks", rows: [task] }] });
 *   await flash("Tâche supprimée", "success", { undo });
 *
 * Le toast affiche « Annuler » ; un clic appelle `undoAction(token)` (`@/actions/undo`)
 * qui rejoue les opérations inverses.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "./supabase/server";
import { getProfile } from "./auth";

type Row = Record<string, unknown>;

/** Opération inverse à rejouer lors de l'annulation */
export type UndoOp =
  /** Remet les valeurs précédentes d'une ligne */
  | { op: "update"; table: string; id: string; values: Row }
  /** Recrée (ou remet à l'identique) des lignes supprimées */
  | { op: "restore"; table: string; rows: Row[] }
  /** Supprime des lignes créées par l'action */
  | { op: "remove"; table: string; ids: string[] };

export type UndoPayload = {
  ops: UndoOp[];
  /** Message du toast après annulation (défaut : « Action annulée ») */
  message?: string;
  /** Page où revenir après annulation (ex. fiche du client restauré) */
  href?: string | null;
};

export type UndoLog = {
  token: string;
  user_id: string;
  kind: string;
  payload: UndoPayload;
  expires_at: string;
  created_at: string;
};

/** Durée d'affichage du bouton « Annuler » */
export const UNDO_WINDOW_MS = 5_000;
/** Marge côté serveur (latence réseau, clic à la dernière seconde) */
const UNDO_GRACE_MS = 10_000;

/** Tables liées à un client (supprimées en cascade avec lui), dans l'ordre de restauration */
export const CONTACT_LINKED_TABLES = [
  "leads",
  "subscriptions",
  "appointments",
  "activities",
  "tasks",
  "member_cards",
  "online_bookings",
  "checkins",
  "care_profiles",
  "treatment_records",
  "consents",
  "care_photos",
  "kids_members",
  "kids_children",
  "kids_attendance",
  "loyalty_ledger",
  "message_log",
  "reviews",
] as const;

/** Tables que l'annulation a le droit de modifier */
const UNDO_TABLES = new Set<string>(["contacts", "catalog_items", "sales", "gift_cards", ...CONTACT_LINKED_TABLES]);

function newToken() {
  return (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
}

/**
 * Mémorise l'état précédent d'une action et renvoie le jeton d'annulation
 * (null si l'enregistrement échoue : l'action reste valable, sans bouton « Annuler »).
 */
export async function recordUndo(kind: string, payload: UndoPayload): Promise<string | null> {
  try {
    const [me, supabase] = await Promise.all([getProfile(), createClient()]);
    const now = Date.now();
    // Ménage : jetons expirés de cet utilisateur
    await supabase.from("undo_log").delete().eq("user_id", me.id).lt("expires_at", new Date(now).toISOString());
    const token = newToken();
    const { error } = await supabase.from("undo_log").insert({
      token,
      user_id: me.id,
      kind: kind.slice(0, 60),
      payload,
      expires_at: new Date(now + UNDO_WINDOW_MS + UNDO_GRACE_MS).toISOString(),
      created_at: new Date(now).toISOString(),
    });
    return error ? null : token;
  } catch {
    return null;
  }
}

/** Rejoue les opérations inverses ; renvoie false si l'une d'elles a échoué */
export async function applyUndoOps(supabase: SupabaseClient, ops: UndoOp[]): Promise<boolean> {
  let ok = true;
  for (const op of ops) {
    if (!UNDO_TABLES.has(op.table)) {
      ok = false;
      continue;
    }
    if (op.op === "update") {
      const { error } = await supabase.from(op.table).update(op.values).eq("id", op.id);
      if (error) ok = false;
    } else if (op.op === "restore") {
      if (!op.rows.length) continue;
      const { error } = await supabase.from(op.table).upsert(op.rows);
      if (error) ok = false;
    } else if (op.op === "remove") {
      if (!op.ids.length) continue;
      const { error } = await supabase.from(op.table).delete().in("id", op.ids);
      if (error) ok = false;
    }
  }
  return ok;
}

/**
 * Photographie d'un client et de toutes ses lignes liées, AVANT sa suppression :
 * opérations qui le recréent à l'identique (fiche, historique, abonnements, RDV…).
 */
export async function contactSnapshotOps(supabase: SupabaseClient, contact: Row & { id: string }): Promise<UndoOp[]> {
  const id = contact.id;
  const [linked, sales, giftBuyer, giftBenef] = await Promise.all([
    Promise.all(CONTACT_LINKED_TABLES.map((t) => supabase.from(t).select("*").eq("contact_id", id))),
    supabase.from("sales").select("*").eq("contact_id", id),
    supabase.from("gift_cards").select("*").eq("buyer_contact_id", id),
    supabase.from("gift_cards").select("*").eq("beneficiary_contact_id", id),
  ]);
  const ops: UndoOp[] = [{ op: "restore", table: "contacts", rows: [contact] }];
  CONTACT_LINKED_TABLES.forEach((table, i) => {
    const rows = (linked[i]?.data ?? []) as Row[];
    if (rows.length) ops.push({ op: "restore", table, rows });
  });
  // Ventes et cartes cadeaux : le lien vers le client est remis (ON DELETE SET NULL)
  const saleRows = (sales.data ?? []) as Row[];
  if (saleRows.length) ops.push({ op: "restore", table: "sales", rows: saleRows });
  const gifts = new Map<string, Row>();
  for (const g of [...((giftBuyer.data ?? []) as Row[]), ...((giftBenef.data ?? []) as Row[])]) gifts.set(String(g.id), g);
  if (gifts.size) ops.push({ op: "restore", table: "gift_cards", rows: [...gifts.values()] });
  return ops;
}
