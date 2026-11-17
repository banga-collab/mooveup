import { cookies } from "next/headers";

export type FlashOptions = {
  /** Jeton renvoyé par `recordUndo()` (`@/lib/undo`) : le toast affiche « Annuler » pendant 5 s */
  undo?: string | null;
};

/**
 * Message de confirmation affiché en bas de l'écran après une action
 * (« Vente enregistrée », « Client ajouté »…). À appeler dans une server action
 * juste avant `redirect()` ou `revalidatePath()`.
 *
 * Action réversible : `await flash("Tâche supprimée", "success", { undo: token })`.
 */
export async function flash(message: string, tone: "success" | "error" | "info" = "success", opts: FlashOptions = {}) {
  const payload: { m: string; t: typeof tone; id: number; u?: string } = { m: message, t: tone, id: Date.now() };
  if (opts.undo) payload.u = opts.undo;
  (await cookies()).set("flash", encodeURIComponent(JSON.stringify(payload)), {
    path: "/",
    maxAge: 30,
    sameSite: "lax",
  });
}
