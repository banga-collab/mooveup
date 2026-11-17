"use server";

import { revalidatePath } from "next/cache";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Vues enregistrées (table `saved_views`) : une URL de liste avec ses filtres et son tri,
 * nommée par l'utilisateur et affichée dans la barre latérale.
 * `icon` = route de base (ex. « /ventes ») : la barre latérale reprend l'icône du menu.
 */
export type SavedView = { id: string; user_id: string; label: string; href: string; icon: string | null; created_at: string };

const MAX_VIEWS = 30;

/** Lien interne uniquement (« /ventes?statut=impayee »), jamais « //site » ni « https:// » */
function cleanHref(href: string) {
  const h = href.trim();
  if (!h.startsWith("/") || h.startsWith("//") || h.includes("\\") || h.length > 600) return null;
  return h;
}

/** Vues de l'utilisateur connecté (les plus récentes d'abord) */
export async function listViews(): Promise<SavedView[]> {
  const me = await getProfile();
  const supabase = await createClient();
  const { data } = await supabase.from("saved_views").select("*").eq("user_id", me.id).order("created_at", { ascending: false });
  return (data ?? []) as SavedView[];
}

/** Enregistre (ou renomme si l'URL existe déjà) la vue courante */
export async function saveView(input: { label: string; href: string; icon?: string | null }): Promise<{ error?: string; id?: string; updated?: boolean }> {
  const me = await getProfile();
  const label = input.label.trim().replace(/\s+/g, " ").slice(0, 60);
  const href = cleanHref(input.href);
  if (!label) return { error: "Donnez un nom à cette vue (ex. « Impayés du mois »)." };
  if (!href) return { error: "Cette page ne peut pas être enregistrée comme vue." };
  const icon = input.icon && /^\/[a-z0-9/-]*$/i.test(input.icon) ? input.icon.slice(0, 60) : `/${href.split(/[/?#]/)[1] ?? ""}`;

  const supabase = await createClient();
  const { data } = await supabase.from("saved_views").select("*").eq("user_id", me.id);
  const mine = (data ?? []) as SavedView[];
  const same = mine.find((v) => v.href === href);
  if (same) {
    await supabase.from("saved_views").update({ label, icon }).eq("id", same.id);
    revalidatePath("/", "layout");
    return { id: same.id, updated: true };
  }
  if (mine.length >= MAX_VIEWS) return { error: `Vous avez déjà ${MAX_VIEWS} vues : supprimez-en une dans la barre latérale.` };

  const id = crypto.randomUUID();
  const { error } = await supabase.from("saved_views").insert({ id, user_id: me.id, label, href, icon, created_at: new Date().toISOString() });
  if (error) return { error: "Enregistrement impossible pour le moment. Réessayez dans un instant." };
  revalidatePath("/", "layout");
  return { id };
}

/** Renomme une vue de l'utilisateur */
export async function renameView(id: string, label: string): Promise<{ error?: string }> {
  const me = await getProfile();
  const clean = label.trim().replace(/\s+/g, " ").slice(0, 60);
  if (!clean) return { error: "Le nom ne peut pas être vide." };
  const supabase = await createClient();
  await supabase.from("saved_views").update({ label: clean }).eq("id", id).eq("user_id", me.id);
  revalidatePath("/", "layout");
  return {};
}

/** Supprime une vue de l'utilisateur */
export async function deleteView(id: string): Promise<void> {
  const me = await getProfile();
  const supabase = await createClient();
  await supabase.from("saved_views").delete().eq("id", id).eq("user_id", me.id);
  revalidatePath("/", "layout");
}
