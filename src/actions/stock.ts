"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getProfile, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { flash } from "@/lib/flash";
import { dayKey, fmtDate, parseNum, str } from "@/lib/utils";
import type { CatalogItem } from "@/lib/types";
import { DEFAULT_ALERT_QTY, type MovementKind, type MovementReason, type OrderLine, type PurchaseOrder, type StockSetting, type Supplier } from "@/lib/types-ops";
import { entity } from "@/lib/entities";
import { barcodeOf, productKey, type TransferLine } from "@/components/stock/lib";
import type { FormState } from "@/components/action-form";

type DB = Awaited<ReturnType<typeof createClient>>;

async function ctx() {
  const [me, scope] = await Promise.all([getProfile(), getScope()]);
  return { me, scope, canWrite: me.role !== "staff", allowed: scope.allowed.map((e) => e.id as string), supabase: await createClient() };
}

async function loadProduct(supabase: DB, allowed: string[], id: string | null) {
  if (!id) return null;
  const { data } = await supabase.from("catalog_items").select("*").eq("id", id).maybeSingle();
  const it = data as CatalogItem | null;
  return it && it.kind === "produit" && allowed.includes(it.entity_id) ? it : null;
}

/** Applique une variation au stock du catalogue et l'inscrit au journal */
async function applyMove(
  supabase: DB,
  item: CatalogItem,
  delta: number,
  kind: MovementKind,
  reason: MovementReason,
  opts: { note?: string | null; ref?: string | null; author: string },
) {
  const after = Math.max(0, Number(item.stock ?? 0) + delta);
  const real = after - Number(item.stock ?? 0);
  await supabase.from("catalog_items").update({ stock: after }).eq("id", item.id);
  await supabase.from("stock_movements").insert({
    entity_id: item.entity_id,
    item_id: item.id,
    kind,
    reason,
    qty: real,
    stock_after: after,
    ref_id: opts.ref ?? null,
    note: opts.note ?? null,
    author_id: opts.author,
  });
  item.stock = after;
  return after;
}

function refresh() {
  revalidatePath("/stock");
  revalidatePath("/catalogue");
  revalidatePath("/caisse");
}

const intOf = (v: FormDataEntryValue | null) => {
  const n = parseNum(v);
  return n === null ? null : Math.round(n);
};

/* ---------- Mouvements ---------- */
export async function addMovement(_state: FormState, formData: FormData): Promise<FormState> {
  const { me, allowed, canWrite, supabase } = await ctx();
  if (!canWrite) return { error: "Votre rôle ne permet pas de modifier le stock." };
  const item = await loadProduct(supabase, allowed, str(formData.get("item_id")));
  if (!item) return { error: "Choisissez un produit." };
  const type = str(formData.get("type"));
  const qty = intOf(formData.get("qty"));
  const note = str(formData.get("note"))?.slice(0, 200) ?? null;
  if (qty === null || qty < 0 || (type !== "compte" && qty === 0)) return { error: "Indiquez une quantité valide." };

  const before = Number(item.stock ?? 0);
  if (type === "entree") await applyMove(supabase, item, qty, "entree", "manuel", { note, author: me.id });
  else if (type === "sortie") await applyMove(supabase, item, -qty, "sortie", "manuel", { note, author: me.id });
  else if (type === "perte") await applyMove(supabase, item, -qty, "sortie", "perte", { note, author: me.id });
  else if (type === "compte") {
    if (qty === before) return { error: `Le stock est déjà de ${before}.` };
    await applyMove(supabase, item, qty - before, "ajustement", "manuel", { note: note ?? "Correction du stock", author: me.id });
  } else return { error: "Choisissez le type de mouvement." };

  await flash(`${item.name} : stock ${before} → ${item.stock}`);
  refresh();
  return undefined;
}

