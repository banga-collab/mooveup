"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getProfile, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { flash } from "@/lib/flash";
import { ENTITY_IDS, entity, type EntityId } from "@/lib/entities";
import type { Contact, PayMethod } from "@/lib/types";
import type { GiftCard, LedgerRow } from "@/lib/types-loyalty";
import { addDaysKey, dayKey, mad, parseNum, str } from "@/lib/utils";
import { loadBalances, pointsValue, readableCode } from "@/lib/loyalty";
import { createSale } from "@/actions/sales";
import type { FormState } from "@/components/action-form";

const METHODS: PayMethod[] = ["especes", "carte", "virement", "cheque", "en_ligne"];

async function ctx() {
  const [me, scope, supabase] = await Promise.all([getProfile(), getScope(), createClient()]);
  return { me, scope, supabase, allowed: scope.allowed.map((e) => e.id) as EntityId[] };
}

async function uniqueCode(supabase: Awaited<ReturnType<typeof createClient>>, table: "gift_cards" | "loyalty_ledger", column: string, prefix: string) {
  for (let i = 0; i < 6; i++) {
    const code = readableCode(prefix, i < 3 ? 4 : 6);
    const { data } = await supabase.from(table).select("id").eq(column, code).maybeSingle();
    if (!data) return code;
  }
  return readableCode(prefix, 8);
}

function revalidateContact(id: string | null | undefined) {
  if (id) revalidatePath(`/contacts/${id}`);
  revalidatePath("/fidelite");
}

/* ---------- Points ---------- */

/** Utiliser des points : crée un bon de réduction (mouvement négatif) */
export async function redeemPoints(_s: FormState, fd: FormData): Promise<FormState> {
  const { me, supabase, allowed } = await ctx();
  const contactId = str(fd.get("contact_id"));
  const entityId = str(fd.get("entity_id")) as EntityId | null;
  const points = Math.round(parseNum(fd.get("points")) ?? 0);
  if (!contactId) return { error: "Client manquant." };
  if (!entityId || !allowed.includes(entityId)) return { error: "Choisissez l'établissement où le bon sera utilisé." };
  if (points <= 0) return { error: "Indiquez un nombre de points supérieur à zéro." };
  const [{ data: c }, balances, settings] = await Promise.all([supabase.from("contacts").select("*").eq("id", contactId).maybeSingle(), loadBalances(supabase, [contactId]), getSettings()]);
  const contact = c as Contact | null;
  if (!contact) return { error: "Client introuvable." };
  const balance = balances.get(contactId)?.balance ?? 0;
  if (points > balance) return { error: `Solde insuffisant : ${balance} points disponibles.` };
  const value = pointsValue(points, settings);
  const code = await uniqueCode(supabase, "loyalty_ledger", "voucher_code", "MU-BON");
  const { error } = await supabase.from("loyalty_ledger").insert({
    contact_id: contactId,
    entity_id: entityId,
    points: -points,
    kind: "utilisation",
    sale_id: null,
    voucher_code: code,
    value_mad: value,
    voucher_used: false,
    note: `Bon de réduction ${mad(value)}`,
    author_id: me.id,
  });
  if (error) return { error: "Impossible de créer le bon." };
  await supabase.from("activities").insert({ contact_id: contactId, entity_id: entityId, kind: "note", body: `Fidélité : ${points} points utilisés, bon ${code} de ${mad(value)} à déduire en caisse`, author_id: me.id });
  await flash(`Bon ${code} de ${mad(value)} créé`);
  revalidateContact(contactId);
  return undefined;
}

/** Marque un bon de réduction comme utilisé en caisse */
export async function markVoucherUsed(fd: FormData) {
  const { supabase } = await ctx();
  const id = str(fd.get("id"));
  if (!id) return;
  const { data } = await supabase.from("loyalty_ledger").select("*").eq("id", id).maybeSingle();
  const row = data as LedgerRow | null;
  if (!row || !row.voucher_code) return;
  await supabase.from("loyalty_ledger").update({ voucher_used: true }).eq("id", id);
  await flash(`Bon ${row.voucher_code} marqué utilisé`);
  revalidateContact(row.contact_id);
}

/** Ajustement manuel (managers) */
export async function adjustPoints(_s: FormState, fd: FormData): Promise<FormState> {
  const { me, supabase, allowed } = await ctx();
  if (me.role !== "direction" && me.role !== "manager") return { error: "Réservé aux managers." };
  const contactId = str(fd.get("contact_id"));
  const entityId = str(fd.get("entity_id")) as EntityId | null;
  const points = Math.round(parseNum(fd.get("points")) ?? 0);
  const reason = str(fd.get("note"));
  if (!contactId || !points) return { error: "Indiquez un nombre de points (négatif pour retirer)." };
  if (!entityId || !allowed.includes(entityId)) return { error: "Établissement non autorisé." };
  if (!reason) return { error: "Indiquez la raison de l'ajustement." };
  if (points < 0) {
    const bal = (await loadBalances(supabase, [contactId])).get(contactId)?.balance ?? 0;
    if (bal + points < 0) return { error: `Le solde ne peut pas devenir négatif (${bal} points).` };
  }
  await supabase.from("loyalty_ledger").insert({ contact_id: contactId, entity_id: entityId, points, kind: "ajustement", sale_id: null, voucher_code: null, value_mad: null, voucher_used: false, note: reason.slice(0, 200), author_id: me.id });
  await supabase.from("activities").insert({ contact_id: contactId, entity_id: entityId, kind: "note", body: `Fidélité : ajustement de ${points > 0 ? "+" : ""}${points} points (${reason.slice(0, 200)})`, author_id: me.id });
  await flash("Points ajustés");
  revalidateContact(contactId);
  return undefined;
}

