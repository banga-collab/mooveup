/**
 * Espace adhérent : identification du client connecté, séparée de l'équipe.
 * - Réel : compte Supabase Auth (`raw_user_meta_data.kind = 'member'`) + ligne `member_accounts`
 *   (voir supabase/member.sql) ; les lectures passent par la session (RLS « my_contact_id() »).
 * - Démo : cookie « demo_member » (identifiant d'un compte de `member_accounts`).
 * Fichier serveur uniquement.
 */
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEMO, demoClient, demoDb } from "./demo";
import { publicDb } from "./access";
import { createClient } from "./supabase/server";
import { DEFAULT_SETTINGS, type Settings } from "./settings";
import { addDaysKey, agadirToIso, dayKey } from "./utils";
import { seedMember } from "./seed/member";
import type { Contact } from "./types";
import type { MemberAccount } from "./types-member";
import "@/lib/supabase/paginate";

export const MEMBER_COOKIE = "demo_member";
/** Mot de passe commun des comptes adhérents de démonstration */
export const DEMO_MEMBER_PASSWORD = "adherent2026";

export type Member = { account: MemberAccount; contact: Contact | null };
export type LinkedMember = { account: MemberAccount; contact: Contact };

/* ---------- Démo ---------- */

/** Comptes adhérents de démonstration (créés à la volée si la base de démo est antérieure au module) */
export function demoMemberAccounts(): MemberAccount[] {
  const db = demoDb();
  if (!db.member_accounts?.length) {
    const day = (n: number) => addDaysKey(dayKey(), n);
    const extra = seedMember(db, {
      uid: () => crypto.randomUUID(),
      rnd: Math.random,
      pick: (a) => a[0]!,
      int: (min) => min,
      day,
      at: (n, hhmm) => agadirToIso(day(n), hhmm),
    });
    db.member_accounts = extra.member_accounts ?? [];
    db.member_requests ??= [];
  }
  return db.member_accounts as MemberAccount[];
}

/* ---------- Clients Supabase ---------- */

/** Lecture des données de l'adhérent : session (RLS) en réel, base de démo sinon. Toujours filtrer par contact_id. */
export async function memberReadDb(): Promise<SupabaseClient> {
  if (DEMO) return demoClient(null) as SupabaseClient;
  return createClient();
}

/** Écritures (RDV, tâches, activités) : clé de service côté serveur, APRÈS vérification de l'adhérent */
export function memberWriteDb(): SupabaseClient {
  return publicDb();
}

/** Réglages du groupe lus sans session d'équipe */
export async function memberSettings(): Promise<Settings> {
  try {
    const { data } = await publicDb().from("settings").select("*").eq("id", 1).maybeSingle();
    return { ...DEFAULT_SETTINGS, ...((data as Partial<Settings> | null) ?? {}) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/* ---------- Adhérent connecté ---------- */

/** Adhérent connecté (null si personne, ou si la session est celle d'un membre de l'équipe) */
export const getMember = cache(async (): Promise<Member | null> => {
  if (DEMO) {
    const id = (await cookies()).get(MEMBER_COOKIE)?.value;
    if (!id) return null;
    const account = demoMemberAccounts().find((a) => a.user_id === id);
    if (!account) return null;
    const contact = account.contact_id ? ((demoDb().contacts ?? []).find((c) => c.id === account.contact_id) as Contact | undefined) ?? null : null;
    return { account: { ...account }, contact: contact ? { ...contact } : null };
  }
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase.from("member_accounts").select("*").eq("user_id", user.id).maybeSingle();
    const account = data as MemberAccount | null;
    if (!account) return null;
    let contact: Contact | null = null;
    if (account.contact_id) {
      const { data: c } = await supabase.from("contacts").select("*").eq("id", account.contact_id).maybeSingle();
      contact = (c as Contact | null) ?? null;
    }
    return { account, contact };
  } catch {
    return null;
  }
});

/** Pages de l'espace : adhérent connecté ET rattaché à sa fiche client, sinon redirection */
export async function requireMember(): Promise<LinkedMember> {
  const m = await getMember();
  if (!m) redirect("/espace/connexion");
  if (!m.contact) redirect("/espace/attente");
  return m as LinkedMember;
}