/* ---------- Réglages produit ---------- */
export async function saveStockSettings(itemId: string, _state: FormState, formData: FormData): Promise<FormState> {
  const { allowed, canWrite, supabase } = await ctx();
  if (!canWrite) return { error: "Votre rôle ne permet pas de modifier le stock." };
  const item = await loadProduct(supabase, allowed, itemId);
  if (!item) return { error: "Produit introuvable." };
  const alert = intOf(formData.get("alert_qty"));
  if (alert === null || alert < 0) return { error: "Seuil d'alerte invalide." };
  const cost = parseNum(formData.get("unit_cost_mad"));
  if (cost !== null && cost < 0) return { error: "Prix d'achat invalide." };
  const supplierId = str(formData.get("supplier_id"));

  // Code-barres (scan en caisse) : unique dans l'établissement, partagé entre établissements pour un même produit
  if (formData.has("barcode")) {
    const barcode = (str(formData.get("barcode")) ?? "").replace(/\s/g, "").slice(0, 32) || null;
    if (barcode && !/^[0-9A-Za-z-]{4,32}$/.test(barcode)) return { error: "Code-barres invalide (chiffres et lettres, 4 caractères minimum)." };
    if (barcode) {
      const { data: same } = await supabase.from("catalog_items").select("*").eq("entity_id", item.entity_id).eq("barcode", barcode);
      const other = ((same ?? []) as CatalogItem[]).find((x) => x.id !== item.id);
      if (other) return { error: `Ce code-barres est déjà utilisé par « ${other.name} ».` };
    }
    const current = (item as CatalogItem & { barcode?: string | null }).barcode ?? null;
    if (barcode !== current) {
      const { error } = await supabase.from("catalog_items").update({ barcode }).eq("id", item.id);
      if (error) return { error: "Code-barres non enregistré : exécutez supabase/establishments.sql (colonne barcode)." };
    }
  }

  const row = { item_id: item.id, entity_id: item.entity_id, alert_qty: alert, unit_cost_mad: cost === null ? null : Math.round(cost * 100) / 100, supplier_id: supplierId };
  const { data } = await supabase.from("stock_settings").select("*").eq("item_id", item.id).maybeSingle();
  if (data) await supabase.from("stock_settings").update(row).eq("id", (data as StockSetting).id);
  else await supabase.from("stock_settings").insert(row);

  // Le fournisseur choisi référence ce produit
  if (supplierId) {
    const { data: s } = await supabase.from("suppliers").select("*").eq("id", supplierId).maybeSingle();
    const sup = s as Supplier | null;
    if (sup && !(sup.product_ids ?? []).includes(item.id)) await supabase.from("suppliers").update({ product_ids: [...(sup.product_ids ?? []), item.id] }).eq("id", sup.id);
  }
  await flash("Réglages enregistrés");
  refresh();
  return undefined;
}

/* ---------- Inventaire ---------- */
export async function validateInventory(entityId: string, _state: FormState, formData: FormData): Promise<FormState> {
  const { me, allowed, canWrite, supabase } = await ctx();
  if (!canWrite) return { error: "Votre rôle ne permet pas de valider un inventaire." };
  if (!allowed.includes(entityId)) return { error: "Établissement non autorisé." };
  const { data } = await supabase.from("catalog_items").select("*").eq("entity_id", entityId).eq("kind", "produit");
  const items = (data ?? []) as CatalogItem[];
  let fixed = 0;
  let counted = 0;
  for (const it of items) {
    const raw = formData.get(`count_${it.id}`);
    if (raw === null || String(raw).trim() === "") continue;
    const n = intOf(raw);
    if (n === null || n < 0) return { error: `Quantité invalide pour « ${it.name} ».` };
    counted++;
    const diff = n - Number(it.stock ?? 0);
    if (!diff) continue;
    await applyMove(supabase, it, diff, "ajustement", "inventaire", { note: `Inventaire du ${fmtDate(new Date())}`, author: me.id });
    fixed++;
  }
  if (!counted) return { error: "Saisissez au moins une quantité comptée." };
  await flash(fixed ? `Inventaire validé : ${fixed} écart${fixed > 1 ? "s" : ""} corrigé${fixed > 1 ? "s" : ""}` : "Inventaire validé : aucun écart");
  refresh();
  redirect("/stock?onglet=mouvements&periode=7");
}