/* ---------- Cartes cadeaux ---------- */

export async function createGiftCard(_s: FormState, fd: FormData): Promise<FormState> {
  const { me, supabase, allowed, scope } = await ctx();
  const amount = Math.round((parseNum(fd.get("amount")) ?? 0) * 100) / 100;
  const soldAt = (str(fd.get("entity_id")) ?? scope.current?.id ?? allowed[0]) as EntityId;
  const buyerId = str(fd.get("buyer_id"));
  const beneficiaryId = str(fd.get("beneficiary_id"));
  const beneficiaryName = str(fd.get("beneficiary_name"));
  const valid = fd.getAll("valid").map(String).filter((e): e is EntityId => ENTITY_IDS.includes(e as EntityId));
  const expires = str(fd.get("expires_on")) ?? addDaysKey(dayKey(), 365);
  const message = str(fd.get("message"));
  const charge = fd.get("charge") === "on";
  const method = (str(fd.get("method")) ?? "especes") as PayMethod;

  if (!(amount > 0) || amount > 50_000) return { error: "Indiquez un montant entre 1 et 50 000 MAD." };
  if (!allowed.includes(soldAt)) return { error: "Établissement de vente non autorisé." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expires) || expires <= dayKey()) return { error: "La date d'expiration doit être dans le futur." };
  if (charge && !METHODS.includes(method)) return { error: "Mode de paiement inconnu." };

  const ids = [buyerId, beneficiaryId].filter((x): x is string => !!x);
  const { data: people } = ids.length ? await supabase.from("contacts").select("*").in("id", ids) : { data: [] };
  const byId = new Map(((people ?? []) as Contact[]).map((c) => [c.id, c]));
  const buyer = buyerId ? byId.get(buyerId) : undefined;
  const beneficiary = beneficiaryId ? byId.get(beneficiaryId) : undefined;
  if (!buyer && !str(fd.get("buyer_name"))) return { error: "Choisissez l'acheteur (client) ou saisissez son nom." };

  const code = await uniqueCode(supabase, "gift_cards", "code", "MU-GC");

  // Encaissement de la carte en caisse
  if (charge) {
    const res = await createSale({
      entity_id: soldAt,
      contact_id: buyer?.id ?? null,
      lines: [{ item_id: null, label: `Carte cadeau ${code}`, qty: 1, unit_price: amount }],
      discount_mode: "mad",
      discount_value: 0,
      method,
      paid: null,
      rdv_id: null,
      notes: `Carte cadeau ${code}`,
    });
    if (res.error) return { error: `Encaissement impossible : ${res.error}` };
  }

  const { data, error } = await supabase
    .from("gift_cards")
    .insert({
      code,
      amount_mad: amount,
      balance_mad: amount,
      buyer_contact_id: buyer?.id ?? null,
      buyer_name: buyer?.full_name ?? str(fd.get("buyer_name")),
      beneficiary_contact_id: beneficiary?.id ?? null,
      beneficiary_name: beneficiary?.full_name ?? beneficiaryName,
      entity_ids: valid.length === ENTITY_IDS.length ? [] : valid,
      entity_id: soldAt,
      expires_on: expires,
      status: "active",
      message: message?.slice(0, 200) ?? null,
      created_by: me.id,
    })
    .select()
    .single();
  if (error || !data) return { error: "Impossible d'enregistrer la carte." };
  const card = data as GiftCard;
  if (buyer) await supabase.from("activities").insert({ contact_id: buyer.id, entity_id: soldAt, kind: "vente", body: `Carte cadeau ${code} de ${mad(amount)} achetée${card.beneficiary_name ? ` pour ${card.beneficiary_name}` : ""}`, author_id: me.id });
  if (beneficiary && beneficiary.id !== buyer?.id)
    await supabase.from("activities").insert({ contact_id: beneficiary.id, entity_id: soldAt, kind: "note", body: `Carte cadeau ${code} de ${mad(amount)} reçue${buyer ? ` de ${buyer.full_name}` : ""}`, author_id: me.id });
  await flash(`Carte ${code} créée`);
  revalidatePath("/fidelite");
  redirect(`/fidelite/cartes/${card.id}`);
}

