/**
 * Fidélité du groupe Moov'Up : un seul programme pour les 7 établissements
 * (points gagnés au sport, dépensés à l'institut…), cartes cadeaux et parrainage.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Contact, Profile, Sale } from "./types";
import type { SaleLine } from "./hooks";
import type { LedgerRow, Referral } from "./types-loyalty";
import { createClient } from "./supabase/server";
import { getSettings, type Settings } from "./settings";
import { DEMO } from "./demo";
import { mad } from "./utils";

/* ---------- Calculs ---------- */

/** Points gagnés pour un montant : floor(total / 10) × points par tranche de 10 MAD */
export function pointsFor(totalMad: number, s: Pick<Settings, "loyalty_points_per_10mad">) {
  return Math.max(0, Math.floor(Number(totalMad) / 10) * Number(s.loyalty_points_per_10mad || 0));
}

/** Valeur en MAD d'un nombre de points */
export function pointsValue(points: number, s: Pick<Settings, "loyalty_point_value_mad">) {
  return Math.round(points * Number(s.loyalty_point_value_mad || 0) * 100) / 100;
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Code lisible : MU-GC-7K2P */
export function readableCode(prefix: string, len = 4) {
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return `${prefix}-${s}`;
}

/** Code de parrainage stable d'un client : SALMA-7K2P */
export function referralCode(c: Pick<Contact, "id" | "full_name">) {
  const first =
    (c.full_name.split(/\s+/)[0] ?? "MU")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toUpperCase()
      .replace(/[^A-Z]/g, "")
      .slice(0, 8) || "MU";
  let h = 2166136261;
  for (const ch of c.id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  let tail = "";
  for (let i = 0; i < 4; i++) {
    tail += ALPHABET[(h >>> 0) % ALPHABET.length];
    h = Math.imul(h ^ (h >>> 13), 2654435761);
  }
  return `${first}-${tail}`;
}

/** Prénom pour les messages */
export function firstName(name: string) {
  return name.split(/\s+/)[0] ?? name;
}

/* ---------- Lecture ---------- */

/**
 * Charge toutes les lignes d'une requête (au-delà de la limite de 1 000 lignes
 * de Supabase). `make` doit recréer la requête à chaque appel.
 */
export async function fetchAll<T>(make: () => any): Promise<T[]> {
  if (DEMO) {
    const { data } = await make();
    return (data ?? []) as T[];
  }
  const out: T[] = [];
  for (let from = 0; from < 200_000; from += 1000) {
    const { data } = await make().range(from, from + 999);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

export type Balance = { balance: number; earned: number; last: string };

/** Soldes de points (tous établissements confondus) par client */
export async function loadBalances(supabase: SupabaseClient, contactIds?: string[]) {
  const rows = await fetchAll<Pick<LedgerRow, "contact_id" | "points" | "created_at">>(() => {
    const q = supabase.from("loyalty_ledger").select("contact_id, points, created_at");
    return contactIds ? q.in("contact_id", contactIds) : q;
  });
  const map = new Map<string, Balance>();
  for (const r of rows) {
    const m = map.get(r.contact_id) ?? { balance: 0, earned: 0, last: "" };
    m.balance += Number(r.points);
    if (r.points > 0) m.earned += Number(r.points);
    if (r.created_at > m.last) m.last = r.created_at;
    map.set(r.contact_id, m);
  }
  return map;
}

/* ---------- Écriture (appelées par les ventes) ---------- */

async function note(supabase: SupabaseClient, contactId: string, entityId: string, body: string, authorId: string | null) {
  await supabase.from("activities").insert({ contact_id: contactId, entity_id: entityId, kind: "note", body, author_id: authorId });
}

/** Crédite les points de fidélité d'une vente (appelé après chaque vente) */
export async function awardLoyaltyForSale(ctx: { sale: Sale; lines: SaleLine[]; contact: Contact | null; profile: Profile }): Promise<void> {
  const { sale, contact, profile } = ctx;
  if (!contact || sale.status === "remboursee") return;
  try {
    const [supabase, settings] = await Promise.all([createClient(), getSettings()]);
    // L'achat d'une carte cadeau ne rapporte pas de points (ils seront gagnés quand la carte sera utilisée)
    const giftPart = ctx.lines.filter((l) => /^carte cadeau/i.test(l.label)).reduce((a, l) => a + Number(l.qty) * Number(l.unit_price_mad), 0);
    const pts = pointsFor(Math.max(0, Number(sale.total_mad) - giftPart), settings);
    if (pts > 0) {
      await supabase.from("loyalty_ledger").insert({
        contact_id: contact.id,
        entity_id: sale.entity_id,
        points: pts,
        kind: "gain",
        sale_id: sale.id,
        voucher_code: null,
        value_mad: null,
        voucher_used: false,
        note: `Vente ${sale.number}`,
        author_id: profile.id,
      });
      await note(supabase, contact.id, sale.entity_id, `Fidélité : +${pts} points (vente ${sale.number}, ${mad(sale.total_mad)})`, profile.id);
    }

    // Parrainage : bonus au parrain à la première vente du filleul
    const { data: refRow } = await supabase.from("referrals").select("*").eq("referee_id", contact.id).eq("status", "en_attente").maybeSingle();
    const ref = refRow as Referral | null;
    if (ref) {
      const bonus = Number(settings.referral_bonus_points || 0);
      await supabase.from("referrals").update({ status: "valide", bonus_points: bonus, rewarded_at: new Date().toISOString() }).eq("id", ref.id);
      if (bonus > 0) {
        await supabase.from("loyalty_ledger").insert({
          contact_id: ref.referrer_id,
          entity_id: sale.entity_id,
          points: bonus,
          kind: "parrainage",
          sale_id: null,
          voucher_code: null,
          value_mad: null,
          voucher_used: false,
          note: `Parrainage de ${contact.full_name}`,
          author_id: profile.id,
        });
        await note(supabase, ref.referrer_id, sale.entity_id, `Parrainage validé : ${contact.full_name} a fait son premier achat, +${bonus} points`, profile.id);
      }
    }
  } catch (e) {
    console.error("Fidélité : crédit impossible", e);
  }
}

/** Retire les points d'une vente remboursée */
export async function revokeLoyaltyForSale(ctx: { sale: Sale; profile: Profile }): Promise<void> {
  const { sale, profile } = ctx;
  if (!sale.contact_id) return;
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("loyalty_ledger").select("*").eq("sale_id", sale.id);
    const net = ((data ?? []) as LedgerRow[]).reduce((a, r) => a + Number(r.points), 0);
    if (net <= 0) return;
    await supabase.from("loyalty_ledger").insert({
      contact_id: sale.contact_id,
      entity_id: sale.entity_id,
      points: -net,
      kind: "annulation",
      sale_id: sale.id,
      voucher_code: null,
      value_mad: null,
      voucher_used: false,
      note: `Remboursement de la vente ${sale.number}`,
      author_id: profile.id,
    });
    await note(supabase, sale.contact_id, sale.entity_id, `Fidélité : −${net} points (vente ${sale.number} remboursée)`, profile.id);
  } catch (e) {
    console.error("Fidélité : retrait impossible", e);
  }
}
