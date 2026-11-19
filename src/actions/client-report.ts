"use server";

import { getProfile, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { matchesQuery } from "@/lib/search-match";
import type { Contact } from "@/lib/types";

export type ClientHit = { id: string; full_name: string; phone: string | null; status: Contact["status"] };

/** Recherche de clients (nom, téléphone, e-mail) pour composer un rapport — 20 résultats au plus */
export async function findReportClients(q: string): Promise<ClientHit[]> {
  const me = await getProfile();
  if (me.role === "staff") return [];
  const scope = await getScope();
  const term = q.trim().slice(0, 60);
  if (term.length < 2) return [];
  const supabase = await createClient();
  const digits = term.replace(/\D/g, "");
  const like = term.replace(/[%,()*]/g, " ").trim();
  const filters = [`full_name.ilike.%${like}%`, `email.ilike.%${like}%`];
  if (digits.length >= 3) filters.push(`phone.ilike.%${digits}%`);
  const { data } = await supabase.from("contacts").select("id, full_name, phone, status, email").overlaps("entity_ids", scope.ids).or(filters.join(",")).order("full_name").limit(60);
  let rows = (data ?? []) as (ClientHit & { email: string | null })[];
  // Téléphones saisis avec espaces : 2e passe tolérante
  if (rows.length < 5 && digits.length >= 3) {
    const { data: all } = await supabase.from("contacts").select("id, full_name, phone, status, email").overlaps("entity_ids", scope.ids).ilike("phone", `%${digits.slice(-4)}%`).limit(200);
    const seen = new Set(rows.map((r) => r.id));
    for (const r of (all ?? []) as (ClientHit & { email: string | null })[]) if (!seen.has(r.id) && matchesQuery(term, r.full_name, r.phone)) rows.push(r);
  }
  rows = rows.filter((r) => matchesQuery(term, r.full_name, r.phone, r.email));
  return rows.slice(0, 20).map(({ id, full_name, phone, status }) => ({ id, full_name, phone, status }));
}