/** Utiliser une partie du solde d'une carte */
export async function spendGiftCard(_s: FormState, fd: FormData): Promise<FormState> {
  const { me, supabase, allowed } = await ctx();
  const id = str(fd.get("card_id"));
  const entityId = str(fd.get("entity_id")) as EntityId | null;
  const amount = Math.round((parseNum(fd.get("amount")) ?? 0) * 100) / 100;
  if (!id) return { error: "Carte introuvable." };
  const { data } = await supabase.from("gift_cards").select("*").eq("id", id).maybeSingle();
  const card = data as GiftCard | null;
  if (!card) return { error: "Carte introuvable." };
  if (card.status !== "active") return { error: "Cette carte n'est plus active." };
  if (card.expires_on < dayKey()) return { error: `Carte expirée depuis le ${card.expires_on}.` };
  if (!entityId || !allowed.includes(entityId)) return { error: "Choisissez l'établissement." };
  if (card.entity_ids.length && !card.entity_ids.includes(entityId)) return { error: `Carte non valable chez ${entity(entityId)?.short}.` };
  if (!(amount > 0)) return { error: "Indiquez le montant à déduire." };
  if (amount > Number(card.balance_mad)) return { error: `Solde insuffisant : il reste ${mad(card.balance_mad)}.` };
  const left = Math.round((Number(card.balance_mad) - amount) * 100) / 100;
  await supabase.from("gift_card_uses").insert({ card_id: card.id, entity_id: entityId, amount_mad: amount, note: str(fd.get("note"))?.slice(0, 200) ?? null, author_id: me.id });
  await supabase.from("gift_cards").update({ balance_mad: left, status: left <= 0 ? "epuisee" : "active" }).eq("id", card.id);
  const holder = card.beneficiary_contact_id ?? card.buyer_contact_id;
  if (holder) await supabase.from("activities").insert({ contact_id: holder, entity_id: entityId, kind: "vente", body: `Carte cadeau ${card.code} : ${mad(amount)} utilisés, reste ${mad(left)}`, author_id: me.id });
  await flash(left > 0 ? `${mad(amount)} déduits, reste ${mad(left)}` : "Carte entièrement utilisée");
  revalidatePath(`/fidelite/cartes/${card.id}`);
  revalidateContact(holder);
  return undefined;
}

export async function cancelGiftCard(fd: FormData) {
  const { me, supabase } = await ctx();
  if (me.role !== "direction" && me.role !== "manager") return;
  const id = str(fd.get("id"));
  if (!id) return;
  await supabase.from("gift_cards").update({ status: "annulee" }).eq("id", id);
  await flash("Carte annulée");
  revalidatePath("/fidelite");
  revalidatePath(`/fidelite/cartes/${id}`);
}

/* ---------- Parrainage ---------- */

export async function createReferral(_s: FormState, fd: FormData): Promise<FormState> {
  const { me, supabase, allowed, scope } = await ctx();
  const referrerId = str(fd.get("referrer_id"));
  const refereeId = str(fd.get("referee_id"));
  if (!referrerId || !refereeId) return { error: "Choisissez le parrain et le filleul." };
  if (referrerId === refereeId) return { error: "Le parrain et le filleul doivent être deux personnes différentes." };
  const [{ data: rows }, { data: existing }, { count: salesCount }] = await Promise.all([
    supabase.from("contacts").select("*").in("id", [referrerId, refereeId]),
    supabase.from("referrals").select("id").eq("referee_id", refereeId).maybeSingle(),
    supabase.from("sales").select("id", { count: "exact", head: true }).eq("contact_id", refereeId).neq("status", "remboursee"),
  ]);
  const people = new Map(((rows ?? []) as Contact[]).map((c) => [c.id, c]));
  const referrer = people.get(referrerId);
  const referee = people.get(refereeId);
  if (!referrer || !referee) return { error: "Client introuvable." };
  if (existing) return { error: `${referee.full_name} a déjà un parrain.` };
  if ((salesCount ?? 0) > 0) return { error: `${referee.full_name} a déjà fait un achat : le parrainage concerne les nouveaux clients.` };
  const eid = (referee.entity_ids.find((e) => allowed.includes(e)) ?? scope.current?.id ?? allowed[0]) as EntityId;
  const { error } = await supabase.from("referrals").insert({ referrer_id: referrerId, referee_id: refereeId, entity_id: eid, status: "en_attente", bonus_points: 0, rewarded_at: null, created_by: me.id });
  if (error) return { error: "Impossible d'enregistrer le parrainage." };
  await supabase.from("activities").insert([
    { contact_id: referrerId, entity_id: eid, kind: "note", body: `Parraine ${referee.full_name} (bonus à son premier achat)`, author_id: me.id },
    { contact_id: refereeId, entity_id: eid, kind: "note", body: `Parrainé(e) par ${referrer.full_name}`, author_id: me.id },
  ]);
  await flash("Parrainage enregistré");
  revalidateContact(referrerId);
  revalidatePath(`/contacts/${refereeId}`);
  return undefined;
}