/* ---------- Fournisseurs ---------- */
export async function saveSupplier(id: string | null, _state: FormState, formData: FormData): Promise<FormState> {
  const { allowed, canWrite, supabase } = await ctx();
  if (!canWrite) return { error: "Votre rôle ne permet pas de gérer les fournisseurs." };
  const name = str(formData.get("name"));
  if (!name) return { error: "Le nom du fournisseur est obligatoire." };
  const entityIds = formData.getAll("entity_ids").map(String).filter((e) => allowed.includes(e));
  if (!entityIds.length) return { error: "Cochez au moins un établissement." };
  const productIds = formData.getAll("product_ids").map(String);

  const row = {
    name: name.slice(0, 120),
    contact_name: str(formData.get("contact_name"))?.slice(0, 120) ?? null,
    phone: str(formData.get("phone"))?.slice(0, 40) ?? null,
    email: str(formData.get("email"))?.slice(0, 120) ?? null,
    city: str(formData.get("city"))?.slice(0, 80) ?? null,
    entity_ids: entityIds,
    product_ids: productIds,
    notes: str(formData.get("notes"))?.slice(0, 500) ?? null,
  };
  if (id) {
    const { data } = await supabase.from("suppliers").select("*").eq("id", id).maybeSingle();
    const sup = data as Supplier | null;
    if (!sup || !(sup.entity_ids ?? []).some((e) => allowed.includes(e))) return { error: "Fournisseur introuvable." };
    // On garde les établissements hors périmètre déjà rattachés
    row.entity_ids = [...new Set([...(sup.entity_ids ?? []).filter((e) => !allowed.includes(e)), ...entityIds])];
    await supabase.from("suppliers").update(row).eq("id", id);
  } else {
    await supabase.from("suppliers").insert(row);
  }
  await flash(id ? "Fournisseur modifié" : "Fournisseur ajouté");
  refresh();
  redirect("/stock?onglet=fournisseurs");
}

export async function deleteSupplier(id: string) {
  const { allowed, canWrite, supabase } = await ctx();
  if (!canWrite) return;
  const { data } = await supabase.from("suppliers").select("*").eq("id", id).maybeSingle();
  const sup = data as Supplier | null;
  if (!sup || !(sup.entity_ids ?? []).some((e) => allowed.includes(e))) return;
  await supabase.from("suppliers").delete().eq("id", id);
  const { data: st } = await supabase.from("stock_settings").select("*").eq("supplier_id", id);
  for (const s of (st ?? []) as StockSetting[]) await supabase.from("stock_settings").update({ supplier_id: null }).eq("id", s.id);
  await flash("Fournisseur supprimé");
  refresh();
}

