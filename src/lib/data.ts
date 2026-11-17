import { createClient } from "./supabase/server";
import type { Scope } from "./auth";
import type { Contact, Profile } from "./types";

/** Index par id */
export function byId<T extends { id: string }>(rows: T[] | null | undefined) {
  return new Map((rows ?? []).map((r) => [r.id, r]));
}

/** Membres actifs de l'équipe qui travaillent dans le périmètre */
export async function getTeam(scope: Scope): Promise<Profile[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").eq("active", true).order("full_name");
  return ((data ?? []) as Profile[]).filter((p) => !p.entity_ids.length || p.entity_ids.some((e) => scope.ids.includes(e)));
}

/** Contacts liés au périmètre (au moins un établissement en commun) */
export async function getContacts(scope: Scope): Promise<Contact[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("contacts").select("*").overlaps("entity_ids", scope.ids).order("full_name");
  return (data ?? []) as Contact[];
}

/** Clé AAAA-MM d'une date à Agadir */
const monthFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Casablanca", year: "numeric", month: "2-digit" });
export function monthKey(d: string | Date) {
  return monthFmt.format(new Date(d)).slice(0, 7);
}

/** Les N derniers mois (du plus ancien au courant) : [{ key: "2026-06", label: "juin" }] */
export function lastMonths(n: number) {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (n - 1 - i), 15));
    return { key: d.toISOString().slice(0, 7), label: new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(d).replace(".", "") };
  });
}
