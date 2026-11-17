import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { cache } from "react";
import { createClient } from "./supabase/server";
import { ENTITIES, ENTITY_IDS, type Entity, type EntityId } from "./entities";
import type { Profile } from "./types";

/** Profil de l'utilisateur connecté (mis en cache par requête). */
export const getProfile = cache(async (): Promise<Profile> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!data) redirect("/login");
  return data as Profile;
});

export async function requireDirection() {
  const p = await getProfile();
  if (p.role !== "direction") redirect("/");
  return p;
}

export async function requireManager() {
  const p = await getProfile();
  if (p.role !== "direction" && p.role !== "manager") redirect("/");
  return p;
}

/** Établissements que l'utilisateur a le droit de voir */
export function allowedEntities(p: Profile): EntityId[] {
  return p.role === "direction" || !p.entity_ids?.length ? ENTITY_IDS : p.entity_ids;
}

export type Scope = {
  /** Établissement sélectionné dans le sélecteur (null = tous ceux autorisés) */
  current: Entity | null;
  /** Identifiants à utiliser dans les requêtes : .in("entity_id", scope.ids) */
  ids: EntityId[];
  /** Établissements autorisés (pour les listes déroulantes) */
  allowed: Entity[];
};

/**
 * Périmètre affiché : le cookie « scope » choisi dans la barre du haut,
 * limité aux établissements autorisés pour ce profil.
 */
export const getScope = cache(async (): Promise<Scope> => {
  const p = await getProfile();
  const ids = allowedEntities(p);
  const allowed = ENTITIES.filter((e) => ids.includes(e.id));
  const chosen = (await cookies()).get("scope")?.value;
  const current = allowed.find((e) => e.id === chosen) ?? (allowed.length === 1 ? allowed[0]! : null);
  return { current, ids: current ? [current.id] : ids, allowed };
});