/* ---------- Bons de commande ---------- */
async function nextOrderNumber(supabase: DB, year: string, bump = 0) {
  const { data } = await supabase.from("purchase_orders").select("number").ilike("number", `BC-${year}-%`);
  const max = ((data ?? []) as { number: string }[]).reduce((m, r) => {
    const n = Number(r.number.slice(`BC-${year}-`.length));
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `BC-${year}-${String(max + 1 + bump).padStart(4, "0")}`;
}

export async function createOrder(_state: FormState, formData: FormData): Promise<FormState> {
  const { me, allowed, canWrite, supabase } = await ctx();
  if (!canWrite) return { error: "Votre rôle ne permet pas de passer commande." };
  const entityId = str(formData.get("entity_id"));
  if (!entityId || !allowed.includes(entityId)) return { error: "Choisissez un établissement autorisé." };
  const supplierId = str(formData.get("supplier_id"));

  const { data } = await supabase.from("catalog_items").select("*").eq("entity_id", entityId).eq("kind", "produit");
  const lines: OrderLine[] = [];
  for (const it of (data ?? []) as CatalogItem[]) {
    const qty = intOf(formData.get(`qty_${it.id}`));
    if (!qty || qty <= 0) continue;
    const cost = parseNum(formData.get(`cost_${it.id}`));
    lines.push({ item_id: it.id, label: it.name, qty, unit_cost_mad: cost !== null && cost >= 0 ? Math.round(cost * 100) / 100 : 0 });
  }
  if (!lines.length) return { error: "Indiquez au moins une quantité à commander." };

  const year = dayKey().slice(0, 4);
  const total = Math.round(lines.reduce((a, l) => a + l.qty * l.unit_cost_mad, 0) * 100) / 100;
  let ok = false;
  for (let attempt = 0; attempt < 4 && !ok; attempt++) {
    const { error } = await supabase.from("purchase_orders").insert({
      number: await nextOrderNumber(supabase, year, attempt),
      entity_id: entityId,
      supplier_id: supplierId,
      status: "brouillon",
      lines,
      total_mad: total,
      notes: str(formData.get("notes"))?.slice(0, 500) ?? null,
      sent_at: null,
      received_at: null,
      created_by: me.id,
    });
    if (!error) ok = true;
    else if ((error as { code?: string }).code !== "23505") return { error: error.message };
  }
  if (!ok) return { error: "Numéro de commande déjà utilisé, réessayez." };
  await flash("Bon de commande créé");
  refresh();
  redirect("/stock?onglet=commandes");
}

async function loadOrder(id: string) {
  const c = await ctx();
  const { data } = await c.supabase.from("purchase_orders").select("*").eq("id", id).maybeSingle();
  const order = data as PurchaseOrder | null;
  if (!c.canWrite || !order || !c.allowed.includes(order.entity_id)) return { ...c, order: null };
  return { ...c, order };
}

export async function markOrderSent(id: string) {
  const { order, supabase } = await loadOrder(id);
  if (!order || order.status !== "brouillon") return;
  await supabase.from("purchase_orders").update({ status: "envoyee", sent_at: new Date().toISOString() }).eq("id", id);
  await flash(`Commande ${order.number} marquée envoyée`);
  refresh();
}

/** Réception : entrée en stock de chaque ligne */
export async function receiveOrder(id: string) {
  const { order, supabase, me, allowed } = await loadOrder(id);
  if (!order || order.status === "recue") return;
  let units = 0;
  for (const l of order.lines ?? []) {
    const item = await loadProduct(supabase, allowed, l.item_id);
    if (!item || l.qty <= 0) continue;
    await applyMove(supabase, item, l.qty, "entree", "reception", { note: `Réception ${order.number}`, ref: order.id, author: me.id });
    units += l.qty;
    if (l.unit_cost_mad > 0) {
      const { data } = await supabase.from("stock_settings").select("*").eq("item_id", item.id).maybeSingle();
      if (data) await supabase.from("stock_settings").update({ unit_cost_mad: l.unit_cost_mad }).eq("id", (data as StockSetting).id);
      else await supabase.from("stock_settings").insert({ item_id: item.id, entity_id: item.entity_id, alert_qty: 5, unit_cost_mad: l.unit_cost_mad, supplier_id: order.supplier_id });
    }
  }
  await supabase.from("purchase_orders").update({ status: "recue", received_at: new Date().toISOString(), sent_at: order.sent_at ?? new Date().toISOString() }).eq("id", id);
  await flash(`Commande ${order.number} reçue : ${units} article${units > 1 ? "s" : ""} en stock`);
  refresh();
}

export async function deleteOrder(id: string) {
  const { order, supabase } = await loadOrder(id);
  if (!order || order.status === "recue") return;
  await supabase.from("purchase_orders").delete().eq("id", id);
  await flash("Bon de commande supprimé");
  refresh();
}

/* ---------- Transferts entre établissements ---------- */
const normName = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Transfère des produits d'un établissement à un autre : sortie d'un côté, entrée de l'autre.
 * Si le produit n'existe pas encore dans l'établissement d'arrivée, il y est créé (stock 0, mêmes réglages).
 */
export async function createTransfer(_state: FormState, formData: FormData): Promise<FormState> {
  const { me, allowed, canWrite, supabase } = await ctx();
  if (!canWrite) return { error: "Votre rôle ne permet pas de transférer du stock." };
  const from = str(formData.get("from"));
  const to = str(formData.get("to"));
  if (!from || !to || !allowed.includes(from) || !allowed.includes(to)) return { error: "Choisissez deux établissements autorisés." };
  if (from === to) return { error: "Choisissez deux établissements différents." };

  let raw: { item_id?: string; qty?: number | string }[] = [];
  try {
    raw = JSON.parse(String(formData.get("lines") ?? "[]"));
  } catch {
    return { error: "Lignes du transfert illisibles. Réessayez." };
  }
  const qtyBy = new Map<string, number>();
  for (const l of Array.isArray(raw) ? raw : []) {
    const q = Math.round(Number(l.qty));
    if (l.item_id && Number.isFinite(q) && q > 0) qtyBy.set(l.item_id, (qtyBy.get(l.item_id) ?? 0) + q);
  }
  if (!qtyBy.size) return { error: "Ajoutez au moins un produit avec une quantité." };
  const note = str(formData.get("note"))?.slice(0, 200) ?? null;
  const shortOf = (id: string) => entity(id)?.short ?? id;

  const [{ data: srcRows }, { data: dstRows }, { data: setRows }] = await Promise.all([
    supabase.from("catalog_items").select("*").eq("entity_id", from).eq("kind", "produit"),
    supabase.from("catalog_items").select("*").eq("entity_id", to).eq("kind", "produit"),
    supabase.from("stock_settings").select("*").in("entity_id", [from, to]),
  ]);
  const src = new Map(((srcRows ?? []) as CatalogItem[]).map((i) => [i.id, i]));
  const dst = [...((dstRows ?? []) as CatalogItem[])];
  const settings = (setRows ?? []) as StockSetting[];

  for (const [id, qty] of qtyBy) {
    const it = src.get(id);
    if (!it) return { error: `Un produit n'appartient pas à ${shortOf(from)}.` };
    const have = Math.max(0, Number(it.stock ?? 0));
    if (qty > have) return { error: `Stock insuffisant pour « ${it.name} » chez ${shortOf(from)} : ${have} disponible${have > 1 ? "s" : ""}.` };
  }

  // Numéro TR-AAAA-0001
  const year = dayKey().slice(0, 4);
  const { data: nums } = await supabase.from("stock_transfers").select("number").ilike("number", `TR-${year}-%`);
  const max = ((nums ?? []) as { number: string }[]).reduce((m, r) => Math.max(m, Number(r.number.slice(8)) || 0), 0);
  const number = `TR-${year}-${String(max + 1).padStart(4, "0")}`;
  const id = crypto.randomUUID();

  // Produit correspondant à l'arrivée (même code-barres ou même nom), créé si besoin
  const lines: TransferLine[] = [];
  for (const [itemId, qty] of qtyBy) {
    const s = src.get(itemId)!;
    const key = productKey(s);
    let d = dst.find((x) => productKey(x) === key) ?? dst.find((x) => normName(x.name) === normName(s.name));
    if (!d) {
      const barcode = barcodeOf(s);
      const { data: created } = await supabase
        .from("catalog_items")
        .insert({ entity_id: to, kind: "produit", name: s.name, category: s.category, price_mad: s.price_mad, duration_min: null, duration_days: null, sessions_count: null, stock: 0, active: true, ...(barcode ? { barcode } : {}) })
        .select()
        .single();
      if (!created) return { error: `Impossible de créer « ${s.name} » chez ${shortOf(to)}.` };
      d = created as CatalogItem;
      dst.push(d);
      const st = settings.find((x) => x.item_id === s.id);
      await supabase.from("stock_settings").insert({ item_id: d.id, entity_id: to, alert_qty: st?.alert_qty ?? DEFAULT_ALERT_QTY, unit_cost_mad: st?.unit_cost_mad ?? null, supplier_id: st?.supplier_id ?? null });
    }
    const cost = Number(settings.find((x) => x.item_id === s.id)?.unit_cost_mad ?? s.price_mad);
    lines.push({ label: s.name, qty, from_item_id: s.id, to_item_id: d.id, unit_cost_mad: cost });
  }

  const { error } = await supabase.from("stock_transfers").insert({ id, number, from_entity_id: from, to_entity_id: to, lines, note, created_by: me.id, created_at: new Date().toISOString() });
  if (error) return { error: "Impossible d'enregistrer le transfert (table stock_transfers manquante ?)." };

  for (const l of lines) {
    const s = src.get(l.from_item_id)!;
    const d = dst.find((x) => x.id === l.to_item_id)!;
    await applyMove(supabase, s, -l.qty, "sortie", "transfert" as MovementReason, { note: `Transfert ${number} vers ${shortOf(to)}${note ? ` · ${note}` : ""}`, ref: id, author: me.id });
    await applyMove(supabase, d, l.qty, "entree", "transfert" as MovementReason, { note: `Transfert ${number} depuis ${shortOf(from)}${note ? ` · ${note}` : ""}`, ref: id, author: me.id });
  }
  const units = lines.reduce((a, l) => a + l.qty, 0);
  await flash(`Transfert ${number} : ${units} article${units > 1 ? "s" : ""} vers ${shortOf(to)}`);
  refresh();
  redirect(`/stock?onglet=transferts`);
}
