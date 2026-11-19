"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getProfile, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addDaysKey, dayKey, mad, parseNum, PAY_LABEL } from "@/lib/utils";
import { entity } from "@/lib/entities";
import type { PosPayment, TicketData } from "@/components/sales/pos-types";
import { loadTicket } from "@/components/sales/query";
import type { Appointment, CatalogItem, Contact, PayMethod, Sale, SaleItem, SaleStatus } from "@/lib/types";
import type { FormState } from "@/components/action-form";
import { onSaleCreated, onSaleRefunded } from "@/lib/hooks";
import { logAudit } from "@/lib/audit";
import { flash } from "@/lib/flash";

const METHODS: PayMethod[] = ["especes", "carte", "virement", "cheque", "en_ligne"];

export type CheckoutLine = { item_id: string | null; label: string; qty: number; unit_price: number };

export type CheckoutInput = {
  entity_id: string;
  contact_id: string | null;
  lines: CheckoutLine[];
  discount_mode: "mad" | "pct";
  discount_value: number;
  method: PayMethod;
  /** Montant encaissé maintenant (null = tout le montant) */
  paid: number | null;
  rdv_id: string | null;
  notes: string | null;
  /** Caisse : paiement en plusieurs modes (remplace method / paid) */
  payments?: PosPayment[];
  /** Caisse : vérifier le stock disponible des produits */
  check_stock?: boolean;
  /** Caisse : vente confirmée malgré un stock insuffisant */
  allow_short?: boolean;
  /** Caisse : rester sur la caisse (renvoie le ticket au lieu de rediriger) */
  stay?: boolean;
};

