"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Lang } from "@/lib/i18n/core";
import type { OnboardingStep, SavedView } from "@/lib/types-shell";

const YEAR = 60 * 60 * 24 * 365;

/** Langue de l'interface (cookie « lang ») : la page se recharge avec <html lang dir> */
export async function setLang(lang: Lang) {
  (await cookies()).set("lang", lang === "ar" ? "ar" : "fr", { path: "/", maxAge: YEAR, sameSite: "lax" });
  revalidatePath("/", "layout");
}

/** Vues enregistrées du membre connecté (barre latérale) */
export async function listSavedViews(): Promise<SavedView[]> {
  const me = await getProfile();
  const supabase = await createClient();
  const { data } = await supabase.from("saved_views").select("*").eq("user_id", me.id).order("created_at");
  return ((data ?? []) as SavedView[]).filter((v) => typeof v.href === "string" && v.href.startsWith("/"));
}

export async function deleteSavedView(id: string) {
  const me = await getProfile();
  const supabase = await createClient();
  await supabase.from("saved_views").delete().eq("id", id).eq("user_id", me.id);
  revalidatePath("/", "layout");
}

/**
 * Prise en main : étapes cochées automatiquement d'après les données du membre.
 * « palette » et « raccourcis » sont cochées côté navigateur (localStorage).
 */
export async function getOnboarding(): Promise<OnboardingStep[]> {
  const me = await getProfile();
  const supabase = await createClient();
  const head = { count: "exact" as const, head: true };
  const [clients, sales, rdv, scans, tasks] = await Promise.all([
    supabase.from("contacts").select("id", head).eq("owner_id", me.id),
    supabase.from("sales").select("id", head).eq("sold_by", me.id),
    supabase.from("activities").select("id", head).eq("author_id", me.id).eq("kind", "rdv"),
    supabase.from("checkins").select("id", head).eq("by_id", me.id),
    supabase.from("tasks").select("id", head).eq("created_by", me.id),
  ]);
  const n = (r: { count: number | null }) => (r.count ?? 0) > 0;
  return [
    { id: "client", done: n(clients), href: "/contacts/nouveau" },
    { id: "rdv", done: n(rdv), href: "/agenda/nouveau" },
    { id: "vente", done: n(sales), href: "/caisse" },
    { id: "entree", done: n(scans), href: "/acces" },
    { id: "tache", done: n(tasks), href: "/taches#nouvelle-tache" },
    { id: "palette", done: false, href: "#palette" },
    { id: "raccourcis", done: false, href: "#raccourcis" },
  ];
}
