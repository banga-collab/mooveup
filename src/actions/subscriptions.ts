"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getProfile, getScope } from "@/lib/auth";
import { entity, type EntityId } from "@/lib/entities";
import { PAY_LABEL, addDaysKey, dayKey, fmtDate, mad, parseNum, str } from "@/lib/utils";
import type { CatalogItem, Contact, PayMethod, SaleStatus, Subscription } from "@/lib/types";
import type { FormState } from "@/components/action-form";

const METHODS = Object.keys(PAY_LABEL) as PayMethod[];

/** Nombre de jours entre deux dates AAAA-MM-JJ */
function spanDays(from: string, to: string) {
  return Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000);
}

/** Prochain numéro de vente unique de l'année : MU-AAAA-xxxxx (max existant + 1) */
async function nextSaleNumber(supabase: SupabaseClient) {
  const year = dayKey().slice(0, 4);
  const prefix = `MU-${year}-`;
  const { data } = await supabase.from("sales").select("number").ilike("number", `${prefix}%`).order("number", { ascending: false }).limit(50);
  const max = ((data ?? []) as { number: string }[]).reduce((m, r) => {
    const n = Number(r.number.slice(prefix.length));
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `${prefix}${String(max + 1).padStart(5, "0")}`;
}

/** Enregistre une vente (+ lignes) avec un numéro unique, en réessayant en cas de doublon. */
async function recordSale(
  supabase: SupabaseClient,
  sale: { entity_id: EntityId; contact_id: string; total_mad: number; discount_mad: number; paid_mad: number; method: PayMethod; status: SaleStatus; sold_by: string; notes: string | null },
  line: { item_id: string | null; label: string; unit_price_mad: number },
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const number = await nextSaleNumber(supabase);
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("sales")
      .insert({ ...sale, number, sold_at: now })
      .select()
      .single();
    if (!error && data) {
      await supabase.from("sale_items").insert({ sale_id: (data as { id: string }).id, item_id: line.item_id, label: line.label, qty: 1, unit_price_mad: line.unit_price_mad });
      return number;
    }
  }
  return null;
}

async function loadSub(id: string) {
  const scope = await getScope();
  const supabase = await createClient();
  const { data } = await supabase.from("subscriptions").select("*").eq("id", id).in("entity_id", scope.allowed.map((e) => e.id)).maybeSingle();
  return { supabase, sub: data as Subscription | null };
}

function refresh(contactId: string) {
  revalidatePath("/abonnements");
  revalidatePath("/");
  revalidatePath("/ventes");
  revalidatePath(`/contacts/${contactId}`);
}

/** Nouvel abonnement / pack : abonnement + vente + historique. */
export async function createSubscription(_state: FormState, formData: FormData): Promise<FormState> {
  const [profile, scope] = await Promise.all([getProfile(), getScope()]);
  const supabase = await createClient();

  const contactId = str(formData.get("contact_id"));
  const entityId = str(formData.get("entity_id")) as EntityId | null;
  const itemId = str(formData.get("item_id"));
  const start = str(formData.get("start_date"));
  const days = Math.round(parseNum(formData.get("duration_days")) ?? 0);
  const price = parseNum(formData.get("price_mad"));
  const discount = parseNum(formData.get("discount_mad")) ?? 0;
  const method = str(formData.get("method")) as PayMethod | null;
  const paidRaw = parseNum(formData.get("paid_mad"));
  const sessions = parseNum(formData.get("sessions"));
  const autoRenew = formData.get("auto_renew") === "on";

  if (!contactId) return { error: "Choisissez le client." };
  if (!entityId || !scope.allowed.some((e) => e.id === entityId)) return { error: "Choisissez un établissement autorisé." };
  if (!itemId) return { error: "Choisissez une formule." };
  if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return { error: "Indiquez la date de début." };
  if (days < 1 || days > 1100) return { error: "La durée de validité doit être comprise entre 1 et 1100 jours." };
  if (price === null || price < 0) return { error: "Indiquez un prix valide." };
  if (discount < 0 || discount > price) return { error: "La remise doit être comprise entre 0 et le prix." };
  if (!method || !METHODS.includes(method)) return { error: "Choisissez le mode de paiement." };

  const { data: itemRow } = await supabase.from("catalog_items").select("*").eq("id", itemId).maybeSingle();
  const item = itemRow as CatalogItem | null;
  if (!item || item.entity_id !== entityId || (item.kind !== "abonnement" && item.kind !== "pack")) return { error: "Cette formule n'est pas proposée par l'établissement choisi." };

  const { data: contactRow } = await supabase.from("contacts").select("*").eq("id", contactId).maybeSingle();
  const contact = contactRow as Contact | null;
  if (!contact) return { error: "Client introuvable." };

  const total = Math.round((price - discount) * 100) / 100;
  const paid = Math.max(0, Math.min(total, paidRaw ?? total));
  const status: SaleStatus = paid >= total ? "payee" : paid > 0 ? "partielle" : "impayee";
  const end = addDaysKey(start, days);
  const isPack = item.kind === "pack";
  const sessionsLeft = isPack ? Math.max(1, Math.round(sessions ?? item.sessions_count ?? 1)) : null;

  const { error } = await supabase.from("subscriptions").insert({
    contact_id: contactId,
    entity_id: entityId,
    item_id: item.id,
    name: item.name,
    price_mad: total,
    start_date: start,
    end_date: end,
    status: "actif",
    auto_renew: autoRenew,
    sessions_left: sessionsLeft,
  });
  if (error) return { error: "Impossible de créer l'abonnement." };

  const number = await recordSale(
    supabase,
    { entity_id: entityId, contact_id: contactId, total_mad: total, discount_mad: discount, paid_mad: paid, method, status, sold_by: profile.id, notes: null },
    { item_id: item.id, label: item.name, unit_price_mad: price },
  );

  await supabase.from("activities").insert({
    contact_id: contactId,
    entity_id: entityId,
    kind: "vente",
    body:
      `${isPack ? "Pack" : "Abonnement"} ${item.name} (${entity(entityId)?.short ?? ""}) du ${fmtDate(start)} au ${fmtDate(end)}` +
      `${sessionsLeft ? `, ${sessionsLeft} séances` : ""} — ${mad(total)}${discount ? ` (remise ${mad(discount)})` : ""}` +
      ` · ${PAY_LABEL[method]}${status === "payee" ? "" : `, reste ${mad(total - paid)}`}${number ? ` · vente ${number}` : ""}`,
    author_id: profile.id,
  });

  const patch: Partial<Contact> = { status: "client" };
  if (!contact.entity_ids.includes(entityId)) patch.entity_ids = [...contact.entity_ids, entityId];
  await supabase.from("contacts").update(patch).eq("id", contactId);

  refresh(contactId);
  revalidatePath("/contacts");
  redirect(`/contacts/${contactId}?tab=abonnements`);
}

/** Renouvelle pour une nouvelle période et encaisse la vente correspondante. */
export async function renewSubscription(id: string, _state: FormState, formData: FormData): Promise<FormState> {
  const profile = await getProfile();
  const { supabase, sub } = await loadSub(id);
  if (!sub) return { error: "Abonnement introuvable." };
  const method = str(formData.get("method")) as PayMethod | null;
  if (!method || !METHODS.includes(method)) return { error: "Choisissez le mode de paiement." };
  const backRaw = str(formData.get("back")) ?? "/abonnements";
  const back = backRaw.startsWith("/abonnements") ? backRaw : "/abonnements";

  let item: CatalogItem | null = null;
  if (sub.item_id) {
    const { data } = await supabase.from("catalog_items").select("*").eq("id", sub.item_id).maybeSingle();
    item = data as CatalogItem | null;
  }
  const today = dayKey();
  const start = sub.status !== "resilie" && sub.end_date >= today ? sub.end_date : today;
  const days = item?.duration_days || Math.max(1, spanDays(sub.start_date, sub.end_date));
  const end = addDaysKey(start, days);
  const price = Number(sub.price_mad);

  const { error } = await supabase
    .from("subscriptions")
    .update({
      start_date: start,
      end_date: end,
      status: "actif",
      sessions_left: sub.sessions_left === null ? null : (item?.sessions_count ?? sub.sessions_left),
    })
    .eq("id", sub.id);
  if (error) return { error: "Impossible de renouveler l'abonnement." };

  const number = await recordSale(
    supabase,
    { entity_id: sub.entity_id, contact_id: sub.contact_id, total_mad: price, discount_mad: 0, paid_mad: price, method, status: "payee", sold_by: profile.id, notes: "Renouvellement" },
    { item_id: sub.item_id, label: `${sub.name} — renouvellement`, unit_price_mad: price },
  );

  await supabase.from("activities").insert({
    contact_id: sub.contact_id,
    entity_id: sub.entity_id,
    kind: "vente",
    body: `Renouvellement ${sub.name} jusqu'au ${fmtDate(end)} — ${mad(price)} (${PAY_LABEL[method]})${number ? ` · vente ${number}` : ""}`,
    author_id: profile.id,
  });

  await supabase.from("contacts").update({ status: "client" }).eq("id", sub.contact_id);
  refresh(sub.contact_id);
  redirect(back);
}

/** Suspendre, réactiver ou résilier */
export async function setSubscriptionStatus(id: string, status: "actif" | "suspendu" | "resilie") {
  if (!["actif", "suspendu", "resilie"].includes(status)) return;
  const profile = await getProfile();
  const { supabase, sub } = await loadSub(id);
  if (!sub || sub.status === status) return;
  await supabase
    .from("subscriptions")
    .update(status === "resilie" ? { status, auto_renew: false } : { status })
    .eq("id", id);
  const verb = status === "actif" ? "réactivé" : status === "suspendu" ? "suspendu" : "résilié";
  await supabase.from("activities").insert({
    contact_id: sub.contact_id,
    entity_id: sub.entity_id,
    kind: "statut",
    body: `Abonnement ${sub.name} ${verb}`,
    author_id: profile.id,
  });
  refresh(sub.contact_id);
}

/** Décompte une séance d'un pack */
export async function consumeSession(id: string) {
  const profile = await getProfile();
  const { supabase, sub } = await loadSub(id);
  if (!sub || sub.sessions_left === null || sub.sessions_left <= 0 || sub.status !== "actif") return;
  const left = sub.sessions_left - 1;
  await supabase
    .from("subscriptions")
    .update(left === 0 ? { sessions_left: 0, status: "expire" } : { sessions_left: left })
    .eq("id", id);
  await supabase.from("activities").insert({
    contact_id: sub.contact_id,
    entity_id: sub.entity_id,
    kind: "visite",
    body: `Séance décomptée sur ${sub.name} : ${left ? `reste ${left} séance${left > 1 ? "s" : ""}` : "pack terminé"}`,
    author_id: profile.id,
  });
  refresh(sub.contact_id);
}