export type CheckoutResult = {
  error?: string;
  /** Produits en stock insuffisant (à confirmer) */
  short?: { label: string; stock: number; qty: number }[];
  ticket?: TicketData;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

function statusFor(total: number, paid: number): SaleStatus {
  if (paid >= total) return "payee";
  return paid > 0 ? "partielle" : "impayee";
}

/** Prochain numéro de vente de l'année : MU-AAAA-00042 */
async function nextNumber(supabase: Awaited<ReturnType<typeof createClient>>, year: string) {
  const { data } = await supabase.from("sales").select("number").ilike("number", `MU-${year}-%`).order("number", { ascending: false }).limit(50);
  const max = ((data ?? []) as { number: string }[]).reduce((m, r) => {
    const n = Number(r.number.slice(`MU-${year}-`.length));
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return max + 1;
}

const fmtNumber = (year: string, n: number) => `MU-${year}-${String(n).padStart(5, "0")}`;

/** Validation du panier de la caisse */
export async function createSale(input: CheckoutInput): Promise<CheckoutResult> {
  const [profile, scope] = await Promise.all([getProfile(), getScope()]);
  const supabase = await createClient();

  if (!scope.allowed.some((e) => e.id === input.entity_id)) return { error: "Établissement non autorisé." };
  if (!METHODS.includes(input.method)) return { error: "Mode de paiement inconnu." };
  const lines = (input.lines ?? [])
    .map((l) => ({ item_id: l.item_id || null, label: String(l.label ?? "").trim().slice(0, 200), qty: Math.round(Number(l.qty)), unit_price: round2(Number(l.unit_price)) }))
    .filter((l) => l.label && l.qty > 0 && Number.isFinite(l.unit_price) && l.unit_price >= 0);
  if (!lines.length) return { error: "Le panier est vide." };

  // Articles du catalogue (doivent appartenir à l'établissement)
  const itemIds = [...new Set(lines.map((l) => l.item_id).filter((x): x is string => !!x))];
  const { data: itemRows } = itemIds.length ? await supabase.from("catalog_items").select("*").in("id", itemIds) : { data: [] };
  const items = new Map(((itemRows ?? []) as CatalogItem[]).map((i) => [i.id, i]));
  for (const l of lines) {
    if (!l.item_id) continue;
    const it = items.get(l.item_id);
    if (!it || it.entity_id !== input.entity_id) return { error: `« ${l.label} » n'appartient pas à cet établissement.` };
  }

  // Client
  let contact: Contact | null = null;
  if (input.contact_id) {
    const { data } = await supabase.from("contacts").select("*").eq("id", input.contact_id).maybeSingle();
    contact = (data as Contact | null) ?? null;
    if (!contact) return { error: "Client introuvable." };
  }

  // Stock disponible (caisse)
  const qtyByItem = new Map<string, number>();
  for (const l of lines) if (l.item_id) qtyByItem.set(l.item_id, (qtyByItem.get(l.item_id) ?? 0) + l.qty);
  if (input.check_stock && !input.allow_short) {
    const short = [...qtyByItem]
      .map(([id, qty]) => ({ it: items.get(id), qty }))
      .filter(({ it, qty }) => it?.kind === "produit" && it.stock !== null && qty > Number(it.stock))
      .map(({ it, qty }) => ({ label: it!.name, stock: Math.max(0, Number(it!.stock)), qty }));
    if (short.length)
      return {
        error: `Stock insuffisant : ${short.map((x) => `${x.label} (${x.stock} disponible${x.stock > 1 ? "s" : ""}, ${x.qty} demandé${x.qty > 1 ? "s" : ""})`).join(", ")}.`,
        short,
      };
  }

  // Montants
  const gross = round2(lines.reduce((a, l) => a + l.qty * l.unit_price, 0));
  const dv = Math.max(0, Number(input.discount_value) || 0);
  const discount = Math.min(gross, round2(input.discount_mode === "pct" ? (gross * Math.min(dv, 100)) / 100 : dv));
  const total = round2(gross - discount);

  // Paiements : un seul mode (method / paid) ou paiement mixte (payments)
  let method: PayMethod = input.method;
  let paid: number;
  let payRows: { method: PayMethod; amount: number; tendered: number | null }[] = [];
  let change = 0;
  let tenderedCash = 0;
  if (input.payments?.length) {
    const ps = input.payments
      .map((p) => ({ method: p.method, amount: Math.max(0, round2(Number(p.amount) || 0)), tendered: p.tendered == null ? null : Math.max(0, round2(Number(p.tendered) || 0)) }))
      .filter((p) => METHODS.includes(p.method) && (p.amount > 0 || (p.tendered ?? 0) > 0));
    const nonCash = round2(ps.filter((p) => p.method !== "especes").reduce((a, p) => a + p.amount, 0));
    if (nonCash > total + 0.001) return { error: "Les paiements par carte, virement ou chèque dépassent le total : seules les espèces donnent lieu à un rendu de monnaie." };
    tenderedCash = round2(ps.filter((p) => p.method === "especes").reduce((a, p) => a + (p.tendered ?? p.amount), 0));
    const cashNet = round2(Math.min(tenderedCash, total - nonCash));
    change = round2(tenderedCash - cashNet);
    paid = round2(nonCash + cashNet);
    // Regroupe par mode ; espèces = montant net (après rendu de monnaie)
    const by = new Map<PayMethod, number>();
    for (const p of ps) if (p.method !== "especes") by.set(p.method, round2((by.get(p.method) ?? 0) + p.amount));
    if (cashNet > 0) by.set("especes", cashNet);
    payRows = [...by].map(([m, amount]) => ({ method: m, amount, tendered: m === "especes" ? tenderedCash : null }));
    method = [...payRows].sort((a, b) => b.amount - a.amount)[0]?.method ?? input.method;
  } else {
    paid = input.paid === null || input.paid === undefined ? total : Math.min(total, Math.max(0, round2(Number(input.paid) || 0)));
  }
  if (!METHODS.includes(method)) return { error: "Mode de paiement inconnu." };
  if (paid < total && !contact) return { error: "Choisissez le client pour un paiement partiel ou à crédit." };
  const status = statusFor(total, paid);

  // Rendez-vous lié
  let rdv: Appointment | null = null;
  if (input.rdv_id) {
    const { data } = await supabase.from("appointments").select("*").eq("id", input.rdv_id).maybeSingle();
    rdv = (data as Appointment | null) ?? null;
    if (rdv && !scope.allowed.some((e) => e.id === rdv!.entity_id)) rdv = null;
  }

  // Enregistrement (numéro unique, nouvel essai en cas de collision)
  const today = dayKey();
  const year = today.slice(0, 4);
  let n = await nextNumber(supabase, year);
  let sale: Sale | null = null;
  for (let attempt = 0; attempt < 4 && !sale; attempt++) {
    const { data, error } = await supabase
      .from("sales")
      .insert({
        number: fmtNumber(year, n),
        entity_id: input.entity_id,
        contact_id: contact?.id ?? null,
        total_mad: total,
        discount_mad: discount,
        paid_mad: paid,
        method,
        status,
        sold_by: profile.id,
        sold_at: new Date().toISOString(),
        notes: input.notes?.trim() || null,
      })
      .select()
      .single();
    if (data) sale = data as Sale;
    else if (error && (error as { code?: string }).code === "23505") n++;
    else return { error: error?.message ?? "Impossible d'enregistrer la vente." };
  }
  if (!sale) return { error: "Numéro de vente déjà utilisé, réessayez." };

  await supabase.from("sale_items").insert(lines.map((l) => ({ sale_id: sale!.id, item_id: l.item_id, label: l.label, qty: l.qty, unit_price_mad: l.unit_price })));
  if (payRows.length) {
    await supabase.from("sale_payments").insert(
      payRows.map((p) => ({ sale_id: sale!.id, entity_id: input.entity_id, method: p.method, amount_mad: p.amount, tendered_mad: p.tendered, created_at: sale!.sold_at })),
    );
  }

  // Stock des produits (le mouvement est enregistré par onSaleCreated → recordSaleStockOut)
  for (const [id, qty] of qtyByItem) {
    const it = items.get(id);
    if (it?.kind === "produit" && it.stock !== null) await supabase.from("catalog_items").update({ stock: Math.max(0, Number(it.stock) - qty) }).eq("id", id);
  }

  // Abonnements / packs
  const created: string[] = [];
  if (contact) {
    for (const l of lines) {
      const it = l.item_id ? items.get(l.item_id) : undefined;
      if (!it || (it.kind !== "abonnement" && it.kind !== "pack")) continue;
      const days = (it.duration_days ?? (it.kind === "abonnement" ? 30 : 90)) * (it.kind === "abonnement" ? l.qty : 1);
      const end = addDaysKey(today, days);
      await supabase.from("subscriptions").insert({
        contact_id: contact.id,
        entity_id: input.entity_id,
        item_id: it.id,
        name: it.name,
        price_mad: round2(l.unit_price * l.qty),
        start_date: today,
        end_date: end,
        status: "actif",
        auto_renew: false,
        sessions_left: it.kind === "pack" ? (it.sessions_count ?? 1) * l.qty : null,
      });
      created.push(`${it.name} (jusqu'au ${end.split("-").reverse().join("/")})`);
    }
    const ents = contact.entity_ids ?? [];
    const patch: Partial<Contact> = {};
    if (created.length && contact.status !== "client") patch.status = "client";
    if (!ents.includes(input.entity_id as never)) patch.entity_ids = [...ents, input.entity_id as Contact["entity_ids"][number]];
    if (Object.keys(patch).length) await supabase.from("contacts").update(patch).eq("id", contact.id);

    const labels = lines.map((l) => (l.qty > 1 ? `${l.qty} × ${l.label}` : l.label)).join(", ");
    await supabase.from("activities").insert({
      contact_id: contact.id,
      entity_id: input.entity_id,
      kind: "vente",
      body:
        `Vente ${sale.number} : ${labels} — ${mad(total)} (${payRows.length > 1 ? payRows.map((p) => `${PAY_LABEL[p.method]} ${mad(p.amount)}`).join(" + ") : PAY_LABEL[method]}${status === "payee" ? "" : `, reste ${mad(total - paid)}`})` +
        (created.length ? `. Abonnement activé : ${created.join(", ")}` : ""),
      author_id: profile.id,
    });
  }

  if (rdv && rdv.status !== "termine") await supabase.from("appointments").update({ status: "termine" }).eq("id", rdv.id);

  await onSaleCreated({ sale, lines: lines.map((l) => ({ item_id: l.item_id, label: l.label, qty: l.qty, unit_price_mad: l.unit_price })), contact, profile, discount });

  revalidatePath("/ventes");
  revalidatePath("/caisse");
  revalidatePath("/stock");
  revalidatePath("/");
  if (input.stay) {
    const ticket = await loadTicket(sale.id, { cashier: profile.full_name, change, tenderedCash });
    return ticket ? { ticket } : {};
  }
  await flash(`Vente ${sale.number} enregistrée`);
  redirect(`/ventes/${sale.id}?ok=1`);
}

/* ---------- Session de caisse (ouverture depuis la caisse) ---------- */

/** Ouvre la caisse du jour d'un établissement avec le fond de caisse */
export async function openRegister(entityId: string, floatValue: number): Promise<{ error?: string }> {
  const [me, scope] = await Promise.all([getProfile(), getScope()]);
  if (me.role === "staff") return { error: "L'ouverture de caisse est réservée à la réception, aux managers et à la direction." };
  if (!scope.allowed.some((e) => e.id === entityId)) return { error: "Établissement non autorisé." };
  const float = round2(Number(floatValue));
  if (!Number.isFinite(float) || float < 0 || float > 100_000) return { error: "Indiquez le fond de caisse (0 si le tiroir est vide)." };
  const supabase = await createClient();
  const today = dayKey();
  const { data: existing } = await supabase.from("cash_sessions").select("*").eq("entity_id", entityId).eq("day", today).maybeSingle();
  if (existing) return { error: (existing as { status: string }).status === "cloturee" ? "La caisse de cet établissement est déjà clôturée aujourd'hui." : "La caisse est déjà ouverte." };
  const { data, error } = await supabase
    .from("cash_sessions")
    .insert({
      entity_id: entityId,
      day: today,
      status: "ouverte",
      opening_float_mad: float,
      opened_at: new Date().toISOString(),
      opened_by: me.id,
      closed_at: null,
      closed_by: null,
      expected_cash_mad: null,
      counted_cash_mad: null,
      difference_mad: null,
      comment: null,
      breakdown: null,
      totals: null,
    })
    .select()
    .single();
  if (error || !data) return { error: "Impossible d'ouvrir la caisse. Réessayez." };
  await logAudit({
    action: "caisse.ouverture",
    entity_id: entityId,
    target_type: "cash_session",
    target_id: (data as { id: string }).id,
    summary: `Caisse ${entity(entityId)?.short ?? ""} ouverte avec un fond de ${mad(float)}`,
    actor: me,
    meta: { float },
  });
  await flash(`Caisse ouverte · fond de ${mad(float)}`);
  revalidatePath("/caisse");
  revalidatePath("/cloture");
  return {};
}

/** Entrée (dépôt) ou sortie (retrait) d'espèces dans la caisse ouverte */
export async function addCashMove(entityId: string, kind: "depot" | "retrait", amountValue: number, reasonValue: string): Promise<{ error?: string }> {
  const [me, scope] = await Promise.all([getProfile(), getScope()]);
  if (me.role === "staff") return { error: "Réservé à la réception, aux managers et à la direction." };
  if (!scope.allowed.some((e) => e.id === entityId)) return { error: "Établissement non autorisé." };
  if (kind !== "depot" && kind !== "retrait") return { error: "Choisissez dépôt ou retrait." };
  const amount = round2(Number(amountValue));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000) return { error: "Indiquez un montant valide." };
  const reason = String(reasonValue ?? "").trim().slice(0, 160);
  if (kind === "retrait" && !reason) return { error: "Indiquez le motif du retrait." };
  const supabase = await createClient();
  const today = dayKey();
  const { data } = await supabase.from("cash_sessions").select("*").eq("entity_id", entityId).eq("day", today).maybeSingle();
  const session = data as { id: string; status: string } | null;
  if (!session || session.status !== "ouverte") return { error: "Ouvrez d'abord la caisse du jour." };
  const { error } = await supabase.from("cash_moves").insert({
    entity_id: entityId,
    session_id: session.id,
    day: today,
    kind,
    amount_mad: amount,
    reason: reason || "Dépôt d'espèces",
    created_by: me.id,
    created_at: new Date().toISOString(),
  });
  if (error) return { error: "Impossible d'enregistrer le mouvement de caisse." };
  await logAudit({
    action: kind === "depot" ? "caisse.depot" : "caisse.retrait",
    entity_id: entityId,
    target_type: "cash_session",
    target_id: session.id,
    summary: `${kind === "depot" ? "Dépôt" : "Retrait"} de ${mad(amount)} en caisse ${entity(entityId)?.short ?? ""}${reason ? ` : ${reason}` : ""}`,
    actor: me,
    meta: { amount, kind, reason },
  });
  await flash(`${kind === "depot" ? "Dépôt" : "Retrait"} de ${mad(amount)} enregistré`);
  revalidatePath("/caisse");
  revalidatePath("/cloture");
  return {};
}

async function loadSale(id: string) {
  const [profile, scope] = await Promise.all([getProfile(), getScope()]);
  const supabase = await createClient();
  const { data } = await supabase.from("sales").select("*").eq("id", id).maybeSingle();
  const sale = data as Sale | null;
  if (!sale || !scope.allowed.some((e) => e.id === sale.entity_id)) return { profile, supabase, sale: null };
  return { profile, supabase, sale };
}

/** Complète le paiement d'une vente partielle ou impayée */
export async function addPayment(id: string, _state: FormState, formData: FormData): Promise<FormState> {
  const { profile, supabase, sale } = await loadSale(id);
  if (!sale) return { error: "Vente introuvable." };
  if (sale.status === "remboursee") return { error: "Cette vente a été remboursée." };
  const rest = round2(Number(sale.total_mad) - Number(sale.paid_mad));
  if (rest <= 0) return { error: "Cette vente est déjà réglée." };
  const amount = parseNum(formData.get("amount"));
  if (amount === null || amount <= 0) return { error: "Indiquez le montant reçu." };
  const method = String(formData.get("method") ?? "") as PayMethod;
  const paid = round2(Math.min(Number(sale.total_mad), Number(sale.paid_mad) + amount));
  const status = statusFor(Number(sale.total_mad), paid);
  await supabase
    .from("sales")
    .update({ paid_mad: paid, status, ...(METHODS.includes(method) ? { method } : {}) })
    .eq("id", sale.id);
  if (sale.contact_id) {
    await supabase.from("activities").insert({
      contact_id: sale.contact_id,
      entity_id: sale.entity_id,
      kind: "vente",
      body: `Paiement de ${mad(Math.min(amount, rest))} reçu pour la vente ${sale.number}${status === "payee" ? " (soldée)" : `, reste ${mad(Number(sale.total_mad) - paid)}`}`,
      author_id: profile.id,
    });
  }
  const received = round2(Math.min(amount, rest));
  await logAudit({
    action: "vente.paiement",
    entity_id: sale.entity_id,
    target_type: "sale",
    target_id: sale.id,
    summary: `Paiement de ${mad(received)} (${PAY_LABEL[METHODS.includes(method) ? method : sale.method]}) sur la vente ${sale.number}${status === "payee" ? ", soldée" : ""}`,
    actor: profile,
    meta: { amount: received, method: METHODS.includes(method) ? method : sale.method, contact_id: sale.contact_id },
  });
  revalidatePath(`/ventes/${sale.id}`);
  revalidatePath("/ventes");
  await flash(`Paiement de ${mad(received)} enregistré`);
  redirect(`/ventes/${sale.id}`);
}

/** Rembourse une vente (remet les produits en stock) */
export async function refundSale(id: string) {
  const { profile, supabase, sale } = await loadSale(id);
  if (!sale || sale.status === "remboursee") redirect("/ventes");
  if (profile.role === "staff") redirect(`/ventes/${sale.id}`);

  const { data: lineRows } = await supabase.from("sale_items").select("*").eq("sale_id", sale.id);
  const lines = (lineRows ?? []) as SaleItem[];
  const ids = [...new Set(lines.map((l) => l.item_id).filter((x): x is string => !!x))];
  if (ids.length) {
    const { data: itemRows } = await supabase.from("catalog_items").select("*").in("id", ids);
    for (const it of (itemRows ?? []) as CatalogItem[]) {
      if (it.kind !== "produit" || it.stock === null) continue;
      const qty = lines.filter((l) => l.item_id === it.id).reduce((a, l) => a + Number(l.qty), 0);
      await supabase.from("catalog_items").update({ stock: Number(it.stock) + qty }).eq("id", it.id);
    }
  }
  await supabase.from("sales").update({ status: "remboursee" }).eq("id", sale.id);
  await onSaleRefunded({ sale, profile });
  if (sale.contact_id) {
    await supabase.from("activities").insert({
      contact_id: sale.contact_id,
      entity_id: sale.entity_id,
      kind: "vente",
      body: `Vente ${sale.number} remboursée (${mad(Number(sale.paid_mad))})`,
      author_id: profile.id,
    });
  }
  revalidatePath(`/ventes/${sale.id}`);
  revalidatePath("/ventes");
  revalidatePath("/");
  await flash(`Vente ${sale.number} remboursée`);
  redirect(`/ventes/${sale.id}`);
}
